# Bridging the `.ng` Proposal to Ivy

> **Highly speculative design exercise.** The `.ng` authoring APIs and runtime
> extensions discussed here are not implemented in this checkout. Statements
> about existing Angular behavior are grounded in the linked source files;
> proposed representations and execution orders remain design choices.

## 1. Scope and sources

This document explores the runtime work needed by the contracts in
[readme.md](../readme.md), [ng-types.ts](../types/ng-types.ts), its
[compile-time examples](../types/ng-types.spec.ts), and the
[template checking specification](../types/ng-dsl-type-checking-spec.md). It also includes
the additional [directive host-binding proposal](./directives-host-bindings.md).
The TypeScript helpers are sketches, not working implementations of these APIs.

The source baseline is checkout commit
`ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2`. References to “existing Ivy” mean
that checkout, not the latest upstream branch. PR
`https://github.com/angular/angular/pull/70189` is a separate experiment:
As of this review (2026-10-07), GitHub reports it as **closed and unmerged**.
The inspected patch has head commit
`098aaa9c239317f9e2d734c7537f3671840cd6e1`. Section 4 describes what that patch
actually changes.

The proposal establishes several contracts:

- Component and directive `setup` run once per instance in an injection context.
  Bindings are available immediately; component setup returns one tail-position
  markup literal, directly or as `{ template, expose? }`. Directive setup returns
  its public expose value.
- Inputs, models, outputs, and received fragment signals belong to each instance.
  Component and directive `providers` callbacks receive **inputs only**, excluding
  models even though `ModelSignal` extends `InputSignal`.
- Components default to a logical `RootNode`. An explicit `rootNode: element<T>()`
  declares a public native-root contract. Call-site directives attach to that
  root, in one step.
- Refs and injection of `.ng` component/directive tokens expose only their public
  API. Template-local fragments retain lexical captures and declaration-site
  injection ancestry by default; `@render` supports an explicit embedded-view
  injector. Derivations belong to their enclosing view instance.
- Explicit `use:` applications are fixed for their owning view instance, with
  reactive bindings. `host.register` adds declarative native bindings using
  Angular's normal binding/styling semantics and view-lifetime resource cleanup.

These contracts constrain a bridge; they do not select an instruction ABI,
component identity representation, injector implementation, or CSS mode. Existing
`ɵɵ` symbols below refer to real source. Pseudocode uses descriptive operations
instead of inventing Angular instruction names.

## 2. Reusable Ivy structures and their limits

Ivy separates shared template layout from instance state. A `TView` stores template
metadata, directive definitions, hook tables, host-binding opcodes, and a blueprint.
Each `LView` stores a particular view's context, native nodes, binding values, and
directive/provider instances. A `TNode` describes a node's layout and directive
range. Embedded views are inserted into `LContainer`s. See
[view interfaces](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/interfaces/view.ts),
[node interfaces](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/interfaces/node.ts), and
[view construction](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/view/construction.ts).

Shared template functions plus per-instance capture records are a plausible fit
for `.ng`. The compiler can turn a markup literal into template functions and
store the setup-local values they need in an internal record. JavaScript closures
are another option, with different allocation costs. An existing
`DECLARATION_VIEW` link does not automatically make arbitrary setup locals
available to a generated function.

Explicit lexical component/directive identifiers require a compiler resolution
path rather than selector discovery. However,
[resolveDirectives](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/view/directives.ts) already accepts
a matching strategy. It can be a reuse point for a statically supplied set of
definitions. Layout, DI publication, instance creation, and input/output routing
still need to agree on that set.

Native interpolation, property writes, control-flow views, and enter/leave
animations can build on existing rendering primitives. TypeScript expression
syntax and lexical lookup are compiler work; they do not imply a new DOM renderer.
Native `model:` still needs an explicit property/event conversion contract for
the supported input, select, and textarea surfaces. A writable signal alone does
not specify checkbox, selection, or value-conversion behavior.

Keeping an `LView` component boundary preserves view ownership and traversal; it
does not require a wrapper DOM element. Conversely, a comment alone is insufficient
to implement a component. DOM insertion, view movement, destruction, renderer
selection, and hydration must understand all nodes owned by the boundary.

## 3. Instance creation, seeded bindings, and DI

### 3.1 Existing creation order

For a template component host,
[instantiateAllDirectives](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/shared.ts)
creates the component `LView` before obtaining directive instances. This enables
special injections such as `ChangeDetectorRef`. It then calls
[getNodeInjectable](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/di.ts), which invokes a
`NodeInjectorFactory` and caches its result in the directive/provider slot.
Static input values are applied through `setInputsFromAttrs` **after** that
instance exists; component view `CONTEXT` is assigned the component instance.
Dynamic template inputs arrive during update execution in
[refreshView](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/change_detection.ts).

Signal inputs do not change this ordering.
[writeToDirectiveInput](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/write_to_directive_input.ts)
reads the input field from an existing instance, obtains its `InputSignalNode`,
applies a transform if present, and writes the value. Its development assertions
reject a `NodeInjectorFactory` passed in place of an instance.

Programmatic bindings are also not a pre-setup seed facility: the ordinary
[inputBinding](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/dynamic_bindings.ts) implementation
writes during its update callback. Creating with bindings therefore does not make
inputs available in a class constructor.

### 3.2 Proposed creation transaction

The seeded-binding requirement applies to components, directives, and input-only
derivations. A possible logical sequence is:

```text
evaluate the consumer's initial binding expressions in consumer scope
establish the boundary, owning view, and instance lifetime/injection context
allocate this instance's binding nodes, emitters, and host handle if applicable
seed supplied values; retain defaults; validate required delivery
call providers once synchronously with inputs, with injection/tracking suspended
register its returned providers for this instance
run setup once, resolving providers lazily as requested
retain internal state and public expose separately
render and perform initial template/host-binding updates; publish consistent refs
```

This is a dependency order, not a claim that existing creation instructions can
execute it unchanged. Boundary allocation can precede expression evaluation if
needed. For a node carrying several directives, allocation/seeding and provider
publication must account for cross-directive injection before any setup resolves
a peer. An early DI lookup must not instantiate a peer with unseeded inputs.
Reentrant creation and cyclic injection require explicit handling.

The `bindings` declaration must lower to **allocation metadata or factories**.
Evaluating `input()`, `model()`, `output()`, or `host: ref<H>()` once at module load
and reusing those objects would incorrectly share state between instances.
In particular, existing
[OutputEmitterRef](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/authoring/output/output_emitter_ref.ts)
injects `ErrorHandler` and `DestroyRef` during allocation; models allocate an
emitter too. These cannot simply be constructed outside their owning context.

Setup receives stable binding identities:

| Declaration kind  | Per-instance setup value           | Parent synchronization                                                      |
| ----------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| Input             | `InputSignal<T>`                   | Framework writes the input node                                             |
| Model             | `ModelSignal<T>`                   | Framework writes the input side; requested two-way wiring handles writeback |
| Output            | `OutputEmitterRef<T>`              | Consumer subscribes to the selected emitter                                 |
| Required fragment | `Signal<Fragment<T>>`              | Framework replaces the current source value                                 |
| Optional fragment | `Signal<Fragment<T> \| undefined>` | Same; omission starts as `undefined`                                        |

Every optional fragment binding still needs its own read-only signal. A source
change must not replace that signal or rerun setup. Missing required delivery
should fail before user initialization; TypeScript checks alone cannot protect
untyped/programmatic callers. The exact runtime validation remains to be designed.

Parent writes to a model must not call its public `.set()`: existing
[model signals](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/authoring/model/model_signal.ts) emit on public
writes, whereas framework input-node writes do not. Seeding must preserve that
distinction. One-way model binding is allowed; writeback is requested by `model:`.
The keys of the `.ng` binding record are public names; the readme explicitly
ignores primitive aliases and uses destructuring for local renaming.

### 3.3 Initial evaluation and reactive tracking

Seeding creates an evaluation problem as well as a write-order problem. With
today's instruction pattern, `bindingUpdated(lView, index, expression())` evaluates the
expression **before** comparing the slot. Prepopulating the slot suppresses a
duplicate write, not a duplicate evaluation. The DSL permits function calls and
does not establish purity for general binding expressions.
See [binding comparison](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/bindings.ts) and
[property binding](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/property.ts).

A bridge should reuse the evaluated seed during the first binding update, or
define a different initialization pass in which normal binding evaluation precedes
setup. Either approach must preserve expression ordering and signal dependency
tracking. Simply skipping the first update expression can leave the parent
unsubscribed: existing
[renderView](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/render.ts) executes creation
without the template consumer installed by `refreshView` for update execution.
Any seed cache therefore also needs a way to establish or transfer those reads
into the correct consumer. Re-evaluating only expressions proven safe is another
compiler strategy, not a restriction already present in the proposal.

`once:` deliberately freezes **input** values for an instance's lifetime. It is
valid on component, directive, and derivation inputs, and invalid on native
properties, fragments, outputs, and `model:` forms. Its lowering omits subsequent
updates. On owning-view destruction and recreation, a new directive instance
receives a new seed. Initial seeds referencing `@let`, loop context, or refs require a defined
evaluation order; unavailable refs cannot be made valid merely by allocating
binding nodes sooner.

Setup and provider registration callbacks should execute outside the consumer
evaluating the parent template, so incidental initialization reads do not become parent
template dependencies and setup can create effects. Live reads in templates,
host-binding getters, computed signals, and effects retain their normal reactive
tracking. Immediate setup-time output emissions and model writes introduce a
further ordering choice: whether consumer subscriptions are installed before
setup. The authoring sketches do not settle that choice.

### 3.4 Input-driven providers

Existing
[providersResolver](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/di_setup.ts) publishes tokens,
factory layout, and injector bloom information during the first create pass.
Factories are resolved lazily through instance slots, but provider layout belongs
to shared `TView`/`TNode` metadata.

Provider semantics are defined in [the checking spec, §5.1](../types/ng-dsl-type-checking-spec.md#51-component-declaration-contracts).
The bridge must save, clear, and restore ambient injection/reactive state around
`providers(inputs)`, including on failure, then register its array before setup.
Shared token layout needs instance-specific binding access and factory closures;
closures must never be cached in a shared `TView` or blueprint for other instances.
Same-node visibility and collision rules must remain explicit.

### 3.5 Component identity and public injection

`component()` is not specified to return a constructor. `ComponentInstance` is a
branded declaration type, and the current helper returns its configuration object.
A generated function carrying `ɵcmp`/`ɵfac` could adapt some existing APIs, but a
function-shaped token alone does not establish Router, TestBed, dynamic creation,
or debugging compatibility.

Ivy stores directive instances in slots; it uses the component instance as
`LView[CONTEXT]`. Existing
[ComponentRef.instance](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/component_ref.ts) reads that
context, while
[discovery utilities](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/util/discovery_utils.ts) recover
definitions from an instance's constructor. Hook registration also examines the
definition type's prototype. Returning a bare expose object from `ɵfac` without
adapting these paths is insufficient.

A plausible representation separates the declaration token/definition, the
internal binding-and-capture record, and the public expose value. The precise
slots are open. Crucially, `inject(Component)` and `inject(Directive)` must return
expose, just as refs do. Today `getNodeInjectable` returns the stored slot value;
a bridge retaining an internal record needs a public-resolution adapter or a
separate public token registration. Circular public API dependencies cannot be
resolved by publishing a record before its expose exists.

The DI token helpers are more incremental. `provide(token, factory)` can map to
`useFactory`; multi tokens contribute one item per provider, and factory-bearing
tokens support `provide(token)` shorthand. A factory without `autoProvided: true`
does not imply root registration. `autoProvided: true` could use Angular's
root injectable-definition machinery; it does not imply eager factory execution.
The stronger token-derived typing mainly belongs to the TypeScript layer. See
[InjectionToken](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/di/injection_token.ts) and
[R3Injector](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/di/r3_injector.ts). Programmatic creation, testing,
and full decorator interoperability remain separate design work, as the readme
states.

## 4. Logical roots, native roots, and the hostless experiment

### 4.1 Root contracts

Omitting `rootNode` gives `Root(C) = RootNode`, a non-DOM brand. It does not infer
a native root from the template, even if the template contains only `<button>`.
`element<RootNode>()` and native/`RootNode` unions are rejected as declarations.
A comment can be the runtime anchor, but the public `RootNode` handle should not
be identified with a DOM `Comment` or expose DOM methods.

Declaring `rootNode: element<T>()`, with `T` an HTML or SVG element type, requires:

1. Exactly one renderable root, excluding whitespace and `@let`/`@derive`/
   `@fragment` declarations (D041).
2. An unconditional root, outside control flow, `@defer` and its companion blocks,
   or `@boundary` (D042).
3. A native element rather than a component or other node kind (D043).
4. `ActualRoot(C)` assignable to the declared `T` (D044).

At a call site, compatibility uses **`Root(C) = DeclaredRoot(C)`**, not the
potentially narrower actual element type. A component declaring
`element<HTMLElement>()` and rendering `<button>` still rejects a directive that
requires `HTMLButtonElement`. A directive written on the internal native button
is checked against that button's intrinsic type.

Call-site `ref` always targets component expose, including on native-root
components. The native overloads of `ref<H>()` do not create an alternative
`<Component ref={...}>` contract for reading its root. Directive setup receives
its own typed host handle. Binding `class`, `style`, `disabled`, or `on:click` to
a component also uses its declared binding record; it does not automatically
write to the native root. `class:`/`style:` (D023) and `animate:` (D034) remain
invalid on component tags in either mode.

### 4.2 Hostless rendering

In this checkout, normal component matching requires an element host and
[createComponentLView](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/view/construction.ts) obtains
an `RElement` and passes it to the renderer factory. Existing
[element containers](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/element_container.ts)
provide comment-backed logical nodes and can carry directives, but are not a
complete component-host path.

A hostless bridge needs to preserve the component view while extending native
insertion, root-node collection, movement, destruction, and renderer creation for
a comment-backed boundary. Children become DOM siblings bounded by the anchor's
placement, not children of the comment. The anchor orientation and owned-node
range must be defined consistently. Parent and child instruction cursors are
already independent in Ivy; this is not a new capability.

No element exists for host properties, attributes, listeners, `:host`/
`:host-context`, or a shadow root. A compatible `RootNode` directive may still
run setup, emit outputs, inject services, and provide services. “Inert” describes
its **DOM host surface**, not its logic or DI. There is no attachment tunnelling
to a descendant component or interior element.

### 4.3 What PR #70189 demonstrates

The `https://github.com/angular/angular/pull/70189/files` adds
`@Component({ hostless: true })` metadata to decorator-based components. It does
not implement functional setup, eager input seeding, typed logical roots, or the
native-root lifting proposed here.

The patch:

- Reuses element creation instructions, changes a matched hostless node to
  `TNodeType.ElementContainer`, and calls the element-container comment creation/
  hydration path. It does not introduce a `ɵɵcomponentAnchor` instruction.
- Extends rendering, native-node collection/manipulation, and component creation
  to account for comment-backed component hosts. For dynamic creation without
  an explicit root selector/node, the location is a comment; the patch retains
  the explicit-root path rather than making every creation API uniformly hostless.
- Rejects a hostless component's own host bindings, shadow encapsulation modes,
  decorator animation configuration, and host CSS selectors. Consumer checks
  reject unclaimed DOM bindings, while allowing declared inputs/outputs and
  directive-claimed attributes.
- Keeps emulated content scoping and skips host-attribute application on comments
  in `EmulatedEncapsulationDomRenderer2.applyToHost`.
- Adds comment hydration annotations, root-node counts in `ELEMENT_CONTAINERS`,
  hydration lookup and skip-hydration handling, with runtime and SSR test cases.

The patch is evidence of the scope of hostless work, not proof that all edge cases
are solved. In particular, it does not establish a blanket ban on host directives
or transitive validation of every applied directive's DOM behavior. The `.ng`
host-type checks and `host.register` restriction are separate proposal contracts.

### 4.4 Native-root lifting through compiler-generated host metadata

The single unconditional native-root restriction makes a compile-time lowering
plausible. The compiler can lift the authored root into host metadata, let the
parent create that native element as the component host, and compile the root's
children as the component render body. This retains Ivy's parent-owned host and
child component view. It requires neither moving a DOM node after creation nor
rendering a wrapper around a second copy of the root.

For example, this proposed source:

```ts
const Counter = component({
  rootNode: element<HTMLButtonElement>(),
  setup: () => {
    const count = signal(0);
    return @{
      <button disabled={count() > 10}>
        {count()}
      </button>
    };
  },
});
```

could lower conceptually to:

```text
host metadata: native button tag, namespace, and static root attributes
setup: create count once and retain it in the component's internal context
root bindings: write disabled on the host using the component's count
child template: render count as text inside the host
```

The parent can create or hydrate the host before setup. Dynamic root bindings
execute once their child context is initialized. Existing `createComponentLView`
then has a real native host to use. The compiler and creation APIs must consume
the generated host description, but native-root lifting does not inherently
require a new runtime ownership architecture.

The source proposal defines
`AppliedDirs(C, S) = LocalDirs(RN(C)) ∪ CallSiteDirs(S)` per instantiation. D025
rejects a directive appearing in both sets. Call-site directives can remain in
the parent's host-node layout, as ordinary Angular directives do today. Root-local
directives could be incorporated through compiler metadata using a mechanism
similar to static host-directive composition; existing
[resolveDirectives](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/view/directives.ts) already merges
host directives with matched definitions before initializing the node's layout.
This is an internal lowering option, not a new component authoring API or a claim
that current host-directive semantics cover every root-local application.

Different callers can therefore have different directive sets without mutating
the shared child `TView`. The remaining integration requirements are:

- **Child lexical scope:** root bindings must still access setup locals and
  template declarations, even though the parent creates the host. Root-local
  directive inputs depending on those values need a defined initialization order.
- **Styling precedence:** root-authored styling must retain native template
  precedence. Translating it into ordinary component host bindings could change
  which source wins; the lowering must preserve its source priority explicitly.
- **Directive semantics:** root-local and call-site directives need compatible
  input routing, injection contexts, ordering, duplicate checks, and cleanup.
  A composition-like layout alone does not establish these guarantees.
- **Refs and declarations:** refs to the authored root and declarations beside
  it need correct scope and registration after the root is removed from the child
  template's native-node creation sequence.
- **Renderer and hydration:** tag, namespace, attributes, scoping, and hydration
  identity must describe one host element that is created or claimed exactly once.

Keeping root creation in the child and bridging native-node access is another
possible design, with more ownership questions. It is not necessary to assume
that design when assessing the simpler compiler-generated host approach.

## 5. Directive applications and declarative host bindings

### 5.1 Explicit, view-lifetime `use:`

For a fixed application on an ordinary native element, much of Ivy's machinery is
reusable: definition layout, node injection, input nodes, output subscriptions,
host-binding execution, and teardown. Explicit syntax still changes routing:
`use:tooltip(message={...})` targets **that directive's** input, independently of
same-named element or peer inputs. Existing `ɵɵproperty` can fan out to several
matching inputs. Direct targeting needs the equivalent of
`setDirectiveInput` and
[listenToDirectiveOutput](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/view/directive_outputs.ts),
rather than blindly emitting that fan-out path.

Applications are fixed for the owning view instance. Sites inside `@if`, `@for`,
or other view-producing constructs create and destroy their directives with the
view. A tracked row move retains those instances. Removing a site through `@if`
recreates its subtree on re-entry; element identity, focus, and component-local
state are not preserved across removal and recreation. There is no directive-only
detachment while the element or component boundary survives.

Existing
[NodeInjectorDestroyRef](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/linker/destroy_ref.ts) registers
callbacks on an `LView`, matching this owning-view lifetime. Teardown must dispose
view-owned effects, render callbacks, emitters, listeners, output subscriptions,
providers where applicable, and refs. The bridge needs integration with these
ordinary cleanup paths rather than shorter directive-specific lifetimes.

### 5.2 `host.register`

The [host-binding extension](./directives-host-bindings.md) requires at most one
unconditional synchronous registration with a statically known object shape.
It snapshots getter/handler references without evaluating getters. A host type
admitting `RootNode` cannot register DOM bindings, even when setup later narrows
a host read. This API and its precise TypeScript declarations are not yet present
in `ng-types.ts`.

Static keys allow shared binding layout; getter/handler closures remain instance
state. Generated host-binding functions could read those closures and reuse
Ivy's native property, attribute, class-map, and named styling instructions.
Listeners install during creation; getters first evaluate after seeding in the
host-binding update phase. Native host properties and events must target the
element directly, without component/directive input or output fallback.
The checkout already has
[`ɵɵdomProperty`](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/dom_property.ts) and
[`ɵɵdomListener`](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/listener.ts) paths for
that distinction. The general listener path can also subscribe to same-named
outputs and is not an interchangeable lowering for a native-only host event.
Getters must be side-effect-free. The registration shape excludes spreads,
computed keys, and conditional key sets; class/style aliases that bypass the
styling pipeline are rejected by the extension.

Existing
[host-binding execution](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/change_detection.ts)
runs under a view's reactive consumer. This provides a useful scheduling model:
signal getter reads participate in view tracking and zoneless updates. It does not
provide an effect per getter or independently scheduled binding. New view
instances must execute their getters to establish dependencies before expecting
subsequent signal invalidation to refresh the view.

Collision rules must retain Angular's styling semantics:

- Native template styling outranks directive host styling; named bindings outrank
  map bindings, which outrank static styling within a source. Directive priority
  is fixed for the owning view instance and follows the same static ordering
  on view recreation.
- Named class `false`/`null` suppresses a class; `undefined` yields. Named style
  `null` removes a style; `undefined` yields. Withdrawing a class map releases that
  source's entries rather than erasing all other classes.
- Property and attribute writes use Angular's update order and diffing; they do
  not acquire the styling precedence resolver. Reflected native properties and
  attributes remain distinct, potentially coupled targets.

See the existing
[styling instructions](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/instructions/styling.ts) and
[styling binding list](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/styling/style_binding_list.ts).
The proposal supplies no separate component host styling source: bindings authored
on a native root retain native **template** precedence, including against call-site
directives attached there.

### 5.3 View-lifetime resource cleanup

Registered bindings follow their directive's owning view lifetime. Destruction
stops evaluation, unsubscribes native listeners and outputs, disposes view-owned
effects and render callbacks, cleans up emitters and refs, and releases captured
getter/handler closures. A recreated view gets fresh instances and closures;
tracked row moves retain them. There is no general operation to unregister a
binding while the view survives.

Reactive class-map changes and `undefined` styling values use Angular's ordinary
precedence fallback. This does not restore captured pre-binding DOM state.
Attributes and properties keep their normal update order, diffing, and nullish
semantics, without a styling resolver or forced replay of unchanged writers.
The proposal neither reverses arbitrary imperative DOM writes on destruction
nor restores an externally retained element. Renderer and sanitization rules
still depend on the actual native tag and target.

Static binding layout and instance-local closure storage need runtime integration
with view cleanup and hydration, but no shared snapshot/ownership subsystem is
required for restoration.

The extension also sketches declaration-level `hostDirectives` with static
input/output forwarding. That remains an additional API absent from `ng-types.ts`,
with required-input forwarding, host compatibility, cycles, duplicates, and
provider lifetime under view destruction unresolved. `host.register` itself accepts no
`use:` entries or directive composition recipes.

## 6. Fragments, lexical capture, and outlet lifetime

### 6.1 Sources, bindings, and render descriptions

The proposal distinguishes three things:

- `fragment<T>()` / `fragment.required<T>()`: non-callable binding declaration
  metadata. Requiredness belongs to the receiving binding.
- `Fragment<T>`: a branded callable lexical source. Calling it returns opaque
  `TemplateMarkup`; a plausible representation describes rendering without
  immediately mounting DOM or executing child setup.
- The received read-only signal: reading it obtains the current source, so local
  calls use `row(item)` while received calls use `row()(item)` or `row()?.(item)`.

Component delivery can be by source-valued prop, inline named `@fragment`, or
implicit `children`. `children` must be `FragmentBinding<void>`. Directive bindings
can receive sources by value, but cannot declare inline fragments inside `use:`.
The argument convention is positional: `void` means zero arguments, a tuple means
that tuple's arguments, and an open array type means one array payload.

A runtime source needs reusable template identity, the particular lexical
instance/capture environment, and declaration-view/container links (or equivalent
metadata) preserving default injection ancestry. A call can create a lightweight
description carrying that source identity and argument values. Phantom brands, `TemplateAST`, and TypeScript
parameter types do not themselves need runtime storage. A declaration can reuse
the `ɵɵtemplate`/`TContainer`/`LContainer` model, or use another representation that
retains equivalent ownership, lexical captures, and declaration-linked DI.

Fragments are visible to all siblings in their child list, unlike forward-scoped
`@let` and `@derive`. A direct left-to-right allocation scheme must therefore
predeclare fragment handles or otherwise support a use before its declaration.
Captures of values initialized later still need a sound initialization order.

### 6.2 Declaration-site lexical scope and default DI

Existing [TemplateRef](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/linker/template_ref.ts)
inherits both binding and injection context from its declaration site, even when
inserted elsewhere. The proposed fragment default follows this model: lexical
captures and default injection ancestry remain declaration-linked. Rendering a
fragment inside another component does not automatically select that receiver's
providers. If `Parent` declares content rendered by `Menu` and both provide
`Theme`, a descendant within the fragment resolves the declaration-side value
by default, absent a nearer provider or restrictive injection flags.

An explicit non-null `options.injector` supplies an embedded-view injector.
[createAndRenderEmbeddedLView](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/view_manipulation.ts)
preserves declaration links and accepts that injector. Existing
[embedded injector lookup](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/di.ts)
interleaves fragment-local node lookup and the embedded-view injector; unresolved
tokens can fall back through declaration ancestry. The override does not erase
all ancestors. Omitted, `undefined`, and `null` mean no override. Preserve
Angular's injection-flag behavior instead of introducing a new lookup algorithm.

This restriction improves reuse of declaration-linked embedded views. The
composition trade-off is that consumer-authored fragments do not automatically
inject the receiving menu/list/controller's services. Typed parameters and
explicit injector overrides can supply that context. `inject()` still requires
a supported injection context, such as descendant setup.

### 6.3 Proposed outlet reconciliation

Each `@render` site owns its container and embedded view. The proposed runtime
policy retains the view while source definition, lexical instance, and effective
injector stay the same, updating argument/context slots in place. Allocating a
fresh render description does not alone imply a fresh subtree. A different source
or effective injector replaces the view; `undefined` destroys existing content
and renders nothing; a later source mounts a fresh instance. Other outlets and
the receiver stay alive.

The effective injector is the explicit non-null override, or the source's
declaration-linked default when there is no override. Omitted, `null`, and
`undefined` overrides share the same no-override identity. Switching injectors
must not retain instances with their old dependencies.

This identity/lifetime policy is proposed runtime behavior, not proved by the
type contracts. Source lifetime after its declaration view is destroyed, capture
retention, and transplanted-view refresh still need validation.

Fragments generalize deferred view creation rather than merely renaming
`ng-content` projection. Each outlet can own separate component/directive instances
and cleanup. Mounting the same source twice must not move one pre-existing DOM
subtree between the outlets.

## 7. Derivations, reactivity, and cleanup

`@derive price = simulation(item={item} qty={1});` introduces a `Signal<T>` for
later siblings and descendants in that template scope. It accepts only input
bindings, including `once:`. It has no host, models, outputs, fragments, or
providers configuration.

A lowering can allocate a derivation record in the enclosing `LView`, allocate
and seed its input nodes, then call setup once in that view's injection context.
Later updates write inputs before uses of the returned signal. Each `@for` row
owns a distinct instance; a tracked row move retains it, and row destruction
disposes its resources. Signal results can depend on injected reactive services
as well as inputs; they are not just pure input-tuple caches.

Existing [pipe allocation](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/pipe.ts) offers an analogue
for per-view slots, DI, and destroy hooks, but has different contracts. Pure pipe
bindings cache on argument identity; a derivation returns a live signal. Copying
pipe creation or a generic `runInInjectionContext` call does not automatically
establish the desired derivation injector and lifetime at a declaration that has
no native node. Those require a deliberate view-level context or logical site.
Likewise, `new SomePipe(...)` does not synthesize constructor arguments from DI;
the readme's `DatePipe` wrapper explicitly calls `inject(LOCALE_ID)` and passes it.

Existing
[reactive view consumers](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/reactive_lview_consumer.ts)
track template signal reads and mark ancestor traversal on invalidation. Embedded
views normally share the active containing component's consumer; temporary
consumers cover some direct embedded-view refresh paths. They do not normally
receive an independent consumer per row. A bridge can retain this granularity;
finer derivation or fragment scheduling would be a separate change.

Lifecycle is owned by framework contexts rather than user prototypes:
`DestroyRef.onDestroy` handles teardown, effects handle live reactions, and render
hooks handle post-render work. Setup is not rerun on signal updates. Existing
[effect creation](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/reactivity/effect.ts) uses
`ViewContext` and `DestroyRef` to distinguish view effects from root effects;
an environment-injector-only adapter could accidentally change both timing and
cleanup. The bridge must preserve view-aware contexts for setup, directives,
and derivations, with ordinary owning-view cleanup as described in section 5.
`afterNextRender` and `afterRenderEffect` do not execute during SSR. Removing lifecycle hooks from
`.ng` authoring does not remove their runtime support for decorator-based classes.

## 8. Explicit refs and public values

`ref` and `refMany` are read-only signals populated by the framework. They target
native values at native sites and expose values at component/directive sites;
`:ref` captures a particular directive. Without expose, the declared types are
`Ref<undefined>` and `Ref<[]>`. They do not permit arbitrary provider reads.

The compiler can register values directly at explicit sites, avoiding query
predicate matching. Registration still needs lifecycle/order bookkeeping:

- A single ref used at several sites follows the spec's “last rendered wins” rule
  in template order. Removing the winning site should reveal a surviving earlier
  site, or `undefined` when none remains. This fallback is a proposed runtime
  interpretation; unconditionally clearing on any site's destruction would lose
  an active match.
- `refMany` should reflect active sites in rendered template order, including
  tracked `@for` moves and view creation/destruction. A one-time append is
  insufficient; internal site identity must distinguish repeated instances.
- Publication must be consistent with completed rendering. The proposal tells
  users to read refs after render hooks; initial setup cannot assume child refs
  already exist. Render hooks do not make refs a browser-only storage mechanism.

Existing refs use `TNode.localNames` and native/directive slots. Existing
[signal queries](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/render3/queries/query_reactive.ts) are lazy
computed signals invalidated through query dirtiness, with a guard against partial
creation results. Explicit refs are a different selection contract; they should
not be justified by claiming current queries always walk the entire tree on every
change-detection pass.

## 9. CSS, SSR, hydration, and native security

The current `.ng` config declares `style` and `styleUrl`, not an `encapsulation`
option or component host-binding object. CSS policy beyond those fields remains
open. In particular, a native root does not by itself grant a Shadow DOM API;
shadow-root-compatible hosts are more restrictive than `HTMLElement | SVGElement`.

For hostless components, retaining emulated **content** scoping is plausible.
Angular already splits CSS rewriting in
[ShadowCss](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/compiler/src/shadow_css.ts) from attribute application in
[the DOM renderer](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/platform-browser/src/dom/dom_renderer.ts).
Content attributes can remain while host selectors and host attributes are
unavailable, as PR #70189 demonstrates. Hostless operation does not inherently
require a separate Svelte/Vue-style scoping engine or compiler-emitted attribute
write for every element.

For native-root components, renderer selection and scoping must account for the
element being both the declared root and an element authored in its own template.
It may need both that component's content scope and a host scope if host-selector
support is chosen, as well as its parent's applicable scope. Normal host creation
does not settle this automatically. Fragment-rendered content should retain its
source's lexical style ownership and declaration-linked default DI ancestry.
An explicit embedded-view injector changes dependency lookup, not the fragment's
source/style ownership or lexical captures.

SSR and hydration must preserve the same ownership and ordering:

- Logical boundaries need serialized anchors, root ranges/counts, template/source
  identity, and compatible client lookup. Existing hydration host-attribute
  assumptions require extensions; PR #70189 illustrates changes in
  [annotation](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/hydration/annotate.ts) and
  [lookup](https://github.com/angular/angular/blob/ff0dbf1cd47bb2a252ae87719dd193a8fbb064e2/packages/core/src/hydration/node_lookup_utils.ts).
- Native roots must hydrate one element with the merged directive set, not claim
  it independently as both parent host and child root. Namespace and valid HTML
  placement matter, especially for table, select, and SVG content.
- Functional captures, binding nodes, and host getter/handler closures are
  reconstructed on the client. Server setup having run once does not mean client
  setup is skipped. Initial values/conditions must yield matching DOM or follow
  an explicit mismatch/skip policy.
- `host.register` getters run on the server and render serializable DOM state.
  Client instance closures must be reconstructed with values consistent with the
  server DOM or an explicit mismatch policy. Native properties and handler
  functions are not all HTML-serializable; no restoration snapshots are required.
- Host listeners retain Angular's scheduling, error handling, teardown, and
  applicable event-replay integration. Hydration and view recreation must avoid
  duplicate listeners. DOM-only defer triggers need actual native targets; a logical root
  does not provide one automatically.

All DOM binding writes must use renderer/security semantics.
Typing expressions as TypeScript does not replace sanitization based on the real
tag and binding target. `attr:disabled` returning `false` writes a present
attribute containing `'false'`; `null` removes it. Boolean native properties use
property semantics. Hostless logical handles must not accidentally bypass the
no-DOM-host contract through legacy element APIs.

## 10. Work required and decisions still open

| Area                     | Existing reuse                                              | Required extension or unresolved decision                                                               |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Lexical authoring        | Shared template functions, `TView`/`LView`                  | `.ng` parser/checker/lowering; per-instance capture representation                                      |
| Seeded setup             | Signal input nodes, node factories                          | Pre-setup allocation/seeding; initial expression reuse and tracking; subscription timing                |
| Input-driven providers   | Lazy factories, provider/multi-provider machinery           | Per-instance closures for shared fixed layout; seeded inputs and execution contexts                     |
| Identity and expose      | Definitions, DI lookup, component views                     | Internal/public separation, public injection, debug/API adapters                                        |
| Hostless roots           | Element-container anchors, PR experiment                    | Full owned-node/renderer/hydration contract and logical handles                                         |
| Native roots             | Parent-owned hosts, element renderer, directive composition | Compiler-generated host metadata; child-context root bindings and preserved directive/styling semantics |
| View-lifetime directives | Static directive slots, host bindings, destroy machinery    | Explicit input/output targeting; ordinary effect/listener/output/ref cleanup                            |
| Registered host bindings | Native binding instructions, styling precedence             | Instance closures, view-lifetime cleanup, SSR/hydration reconstruction                                  |
| Fragments                | Embedded views, containers, declaration links               | Callable sources/captures, declaration-site DI, identity and injector reconciliation                    |
| Derivations              | Per-view slots, signal graph                                | Seeded input record, node-less view context, cleanup                                                    |
| Refs                     | Signals, view insertion/removal bookkeeping                 | Explicit site registry, last-site fallback, collection order                                            |

Runtime experiments should check the contracts rather than only emitted
instruction names. Particularly useful cases are two instances with different
input seeds sharing fixed registrations but independent factories/services;
callback isolation and ambient-state restoration; side-effectful initial expressions;
parent signals read only for seeds; same-node peer injection; a native root with different directives
at different call sites; view destruction/recreation with effects and providers;
class-map changes, styling collisions, and attribute/property semantics;
declaration-side `Theme` lookup despite a receiver provider; explicit injector
lookup and declaration fallback with Angular's flags; nullish override identity;
fragment source and injector changes; repeated fragment outlets; ref fallback and
tracked row reordering; and hydrated view recreation without leaked resources or
duplicate listeners.

The source proposal's compile-time examples establish type relationships, not
these runtime properties. It also leaves full decorator interoperability,
programmatic creation/attachment, and a testing API intentionally incomplete.
Logical-host registration uses an explicitly unallocated extension diagnostic;
D044 remains the checking spec's native-root type mismatch diagnostic. Extension
sketches are not implemented APIs.

## 11. Runtime feasibility assessment

With directive applications fixed to view lifetimes and no DOM baseline
restoration contract, the runtime proposal, including the host-binding extension,
scores approximately **8/10 for practical feasibility within Ivy**. Fixed provider
registrations allow shared injector layout; view-lifetime directives, ordinary
host-binding cleanup, and declaration-site fragment DI improve reuse of Ivy's
existing machinery. Per-instance factories, initialization, and hydration still
require prototypes.

These scores are qualitative engineering judgments based on the source analysis
above. A score of 10 means a strong architectural fit with manageable extensions;
5 means feasible but requiring substantial architectural changes; 1 means severe
incompatibility with the existing runtime. They are not measured performance
results, delivery estimates, or probabilities of upstream acceptance. The overall
score reflects interactions between features, not an arithmetic average.

There is no obvious fundamental blocker in the contracts examined here. Ivy
already supplies views, containers, signals, rendering, and scheduling. The
hardest changes concern early initialization, per-instance provider factories,
fragment outlet reconciliation, and hydration. Native-root lifting has a plausible
compiler-generated host path that preserves ordinary Ivy ownership; its remaining
integration work does not, by itself, justify treating it as a major ownership
redesign.

### 11.1 Feasibility by runtime area

| Runtime area                                     | Score  | Main difficulty                                                                                             |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------- |
| Functional setup and lexical captures            | 8/10   | Separate internal records from public expose; preserve view-aware injection                                 |
| Derivations and explicit refs                    | 8/10   | Initialization, ordered registration, and cleanup                                                           |
| Hostless components                              | 7/10   | Node ranges, movement, rendering, and hydration; PR #70189 supplies useful experimental evidence            |
| Inputs available before setup                    | 6/10   | Change creation order while preserving expression evaluation and reactive tracking                          |
| Fragments with declaration-site DI               | 8/10   | Preserve declaration links; reconcile sources, arguments, and optional embedded-view injectors              |
| Input-driven providers                           | 7/10   | Per-instance factories for fixed shared layout; initialization and execution contexts                       |
| Native-root lifting and directive merging        | 6–7/10 | Generate a native host; preserve child scope, template styling priority, and root-local directive semantics |
| View-lifetime directives and registered bindings | 8/10   | Explicit targeting, instance closures, native binding semantics, and ordinary cleanup                       |

The lower scores identify greater architectural distance and unresolved semantics,
not evidence that those features are impossible. View-lifetime `host.register`
bindings reuse normal evaluation, diffing, styling precedence, and cleanup,
without directive-only detachment or DOM snapshot restoration.
The native-root score assumes the compiler-generated host approach in §4.4 and
the existing single unconditional root restriction. The overall assessment remains
contingent on initialization, provider/injector, root-binding, and hydration
prototypes. Declaration-site fragment DI removes
the need to suppress declaration fallback or select receiver ancestry by default.

### 11.2 The most difficult points

**Native-root lifting needs semantic preservation, not necessarily new ownership
(§4.4).** A compiler can lift the authored element into host metadata, keep the
host and call-site directives in the parent view, and render only its children in
the component view. Different callers then do not require mutation of the child's
shared `TView`. The remaining work is preserving child lexical scope, root-local
directive initialization and injection, refs, renderer scoping, and template
styling priority. These are meaningful integration requirements, but are more
tractable than an approach that shares one element across independent logical
owners. A prototype should validate those semantics using the compiler-generated
host approach first.

**Registered bindings need instance and hydration integration (§5 and §9).**
Static layout can reuse native host-binding instructions, but getter/handler
closures belong to instances and must be released with their views. Initial
signal reads must establish tracking; hydration must reconstruct matching values
without duplicate listeners. Styling fallback uses the existing pipeline rather
than captured native state. These integrations require prototypes even though
ordinary view cleanup now matches directive lifetimes.

**Early inputs require a coherent initialization model (§3.2–§3.3).** Allocating
and seeding signals is comparatively straightforward. Evaluating initial
expressions exactly once, tracking their signal dependencies, supporting
template-local values, and preventing DI from constructing an unseeded peer are
harder. Caching initial values solves duplicate evaluation only if dependency
tracking is also handled. A prototype should establish the complete initialization
order rather than add isolated pre-factory writes.

**Providers need per-instance closures within shared layout (§3.4).** Fixed
registrations fit Ivy; initialization and compiler analysis still need prototypes.

These difficulties compound. A directive attached to a lifted root, contributing
input-driven providers and registered bindings in a hydrated view, exercises
several integrations simultaneously. Solving each feature independently would
not establish that their combination works. Allocation, retained captures,
injector lookup, and binding evaluation have unmeasured memory and performance
costs.

### 11.3 Suggested prototype sequence

1. **Establish the core instance model:** internal records and expose, per-instance
   binding allocation, seeded setup, reactive tracking, and fixed providers with
   per-instance closures and callback isolation.
2. **Validate view-lifetime directives and registered bindings:** explicit targeting,
   instance getters/handlers, binding diffing, styling collisions, and ordinary
   effect/listener/output/ref cleanup. Check view recreation and tracked row moves.
3. **Validate view-based features:** derivations, ordered refs, and fragment
   outlets with lexical captures and declaration-site DI. Check explicit embedded-view
   injectors, declaration fallback and injection flags, nullish override identity,
   source/injector replacement, repeated outlets, and cleanup.
4. **Validate root lowering:** hostless node ranges and compiler-generated native
   hosts, including child-context root bindings, template styling priority,
   root-local and call-site directive combinations, and renderer scoping.
5. **Combine SSR/hydration and lifecycle validation:** reconstruct instance closures,
   hydrate one native host element, preserve matching initial values, and destroy
   and recreate views without duplicated listeners or leaked resources.

This sequence is a recommendation for gathering evidence, not a change to the
authoring contracts. The core deserves an implementation experiment; the full
proposal needs concrete evidence for initialization, provider/injector behavior,
root-binding semantics, and combined hydration/lifecycle cleanup before it can
be treated as a production-ready runtime design.
