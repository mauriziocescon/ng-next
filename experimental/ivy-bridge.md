# Bridging .ng Components to the Ivy Runtime

> **DISCLAIMER — Highly Speculative & Design Exercise**
> This document explores how the functional, signal-native `.ng` proposal maps onto the existing Angular Ivy engine. The runtime details and instruction names are approximations used for illustrative purposes and should not be treated as authoritative descriptions of Angular internals.

## Proposal Framing
- **Change Class:** what layer must change (`Compiler-only`, `Runtime-only`, `Compiler + Runtime`).
- **Delta from Ivy Today:** what is intentionally different from current behavior.

---

### 1. Component Instantiation: The "Fake Class" & Reactive Input Wiring
The `component()` utility returns a constructor-impersonator to satisfy the DI and Router systems.

- **Change Class:** Compiler + Runtime.
- **Shape:** The utility returns a plain JavaScript function that satisfies both the TypeScript compiler and the Angular runtime as if it were a class constructor.
- **Ivy Metadata:** The compiler attaches the standard static properties (`ɵcmp` for the component definition, `ɵfac` for the factory) directly to this function.
- **Factory Hijack:** When the Router or a template "instantiates" the component, the `ɵfac` factory function (a static property on the constructor, distinct from the `ɵɵ`-prefixed runtime instructions) is invoked. It calls `providers()` then `setup()` and returns the `expose` object instead of a class instance. `lView[CONTEXT]` stores this plain object.
- **Reactive Input Wiring — the timing problem:** In current Ivy, `renderView()` (creation pass, where the factory runs) and `refreshView()` (update pass, where `ɵɵproperty` evaluates parent expressions and calls `writeToDirectiveInput()`) are two separate, non-consecutive calls. There is no mechanism for the factory to observe any input values at construction time — static or dynamic. `initialInputs` (static literal-string attributes) are also applied after the factory. Both paths arrive too late for `providers()` or `setup()`.
- **Proposed extension — eager initial seeding:** For `.ng` component instantiation sites the compiler emits the bound input expressions both in the creation pass (as a seed) and in the update pass (for ongoing reactivity). The new `ɵɵcomponentAnchor` instruction receives this initial-values map and calls `writeToDirectiveInput()` for each entry — the same function used by `initialInputs` and the update pass — before invoking the factory:
  ```
  // creation pass: expressions evaluated once as seeds
  ɵɵcomponentAnchor(0, Counter, [‘c’, ctx.count()]);
  // update pass: unchanged — owns reactive updates
  ɵɵproperty(‘c’, ctx.count());
  ```
  Double-evaluation is safe because `.ng` bindings are signal reads (pure, side-effect free). `bindingUpdated()` in `ɵɵproperty` compares the binding slot against the new value; since the slot still starts as `NO_CHANGE`, the first update pass re-applies the value harmlessly (the signal is set to the value it already holds) and subsequent passes skip it if unchanged. This constraint — signal-only bindings — is what makes eager seeding safe and is a property the `.ng` model already guarantees.
- **Provider Lifecycle (with eager seeding):** `providers()` runs before `setup()`, and both receive signal nodes pre-populated with the parent’s current values. `factory: () => new Service(c())` works unconditionally — `c()` returns the actual parent value, not `undefined`. Passing the signal reference (`c`) remains valid for services that want to react to future changes.
- **Consumer one-time bindings (`once:`):** This is a compiler-only variation of the same flow. For `once:input={expr}`, the compiler emits the seed in `ɵɵcomponentAnchor` during creation and omits the corresponding `ɵɵproperty` in the update pass. The input is initialized once and then treated as constant from the child’s perspective. No new runtime instruction or binding type is required.
- **Delta from Ivy Today:** The core data flow — Instantiation → CD push — is preserved. Inputs are wired into the `setup` closure’s argument object rather than assigned to class instance properties. The entire class lifecycle protocol is removed: `ngOnChanges`, `ngOnInit`, `ngDoCheck`, `ngAfterContent*`, `ngAfterView*`, and `ngOnDestroy` no longer exist on the component instance. Post-binding notification (previously `ngOnChanges`) is replaced by signal reactivity; teardown by `DestroyRef.onDestroy`; post-render work by `afterRenderEffect`. `lView[CONTEXT]` stores the `expose` object, not a class instance.

---

### 2. The "Logical Anchor" (Hostless Components)
Standard components require a physical DOM host. Hostless `.ng` components map to a **Logical Anchor**.

- **Change Class:** Runtime-only.
- **Mechanism:**
  1. **Anchor Instruction:** The parent template calls `ɵɵcomponentAnchor(index, ComponentDef)`. This creates a comment node (`<!-- -->`) in the DOM. The instruction is new, but the pattern is not: `ɵɵelementContainer` (`<ng-container>`) already produces a comment-backed `TNodeType.ElementContainer`; `ɵɵcomponentAnchor` would be a third member of that family, extended to carry a component view.
  2. **LView Boundary:** The "anchor" occupies exactly one slot in the parent `LView`.
  3. **Context Switching:** `enterView()` / `leaveView()` and the per-`LFrame` `selectedIndex` cursor are unchanged. The parent advances past the anchor with `ɵɵadvance(1)`; the child runs its own template function with its own cursor. This is not a new behavior — all components already get an independent cursor. The only change is that the anchor is a comment node instead of a real element.
- **Delta from Ivy Today:** Components are currently element-hosted (`TNodeType.Element`). Hostless mode introduces a comment-backed anchor (`TNodeType.ElementContainer`-like) that carries a component view. The cursor independence is not a delta — it is how Ivy already works for every component.

---

### 3. Component Boundaries & Encapsulation
- **Change Class:** Compiler + Runtime.
- **The `expose` Hijack:** During view creation, the `expose` object returned by `setup()` is stored at `lView[CONTEXT]`.
- **Reference Resolution:** Parent template refs (e.g., `<Comp #ref />`) resolve to this `expose` object. Component internals remain private.
- **Lifecycle:** Prototype-based hooks are replaced by DI-native APIs: `DestroyRef.onDestroy` for teardown, `afterRenderEffect` for post-render work (note: `afterNextRender` is browser-only and does not run in SSR).
- **Query Bridging (`ref` and `refMany`):** The legacy query instructions (`ɵɵqueryRefresh`, `ɵɵviewQuery`) are completely bypassed. When a template uses `ref={myRef}`, the compiler generates a lightweight instruction that pulls the child's `expose` object from `lView[CONTEXT]` and pushes it directly into the `myRef` signal. `refMany` simply appends to an array signal rather than walking a static query tree.
- **Delta from Ivy Today:** Ivy's query resolution engine resolves `@ViewChild`/`@ViewChildren` tokens by walking the view tree at creation time. `ɵɵqueryRefresh` is called on every CD pass and performs a tree-walk whenever the `QueryList` is marked dirty. The signal-push model is event-driven: a single compiler-generated instruction fires once at child-creation time, writing the `expose` object into the ref signal. No periodic refresh is needed.

---

### 4. Fragments and Lexical Scoping
Fragments are ng-templates with typed parameters.

- **Change Class:** Compiler + Runtime.
- **Mechanism:** A `@fragment` declaration compiles to a standard `ɵɵtemplate` instruction, producing an `LContainer` backed by a comment node — identical to `<ng-template>`. Each `@render(frag(args))` call site is also statically known at compile time, so the compiler pre-allocates the `LContainer` at the render site, exactly as it does for existing ng-template outlets. No dynamic container establishment is required.
- **Lexical Capture:** Fragments access `setup()` variables through the existing `declarationLView` mechanism: Ivy already renders every embedded view in the context of the LView where it was declared, giving the template function access to the surrounding scope. Fragments rely on this unchanged.
- **Typed Parameters:** The sole compiler addition over `<ng-template>` is static typing for context arguments — `@fragment menuItem(item: Item) { ... }` gives `item` a concrete TypeScript type. Today’s `ng-template` context is untyped by default (requiring `ngTemplateContextGuard` workarounds). This is a compiler-only change; the runtime instruction set is identical.
- **Memory Impact:** Increases memory allocation per instance (template functions are no longer singletons) because each `setup()` closure captures its own variables. This is the expected trade-off for lexical scoping.
- **Delta from Ivy Today:** The runtime is unchanged — `ɵɵtemplate`, `LContainer`, and `declarationLView` scoping all carry over as-is. The only delta is the typed-parameter contract enforced by the compiler, and the `@render(frag(args))` call syntax replacing `*ngTemplateOutlet` + untyped context object.

---

### 5. Derivations (`@derive`)
Template-scoped reactive computations with native DI support.

- **Change Class:** Runtime-only.
- **Mechanism:**
  1. **Slot Allocation:** When the compiler encounters `@derive price = simulation(...)` inside a template, it allocates a dedicated slot in the enclosing `LView` for the derivation.
  2. **Creation Pass:** During the embedded view’s creation pass, the runtime pushes an injection context (scoped to the current view’s injector) and calls the derivation’s `setup()` function. The `Signal<T>` returned by `setup()` is stored in the allocated `LView` slot.
  3. **Update Pass:** During change detection, the runtime reads the `Signal<T>` from the slot. The signal’s own reactive graph drives all further propagation — no additional polling or dirty-checking is required.
  4. **Lifecycle:** The derivation’s lifetime matches the enclosing embedded view. When the view is destroyed (e.g., the `@for` iteration is removed), the derivation is torn down with it.
- **Delta from Ivy Today:** The closest legacy analogue is a `Pipe` instance — pipes are also allocated per view slot and applied during the update pass. Pipes do support constructor DI and `inject()` fully (they run inside a `NodeInjector` context during the creation pass). However, pipes are not first-class participants in the signal reactive graph: they are not reactive consumers and cannot produce or track `Signal<T>` values as part of the graph. Derivations are signal-native memoization slots — the `Signal<T>` they return is a live reactive node, so downstream template expressions automatically re-evaluate when the derivation’s dependencies change, without any CD dirty-marking.

---

### 6. Directive Forwarding (Instruction-Based Late Binding)
Allows directives to "tunnel" through hostless components without requiring global compiler knowledge.

- **Change Class:** Compiler + Runtime.
- **Analogy with Fragments:** The pattern mirrors fragments: the consuming compiler (CompB) prepares a compile-time artifact — a recipe of directive defs and binding functions — and passes it across the component boundary. The child (CompA) receives an opaque, typed blob and executes it at the `@forward()` site. Just as `@render(frag(args))` executes a pre-compiled template function without the child knowing anything about its contents, `ɵɵapplyForwardedDirectives` executes a pre-compiled directive recipe without the child knowing which directives are in it.
- **Compile-time responsibility (CompB):** When the application compiler processes `<CompA use:ripple() use:tooltip(message={msg()}) />`, it generates the full recipe: directive defs, initial binding values, and update-pass binding functions. The directive matching and validation that Ivy does today via CSS-selector scanning at the first create pass has already been done — at compile time, by CompB’s compiler.
- **The "Directive Forwarding" Contract (CompA):** The child defines directive forwarding metadata with `component.withDirectiveForwarding<T>(...)`. This is the only interface CompA exposes: the element type `T` for compile-time validation. CompA’s own TView has no knowledge of which directives will arrive.
- **Runtime Execution:** `ɵɵapplyForwardedDirectives` calls each directive factory in the recipe, stores the instances in a per-LView side structure at the element’s position (outside the shared TView blueprint — analogous to `LView[ON_DESTROY_HOOKS]`), and wires bindings. CD visits this side structure for host bindings; destruction scans it for cleanup.
- **Independent Compilation:** CompA’s TView blueprint is unchanged — no slots are reserved for forwarded directives. CompB needs no knowledge of CompA’s internals beyond the forwarded element type. The compiler does the structural work; the runtime does mechanical execution.
- **Delta from Ivy Today:** In current Ivy, directive matching runs at the first create pass via CSS-selector matching against `tView.directiveRegistry`; the child must have the directive in its compilation scope and the instances live in TView-indexed LView slots. The recipe model moves matching entirely to compile time (CompB’s compiler), removes the shared-registry requirement, and stores forwarded directive instances in per-LView side storage rather than in the shared TView blueprint.

---

### 7. Wrapper Components (`component.wrap`)
A compile-time macro for structurally wrapping an existing component.

- **Change Class:** Compiler-only.
- **Mechanism:** `component.wrap(Target, { bindings, setup })` is processed entirely at compile time. When the compiler encounters a wrapper, it:
  1. Resolves `Selected = keys(wrapper.bindings)` and type-checks `bindings` as a strict subset of `TargetBindings` (key, binding kind, and inner type preserved).
  2. Resolves `Forwarded = keyof TargetBindings - Selected`.
  3. Binds `setup` as `setup(selectedBindings)`; forwarding remainder is compiler-derived (`Forwarded`) and marker-driven via `@forward()`.
  4. Lowers `<Target @forward() />` by unrolling only `Forwarded` keys directly to target bindings.
  5. Preserves explicit prop precedence in mixed forms such as `<Target @forward() user={x} />` and `<Target user={x} @forward() />` (explicit bindings always win).
  6. Preserves directive forwarding metadata inheritance from target to wrapper so directive forwarding remains parent → wrapper → target element. `ɵɵapplyForwardedDirectives` is emitted only at the target `@forward()` site.
  7. Emits no additional Ivy instructions compared with explicit forwarding; no runtime forwarding object is allocated.
- **Forwarding diagnostics (wrapper binding-forwarding context):**
  - token/object-style forwarding usage (for example `token.foo`) is invalid.
  - spread-based forwarding derivation is invalid.
  - binding-forwarding `@forward()` applied to non-component elements (directives, derivations, fragments) is invalid; native element `@forward()` remains valid for directive forwarding.
- **Delta from Ivy Today:** Standard Angular has no spread syntax for forwarding component inputs. Developers must enumerate every propagated binding manually, making wrapper components fragile when the wrapped component’s API changes. `component.wrap` formalizes a strict compile-time macro for structural wrapping: the Ivy runtime never observes a "wrapper object" and incurs no object-spread overhead.

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
| **Input Timing** | Inputs uninitialized in the constructor; values pushed by CD after instantiation (`refreshView` update pass). | Input signal nodes pre-seeded by `ɵɵcomponentAnchor` before the factory runs (eager creation-pass seeding); `ɵɵproperty` in the update pass still owns reactive updates. For `once:` consumer bindings, the compiler omits that specific `ɵɵproperty`, so the value is seeded once and never updated. `providers()` and `setup()` receive inputs at their actual values. |
| **Lifecycle Hooks** | `ngOnChanges`, `ngOnInit`, `ngDoCheck`, `ngAfterContent*`, `ngAfterView*`, `ngOnDestroy` on the class instance. | Entirely removed. Signal reactivity replaces `ngOnChanges`; `DestroyRef.onDestroy` replaces `ngOnDestroy`; `afterRenderEffect` replaces `ngAfterViewInit`. `lView[CONTEXT]` stores the `expose` object, not a class instance. |
| **Host Element** | Implicitly required (physical tag). | Absent by default (comment node anchor). |
| **Instruction Cursor** | Sequential `ɵɵadvance` on host. | Parent `ɵɵadvance` treats component as 1 slot; Child has a fresh cursor. |
| **Public API** | Entire class instance exposed via template ref. | Only the `expose` object is accessible; internals remain private. |
| **Projection** | Implicitly handled by `<ng-content>`. | Passed as fragments in `children` and called as functions. |
| **Directives** | Automatically attach to the host element. | Collected in a directive recipe and propagated via directive forwarding metadata to `@forward()`. |
| **CSS Scoping** | Tied to the physical host attribute. | Applied to all template elements via compiler-generated attributes. |
| **Template Queries** | `@ViewChild`/`@ViewChildren` resolved by a tree-walk; refreshed via `ɵɵqueryRefresh` every CD cycle. | Signal-push via `ref`/`refMany`; `expose` written once at child creation — no periodic refresh. |
| **Transform / Memoization** | `Pipe` instances per view slot; limited DI access and no signal reactivity. | `derivation` slots with full native DI; driven directly by the signal reactive graph. |
| **Component Wrapping** | Manual enumeration of every propagated binding; no spread syntax. | Compile-time macro (`component.wrap`) with `setup(selectedBindings)` and marker-based forwarding (`<Target @forward() />`) unrolled by the compiler with zero runtime forwarding object overhead. |
