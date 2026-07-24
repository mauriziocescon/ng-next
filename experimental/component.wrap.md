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

Today, `component.wrap(Target, config)` selects a subset of the target's bindings to handle in `setup`; the remainder is delivered to the wrapped target by `@forward()`. The wrapper's **public API is always the full target bindings** — selection only controls what `setup` receives. See the [Type-Level Integration](#type-level-integration) section for the current and proposed signatures.

---

## Running Example: `ThirdPartyGrid`

All examples in this document wrap the same target component:

```ts
import { component, input, output, model } from '@angular/core';

interface Row { id: string; data: Record<string, unknown> }
interface Column { key: string; label: string }
type SortOrder = 'asc' | 'desc' | 'none';

export const ThirdPartyGrid = component({
  bindings: {
    rows: input.required<Row[]>(),
    columns: input.required<Column[]>(),
    pageSize: input<number>(25),
    density: input<'compact' | 'comfortable'>('comfortable'),
    sortOrder: model<SortOrder>('none'),
    debugMode: input<boolean>(false),
    unsafeHtml: input<boolean>(false),
    theme: input<'default' | 'corporate'>('default'),
    rowClick: output<Row>(),
  },
  setup: ({ rows, columns, pageSize, density, sortOrder, debugMode, unsafeHtml, theme, rowClick }) => @{ ... },
});
```

---

## 1. `omitBindings`: Hide Target Bindings from the Public API

The wrapper removes selected target bindings from its external surface. Omitted bindings are **not forwarded** — the wrapper `MUST` handle them explicitly inside its template (supplying values directly to the wrapped target).

`omitBindings` is a string array whose elements are constrained to keys of `TargetBindings<C>`. It is the minimal honest representation of the operation: a list of names to remove.

```ts
/**
 * CorpGrid hides debugMode, unsafeHtml, theme from consumers.
 * Public API: rows, columns, pageSize, density, sortOrder, rowClick
 *             (target minus omitted).
 *
 * The omitted bindings are supplied with hardcoded values inside the template.
 */
export const CorpGrid = component.wrap(ThirdPartyGrid, {
  omitBindings: ['debugMode', 'unsafeHtml', 'theme'],
  setup: () => @{
    <ThirdPartyGrid
      @forward()
      debugMode={false}
      unsafeHtml={false}
      theme={'corporate'} />
  },
});
```

### Why array form

`omitBindings` is a set of key names — nothing more. There is no type, kind, or default value to declare (those belong to the target). An array is the most honest representation:

```ts
omitBindings: ['debugMode', 'unsafeHtml', 'theme'],
```

The generic constraint `(keyof TargetBindings<C> & string)[]` provides autocomplete on valid keys. Unknown keys produce a compile-time error. Duplicate entries are harmless (the set is deduplicated internally) but `MAY` trigger a warning.

---

## 2. `addBindings`: Wrapper-Local Bindings

The wrapper introduces new bindings not present on the target. Added bindings appear in the wrapper's public API and in `setup`, but are **never forwarded** to the target.

```ts
/**
 * CorpGrid adds a wrapper-local 'highlight' input.
 * Public API: rows, columns, pageSize, density, sortOrder, rowClick
 *             (full target) + highlight (added).
 */
export const CorpGrid = component.wrap(ThirdPartyGrid, {
  addBindings: {
    highlight: input<boolean>(false),
  },
  setup: ({ highlight }) => @{
    <section class:highlight={highlight()}>
      <ThirdPartyGrid @forward() />
    </section>
  },
});
```

### Combining `omitBindings` + `addBindings` for rename

```ts
/**
 * CorpGrid renames 'sortOrder' → 'order'.
 * Public API: rows, columns, pageSize, density, debugMode, unsafeHtml,
 *             theme, rowClick (target minus omitted) + order (added).
 */
export const CorpGrid = component.wrap(ThirdPartyGrid, {
  omitBindings: ['sortOrder'],
  addBindings: {
    order: model<SortOrder>('none'),
  },
  setup: ({ order }) => @{
    <ThirdPartyGrid @forward() model:sortOrder={order} />
  },
});
```

### Combining with `bindings` selection

Selected bindings are removed from the forwarding payload (as in today's API) and become available in `setup`:

```ts
/**
 * CorpGrid: corporate edition.
 * - Omits debugMode, unsafeHtml, theme (hardcoded internally).
 * - Adds highlight (wrapper-local).
 * - Selects rows for transformation in setup.
 * Public API: columns, pageSize, density, sortOrder, rowClick
 *             (target minus omitted minus selected) + rows (selected,
 *             still public) + highlight (added).
 *
 * Note: selected bindings remain in the public API — selection controls
 * what setup receives, not visibility.
 */
export const CorpGrid = component.wrap(ThirdPartyGrid, {
  omitBindings: ['debugMode', 'unsafeHtml', 'theme'],
  addBindings: {
    highlight: input<boolean>(false),
  },
  bindings: {
    rows: input.required<Row[]>(),
  },
  setup: ({ rows, highlight }) => {
    const filtered = computed(() => rows().filter(r => r.data['active']));

    return @{
      <section class:highlight={highlight()}>
        <ThirdPartyGrid
          @forward()
          rows={filtered()}
          debugMode={false}
          unsafeHtml={false}
          theme={'corporate'} />
      </section>
    };
  },
});
```

---

## Compiler Lowering

Given:

```ts
component.wrap(ThirdPartyGrid, {
  omitBindings: ['debugMode'],
  addBindings: { highlight: input<boolean>(false) },
  bindings: { rows: input.required<Row[]>() },
  setup: ({ rows, highlight }) => @{
    <ThirdPartyGrid @forward() rows={transform(rows())} debugMode={false} />
  },
});
```

The compiler:

1. `MUST` build the forwardable key set as `keys(B(Target)) \ omitBindings \ keys(bindings)`.
2. `MUST` lower `@forward()` by unrolling only the forwardable key set.
3. `MUST NOT` include `addBindings` keys in target forwarding.
4. `MUST` keep existing explicit-binding precedence: explicit bindings on `<Target @forward() ...>` override forwarded ones for the same key (collision precedence from `ng-dsl-type-checking-spec.md` §6.2 `COLLISION-PRECEDENCE`).
5. `MUST` preserve proxy-surface metadata inheritance: `P(result) = P(Target)`.
6. `MUST` treat `@forward()` as marker-only (`ForwardMarkerNode` in `ng-ast.ts`): no forwarding object, property reads, or enumeration.
7. `MUST` reject `@forward()` placed on a node that cannot consume the wrapper payload (D032).
8. `MUST` reject more than one `@forward()` placement per component template (D031).
9. `MUST` reject absence of `@forward()` when `WrapPayload.bindings ≠ ∅ ∨ P(W) ≠ never` (D025).
10. `MUST` validate that every element in `omitBindings` exists in `keys(B(Target))`.
11. `MUST` validate that `addBindings` keys do NOT collide with non-omitted target keys.
12. `MUST` deduplicate `omitBindings` entries internally. Duplicate entries `MAY` produce a warning but are not errors.

No runtime forwarding object is required.

---

## Type-Level Integration

The following type snippets are **proposed deltas** to the current type model in `types/ng-types.ts`.

### Current `wrap` signatures (from `types/ng-types.ts`)

```ts
// With bindings (selected subset of target bindings)
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

// No bindings (forward everything)
export declare function wrap<
  ExplicitWrapperGenericsAreNotAllowed extends never = never,
  C extends ComponentInstance<unknown, unknown, any>,
  E = void,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(
  target: C,
  config: {
    bindings?: never;
    setup: () => SetupReturn<E, TMarkup>;
    providers?: () => Provider[];
    style?: string;
    styleUrl?: string;
  },
): ComponentInstance<TargetBindings<C>, E, ProxySurfaceOf<C>, TMarkup>;
```

### Omit array utility

```ts
// Constrains array elements to valid target binding keys
type OmitArray<B> = readonly (Extract<keyof B, string>)[];

// Extracts the union of literal string types from the omit array
type OmittedKeys<A extends readonly string[]> = A[number];
```

### Effective public API

```ts
// The wrapper's public API after omit + add
type EffectivePublicBindings<
  C extends ComponentInstance<any, any, any>,
  Added extends Record<string, ComponentBindingValue>,
  Omitted extends readonly string[],
> = Omit<TargetBindings<C>, OmittedKeys<Omitted>> & Added;

// What @forward() can deliver (target minus omitted minus selected)
type ForwardableTargetBindings<
  C extends ComponentInstance<any, any, any>,
  Omitted extends readonly string[],
> = Omit<TargetBindings<C>, OmittedKeys<Omitted>>;
```

### Extended `wrap` overload

This is a **proposed** extension of `component.wrap(Target, config)`, not the current signature. It subsumes both current overloads.

```ts
export declare function wrap<
  ExplicitWrapperGenericsAreNotAllowed extends never = never,
  C extends ComponentInstance<unknown, unknown, any>,
  Sel extends Record<string, ComponentBindingValue> = {},
  Added extends Record<string, ComponentBindingValue> = {},
  Omitted extends OmitArray<TargetBindings<C>> = [],
  E = void,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(
  target: C,
  config: {
    omitBindings?: Omitted;
    addBindings?: Added;
    bindings?: ValidateWrapSelection<Sel, ForwardableTargetBindings<C, Omitted>>;
    setup: (bindings: SetupBindings<Sel & Added>) => SetupReturn<E, TMarkup>;
    providers?: (inputs: InputsOnly<Sel & Added>) => Provider[];
    style?: string;
    styleUrl?: string;
  },
): ComponentInstance<
  EffectivePublicBindings<C, Added, Omitted>,
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
| `bindings` validates against | `TargetBindings<C>` | `ForwardableTargetBindings<C, Omitted>` |

---

## Interaction Between `omitBindings`, `addBindings`, and Forwarding

| Target binding | In `omitBindings`? | In `bindings` (selected)? | Result |
|:---|:---|:---|:---|
| `columns` | No | No | Forwarded via `@forward()` to target |
| `rows` | No | Yes | Handled in `setup`; explicit binding on target overrides |
| `debugMode` | Yes | — | Removed from public API; wrapper supplies value directly |
| — | — | — | `addBindings: { highlight }` → in public API + `setup`, never forwarded |

---

## Constraints and Diagnostics

| Rule | Diagnostic |
|:---|:---|
| `omitBindings` element not in `keys(B(Target))` | `WRAP001` — unknown omit key |
| `addBindings` key collides with non-omitted target key | `WRAP002` — name collision |
| `addBindings` key collides with omitted target key | Valid — this is a rename pattern |
| Omitted required binding not explicitly supplied in template | D013 — missing required component input/model/fragment (enforced on `<Target @forward() ...>`) |
| `@forward()` absent when payload exists | D025 |
| Multiple `@forward()` placements | D031 |
| `@forward()` on incompatible node | D032 |
| `bindings` selection references an omitted key | `WRAP003` — omitted keys are not selectable |
