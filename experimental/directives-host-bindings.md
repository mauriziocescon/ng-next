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
and injector lifecycle under conditional removal.

## 4. Collisions: retain Angular's ordering

The framework MUST retain Angular's existing ordering among the sources present
in ng-next: native template bindings and directive host bindings. Registration
time and directive activation time MUST NOT introduce new priority. A
conditionally applied directive retains its assigned position when it is
removed and recreated.

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

## 5. Ownership and cleanup

Conditional application (`use:D(...):when={condition}`) introduces removal while
the element survives. Removal MUST withdraw declarative contributions; this is
a new lifecycle guarantee beyond today's fixed Angular directive instances.

The framework owns the baseline for each element/binding target, shared by all
declarative writers. The baseline is its unbound state before the first managed
writer takes ownership, including attribute absence, inline style value and
priority, class presence, or the native property value. It MUST NOT capture
another active directive's value as the original baseline. The baseline lasts
until the last writer releases the target.

On directive removal, in the render phase:

1. Remove its listeners, stop its binding evaluation, release its reactive
   references, and withdraw its contributions.
2. Restore baselines for the affected native state before replaying any surviving
   writers, accounting for coupled targets as described below.
3. Resolve surviving styling with Angular's precedence and reapply affected
   property/attribute bindings in Angular's update order, even if their values
   are unchanged.
4. Where no writer remains, leave the restored baseline and release its ownership
   record.

For reflected attributes/properties or otherwise coupled native targets,
baseline capture and restoration MUST preserve coherent native state. Restore
released state before replaying surviving writers so restoration cannot overwrite
their current values. Independent per-directive snapshots are insufficient.

For example, on an initially white background: A supplies green, then a
higher-priority B supplies blue. Removing A leaves blue; removing B afterward
restores white, not A's departed green. If A survives B instead, green returns.

Property restoration is a normal native property write. It restores the value,
not every side effect of the original setter; it cannot resurrect destroyed DOM
nodes or undo arbitrary imperative work. Only writable native properties with a
platform-supported baseline/restoration path are supported. Unsupported targets
MUST be reported rather than silently retaining a departed binding's value.

While a target is managed, its declarative bindings own its state. Imperative
writes to that same target are outside the merge/cleanup contract. Destroying
the entire element releases records and listeners without restoring a doomed
element. A new directive instance registers afresh.

## 6. Native behavior, SSR, and hydration

All writes, including restoration, use Angular's renderer and security rules.
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
listeners and preserve or reconstruct cleanup baselines. The already-bound
server DOM MUST NOT be mistaken for the unbound baseline. A platform unable to
preserve a required baseline must report that target as unsupported.

## 7. Checking and runtime integration

The host declaration continues to determine placement compatibility (D024).
Check literal keys and getter results against the native surface of `H`:

- Property/attribute/event names reuse the DOM model (D010 for unknown names);
  getter results and handler parameters use the corresponding native value/event
  types (D017 for mismatches).
- Class names and style properties remain open namespaces. Named class values
  use truthiness; whole-class values use the class-map rule above.
- Registration on a host type admitting `RootNode` is rejected (proposed D044).
- Duplicate keys, unsupported forms, and registration-lifetime violations are
  explicit errors; their diagnostic codes remain to be assigned.

Exact TypeScript declarations are deferred. The setup host remains a callable
`Ref<H | undefined>` with `register` added; the `bindings` and expose contracts
are unchanged.

Literal declaration shapes allow fixed host-binding slots. The compiler stores
layout in shared metadata; each instance stores its own getter/handler closures.
Rendering reuses native host-binding instructions and renderer paths. Cleanup
requires additional ownership, baseline, and forced-replay machinery, including
SSR/hydration support; this is not a compiler-only change.

`host()` remains the escape hatch for focus, measurement, and third-party DOM
integration. Such work uses render hooks where appropriate and explicit cleanup
through `DestroyRef`. Declarative host bindings require no directive-owned
renderer writes or cleanup callback.

## 8. Required behavioral checks

| Scenario | Required result |
|:---|:---|
| Whole-class getter changes `'a'` → `'b'` | Withdraw only this map's `a`; resolve `b` and other sources normally |
| Native template and directive bind the same class/style | Preserve Angular's template styling precedence |
| Named styling returns `undefined` versus `false` / `null` | Yield versus explicit class/style removal, as defined above |
| Two instances read different inputs | Independent values, handlers, and baselines |
| A is removed beneath B, then B is removed | B remains effective; the original baseline returns after B leaves |
| A property writer leaves while another survives unchanged | Reapply the surviving writer; no stale snapshot wins |
| Attribute and reflected property writers overlap | Restore coherent native state, then replay surviving writes |
| `attr:disabled` returns `false` versus `null` | Present attribute containing `'false'` versus removed attribute |
| Directive is removed and recreated through `:when` | No leaked listeners; stable ordering; fresh instance callbacks |
| Server-rendered directive is later removed after hydration | Restore the unbound baseline, not its server-applied value |
| A baseline cannot be preserved/restored on the target platform | Report the unsupported target rather than promise cleanup |
