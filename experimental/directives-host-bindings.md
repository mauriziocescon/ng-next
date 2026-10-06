# Directive Host Bindings

A declarative, framework-owned way for a `directive` to project bindings onto its
host element — classes, styles, attributes, properties, and listeners — driven
from the `host` handle it already has.

> Status: proposal only. Nothing here is implemented in `types/ng-types.ts` or
> specified in `ng-dsl-type-checking-spec.md`. It extends the existing
> `directive({ host, bindings, setup })` surface (`ng-types.ts` §8) and reuses
> the native-element binding judgments (`ng-dsl-type-checking-spec.md` §4.1,
> §4, CHECK-NATIVE-\*).

## Conventions

Normative keywords follow RFC-style meaning:

- `MUST` / `MUST NOT`: mandatory behavior.
- `SHOULD` / `SHOULD NOT`: recommended behavior with possible justified exceptions.
- `MAY`: optional behavior.

## Summary

1. A directive projects host bindings by handing a list of **binding descriptors**
   to its `host` handle: `host.apply([...])`.
2. Descriptors are produced by pure factories — `classBinding`, `styleBinding`,
   `attrBinding`, `propBinding`, `listener` — mirroring Angular's programmatic
   `inputBinding()` / `outputBinding()` / `twoWayBinding()` creation API.
3. The framework owns diffing, cross-directive merge, render timing, and SSR —
   the directive never calls `Renderer2` for these.
4. The host element type `H` from `host: ref<H>()` types the descriptors.
   `Renderer2` + `afterRenderEffect` remains the escape hatch for genuinely
   imperative DOM work.

---

## 1. Motivation

A decorator directive binds to its host declaratively:

```ts
@Directive({
  selector: '[highlight]',
  host: { '[class]': 'appliedClass()' },
})
export class Highlight {
  readonly highlightClass = input.required<string>();
  readonly highlighted = input(true);
  protected readonly appliedClass = computed(() =>
    this.highlighted() ? this.highlightClass() : '',
  );
}
```

Angular diffs `[class]` and applies it, merges it with other directives' host
bindings on the same element, runs it in the render pass, and serializes it for
SSR.

The current ng-next `directive` (`ng-types.ts` §8) gives `setup` only a
`Ref<H | undefined>` to the host. The sole way to touch the host is imperatively:

```ts
setup: ({ highlightClass, highlighted }, { host }) => {
  const renderer = inject(Renderer2);
  afterRenderEffect(() => {
    const el = host();
    if (!el) return;
    if (highlighted()) renderer.addClass(el, highlightClass());
    else renderer.removeClass(el, highlightClass());
  });
},
```

This re-implements, by hand, what a host binding does for free — and does it
worse. The `addClass` / `removeClass` branch never removes the *old* class when
`highlightClass()` changes value (`'a'` → `'b'` leaves `a` applied). It runs in
`afterRenderEffect`, one step after the render pass, so there can be a frame
without the class. Two directives each writing `class` on the same host have no
defined merge order. And it does not run during SSR.

The gap is not expressiveness — it is that imperative writes forfeit the
framework's diffing, merge, timing, and SSR guarantees.

---

## 2. Design: actionable from `host`

`host` stays exactly one concept. In `ng-types.ts` §8 it is declared as
`host: ref<H>()` and `setup` receives it as `{ host: Ref<H | undefined> }`.
This proposal keeps that single declaration and single handle, and adds a
*method* on it:

- `host.apply(bindings)` — declarative projection, framework-owned.
- `host()` — the existing read, returning `H | undefined` for imperative use.

There is no second `host` key and no second return channel. Everything hangs off
the one handle, so the earlier `host (ref)` versus `host (host-bindings)` naming
collision does not arise.

`host: ref<H>()` is **not** optional and is not inferred away. It remains the
single source of the host element type `H`, which already gates `use:` placement
(HOST-COMPAT, spec §7, D024) and now additionally types every descriptor passed
to `host.apply(...)`.

### 2.1 The `highlight` directive, restated

```ts
import { directive, ref, input, classBinding, computed } from '@angular/core';

export const highlight = directive({
  host: ref<HTMLElement>(),
  bindings: {
    highlightClass: input.required<string>(),
    highlighted: input<boolean>(true),
  },
  setup: ({ highlightClass, highlighted }, { host }) => {
    const appliedClass = computed(() => highlighted() ? highlightClass() : '');
    host.apply([
      classBinding(appliedClass),
    ]);
  },
});
```

No `Renderer2`, no `afterRenderEffect`, no manual add/remove. Changing
`highlightClass()` from `'a'` to `'b'` removes `a` and adds `b` because the
framework diffs the descriptor, exactly as a template `class:` binding does
(spec §4.1 CLASS-BINDING).

---

## 3. Binding descriptor factories

Pure functions that return opaque, branded descriptors. They parallel Angular's
`inputBinding(name, () => value)` shape: a name (where applicable) plus a
**thunk returning the reactive value**, so the framework re-evaluates and diffs
rather than the directive pushing updates.

```ts
// one class, toggled by a boolean thunk
classBinding(name: string, present: () => boolean): HostBinding;
// a whole class map / string, like [class]="..."
classBinding(value: () => string | Record<string, boolean>): HostBinding;

// one style property; unit is folded into the property per Angular convention
styleBinding(
  prop: string,
  value: () => string | number | null,
  opts?: { unit?: string },
): HostBinding;

// attribute (setAttribute space); null removes it
attrBinding(
  name: string,
  value: () => string | number | boolean | null,
): HostBinding;

// DOM property (the [prop] space)
propBinding(name: string, value: () => unknown): HostBinding;

// host event listener
listener(
  event: string,
  handler: (event: Event) => void,
  opts?: { capture?: boolean; passive?: boolean; once?: boolean },
): HostBinding;
```

`HostBinding` is a branded descriptor (a `unique symbol`, like `ELEMENT`, `REF`,
`FRAGMENT` in `ng-types.ts` §2–3). It is opaque data: the directive builds a
`HostBinding[]`, the framework interprets it.

### 3.1 Why a descriptor array, not `host.class()` / `host.attr()` methods

An array of descriptors is preferred over per-concern methods on `host`:

- It is the **same mental model** as Angular's programmatic component creation
  (`bindings: [inputBinding(...), outputBinding(...)]`), so there is one shape to
  learn and it already covers inputs/outputs/two-way for directive composition.
- Descriptors **compose**: a `HostBinding[]` can be built conditionally, spread,
  or shared between directives. A fixed set of methods on `host` cannot.
- Adding a new binding kind is a **new factory**, not a new method on the host
  handle, so the handle's surface stays small and stable.
- The reactive value stays **data** (`() => expr`), which is what lets the
  framework own diffing — the same reason Angular models creation-time bindings
  as `inputBinding(name, signalOrThunk)`.

`.class` alone was rejected for the obvious reason: a host surface MUST be able to
bind anything a native element can — attributes, properties, classes, styles,
events — not just classes.

---

## 4. Type checking

Host-binding descriptors are checked against `H` (the type in `host: ref<H>()`)
with the **same judgments native elements already use** (spec §4). This proposal
adds no new DOM type model; it points the existing one at `H`.

```
CHECK-HOST-BINDING(H, b)
─────────────────────────────────────────────────
b = classBinding(name, present)
  Γ ⊢ present : () => boolean                              → D017 on mismatch
b = classBinding(value)
  Γ ⊢ value : () => string | Record<string, boolean>      → D017 on mismatch

b = styleBinding(prop, value, opts?)
  Γ ⊢ value : () => string | number | null                → D017 on mismatch
      (reuses STYLE-BINDING value type, spec §4.1)

b = attrBinding(name, value)
  name ∈ Attrs(H)                                          → D010 if absent
  Γ ⊢ value : () => string | number | boolean | null      → D017 on mismatch

b = propBinding(name, value)
  name ∈ Props(H)    Props(H)[name] = T                    → D010 if absent
  Γ ⊢ value : () => U    U ⊑ T                             → D017 on mismatch
      (reuses CHECK-NATIVE-INPUT, spec §4)

b = listener(event, handler, opts?)
  event ∈ Events(H)    Events(H)[event] = Event<T>         → D010 if absent
  Γ ⊢ handler : (e: T) => void                             → D017 on mismatch
      (reuses CHECK-NATIVE-OUTPUT, spec §4; arity-safe)
─────────────────────────────────────────────────
```

Notes:

- `classBinding` / `styleBinding` carry **no `D010` name check**: classes and
  style properties are open namespaces, exactly as spec §4.1 treats template
  `class:` / `style:` (truthiness and `string | number | null`, no DOM-name
  membership test).
- `attrBinding` / `propBinding` / `listener` **do** check the name against `H`'s
  `Attrs` / `Props` / `Events` (D010), reusing CHECK-NATIVE-\* verbatim. This is
  the second reason `host: ref<H>()` MUST stay: without `H`, these names cannot
  be checked.
- When `H` is `RootNode` (an inert, non-element host, `ng-types.ts` §5), there is
  no DOM surface. A descriptor against a `RootNode` host is a new diagnostic,
  **D044** (host bindings require a native-element host), consistent with how
  `RootNode` directives are inert in spec §6–7.

### 4.1 Merge with template bindings and other directives

A host element may receive bindings from its own template site (`class:`,
`style:`, properties — spec §4) *and* from every directive applied to it via
`host.apply(...)`. The framework merges them with the **same rules as multiple
template host bindings today**: classes and styles are additive (repeatable, per
NO-DUPLICATE-BINDINGS in spec §3.7), while a property or attribute written by
two sources is a conflict the framework resolves deterministically rather than
by `apply` call order. Specifying the exact precedence (template vs directive,
directive vs directive) is deferred, but it MUST be defined by the framework and
MUST NOT depend on `afterRenderEffect` scheduling.

---

## 5. `apply` semantics

```
HOST-APPLY
─────────────────────────────────────────────────
host.apply(bindings: HostBinding[]): void

- Called in setup (an injection context), at most conceptually once per
  directive instance: registration, not an update loop.
- Each descriptor's value thunk is the reactive surface. The framework
  re-evaluates thunks and diffs results across change detection.
- A directive MUST NOT need to re-call apply to react to signal changes;
  reactivity lives in the thunks.
─────────────────────────────────────────────────
```

Rationale for registration-once: it matches `inputBinding(name, signal)`, where
the binding is declared once and the signal carries the updates. Allowing
repeated `apply` calls would reintroduce imperative, order-dependent state — the
very thing this replaces.

### Lowering

Descriptors lower to the same host-binding instructions the compiler already
emits for a directive's host bindings: a creation-pass registration plus
update-pass writes gated on the thunk's dependencies. Conceptually:

```
// classBinding('active', () => highlighted())
// creation pass: register host class binding slot
// update pass:   ɵɵclassProp('active', highlighted())   — framework diffs
```

No `Renderer2` call is emitted for `apply` descriptors. `Renderer2` instructions
appear only when the directive itself calls into it from the escape hatch (§6).

---

## 6. Escape hatch

The imperative path is unchanged and remains available on the same `host`
handle for work that is genuinely not a declarative binding — focus management,
measuring layout, integrating a third-party DOM library:

```ts
setup: (_, { host }) => {
  const renderer = inject(Renderer2);
  afterRenderEffect(() => {
    const el = host();           // H | undefined, as today
    if (!el) return;
    // imperative, directive-owned DOM work
  });
},
```

Guidance: `host.apply(...)` is the default for projecting classes/styles/attrs/
props/listeners; `host()` + `Renderer2` is the exception for imperative DOM that
has no declarative descriptor.

---

## 7. Type-Level Integration

- `HostBinding` is a new branded type (a `unique symbol`), alongside `ELEMENT`,
  `REF`, `FRAGMENT` in `ng-types.ts` §2–3.
- The five factories (`classBinding`, `styleBinding`, `attrBinding`,
  `propBinding`, `listener`) are new declared functions. The DOM-name-checked
  ones (`attrBinding`, `propBinding`, `listener`) are generic over `H` so the
  checker can resolve `Attrs(H)` / `Props(H)` / `Events(H)`.
- The directive `host` context type changes from `Ref<H | undefined>` to a type
  that is still callable as `() => H | undefined` **and** carries
  `apply(bindings: HostBinding[]): void`. One handle, two capabilities — the
  `Ref<H>` read is preserved, `apply` is added.
- Nothing about `bindings`, `component`, `derivation`, or the existing refs
  changes. `AnyBindingValue`, `InputsOnly`, `ValidateDerivationBindings` are
  untouched — host bindings are a `setup`-side concern, not a `bindings`-record
  one.

---

## 8. Constraints and Diagnostics

| Rule | Diagnostic |
|:---|:---|
| `attrBinding` name ∉ `Attrs(H)` | D010 |
| `propBinding` name ∉ `Props(H)` | D010 |
| `listener` event ∉ `Events(H)` | D010 |
| descriptor value thunk type mismatch | D017 |
| `host.apply(...)` on a `RootNode` host (no DOM surface) | D044 (new) |
| `classBinding` / `styleBinding` unknown name | No error — open namespace, per spec §4.1 |
| imperative `host()` + `Renderer2` for a value a descriptor could express | No error — allowed escape hatch, discouraged |

---

## Comparison

| Concern | Imperative `Renderer2` (today) | `host.apply([...])` (proposed) |
|:---|:---|:---|
| Class value change (`'a'`→`'b'`) | Manual; old class leaks unless hand-removed | Framework diffs and swaps |
| Render timing | `afterRenderEffect`, post-render (frame gap) | Render pass, no gap |
| Merge with other directives | Undefined, call-order dependent | Framework-defined (§4.1) |
| SSR | Client-only | Serialized |
| Binds anything (attr/prop/class/style/event) | Yes, by hand | Yes, by descriptor |
| Type-checked against host `H` | No | Yes (§4) |
