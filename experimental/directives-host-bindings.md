# Directive Host Bindings

A directive declares classes, styles, attributes, properties, and listeners in
one binding object. Angular owns evaluation, rendering, ordering, and cleanup.

> Status: proposal. This extends `directive({ host, bindings, setup })` in
> `types/ng-types.ts` §8; it is not implemented. The native binding rules in
> `types/ng-dsl-type-checking-spec.md` §4 provide the starting point.
> `MUST` and `MUST NOT` below identify required behavior.

## 1. Surface

Keep `host: ref<H>()` as the host-type declaration. In setup, the same handle
provides two operations:

- `host()` reads `H | undefined`, for imperative DOM work.
- `host.register({...})` declares the directive's host bindings once.

```ts
import { directive, ref, input } from '@angular/core';

export const highlight = directive({
  host: ref<HTMLElement>(),
  bindings: {
    highlightClass: input.required<string>(),
    highlighted: input(true),
  },
  setup: ({ highlightClass, highlighted }, { host }) => {
    host.register({
      class: () => highlighted() ? highlightClass() : '',
    });
  },
});
```

Changing `highlightClass()` from `'a'` to `'b'` withdraws this directive's
contribution of `a` and adds `b`. Other sources' contributions remain subject to
Angular's styling precedence.

The object preserves the declarative binding-map experience of `host: {}` while
allowing getters to close over setup-local state. The configuration's `host`
key continues to declare the ref; setup's return value continues to be expose.
There are no descriptor factories or separate host-binding return channel.

## 2. Binding keys and values

Keys follow the DSL's native binding vocabulary. Every bound value is a getter;
every event value is a handler.

| Key | Getter result / handler | Meaning |
|:---|:---|:---|
| `class` | `string \| Record<string, boolean> \| null \| undefined` | Whole-class contribution, using Angular's class-map pipeline |
| `class:name` | Any value | Named class: truthiness, with `undefined` yielding to lower-priority styling |
| `style:property` | `string \| number \| null \| undefined` | Named inline style; units are included in the returned CSS value |
| `attr:name` | `string \| number \| boolean \| null \| undefined` | Native attribute; nullish values remove it |
| `bind:property` | The native property's writable value type | Native DOM property, not a component/directive input |
| `on:event` | `(event) => void \| boolean` | Native host event handler; returning `false` prevents default |

For example, inside setup of a button-host directive:

```ts
host.register({
  'class:active': active,
  'style:width': () => `${width()}px`,
  'attr:aria-disabled': () => disabled() ? 'true' : 'false',
  'bind:disabled': disabled,
  'on:click': onClick,
});
```

Pass a signal directly or wrap an expression in a function. Passing its current
value would capture a setup-time snapshot and is rejected:

```ts
host.register({
  'class:active': active,                        // live signal getter
  'class:selected': () => enabled() && active(), // live expression getter
  'class:invalid': active(),                     // invalid: not a getter
});
```

Static bound values use `() => value`. Getters MUST be side-effect-free.
Class-map objects MUST be replaced when their contents change; in-place mutation
does not establish reactivity or bypass Angular's identity-based diffing.

The whole-class getter and `attr:name` prefix are additions to the current DSL
spec. Template equivalents MUST receive the same native semantics when added
there. Allowing `undefined` for named styles also extends the current style
value rule to express Angular's fallback behavior.

To keep one styling pipeline, property/attribute aliases that write the whole
class or style surface, including `bind:className`, `attr:class`, and
`attr:style`, are rejected. Use `class`, `class:name`, and `style:property`.
Two-way binding, animations, global event targets, and listener options are
outside this proposal.

## 3. Registration and evaluation

Registration is optional. When present, it MUST be one unconditional,
synchronous `host.register` call in the directive's setup body, with an object
literal containing a statically known set of unique literal keys. Computed keys,
spreads, and conditional declaration shapes are unsupported in this version.
Conditional behavior belongs inside getters and handlers.

The framework snapshots getter/handler references without evaluating getters.
Mutating the object afterward has no effect. A second call, a call outside this
setup invocation, or a non-function value is an error.

Listeners are installed during creation. Getters first run in the host-binding
update phase after initial inputs have been seeded. Subsequent evaluation uses
the normal render phase and diffing. Signal reads participate in Angular's view
tracking and scheduling, including zoneless rendering; ordinary mutable state
does not independently schedule an update. There is no separate effect per
binding or promise of per-getter dependency optimization.

Bindings attach to the framework's resolved native host, so registration does
not require `host()` to already return an element. A host type admitting
`RootNode` cannot register DOM bindings; narrowing a later `host()` read does
not change this declaration-time requirement.

### 3.1 Boundary: directive composition

`host.register` declares DOM bindings only; `use:` entries are not supported.
Composition belongs in declaration-level `hostDirectives`, retaining Angular's
static array syntax and explicit public input/output forwarding:

```ts
export const help = directive({
  host: ref<HTMLElement>(),
  hostDirectives: [
    {
      directive: tooltip,
      inputs: ['message: tooltipMessage'],
      outputs: ['dismiss: dismissed'],
    },
  ],
  setup: () => {},
});
```

This is a future API sketch; `hostDirectives` is not yet declared in
`ng-types.ts`. A bare directive reference composes behavior without exposing
bindings. Lists select public bindings; `message` forwards the same name and
`message: tooltipMessage` exposes it under an alias. There are no binding
expressions, getter wiring, or setup callbacks in this metadata.

Forwarding enriches the owner's public template API. The composed directive
owns its binding signals/emitters; the owner's setup and providers continue to
receive only its own declared bindings. The composition graph and provider
registrations must be known before provider resolution or setup, and composed
directives share the owner's lifetime.

A separate composition proposal must specify effective public binding types,
required-input forwarding, host compatibility, cycles, duplicate applications,
and injector lifecycle under view destruction.

## 4. Collisions: retain Angular's ordering

The framework MUST retain Angular's existing ordering among the sources present
in ng-next: native template bindings and directive host bindings. Registration
time MUST NOT introduce new priority. Directive applications and their ordering
are fixed for the owning view instance; recreating the view uses the same static
ordering with fresh instances.

For styling, native template styling outranks directive host styling. Within a
source, named bindings outrank whole-map bindings, which outrank static styling.
Retain Angular's existing treatment of static styling and relative directive
priority in the Ivy directive-definition order for the resolved host. ng-next
components contribute no separate component host styling source.

Distinct classes/styles can coexist. Overlapping names use this precedence,
not OR-based class merging or concatenated style values:

- Named class `false` or `null` explicitly removes the class; `undefined`
  yields to a lower-priority source.
- Named style `null` explicitly removes the style; `undefined` yields.
- A missing class-map entry yields. Clearing a whole-class contribution with
  `''`, `null`, or `undefined` withdraws that map's entries rather than erasing
  other sources' classes. A map entry of `false` explicitly suppresses its class
  at that source's priority.

Properties and attributes retain Angular's update order and change-detection
diffing; they do not acquire the styling precedence algorithm. There is no new
universal “highest-priority writer always wins” resolver for these binding kinds.
Attribute and property writes remain distinct operations, even when the native
DOM reflects one into the other.

Component call sites cannot use `class:` or `style:` (D023). A directive applied
to a component with a declared native root binds to that root element, not a
separate component host. Styling in that element's own template still has
template precedence over directive host styling. With the default `RootNode`
root, there is no native element to receive these bindings.

## 5. View-lifetime resource cleanup

A directive application and its registered bindings exist for the owning view's
lifetime. They are created with the site and destroyed with that view. There is
no operation to unregister a binding or detach a directive while its view
survives. Reactive getter results can change without changing this lifetime.

On view destruction, the framework MUST stop binding evaluation, unsubscribe
native listeners and output subscriptions, dispose view-owned effects and render
callbacks, clean up emitters and refs, and release instance-local getter/handler
closures and their captured references. Provider destruction follows the ordinary
owning injector/view lifetime. New view instances register fresh closures.
Tracked row moves retain instances and resources rather than registering again.

Bindings use normal Angular native binding and styling semantics. A changed
class map or an `undefined` styling value can reveal a lower-priority styling
source, as specified in §4. This fallback does not capture or restore a DOM
snapshot. Attributes and properties retain their own nullish-value semantics,
update order, and diffing; clearing them does not invoke a styling resolver.

There is no contract to capture or restore arbitrary pre-binding DOM state.
Destruction does not reverse arbitrary imperative writes or restore the state
of an element retained externally after its view is destroyed. Imperative work
continues to require its own explicit cleanup where appropriate.

## 6. Native behavior, SSR, and hydration

All binding writes use Angular's renderer and security rules.
Sanitization depends on the actual native tag and binding target, not just the
declared host type. Existing restrictions on event-handler attributes and
unsafe property writes remain in force.

Attributes stringify non-nullish values: `false` becomes `'false'`, which still
counts as present for a boolean HTML attribute such as `disabled`. Use
`bind:disabled` for a boolean property, or return `null` to remove the attribute.

`on:event` subscribes to the native host event only; it MUST NOT also subscribe
to a same-named component/directive output. It uses Angular's event scheduling,
error handling, teardown, and supported hydration/event-replay integration.

Getters run during SSR and serializable DOM state is rendered. Arbitrary DOM
properties and handler functions are not necessarily representable in HTML.
Hydration MUST recreate instance-local getters/handlers without duplicate
listeners and produce values consistent with the server-rendered DOM, subject
to Angular's supported mismatch policy. No restoration snapshots need to be
serialized, preserved, or reconstructed.

## 7. Checking and runtime integration

The host declaration continues to determine placement compatibility (D024).
Check literal keys and getter results against the native surface of `H`:

- Property/attribute/event names reuse the DOM model (D010 for unknown names);
  getter results and handler parameters use the corresponding native value/event
  types (D017 for mismatches).
- Class names and style properties remain open namespaces. Named class values
  use truthiness; whole-class values use the class-map rule above.
- Registration on a host type admitting `RootNode` is rejected (unallocated
  extension diagnostic; D044 remains native-root type mismatch).
- Duplicate keys, unsupported forms, and registration-lifetime violations are
  explicit errors; their diagnostic codes remain to be assigned.

Exact TypeScript declarations are deferred. The setup host remains a callable
`Ref<H | undefined>` with `register` added; the `bindings` and expose contracts
are unchanged.

Literal declaration shapes allow fixed host-binding slots. The compiler stores
layout in shared metadata; each instance stores its own getter/handler closures.
Rendering reuses native host-binding instructions, diffing, styling precedence,
and renderer paths. Instance closure storage, view-lifetime cleanup, and
SSR/hydration reconstruction still require runtime integration; this is not a
compiler-only change.

`host()` remains the escape hatch for focus, measurement, and third-party DOM
integration. Such work uses render hooks where appropriate and explicit cleanup
through `DestroyRef`. Declarative host bindings require no directive-owned
renderer writes or cleanup callback.

## 8. Required behavioral checks

| Scenario                                                  | Required result                                                                                                              |
| :-------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| Whole-class getter changes `'a'` → `'b'`                  | Withdraw only this map's `a`; resolve `b` and other sources normally                                                         |
| Native template and directive bind the same class/style   | Preserve Angular's template styling precedence                                                                               |
| Named styling returns `undefined` versus `false` / `null` | Yield versus explicit class/style removal, as defined above                                                                  |
| Two instances read different inputs                       | Independent values and handlers                                                                                              |
| Attribute and reflected property bindings update          | Distinct native writes in Angular's update order and diffing, without a styling resolver                                     |
| `attr:disabled` returns `false` versus `null`             | Present attribute containing `'false'` versus removed attribute                                                              |
| `bind:disabled` changes boolean value                     | Native boolean property semantics                                                                                            |
| An `@if` view is destroyed and recreated                  | No leaked effects, render callbacks, listeners, output subscriptions, emitters, or refs; fresh instance closures and subtree |
| A tracked `@for` row moves                                | Retain directive instances, resources, and static binding priority                                                           |
| A hydrated view is destroyed and recreated                | Consistent initial values, fresh client closures, and no duplicate listeners or leaked resources                             |