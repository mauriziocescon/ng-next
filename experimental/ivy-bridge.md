# Bridging .ng Components to the Ivy Runtime

> **DISCLAIMER — Highly Speculative & Design Exercise**
> This document explores how the functional, signal-native `.ng` proposal maps onto the existing Angular Ivy engine. The runtime details and instruction names are approximations used for illustrative purposes and should not be treated as authoritative descriptions of Angular internals.

## Proposal Framing
- **Change Class:** what layer must change (`Compiler-only`, `Runtime-only`, `Compiler + Runtime`).
- **Delta from Ivy Today:** what is intentionally different from current behavior.

---

### 1. Component Instantiation: The "Fake Class" & Reactive Input Wiring
The `component()` utility returns a constructor-impersonator to satisfy Angular APIs that expect a component type value.

- **Change Class:** Compiler + Runtime + DI metadata changes.
- **Shape:** The utility returns a JavaScript function object that can carry Angular's static metadata (`ɵcmp`, `ɵfac`) and can be used as a token/type value by DI, Router, TestBed, dynamic component creation, and debugging utilities.
- **Ivy Metadata:** The compiler can still attach a standard component definition (`ɵcmp`) and factory (`ɵfac`) to this function. However, the factory contract cannot simply be "call `setup()` and return expose" if the rest of Ivy still expects the value in directive slots and `LView[CONTEXT]` to be a component instance.
- **Current Ivy creation order:** For a component host, Ivy creates the component `LView` before directive instantiation so tokens such as `ChangeDetectorRef` can be injected. It then resolves the component through `getNodeInjectable()`, which invokes the `NodeInjectorFactory`/`ɵfac`. Only after the instance exists does Ivy apply `initialInputs` through `setInputsFromAttrs()`. Dynamic bindings from `ɵɵproperty()` happen later in `refreshView()` update mode. In other words, both static attributes and dynamic property bindings arrive too late for constructor-equivalent logic.
- **Why `writeToDirectiveInput()` cannot be used before the factory today:** `writeToDirectiveInput()` requires the directive/component instance. For signal inputs it reads the private input field from that instance and extracts the `InputSignalNode`; in dev mode it explicitly rejects writing to a `NodeInjectorFactory` before the directive has been created. Therefore eager seeding cannot literally call today's `writeToDirectiveInput()` before invoking the factory.
- **Proposed extension — pre-factory binding surface:** The `.ng` component factory must be split into at least two phases:
  1. Allocate the component's public binding surface first: input signal nodes, model signal nodes, output refs, fragment bindings, and the object passed to `setup()`.
  2. Apply creation seeds to those preallocated input/model nodes before any `providers()` factory or `setup()` body can read them. This requires a new seed-writing helper that targets binding nodes directly, not an already-created class instance.
  3. Resolve per-instance providers that depend on those input nodes.
  4. Run `setup()` in the established injection context.
  5. Store the internal component record and public expose result in the appropriate Ivy locations.
- **Creation/update code shape:** For `.ng` component instantiation sites the compiler may still emit initial values in creation mode and ordinary update bindings for ongoing reactivity:
  ```
  // creation pass: seed binding nodes before providers/setup
  // (ɵɵcomponentAnchor is the hostless boundary from §2; an element-hosted
  //  component instead lifts its root element into an element-host boundary)
  ɵɵcomponentAnchor(0, Counter, ɵɵseedInputs([['c', ctx.count()]]));

  // update pass: owns ongoing parent -> child synchronization
  ɵɵproperty('c', ctx.count());
  ```
  The creation seed should also initialize the corresponding binding slot, or the compiler must prove that the seeded expression is pure and safe to evaluate again in the first update pass. The proposal examples allow general TypeScript expressions and function calls, so double-evaluation is not automatically safe. Treat "signal-only/pure seed expressions" as a compiler-enforced restriction, or avoid the double evaluation by recording the seeded value into the binding slot that `bindingUpdated()` will later compare.
- **Provider Lifecycle (with eager seeding):** `providers()` runs after input/model signal nodes are allocated and seeded, but before `setup()`. This is not the same as current static provider metadata. Current Ivy publishes providers into TView/blueprint structures during first create pass (`providersResolver`) and their factories do not receive per-instance input nodes. Input-driven providers require a new per-instance provider-resolution path, likely attached to the component's node-injector factory, so `provide(Store, () => new Store(c))` can close over the current component's seeded input signal.
- **Consumer one-time bindings (`once:`):** `once:` is mostly a compiler variation: emit the creation seed and omit the update binding. Runtime still needs the same pre-factory seed path. If a `once:` value can contain arbitrary calls, it has the same purity/side-effect considerations as normal seeds, but only during creation.
- **Delta from Ivy Today:** The broad flow remains Create component boundary -> instantiate component logic -> update bindings. The important delta is that `.ng` needs a pre-instance binding-surface phase and a per-instance provider phase. Inputs are not assigned to class fields; they are created as signal nodes and passed to `setup()`. Prototype lifecycle hooks are removed from the public authoring model; post-binding reactions are signal-based, teardown uses `DestroyRef.onDestroy`, and post-render work uses render hooks/effects.

---

### 2. Root Node & Host Modes (`rootNode`)
Standard Ivy components require a physical DOM host. A `.ng` component instead has **two mutually exclusive host modes**, selected by the `rootNode` config key (`ng-types.ts` §7), and the compiler emits a different boundary for each.

- **Change Class:** Compiler + Runtime + Renderer/Hydration integration.
- **The two modes:**
  1. **`rootNode` omitted → hostless (comment anchor).** The component's root type is `RootNode` (`ng-types.ts`), a branded, members-less token that is *not* an `HTMLElement`. This is the default. Semantically it is a component whose host is an `ng-container` (`rootnode.md`): the boundary is a comment-node anchor, exactly the "Logical Anchor" this section describes. `RootNode` is only ever the omitted default — writing `rootNode: element<RootNode>()` (or a `RootNode`-containing union) is rejected at declaration time (`ng-types.spec.ts` §11).
  2. **`rootNode: element<T>()` where `T ⊑ HTMLElement | SVGElement` → element-hosted.** The component's root type becomes the native element type `T` (e.g. `element<HTMLButtonElement>()` or `element<SVGSVGElement>()`). The single, unique renderable root element of the `@{ }` template is "lifted up" to *become* the component's host and takes over all host machinery — `:host` styling, host bindings/attributes/listeners, host directives, providers, and refs — analogous to today's element-hosted Ivy components (`TNodeType.Element`).

  The chosen root type is carried as the 4th type parameter of `ComponentInstance<B, E, M, R>` and read via `ComponentRootOf<C>`; it defaults to `RootNode` when `rootNode` is omitted (`ng-types.ts` §5).

- **How the compiler picks the path:** The presence of `rootNode: element<T>()` selects the element-hosted lowering; its absence selects the comment-anchor lowering. For the element-hosted path the compiler must first satisfy the single-native-root constraints from `ng-dsl-type-checking-spec.md` §5.1 (ELEMENT-ROOT) and §6 (Root Resolution):
  - the template has **exactly one** renderable root node (D041), where renderable roots exclude declaration-only nodes (`@let`/`@derive`/`@fragment`) and whitespace-only text;
  - that root is **not** a control-flow block `@if/@for/@switch` (D042);
  - that root is a **native element** (D043), not another component.
  When these hold, `Root(C) = I(tag(RN(C)))` — the intrinsic host type of the lifted element — and directives applied at `<C .../>` attach to that element.

- **Element-hosted mechanism (reuses today's contract):** This path is close to current Ivy. `createComponentLView()` in `packages/core/src/render3/view/construction.ts` already requires a `TElementNode` host and passes the host native element to `rendererFactory.createRenderer(native, def)`; the lifted root element supplies exactly that. `:host` styling, host bindings/listeners/attributes, host directives, per-instance providers, and refs all target the real element as they do today. Host-targeted directives supplied at the call site (`H_host = Root(C) ⊑ H_D`, the HOST-COMPAT check D024 in `ng-dsl-type-checking-spec.md` §7) resolve against that element's intrinsic type. Uniqueness (D025) then merges the directives applied on the root inside `T(C)` with those applied at the call site, per §7.1.

- **Hostless mechanism (comment anchor):** This is the delta from Ivy today. `ɵɵelementContainer` already creates a comment-backed `TNodeType.ElementContainer` for `<ng-container>`, and directives can match on it. Components are different: current directive matching asserts a component host is a `TNodeType.Element`, and component view creation assumes it can retrieve an `RElement` host. The hostless path needs:
  1. **Anchor Instruction:** The parent template calls a new instruction such as `ɵɵcomponentAnchor(index, ComponentDef, seeds?)`. It creates or hydrates a comment node and reserves one slot in the parent `LView`, analogous to a logical container, and attaches the component `LView` to this comment-backed `TNode` rather than to an `RElement`. This mirrors the upstream "hostless components" work (angular/angular#70189), which replaces the physical host element with a comment-node anchor and returns that anchor for `ComponentRef.location.nativeElement`. (Those identifiers — `hostless`, `locateOrCreateCommentNode` — do not exist in this checkout; this section stays speculative.)
  2. **TNode Shape:** Reusing `TNodeType.ElementContainer` may be possible, but current code distinguishes "component host" from "container" in multiple places. A hostless component likely needs either a new `TNodeType` or an `ElementContainer` subtype/flag that is allowed to carry a component view.
  3. **Renderer Contract:** Hostless components need a renderer creation path that can apply styles and create child elements without a host `RElement`. Encapsulation is compiler-driven (§7) because host attributes/listeners/classes cannot be applied to a comment node.
  4. **Host machinery is unavailable, by design:** Host bindings, host listeners, host attributes, `:host`/`:host-context` styles, host directives, and `ViewEncapsulation.ShadowDom` have no element to target on a hostless component and are disallowed for it (matching angular/angular#70189). A directive whose declared host is a DOM element type cannot attach to a `RootNode` root (D024); only a directive declaring host `RootNode` (or `HTMLElement | SVGElement | RootNode`) can, and such a `RootNode` host is *inert* — it attaches, runs setup, and injects, but cannot reach the DOM (`ng-dsl-type-checking-spec.md` §7). Styling intent must instead flow through explicit `input` signals.
  5. **Hydration/SSR:** The anchor comment must be serialized and matched during hydration similarly to container anchors, as angular/angular#70189 does for its comment anchor. Hydration code that annotates or inspects host elements cannot assume every component boundary has an element.
  6. **Context Switching:** `enterView()` / `leaveView()` and the selected-index cursor remain conceptually unchanged. The parent advances past one logical slot; the child template runs in its own `LView` with its own cursor. This cursor independence is existing component behavior, not a new runtime capability.
- **Delta from Ivy Today:** Every Ivy component today is element-hosted (`TNodeType.Element`), and styling, hydration annotations, host bindings, refs, and renderer creation all assume a concrete host node. The `.ng` model keeps that contract for the element-hosted mode (`rootNode: element<T>()`, lifted root) but adds a hostless-by-default mode (`rootNode` omitted, `RootNode`) that keeps the component `LView` boundary while replacing the host element with a comment-anchor contract.

---

### 3. Component Boundaries & Encapsulation
- **Change Class:** Compiler + Runtime.
- **Internal Context vs. Public Expose:** Do not assume `lView[CONTEXT]` can simply become the `expose` object. Angular internals, debugging, hydration, `ComponentRef.instance`, and component-def lookup paths often use the context as the component instance or recover metadata from `context.constructor`. A safer design is to store an internal `.ng` component record in `LView[CONTEXT]` (or in a dedicated slot) and store the public `expose` object separately on that record.
- **Reference Resolution:** Parent refs (e.g., `<Comp ref={child} />`) resolve to the public `expose` object, not to the internal record. Component internals remain private even if Angular keeps an internal identity object for framework bookkeeping.
- **Lifecycle:** Prototype-based hooks are replaced by DI-native APIs: `DestroyRef.onDestroy` for teardown and render hooks/effects for post-render work. Render callbacks such as `afterNextRender` and `afterRenderEffect` are browser-only and do not run during SSR.
- **Query Bridging (`ref` and `refMany`):** `ref`/`refMany` should be treated as a new direct-ref mechanism, not as a thin wrapper over current `@ViewChild`/`@ViewChildren`. The compiler can emit creation/destruction hooks at each ref site that register and unregister an element/directive/component expose value with the target ref signal.
- **Lifecycle-aware refs:** A single ref must reset to `undefined` when the referenced view is destroyed (for example an `@if` branch turns false). A multi ref must preserve DOM/template order, handle duplicate sites, remove destroyed entries, and update on `@for` reordering. Appending once at child creation is insufficient.
- **Existing query nuance:** Legacy `QueryList` queries use `ɵɵqueryRefresh`, but Angular also has signal-based queries that are already lazy computed signals invalidated by view creation/insertion/deletion. The `.ng` `ref` model is still useful because it is explicit, typed by `expose`, and can avoid query predicate matching, but it should not be described as replacing an unconditional tree-walk on every CD cycle.
- **Delta from Ivy Today:** Current template refs resolve through `TNode.localNames` and LView directive/native slots. Current queries resolve matches through query metadata and refresh dirty `QueryList`/query-signal state. `.ng` refs resolve only the explicit site's value and write it into framework-owned ref signals with deterministic cleanup.

---

### 4. Fragments and Lexical Scoping
Fragments are ng-templates with typed parameters.

- **Change Class:** Compiler + Runtime.
- **Local fragment declaration:** A `@fragment` declaration can lower to an embedded template function plus a comment-backed `LContainer`, reusing the same primitives as `ɵɵtemplate`. Current embedded views already store the declaration `LView` and create an embedded `TView` with the declaration view's directive/pipe registries.
- **Runtime representation:** A fragment value should be an explicit runtime object/function that contains:
  - the template function or `TContainer`/`TNode` identity,
  - the declaration `LView` where lexical values live,
  - the typed parameter contract known to the compiler,
  - optional render options such as an override injector.
- **Lexical Capture:** Ivy's `declarationLView` gives embedded views access to their declaration tree, but JS lexical closures over `setup()` locals do not automatically appear in generated template functions. The compiler must lower captures either into the fragment runtime object/context or into generated closure functions for `.ng` templates. This is a real runtime/representation choice, not merely a type-checking feature.
- **Render sites:** If a fragment is declared and rendered in the same template, the render site can be statically allocated. If a fragment is passed as a component binding (for example `children` or `menuItem`), the consuming component receives an opaque fragment value; its `@render(fragment(args))` site still needs an `LContainer`, but the declaration view and template identity come from the fragment value supplied by the parent.
- **Typed Parameters:** The primary compiler addition over today's `ng-template` context is a strict parameter contract. Unlike `ngTemplateContextGuard`, the parameter list is part of the fragment declaration and the compiler validates calls to `@render(fragment(args))`.
- **Memory Impact:** If the implementation uses per-instance closures or capture records, memory increases relative to singleton template functions. If it uses reusable template functions plus explicit capture/context records, template code can remain shared while captures remain per instance.
- **Delta from Ivy Today:** `ɵɵtemplate`, `LContainer`, embedded `TView`, and declaration-view links remain the closest runtime primitives. The delta is the first-class fragment value, typed call contract, explicit lexical capture representation, and direct render-call syntax.

---

### 5. Derivations (`@derive`)
Template-scoped reactive computations with native DI support.

- **Change Class:** Compiler + Runtime.
- **Mechanism:**
  1. **Slot Allocation:** When the compiler encounters `@derive price = simulation(...)` inside a template, it allocates a dedicated slot in the enclosing `LView` for the derivation.
  2. **Binding Surface:** Derivation inputs are input signal nodes or read-only binding cells created for that derivation instance. They are seeded during creation and updated from parent/template expressions during the update pass.
  3. **Creation Pass:** During the enclosing view's creation pass, the runtime enters an injection context scoped to the current node/view injector and calls the derivation's `setup()` function. The returned `Signal<T>` is stored in the allocated slot. Any cleanup registered through `DestroyRef` must be associated with the enclosing view.
  4. **Update Pass:** During change detection, the compiler updates the derivation's input nodes and reads the stored result signal where the template needs the value. The signal graph handles memoization, but Angular still needs a dirty-marking path from signal invalidation to view refresh. In current signal components, template signal reads are tracked by a reactive LView consumer; embedded views currently share their declaration component's consumer rather than always getting one per embedded view.
  5. **Lifecycle:** The derivation's lifetime matches the enclosing view instance. In an `@for`, each row gets an independent derivation instance; when the row view is destroyed, the derivation's cleanup runs with that view.
- **Delta from Ivy Today:** The closest legacy analogue is a pipe instance: pipes are allocated per view slot, created in an injection context, support constructor DI, register destroy hooks, and pure pipes memoize based on input identity. Derivations differ because their result is a live `Signal<T>` and their inputs are framework-updated signal/binding nodes. They are signal-native memoization slots, but not magic runtime-only replacements for pipes; the compiler must lower declaration, inputs, reads, cleanup, and type checks.

---

### 6. Directive Application (`use:`) & Root Attachment
A directive written at a component call site — `<C use:tooltip(...) />` — attaches to `Root(C)`, the component's resolved host determined by its `rootNode` mode (§2). There is no directive-forwarding/tunnelling API in the current type model: `ng-types.ts` defines directive application through `directive({ host: ref<H>(), ... })` with `H extends DirectiveHostType` (`HTMLElement | SVGElement | RootNode`), and attachment is resolved by `ng-dsl-type-checking-spec.md` §7 `CHECK-DIRECTIVE-USE`, not by any `forward`/`surface` construct.

- **Change Class:** Compiler + Runtime, but for the element-hosted path this is closer to *Compiler-mostly* — it reuses today's Ivy directive machinery essentially unchanged.
- **Where a `use:` directive lands:** `CHECK-DIRECTIVE-USE(Γ, H_host, R_host, dir)` resolves the directive against the host element `H_host = Root(C)` (§6 Root Resolution) and then enforces `HOST-COMPAT: H_host ⊑ H_D` (D024) and `UNIQUE: D at most once per element in R_host` (D025). The resolved host depends on the mode:
  1. **Element-hosted component (`rootNode: element<T>()`).** `Root(C) = I(tag(RN(C)))`, the intrinsic type of the lifted native root element (§5.1 ELEMENT-ROOT / §6). A DOM-host directive (`H_D ⊑ HTMLElement`) attaches to that real element and behaves exactly as if it had been written directly on the element inside the component's template.
  2. **Hostless component (`rootNode` omitted, `RootNode`).** `Root(C) = RootNode`. Only a directive declaring host `RootNode` (or `HTMLElement | SVGElement | RootNode`) satisfies D024; a DOM-host directive is rejected. Such a `RootNode`-host directive is *inert* — it attaches, runs `setup`, and injects, but has no DOM element to touch (§2, `ng-dsl-type-checking-spec.md` §7).
- **Element-hosted path reuses today's Ivy machinery:** Because the lifted root is a real element (the existing, well-supported host path — `createComponentLView` already takes a `TElementNode` host), a `use:` directive on it needs no new runtime subsystem. It reuses:
  - directive slots in the TView-indexed LView expando, matched during the first create pass from `tView.directiveRegistry`,
  - host bindings and host vars,
  - DI/provider publication and bloom visibility,
  - outputs (listener setup and teardown),
  - destroy hooks and `DestroyRef`,
  - refs.
  All of these target the real root element exactly as they do when the directive is applied to that element directly. The compiler's job is to emit the directive at the component call site against the lifted root; the runtime treats it like any other element directive.
- **Attachment is non-transitive (§6):** A directive at `<C .../>` attaches to `C`'s resolved root and no further. It does not propagate to descendants of the component's template.
- **Uniqueness per resolved host element (D025, §7.1):** Because uniqueness is enforced per *resolved host element*, a call-site `use:D(...)` collides with the same directive `D` written on the root element *inside* `C`'s own template — both resolve to the same final element — and is rejected. This is the same merge described in §2: uniqueness (D025) merges the directives applied on the root inside `T(C)` with those applied at the call site.
- **Out of scope — forwarding to internal, non-root elements (speculative, beyond the current type model):** The genuinely hard case is landing a consumer-supplied directive on an *internal, non-root* element of a component. The current type model does **not** define any mechanism for this: `forward` and `surface` do not exist in `ng-types.ts`, and neither the readme nor the type-checking spec defines a directive-tunnelling API. Under the real model, the only way a consumer directive reaches a component's root is the `rootNode` mechanism above (declare `rootNode: element<T>()` so the call-site `use:` attaches to that native root). Getting one onto an interior element would require a new API and a new runtime subsystem — for illustration only, that might look like a compile-time "recipe" of directive defs passed across the boundary and executed by an `ɵɵapplyForwardedDirectives`-style instruction, backed by one of: a synthetic per-site directive range, per-`LView` side storage, or a generated adapter view. Each of those would have to re-integrate input/output alias writes, host bindings, provider/DI publication, outputs, queries, destroy hooks, debug APIs, and hydration/SSR. **None of this is part of the current proposal** and it is not required by anything in `ng-types.ts`; it is noted here only to mark the boundary of what the `rootNode` model does and does not cover.
- **Delta from Ivy Today:** For the element-hosted mode there is essentially no runtime delta — a `use:` directive on a lifted root is an ordinary element directive, matched and instantiated from `tView.directiveRegistry` into LView expando slots as today. The conceptual shift is only that the "host" the directive attaches to is the component's lifted root element rather than an arbitrary element in a template. For the hostless mode the delta is that a `RootNode`-host directive is inert (no DOM target). Forwarding to interior elements is out of scope.

---

### 7. Scoped CSS (mode-dependent)
CSS encapsulation depends on the host mode chosen in §2. Element-hosted components (`rootNode: element<T>()`) reuse today's `:host`-based encapsulation on the lifted root element; hostless components (`rootNode` omitted) have no `:host` element, so they rely on **compiler-driven scoping** (similar to Svelte/Vue).

- **Change Class:** Compiler + Runtime (renderer behavior).
- **Element-hosted mode:** The lifted root element is a real host, so ordinary emulated encapsulation applies — the compiler emits host and content attributes and `:host`/`:host-context` selectors resolve against that element, exactly as today. `ViewEncapsulation.ShadowDom` is available because there is a concrete element to own a shadow root. This is the mode to use when a component needs `:host` styling or external decoration through host bindings.
- **Hostless mode — mechanism:** With no host element, the `.ng` compiler generates a unique attribute (e.g., `_ngcontent-c123`) and applies it to **every** DOM element in the component’s template.
- **Hostless mode — ShadowDom Constraint:** Hostless components are incompatible with `ViewEncapsulation.ShadowDom` because there is no concrete host element to own a shadow root (matching angular/angular#70189, which disallows `ShadowDom` for its comment-anchored components).
- **Hostless mode — External Styling:** A parent cannot decorate a hostless component automatically; there is no `:host` and no host attributes/classes to receive. Styling intent (`class`, `style`) must be explicitly declared as `input` signals in the `bindings` block.
- **Hostless mode — Diagnostic Safety:** If a parent applies a `class` to a hostless component that hasn’t opted in via `bindings`, the compiler emits a diagnostic error.
- **Delta from Ivy Today:** Element-hosted mode preserves current emulated encapsulation with host/content attributes; hostless mode drops the host attribute and needs a hostless scoping contract.
- **Compatibility Impact:** Medium/High — influences style encapsulation, SSR serialization, and hydration style reconciliation for the hostless path.

---

## Comparison: Legacy vs. Functional Model

| Concept | Legacy Class Model | Functional `.ng` Model |
| :--- | :--- | :--- |
| **Input Timing** | Inputs uninitialized in the constructor; static attributes are applied after factory instantiation and dynamic bindings are pushed during update mode. | Input/model signal nodes are allocated and seeded before `.ng` providers/setup run. Update bindings still own ongoing synchronization. `once:` emits only the creation seed. Seed expressions must be compiler-proven safe or must initialize the update binding slot to avoid duplicate first-pass evaluation. |
| **Lifecycle Hooks** | `ngOnChanges`, `ngOnInit`, `ngDoCheck`, `ngAfterContent*`, `ngAfterView*`, `ngOnDestroy` on the class instance. | Removed from the public authoring model. Signal reactivity replaces post-input hooks; `DestroyRef.onDestroy` replaces teardown hooks; render hooks/effects replace post-render work. Angular may still need an internal context/record separate from public `expose`. |
| **Host Element** | Required physical host element; component renderer, host bindings, styling, hydration, and refs assume it. | Two modes via `rootNode`. Hostless-by-default (`rootNode` omitted, root type `RootNode`, host ≡ `ng-container`): comment anchor plus a component `LView`; renderer, hydration, and host semantics need explicit hostless paths. Element-hosted (`rootNode: element<T>()`): the unique renderable root element is lifted to become the host and reuses today's element-host machinery (`TNodeType.Element`, `createComponentLView` with a real host, `:host`, host bindings, host directives). |
| **Instruction Cursor** | Sequential `ɵɵadvance` on host. | Parent `ɵɵadvance` treats component as 1 slot; Child has a fresh cursor. |
| **Public API** | Entire class instance exposed via default template ref and `ComponentRef.instance`. | Refs and intended component interaction expose only the `expose` object. Framework internals may retain a separate component record for metadata/debug/runtime compatibility. |
| **Projection** | Implicitly handled by `<ng-content>`. | Passed as first-class fragment values in `children` and rendered with explicit `@render(...)` calls. Fragment values carry declaration view/capture information. |
| **Directives** | Automatically attach to the host element or match normal elements/containers from the compilation scope. | A plain `use:` directive at `<C .../>` attaches to `Root(C)`: the lifted native element `I(tag(RN(C)))` for an element-hosted component (`rootNode: element<T>()`), or the inert `RootNode` for a hostless one (`rootNode` omitted). HOST-COMPAT (`Root(C) ⊑ H_D`, D024) means DOM-host directives fit an element-hosted root but are rejected on a hostless (`RootNode`) root, which only accepts inert `RootNode`-host directives. On the element-hosted path this reuses existing Ivy directive machinery unchanged — directive slots, host bindings, DI/providers, outputs, destroy hooks, and refs all target the real root element as they do for any element directive. Directive forwarding to internal, non-root elements is not part of the current type model (`forward`/`surface` do not exist in `ng-types.ts`). |
| **CSS Scoping** | Tied to the physical host attribute. | Element-hosted mode reuses ordinary `:host`-based emulated encapsulation (and may use `ShadowDom`). Hostless mode has no `:host`, so scoping is applied to all template elements via compiler-generated attributes and `ShadowDom` is disallowed. |
| **Template Queries / Refs** | Decorator queries use query metadata and `QueryList`/query-signal refresh machinery; template refs resolve from `TNode.localNames` into native/directive slots. | `ref`/`refMany` are explicit, typed, lifecycle-aware registrations of elements/directives/component expose values. They must update on creation, destruction, and view reordering. A ref to a component still resolves to its `expose`; a ref to a root by host type follows the mode — `Ref<T>` for an element-hosted root, `Ref<RootNode>` for a hostless one (`ng-types.ts` §6). |
| **Transform / Memoization** | Pipe instances are per-view slots, support DI, register destroy hooks, and pure pipes memoize by input identity. | Derivations are compiler-lowered per-view slots whose inputs are signal/binding nodes and whose result is a live signal. They still need compiler lowering, update writes, dirty marking, and cleanup. |
