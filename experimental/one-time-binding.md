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
import { Panel } from './panel.ng';

export const Consumer = component({
  setup: () => {
    const title = signal('Dashboard');
    const mode = signal<'light' | 'dark'>('light');

    /**
     * once:title — evaluated once at creation, never updated.
     * mode remains reactive.
     */
    return @{
      <Panel
        once:title={title()}
        collapsible={true}
        mode={mode()} />
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

When the consumer writes `once:title={title()}`, the compiler:

1. `MUST` emit the value in the creation pass (seed).
2. `MUST` skip emitting update-pass property writes for this binding.

The target `InputSignal<string>` is written once through the normal input-write path and never written again. No runtime flag or special signal variant is needed.

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

The author declares that an input is creation-time only. The binding still produces an `InputSignal<T>` — it is simply never updated after creation. `setup` reads it via `()` like any other input signal.

```ts
import { component, input, signal } from '@angular/core';

export const Panel = component({
  bindings: {
    /**
     * input.once<T>()            — optional, InputSignal<T | undefined>
     * input.once<T>(default)     — optional with default, InputSignal<T>
     * input.required.once<T>()   — required, InputSignal<T>
     *
     * Still an InputSignal — just never updated after creation.
     */
    title: input.required.once<string>(),
    collapsible: input.once<boolean>(true),
    mode: input<'light' | 'dark'>('light'),
  },
  setup: ({ title, collapsible, mode }) => {
    // title: InputSignal<string>   — seeded once, never updated
    // collapsible: InputSignal<boolean> — seeded once, never updated
    // mode: InputSignal<...>       — reactive as usual

    const open = signal(collapsible());

    return @{
      <div class={mode()}>
        <h2>{title()}</h2>
        @if (collapsible()) {
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

Semantics: write once at creation, then treat as constant. The `InputSignal<T>` holds its initial value indefinitely. The compiler `MUST NOT` emit update-pass writes for `input.once` bindings.

### Use in providers

`input.once` keys appear in `providers` like regular inputs — they are `InputSignal<T>`:

```ts
import { component, input, provide, inject } from '@angular/core';

class PanelService {
  constructor(readonly title: string) {}
}

export const Panel = component({
  bindings: {
    title: input.required.once<string>(),
  },
  setup: () => {
    const svc = inject(PanelService);
    return @{ <div>{svc.title}</div> };
  },
  providers: ({ title }) => [
    // title is InputSignal<string> — read via title()
    provide(PanelService, () => new PanelService(title())),
  ],
});
```

### Use in Directives and Derivations

`input.once` is valid at directive level. A directive can declare creation-time-only configuration inputs the same way a component does; they are seeded once and not updated afterward.

Derivations are also supported: they declare input `bindings`, so they can use `input.once(...)` for creation-time-only derivation inputs.

---

## Type-Level Integration

No new branded type or type-level changes are required. `input.once<T>()` produces a standard `InputSignal<T>` — the `once` semantics are purely a compiler/codegen concern (skip update-pass writes). All existing type infrastructure (`AnyBindingValue`, `InputsOnly`, `SetupBindingValue`, `ValidateDerivationBindings`) works unchanged.

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
| `once:prop` / `input.required.once` without an initial value | D013/D014/D038 — standard required-input diagnostic |
| `input.once` in directive bindings | Valid |
| `input.once` in `@derive` bindings | Valid |
| `once:` on a `fragment` binding | D018 — fragments are not inputs |


