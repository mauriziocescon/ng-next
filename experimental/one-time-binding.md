# One-Time Binding

Two mechanisms for values that are read once and never updated.

> Status: `once:` (consumer-side) is part of the current design — defined in `ng-dsl-type-checking-spec.md` §3.9 and represented in `ng-ast.ts`. Declaration-side `input.once(...)` is a proposal only — not implemented in `types/ng-types.ts`.

## Conventions

Normative keywords in this document follow RFC-style meaning:

- `MUST` / `MUST NOT`: mandatory behavior.
- `SHOULD` / `SHOULD NOT`: recommended behavior with possible justified exceptions.
- `MAY`: optional behavior.

## Summary

1. Consumer-side `once:` freezes an otherwise reactive input at call-site.
2. Declaration-side `input.once(...)` declares a creation-time-only input.

---

## 1. Consumer-Side: `once:` Prefix

`once:` freezes an input at creation time — never updated afterwards, even if the source signal changes. The target still declares a normal `input()`; codegen treats the specific binding as one-time.

From the binding prefix reference (`readme.md`):

> `once:` — inputs only — No (per property) — Freezes the input value at creation time; never updated afterwards. `once:model:*` and `once:on:*` are compile-time errors.

```ts
import { component, signal } from '@angular/core';
import { UserDetail, User } from './user-detail.ng';

export const Consumer = component({
  setup: () => {
    const user = signal<User>({ name: 'Alice', role: 'admin' });
    const email = signal('alice@example.com');

    function makeAdmin() {/** ... **/}

    /**
     * once:user — evaluated once at creation, never updated.
     * email and makeAdmin remain reactive.
     */
    return @{
      <UserDetail
        once:user={user()}
        model:email={email}
        on:makeAdmin={makeAdmin} />
    };
  },
});
```

### Type Checking Rules (from `ng-dsl-type-checking-spec.md` §3.9)

```
ONCE-BINDING
─────────────────────────────────────────────────
once: applies ONLY to inputs (InputSignal)
once:model:*  → D018
once:on:*     → D018
once:prop + prop on same target → D019
─────────────────────────────────────────────────
```

The type checker validates the binding value against the target `InputSignal<T>` the same way as a normal input (§3.1 `CHECK-INPUT`). The `once:` modifier only affects codegen — it does not change type checking.

### AST Representation (from `ng-ast.ts`)

The `once` flag is a boolean field on binding nodes:

```ts
// Component/native element inputs
interface BoundAttributeNode extends BaseNode {
  type: 'BoundAttribute';
  name: string;
  value: AST;
  once: boolean;   // ← true when once: prefix is used
  // ...
}

// Directive inputs inside use:dir(...)
interface DirectiveInputNode extends BaseNode {
  type: 'DirectiveInput';
  name: string;
  value: AST;
  once: boolean;   // ← true when once: prefix is used
  // ...
}

// Derivation inputs inside @derive
interface DerivationInputNode extends BaseNode {
  type: 'DerivationInput';
  name: string;
  value: AST;
  once: boolean;   // ← true when once: prefix is used
}
```

### Compiler Lowering

When the consumer writes `once:user={user()}`, the compiler:

1. `MUST` emit the value in the creation pass (seed).
2. `MUST` skip emitting update-pass property writes for this binding.

The target `InputSignal<User>` is written once through the normal input-write path and never written again. No runtime flag or special signal variant is needed.

### Interaction with directives and derivations

`once:` can be used on directive bindings inside `use:`:

```ts
<input
  type="text"
  use:tooltip(once:message={initialMsg()}) />
```

The directive's `input.required<string>()` for `message` is seeded once and never updated.

Derivations are also supported:

```ts
@derive price = simulation(once:item={initialItem} qty={qty()});
```

The `item` derivation input is frozen at creation time; `qty` remains reactive.

---

## 2. Declaration-Side: `input.once<T>()`

This section introduces new API (`input.once`) that is **proposed** — not currently available in `types/ng-types.ts`.

The author declares that an input is creation-time only. In `setup`, the binding is exposed as plain `T` (not `InputSignal<T>`).

```ts
import { component, input, signal } from '@angular/core';

export const Panel = component({
  bindings: {
    /**
     * input.once<T>()          — optional, T | undefined
     * input.once<T>(default)   — optional with default
     * input.once.required<T>() — required
     *
     * Produces a plain T in setup (not a signal).
     */
    title: input.once.required<string>(),
    collapsible: input.once<boolean>(true),
    mode: input<'light' | 'dark'>('light'),
  },
  setup: ({ title, collapsible, mode }) => {
    // title: string            — plain value, read once
    // collapsible: boolean     — plain value, read once (default: true)
    // mode: InputSignal<...>   — reactive as usual

    const open = signal(collapsible);

    return @{
      <div class={mode()}>
        <h2>{title}</h2>
        @if (collapsible) {
          <button on:click={() => open.update(v => !v)}>Toggle</button>
        }
      </div>
    };
  },
});
```

### Compiler Lowering

For `input.once`, codegen follows the same pattern: seed in creation pass, skip update-pass writes.

```
// creation pass only — no update-pass instruction emitted
ɵɵcomponentAnchor(0, Panel, ['title', ctx.title(), 'collapsible', true]);
// ɵɵproperty('title', ...) is NOT emitted
// ɵɵproperty('mode', ...) IS emitted (regular input)
```

Semantics: write once at creation, then treat as constant. `setup` sees plain `T`. The compiler `MUST NOT` emit update-pass writes for `input.once` bindings.

### Use in providers

`OnceInput` keys appear in `providers` like regular inputs:

```ts
import { component, input, provide, inject } from '@angular/core';

class PanelService {
  constructor(readonly title: string) {}
}

export const Panel = component({
  bindings: {
    title: input.once.required<string>(),
  },
  setup: () => {
    const svc = inject(PanelService);
    return @{ <div>{svc.title}</div> };
  },
  providers: ({ title }) => [
    // title is OnceInput<string> here — read once via title()
    provide(PanelService, () => new PanelService(title())),
  ],
});
```

### Use in Directives and Derivations

`input.once` is valid at directive level. A directive can declare creation-time-only configuration inputs the same way a component does; they are seeded once and not updated afterward.

Derivations are also supported: they declare input `bindings`, so they can use `input.once(...)` for creation-time-only derivation inputs.

---

## Type-Level Integration

The following type snippets are **proposed deltas** to the current type model in `types/ng-types.ts`.

### Branded type

```ts
declare const ONCE_INPUT: unique symbol;

// Branded type distinct from InputSignal
export type OnceInput<T> = { readonly [ONCE_INPUT]: T };
```

### Extended binding surface

Currently `types/ng-types.ts` defines:

```ts
type AnyBindingValue =
  | InputSignal<any>
  | ModelSignal<any>
  | OutputEmitterRef<any>
  | OptionalFragmentBinding<any>
  | RequiredFragmentBinding<any>;

export type DirectiveBindingValue = AnyBindingValue;
export type ComponentBindingValue = AnyBindingValue;
```

The proposed extension adds `OnceInput` to the union:

```ts
type AnyBindingValue =
  | InputSignal<any>
  | ModelSignal<any>
  | OutputEmitterRef<any>
  | OptionalFragmentBinding<any>
  | RequiredFragmentBinding<any>
  | OnceInput<any>;              // ← new
```

### `InputsOnly<B>` includes `OnceInput` keys

`providers` sees `OnceInput` bindings alongside regular inputs:

```ts
type InputKeys<B> = {
  [K in keyof B]: B[K] extends ModelSignal<any> ? never
    : B[K] extends InputSignal<any> ? K
    : B[K] extends OnceInput<any> ? K    // ← new
    : never;
}[keyof B];
```

### `SetupBindingValue` unwraps `OnceInput<T>` to `T`

Currently `types/ng-types.ts` defines:

```ts
type SetupBindingValue<V> =
  V extends OptionalFragmentBinding<infer T>
    ? OptionalFragmentBinding<T> | undefined
    : V;
```

The proposed extension adds `OnceInput` unwrapping:

```ts
type SetupBindingValue<V> =
  V extends OnceInput<infer T>
    ? T                                       // ← unwrap to plain value
    : V extends OptionalFragmentBinding<infer T>
      ? OptionalFragmentBinding<T> | undefined
      : V;
```

### `ValidateDerivationBindings` accepts `OnceInput`

Currently derivations accept only `InputSignal`. The proposed extension:

```ts
type ValidateDerivationBindings<B extends Record<string, AnyBindingValue>> = {
  [K in keyof B]: B[K] extends InputSignal<any>
    ? B[K] extends ModelSignal<any> ? never : B[K]
    : B[K] extends OnceInput<any> ? B[K]    // ← new
    : never;
};
```

---

## Interaction Between `once:` and `input.once`

| Declaration | Consumer | Result |
|:---|:---|:---|
| `input<T>()` | `prop={expr}` | Reactive (normal) |
| `input<T>()` | `once:prop={expr}` | One-time (consumer freezes it) |
| `input.once<T>()` | `prop={expr}` | One-time (declaration enforces it) |
| `input.once<T>()` | `once:prop={expr}` | One-time (redundant but valid — no error) |
| `model<T>()` | `once:model:prop={sig}` | ‼️ Compile error (D018) |
| `output<T>()` | `once:on:event={fn}` | ‼️ Compile error (D018) |

---

## Constraints and Diagnostics

| Rule | Diagnostic |
|:---|:---|
| `once:` + `model:` on the same binding | D018 — `once:model:*` is invalid |
| `once:` + `on:` on the same binding | D018 — `once:on:*` is invalid |
| `once:prop` and `prop` on the same element | D019 — duplicate binding name |
| `input.once` receives later parent changes | No error — updates are silently ignored by contract |
| `once:prop` / `input.once.required` without an initial value | D013/D014/D038 — standard required-input diagnostic |
| `input.once` in directive bindings | Valid |
| `input.once` in `@derive` bindings | Valid |
| `once:` on a `fragment` binding | D018 — fragments are not inputs |
| `addBindings` key uses `OnceInput` | Valid — follows same rules as `InputSignal` |

---

## Ivy Bridge Considerations

Consumer-side `once:` needs no new runtime instructions; it is a **compiler-only** change:

- **Creation pass**: reuse existing eager seed path.
- **Update pass**: omit property writes for once-bound inputs (codegen decision, no runtime branch).
- **AST**: already represented (`once: boolean` on `BoundAttributeNode`, `DirectiveInputNode`, `DerivationInputNode`).

Declaration-side `input.once` is also compiler-level:

- **Type system**: new `OnceInput<T>` brand, extended `AnyBindingValue`, `SetupBindingValue` unwrapping.
- **Compiler**: same creation-only codegen as consumer `once:`, plus `setup` parameter resolves to plain `T`.
- **Runtime**: no new instruction or signal variant.

**Change Class:** Consumer `once:` — Compiler-only (already in AST). Declaration `input.once` — Compiler + Type-level (no new runtime primitive).
