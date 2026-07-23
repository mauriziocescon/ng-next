# Wrapper API Shaping (`addBindings` / `omitBindings`)

Two mechanisms for curating a wrapper's public API on top of `component.wrap`.

> Status: proposal only. This document describes a possible evolution and is not implemented in `types/ng-types.ts` yet.

## Conventions

Normative keywords in this document follow RFC-style meaning:

- `MUST` / `MUST NOT`: mandatory behavior.
- `SHOULD` / `SHOULD NOT`: recommended behavior with possible justified exceptions.
- `MAY`: optional behavior.

## Summary

1. `omitBindings`: hide selected target bindings from the wrapper's public API.
2. `addBindings`: declare wrapper-local bindings not present on the target.

All practical scenarios described here are achievable today with a pure façade component (`component(...)`) that explicitly maps bindings to the target. This evolution optimizes ergonomics when only one or two bindings need to be adjusted, hidden, or renamed on top of a large target API.

---

## Current `component.wrap` Baseline

Today, `component.wrap(Target, config)` selects a subset of the target's bindings to handle in `setup`; the remainder is delivered to the wrapped target by `@forward()`. The wrapper's **public API is always the full target bindings** — selection only controls what `setup` receives.

```ts
// Current signature (from types/ng-types.ts)
export declare function wrap<
  ExplicitWrapperGenericsAreNotAllowed extends never = never,
  C extends ComponentInstance<unknown, unknown, any>,
  Sel extends Record<string, ComponentBindingValue> = {},
  E = void,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(
  target: C,
  config: TargetBindings<C> extends Record<string, ComponentBindingValue>
    ? {
        bindings: ValidateWrapSelection<Sel, TargetBindings<C>>;
        setup: (bindings: SetupBindings<Sel>) => SetupReturn<E, TMarkup>;
        providers?: (inputs: InputsOnly<Sel>) => Provider[];
        style?: string;
        styleUrl?: string;
      }
    : never,
): ComponentInstance<TargetBindings<C>, E, ProxySurfaceOf<C>, TMarkup>;
```

Key properties:

- Public API: always `TargetBindings<C>` (unchanged by selection).
- `bindings` is validated by `ValidateWrapSelection` (unknown keys → D027, kind mismatch → D028, type mismatch → D029).
- `setup` receives `SetupBindings<Sel>` (selected subset only).
- `providers` receives `InputsOnly<Sel>` (selected inputs only).
- Proxy surface inherited: `ProxySurfaceOf<C>`.
- Inference-only — explicit generics rejected.

---

## 1. `omitBindings`: Hide Target Bindings from the Public API

The wrapper removes selected target bindings from its external surface. Omitted bindings are **not forwarded** — the wrapper `MUST` handle them explicitly inside its template (supplying values directly to the wrapped target).

```ts
import { component, input, output, model, fragment } from '@angular/core';

export const ThirdPartyGrid = component({
  bindings: {
    rows: input.required<Row[]>(),
    columns: input.required<Column[]>(),
    density: input<'compact' | 'comfortable'>('comfortable'),
    debugMode: input<boolean>(false),
    unsafeHtml: input<boolean>(false),
    theme: input<'default' | 'corporate'>('default'),
    rowClick: output<Row>(),
  },
  setup: ({ rows, columns, density, debugMode, unsafeHtml, theme, rowClick }) => @{ ... },
});

/**
 * CorpGrid hides debugMode, unsafeHtml, theme from consumers.
 * Public API: rows, columns, density, rowClick (target minus omitted).
 *
 * The omitted bindings are supplied with hardcoded values inside the template.
 */
export const CorpGrid = component.wrap(ThirdPartyGrid, {
  omitBindings: {
    debugMode: true,
    unsafeHtml: true,
    theme: true,
  },
  bindings: {},
  setup: () => @{
    <ThirdPartyGrid
      @forward()
      debugMode={false}
      unsafeHtml={false}
      theme={'corporate'} />
  },
});
```

### Why object form

A typed marker object instead of string arrays:

```ts
omitBindings: {
  debugMode: true,
  unsafeHtml: true,
  theme: true,
}
```

Benefits:

- autocomplete on valid keys,
- rename-safe in editors,
- no `as const` tuple ergonomics,
- easier structural validation in type space.

`omitBindings` values are constrained to the literal `true`. Setting a key to `false` is a compile-time error — remove the key instead.

---

## 2. `addBindings`: Wrapper-Local Bindings

The wrapper introduces new bindings not present on the target. Added bindings appear in the wrapper's public API and in `setup`, but are **never forwarded** to the target.

```ts
import { component, input, model, output, fragment } from '@angular/core';
import { UserDetail, User } from './user-detail.ng';

/**
 * UserCard adds a wrapper-local 'highlight' input.
 * Public API: user, email, makeAdmin, children (target) + highlight (added).
 */
export const UserCard = component.wrap(UserDetail, {
  addBindings: {
    highlight: input<boolean>(false),
  },
  bindings: {},
  setup: ({ highlight }) => @{
    <section class:highlight={highlight()}>
      <UserDetail @forward() />
    </section>
  },
});
```

### Combining `omitBindings` + `addBindings` for rename

```ts
/**
 * UserProfile renames 'email' → 'contactEmail'.
 * Public API: user, makeAdmin, children (target minus omitted) + contactEmail (added).
 */
export const UserProfile = component.wrap(UserDetail, {
  omitBindings: {
    email: true,
  },
  addBindings: {
    contactEmail: model.required<string>(),
  },
  bindings: {},
  setup: ({ contactEmail }) => @{
    <UserDetail @forward() model:email={contactEmail} />
  },
});
```

### Combining with `bindings` selection

Selected bindings are removed from the forwarding payload (as in today's API) and become available in `setup`:

```ts
export const EnterpriseUser = component.wrap(UserDetail, {
  omitBindings: {
    email: true,
    makeAdmin: true,
  },
  addBindings: {
    contactEmail: model.required<string>(),
    readOnly: input<boolean>(true),
  },
  bindings: {
    user: input.required<User>(),
  },
  setup: ({ user, contactEmail, readOnly }) => {
    const effectiveUser = computed(() => ({ ...user(), role: 'enterprise' }));

    return @{
      <UserDetail
        @forward()
        user={effectiveUser()}
        model:email={contactEmail}
        on:makeAdmin={() => {
          if (!readOnly()) { /* internal policy */ }
        }} />
    };
  },
});
```

---

## Compiler Lowering

Given:

```ts
component.wrap(Target, {
  omitBindings: { x: true },
  addBindings: { y: input.required<number>() },
  bindings: { z: input.required<string>() },
  setup: ({ z, y }) => @{
    <Target @forward() x={computeX()} />
  },
});
```

The compiler:

1. `MUST` build the forwardable key set as `keys(B(Target)) \ keys(omitBindings) \ keys(bindings)`.
2. `MUST` lower `@forward()` by unrolling only the forwardable key set.
3. `MUST NOT` include `addBindings` keys in target forwarding.
4. `MUST` keep existing explicit-binding precedence: explicit bindings on `<Target @forward() ...>` override forwarded ones for the same key (collision precedence from `ng-dsl-type-checking-spec.md` §6.2 `COLLISION-PRECEDENCE`).
5. `MUST` preserve proxy-surface metadata inheritance: `P(result) = P(Target)`.
6. `MUST` treat `@forward()` as marker-only (`ForwardMarkerNode` in `ng-ast.ts`): no forwarding object, property reads, or enumeration.
7. `MUST` reject `@forward()` placed on a node that cannot consume the wrapper payload (D032).
8. `MUST` reject more than one `@forward()` placement per component template (D031).
9. `MUST` reject absence of `@forward()` when `WrapPayload.bindings ≠ ∅ ∨ P(W) ≠ never` (D025).
10. `MUST` validate that omitted keys exist in `B(Target)`.
11. `MUST` validate that `addBindings` keys do NOT collide with non-omitted target keys.

No runtime forwarding object is required.

---

## Type-Level Integration

The following type snippets are **proposed deltas** to the current type model in `types/ng-types.ts`.

### Omit map utility

```ts
type OmitMap<B> = Partial<Record<Extract<keyof B, string>, true>>;

type KeysMarkedTrue<M> = {
  [K in keyof M]: M[K] extends true ? K : never;
}[keyof M];
```

### Effective public API

```ts
// The wrapper's public API after omit + add
type EffectivePublicBindings<
  C extends ComponentInstance<any, any, any>,
  Added extends Record<string, ComponentBindingValue>,
  OmitM extends OmitMap<TargetBindings<C>>,
> = Omit<TargetBindings<C>, KeysMarkedTrue<OmitM>> & Added;

// What @forward() can deliver (target minus omitted minus selected)
type ForwardableTargetBindings<
  C extends ComponentInstance<any, any, any>,
  OmitM extends OmitMap<TargetBindings<C>>,
> = Omit<TargetBindings<C>, KeysMarkedTrue<OmitM>>;
```

### Extended `wrap` overload

This is a **proposed** extension of `component.wrap(Target, config)`, not the current signature.

```ts
export declare function wrap<
  ExplicitWrapperGenericsAreNotAllowed extends never = never,
  C extends ComponentInstance<unknown, unknown, any>,
  Sel extends Record<string, ComponentBindingValue> = {},
  Added extends Record<string, ComponentBindingValue> = {},
  OmitM extends OmitMap<TargetBindings<C>> = {},
  E = void,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(
  target: C,
  config: {
    omitBindings?: OmitM;
    addBindings?: Added;
    bindings: ValidateWrapSelection<Sel, ForwardableTargetBindings<C, OmitM>>;
    setup: (bindings: SetupBindings<Sel & Added>) => SetupReturn<E, TMarkup>;
    providers?: (inputs: InputsOnly<Sel & Added>) => Provider[];
    style?: string;
    styleUrl?: string;
  },
): ComponentInstance<
  EffectivePublicBindings<C, Added, OmitM>,
  E,
  ProxySurfaceOf<C>,
  TMarkup
>;
```

### Differences from current API

| Aspect | Current | Proposed |
|--------|---------|----------|
| Public API | `TargetBindings<C>` | `TargetBindings<C>` minus omitted, plus added |
| `setup` receives | `SetupBindings<Sel>` | `SetupBindings<Sel & Added>` |
| `@forward()` delivers | `B(Target) \ Sel` | `B(Target) \ Omitted \ Sel` |
| `addBindings` in forward | N/A | Never forwarded |
| `bindings` validates against | `TargetBindings<C>` | `ForwardableTargetBindings<C, OmitM>` |

---

## Interaction Between `omitBindings`, `addBindings`, and Forwarding

| Target binding | In `omitBindings`? | In `bindings` (selected)? | Result |
|:---|:---|:---|:---|
| `user` | No | No | Forwarded via `@forward()` to target |
| `user` | No | Yes | Handled in `setup`; explicit binding on target overrides |
| `debugMode` | Yes | — | Removed from public API; wrapper supplies value directly |
| — | — | — | `addBindings: { highlight }` → in public API + `setup`, never forwarded |

---

## Constraints and Diagnostics

| Rule | Diagnostic |
|:---|:---|
| `omitBindings` key not in `B(Target)` | `WRAP001` — unknown omit key |
| `addBindings` key collides with non-omitted target key | `WRAP002` — name collision |
| `addBindings` key collides with omitted target key | Valid — this is a rename pattern |
| Omitted required binding not explicitly supplied in template | D013 — missing required component input/model/fragment (enforced on `<Target @forward() ...>`) |
| `@forward()` absent when payload exists | D025 |
| Multiple `@forward()` placements | D031 |
| `@forward()` on incompatible node | D032 |
| `bindings` selection references an omitted key | `WRAP003` — omitted keys are not selectable |


