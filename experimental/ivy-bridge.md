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
  ɵɵcomponentAnchor(0, Counter, ɵɵseedInputs([['c', ctx.count()]]));

  // update pass: owns ongoing parent -> child synchronization
  ɵɵproperty('c', ctx.count());
  ```
  The creation seed should also initialize the corresponding binding slot, or the compiler must prove that the seeded expression is pure and safe to evaluate again in the first update pass. The proposal examples allow general TypeScript expressions and function calls, so double-evaluation is not automatically safe. Treat "signal-only/pure seed expressions" as a compiler-enforced restriction, or avoid the double evaluation by recording the seeded value into the binding slot that `bindingUpdated()` will later compare.
- **Provider Lifecycle (with eager seeding):** `providers()` runs after input/model signal nodes are allocated and seeded, but before `setup()`. This is not the same as current static provider metadata. Current Ivy publishes providers into TView/blueprint structures during first create pass (`providersResolver`) and their factories do not receive per-instance input nodes. Input-driven providers require a new per-instance provider-resolution path, likely attached to the component's node-injector factory, so `provide(Store, () => new Store(c))` can close over the current component's seeded input signal.
- **Consumer one-time bindings (`once:`):** `once:` is mostly a compiler variation: emit the creation seed and omit the update binding. Runtime still needs the same pre-factory seed path. If a `once:` value can contain arbitrary calls, it has the same purity/side-effect considerations as normal seeds, but only during creation.
- **Delta from Ivy Today:** The broad flow remains Create component boundary -> instantiate component logic -> update bindings. The important delta is that `.ng` needs a pre-instance binding-surface phase and a per-instance provider phase. Inputs are not assigned to class fields; they are created as signal nodes and passed to `setup()`. Prototype lifecycle hooks are removed from the public authoring model; post-binding reactions are signal-based, teardown uses `DestroyRef.onDestroy`, and post-render work uses render hooks/effects.

---

### 2. The "Logical Anchor" (Hostless Components)
Standard Ivy components require a physical DOM host. Hostless `.ng` components map to a **Logical Anchor**, but the change reaches more than the instruction layer.

- **Change Class:** Compiler + Runtime + Renderer/Hydration integration.
- **Current constraint:** `ɵɵelementContainer` already creates a comment-backed `TNodeType.ElementContainer`, and directives can match on it for `<ng-container>`-like behavior. Components are different: current directive matching asserts that a component host is a `TNodeType.Element`, and component view creation assumes it can retrieve an `RElement` host and pass it to `rendererFactory.createRenderer(native, def)`.
- **Mechanism:**
  1. **Anchor Instruction:** The parent template calls a new instruction such as `ɵɵcomponentAnchor(index, ComponentDef, seeds?)`. It creates or hydrates a comment node and reserves one slot in the parent `LView`, analogous to a logical container. The instruction must create a component `LView` attached to this comment-backed `TNode`, not to an `RElement`.
  2. **TNode Shape:** Reusing `TNodeType.ElementContainer` may be possible, but current code distinguishes "component host" from "container" in multiple places. A hostless component likely needs either a new `TNodeType` or an `ElementContainer` subtype/flag that is allowed to carry a component view.
  3. **Renderer Contract:** `createComponentLView()` currently passes the host native element to the component renderer. Hostless components need a renderer creation path that can apply styles and create child elements without a host `RElement`. Emulated encapsulation and Shadow DOM behavior must be handled explicitly because host attributes/listeners/classes cannot be applied to a comment node.
  4. **Host Bindings:** Host bindings, host listeners, host attributes, and component-host directives cannot implicitly target the component tag. `.ng` either forbids them for hostless components or lowers them to explicit forwarded/native elements.
  5. **Hydration/SSR:** The anchor comment must be serialized and matched during hydration similarly to container anchors. Hydration code that annotates or inspects host elements cannot assume every component boundary has an element.
  6. **Context Switching:** `enterView()` / `leaveView()` and the selected-index cursor remain conceptually unchanged. The parent advances past one logical slot; the child template runs in its own `LView` with its own cursor. This cursor independence is existing component behavior, not a new runtime capability.
- **Delta from Ivy Today:** Components are currently element-hosted (`TNodeType.Element`) and component styling, hydration annotations, host bindings, refs, and renderer creation all assume a concrete host node. Hostless mode keeps the component `LView` boundary but replaces the host element contract with a comment-anchor contract.

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

### 6. Proxy Surfaces (Instruction-Based Late Binding)
Allows directives to "tunnel" through hostless components without requiring global compiler knowledge.

- **Change Class:** Compiler + Runtime.
- **Analogy with Fragments:** The pattern mirrors fragments: the consuming compiler (CompB) prepares a compile-time artifact — a recipe of directive defs and binding functions — and passes it across the component boundary. The child (CompA) receives an opaque, typed proxy payload and places it at the `@forward()` site. Just as `@render(frag(args))` executes a pre-compiled template function without the child knowing anything about its contents, `ɵɵapplyForwardedDirectives` executes a pre-compiled directive recipe without the child knowing which directives are in it.
- **Compile-time responsibility (CompB):** When the application compiler processes `<CompA use:ripple() use:tooltip(message={msg()}) />`, it generates the full recipe: directive defs, initial binding values, and update-pass binding functions. The directive matching and validation that Ivy does today via CSS-selector scanning at the first create pass has already been done — at compile time, by CompB’s compiler.
- **The "Proxy Surface" Contract (CompA):** The child defines proxy-surface metadata with `component.proxy<T>(config)`. This is the public directive-compatibility interface CompA exposes: the proxy surface type `T` for compile-time validation. For native `@forward()` placements, the compiler resolves the actual element type through the Angular DSL `IntrinsicElements` map and checks it against `T`. Whether CompA's runtime `TView` has knowledge of the arriving directive defs depends on how the proxy payload is represented by the chosen implementation option below.
- **Runtime Execution Requirements:** A forwarded directive cannot just be an instance in arbitrary side storage unless that side storage also participates in the systems that normal directive slots participate in:
  - input/output alias lookup and update-mode writes,
  - output listener setup and teardown,
  - host binding opcodes and host vars,
  - provider publication and DI bloom visibility,
  - content/view query matching if forwarded directives remain queryable,
  - destroy hooks and `DestroyRef`,
  - debug/discovery APIs,
  - hydration and SSR serialization.
- **Implementation Options:**
  1. **Synthetic per-site directive range:** At the `@forward()` element, allocate normal directive slots for the forwarded defs when the component instance is created. This fits Ivy's existing TView/LView machinery best, but it means CompA's shared `TView` cannot be completely static with respect to forwarded directives. It may need a per-call-site child/adaptor `TView`, or a runtime extension to attach additional directive ranges to an existing TNode.
  2. **Side-storage model:** Keep CompA's `TView` static and store forwarded directive records in per-`LView` side storage. This preserves independent compilation but requires parallel implementations of most directive-slot services listed above. It is a larger runtime change than a simple instruction.
  3. **Adapter view/component:** Lower the forwarded element into a generated adapter template owned by CompB's compilation unit. The adapter can include the exact directive defs in its `TView` while CompA only renders a fragment-like insertion point. This shifts complexity toward compiler/linker output and may preserve more existing Ivy invariants.
- **Independent Compilation:** The type contract can remain independent: CompB only needs CompA's declared proxy surface type and proxy metadata. Runtime independence is harder: the chosen implementation must define where directive defs, slots, host bindings, providers, outputs, and destroy hooks live.
- **Delta from Ivy Today:** Current Ivy matches directives during first create pass from `tView.directiveRegistry`; instances live in TView-indexed LView expando slots; providers and host bindings are registered from those slots. The recipe model moves selection/validation to the consuming compiler, but runtime must still integrate the selected directives into Ivy's directive lifecycle machinery.

---

### 7. Wrapper Components (`component.wrap(Target, config)`)
A compile-time macro for structurally wrapping an existing component.

- **Change Class:** Compiler-only for binding forwarding; Compiler + Runtime if directive forwarding from section 6 is involved.
- **Mechanism:** Binding forwarding in `component.wrap(Target, { bindings, setup })` is processed at compile time. When the compiler encounters a wrapper, it:
  1. Resolves `Selected = keys(wrapper.bindings)` and type-checks `bindings` as a strict subset of `TargetBindings` (key, binding kind, and inner type preserved).
  2. Resolves `Forwarded = keyof TargetBindings - Selected`.
  3. Binds `setup` as `setup(selectedBindings)`; forwarding remainder is compiler-derived (`Forwarded`) and marker-driven via `@forward()`.
  4. Lowers `<Target @forward() />` by unrolling only `Forwarded` keys directly to target bindings.
  5. Preserves explicit prop precedence in mixed forms such as `<Target @forward() user={x} />` and `<Target user={x} @forward() />` (explicit bindings always win).
  6. Preserves proxy-surface metadata inheritance from target to wrapper so directive proxying remains parent → wrapper → target element. `ɵɵapplyForwardedDirectives` is emitted only at the target `@forward()` site.
  7. Emits no runtime forwarding object. For bindings, the generated Ivy is equivalent to explicitly writing each forwarded binding. For directives, the generated Ivy depends on the directive-forwarding implementation chosen in section 6.
- **Provider and setup boundary:** Wrapper `providers()` can only see selected input bindings, because forwarded bindings are not part of the wrapper setup contract. This matches the type proposal. Forwarded target bindings remain parent-to-target synchronization generated by the compiler.
- **Required binding diagnostics:** The compiler must prove that every required target binding is either selected by the wrapper API, explicitly supplied at the target site, or forwarded from the wrapper consumer. Otherwise the wrapper is invalid even if the runtime macro would lower mechanically.
- **Dynamic component creation:** If wrappers are values that can be passed to Router/TestBed/createComponent, the compiler/linker must emit a real Angular component definition for the wrapper value, even if its template body contains only unrolled forwarding. "Compiler-only" means there is no runtime forwarding object/spread, not that no component definition is emitted.
- **Forwarding diagnostics (wrapper context):**
  - token/object-style forwarding usage (for example `token.foo`) is invalid.
  - spread-based forwarding derivation is invalid.
  - `@forward()` applied to a node that cannot consume the wrapper payload is invalid. A wrapper binding payload must be placed on its wrapped target component; a proxy payload must be placed on a compatible native element.
- **Delta from Ivy Today:** Standard Angular has no spread syntax for forwarding component inputs. Developers must enumerate propagated bindings manually. `component.wrap(Target, config)` formalizes a strict compile-time macro for structural wrapping: binding forwarding is unrolled into normal generated input/model/output/fragment instructions, and the Ivy runtime never observes a "wrapper props object" or object-spread operation.

---

### 8. Hostless Scoped CSS
Without a `:host` element, CSS encapsulation relies on **compiler-driven scoping** (similar to Svelte/Vue).

- **Change Class:** Compiler + Runtime (renderer behavior).
- **Mechanism:** The `.ng` compiler generates a unique attribute (e.g., `_ngcontent-c123`) and applies it to **every** DOM element in the component’s template.
- **ShadowDom Constraint:** Hostless components are incompatible with `ViewEncapsulation.ShadowDom` because there is no concrete host element to own a shadow root.
- **External Styling:** A parent cannot decorate a hostless component automatically. Styling intent (`class`, `style`) must be explicitly declared as `input` signals in the `bindings` block.
- **Diagnostic Safety:** If a parent applies a `class` to a hostless component that hasn’t opted in via `bindings`, the compiler emits a diagnostic error.
- **Delta from Ivy Today:** Current emulated encapsulation uses both host/content attributes; hostless mode needs a hostless scoping contract.
- **Compatibility Impact:** Medium/High — influences style encapsulation, SSR serialization, and hydration style reconciliation.

---

## Comparison: Legacy vs. Functional Model

| Concept | Legacy Class Model | Functional `.ng` Model |
| :--- | :--- | :--- |
| **Input Timing** | Inputs uninitialized in the constructor; static attributes are applied after factory instantiation and dynamic bindings are pushed during update mode. | Input/model signal nodes are allocated and seeded before `.ng` providers/setup run. Update bindings still own ongoing synchronization. `once:` emits only the creation seed. Seed expressions must be compiler-proven safe or must initialize the update binding slot to avoid duplicate first-pass evaluation. |
| **Lifecycle Hooks** | `ngOnChanges`, `ngOnInit`, `ngDoCheck`, `ngAfterContent*`, `ngAfterView*`, `ngOnDestroy` on the class instance. | Removed from the public authoring model. Signal reactivity replaces post-input hooks; `DestroyRef.onDestroy` replaces teardown hooks; render hooks/effects replace post-render work. Angular may still need an internal context/record separate from public `expose`. |
| **Host Element** | Required physical host element; component renderer, host bindings, styling, hydration, and refs assume it. | Hostless components use a comment anchor plus a component `LView`. Renderer, hydration, host binding, and host directive semantics need explicit hostless paths. |
| **Instruction Cursor** | Sequential `ɵɵadvance` on host. | Parent `ɵɵadvance` treats component as 1 slot; Child has a fresh cursor. |
| **Public API** | Entire class instance exposed via default template ref and `ComponentRef.instance`. | Refs and intended component interaction expose only the `expose` object. Framework internals may retain a separate component record for metadata/debug/runtime compatibility. |
| **Projection** | Implicitly handled by `<ng-content>`. | Passed as first-class fragment values in `children` and rendered with explicit `@render(...)` calls. Fragment values carry declaration view/capture information. |
| **Directives** | Automatically attach to the host element or match normal elements/containers from the compilation scope. | `component.proxy<T>(config)` declares the public directive-compatible surface; consumer-supplied directives are compiled into recipes and placed at explicit `@forward()` sites. Runtime must still integrate them with directive slots or an equivalent host-binding/output/DI/destroy system. |
| **CSS Scoping** | Tied to the physical host attribute. | Applied to all template elements via compiler-generated attributes. |
| **Template Queries / Refs** | Decorator queries use query metadata and `QueryList`/query-signal refresh machinery; template refs resolve from `TNode.localNames` into native/directive slots. | `ref`/`refMany` are explicit, typed, lifecycle-aware registrations of elements/directives/component expose values. They must update on creation, destruction, and view reordering. |
| **Transform / Memoization** | Pipe instances are per-view slots, support DI, register destroy hooks, and pure pipes memoize by input identity. | Derivations are compiler-lowered per-view slots whose inputs are signal/binding nodes and whose result is a live signal. They still need compiler lowering, update writes, dirty marking, and cleanup. |
| **Component Wrapping** | Manual enumeration of every propagated binding; no spread syntax. | Compile-time macro (`component.wrap(Target, config)`) with `setup(selectedBindings)` and marker-based forwarding (`<Target @forward() />`) unrolled by the compiler. Binding forwarding has no runtime props object; forwarded directives depend on the proxy-surface runtime design. |
