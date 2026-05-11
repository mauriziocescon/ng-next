# `injectionToken`: type-safe, shorthand-friendly replacement for `InjectionToken`

## Summary

The current `InjectionToken` API has type-safety gaps, ergonomic limitations around provider shorthand, and naming inconsistencies with the signal APIs. This issue proposes a new `injectionToken()` function that addresses all four.

## Current limitations

### 1. Type safety gaps

`InjectionToken` allows several unsafe patterns that the compiler does not catch:

```ts
import { Component, inject, InjectionToken } from '@angular/core';
import { JsonPipe } from '@angular/common';

const token = new InjectionToken<number>('test');
const t2: InjectionToken<string> = token; // ❌ should error — tokens are not covariant

@Component({
  selector: 'App',
  imports: [JsonPipe],
  providers: [
    {
      provide: token,
      useFactory: () => ({ x: '1' }), // ❌ should error — factory returns wrong type
    },
  ],
  template: `{{ t | json }}`,
})
export class App {
  t = inject<string>(token); // ❌ generic override bypasses token type
}
```

### 2. Multi-token support

`multi` is only a provider-level flag with no type-level representation:

```ts
import { Component, inject, InjectionToken } from '@angular/core';

const token = new InjectionToken<number>('multi');

@Component({
  selector: 'App',
  providers: [
    { provide: token, useFactory: () => 1, multi: true },
    { provide: token, useFactory: () => 'oops', multi: true }, // ❌ no error — wrong type
    { provide: token, useFactory: () => 2 }, // ❌ no error — forgot multi, throws at runtime
  ],
  template: ``,
})
export class App {
  values = inject(token); // inferred as number, actually number[] at runtime
}
```

Problems:
- `multi` is not part of the token's type — nothing prevents mixing `multi: true` and `multi: false` for the same token (caught only at runtime).
- `inject()` returns `T` instead of `T[]` — the array shape is invisible to the type system.
- Factory return type is not checked against the token's declared type.

### 3. Default factory not usable as a shorthand provider

A token declared with a `factory` cannot be passed directly into a component's `providers` array. The factory only applies when the token is `providedIn: 'root'`:

```ts
import { Component, inject, InjectionToken } from '@angular/core';
import { JsonPipe } from '@angular/common';

const token = new InjectionToken<number>('test', {
  factory: () => 0,
});

@Component({
  selector: 'App',
  imports: [JsonPipe],
  providers: [token], // ❌ does not work — factory is only for root providedIn
  template: `{{ t | json }}`,
})
export class App {
  t = inject(token);
}
```

Workaround — must repeat the factory:

```ts
@Component({
  selector: 'App',
  imports: [JsonPipe],
  providers: [{ provide: token, useFactory: () => 0 }],
  template: `{{ t | json }}`,
})
export class App {
  t = inject(token);
}
```

### 4. Inconsistent debugging name convention

`InjectionToken` takes a positional `desc` string, while signal-based APIs (`signal`, `computed`, `linkedSignal`) use an optional `debugName` property that the compiler sets automatically:

```ts
// Current
const token = new InjectionToken<number>('test');

// Proposed — aligns with signal debugName convention
const token = injectionToken<number>({ debugName: 'test' });
```

---

## Proposed fixes

### 1. Branded types for nominal safety

The new `injectionToken` function uses branded types (`TOKEN_TYPE`, `TOKEN_MULTI`, `PROVIDABLE_TOKEN`) so that:

- tokens are nominally typed — assignment between `InjectionToken<number>` and `InjectionToken<string>` is a compile error,
- `inject()` infers `T` from the token — no generic override needed or allowed.

### 2. Multi encoded at the token level

The new API encodes `multi` directly on the token. The token's type becomes `T[]`, each `provide()` call contributes a single `T` item, and `inject()` correctly returns `T[]`:

```ts
// multi with factory: provide(multiToken) shorthand uses this factory
const multiToken = injectionToken({
  debugName: 'multiToken',
  multi: true,
  factory: () => Math.random(),
});

// autoProvided + multi: factory invoked once at root scope, collects into T[]
const rootMultiToken = injectionToken({
  debugName: 'rootMultiToken',
  autoProvided: true,
  multi: true,
  factory: () => Math.random(),
});

// Usage in providers — each provide() call contributes one entry
providers: () => [
  provide(multiToken),
  provide(multiToken),
  provide({ token: multiToken, factory: () => 10 }),
]

// inject returns number[]
const multi = inject(multiToken);
```

### 3. Three token shapes with shorthand support

The new API distinguishes three token shapes:

1. **Token with factory** — not provided in root by default; throws if not provided in the injector tree. The factory is the default used by the `provide(token)` shorthand — not a fallback:

```ts
const compToken = injectionToken({
  debugName: 'compToken',
  factory: () => {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      decrease: () => counter.update(v => v - 1),
      increase: () => counter.update(v => v + 1),
    };
  },
});

// shorthand works at component, directive, or route level
providers: () => [provide(compToken)]
```

2. **Token with `autoProvided: true`** — factory invoked once at root scope, no explicit `provide()` needed:

```ts
const rootToken = injectionToken({
  debugName: 'rootToken',
  autoProvided: true,
  factory: () => {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      decrease: () => counter.update(v => v - 1),
      increase: () => counter.update(v => v + 1),
    };
  },
});

// inject directly — no provider registration required
const rootCounter = inject(rootToken);
```

3. **Token without factory** — must use `provide({ token, factory })` with an explicit factory; `provide(token)` shorthand is a compile-time error:

```ts
const otherCompToken = injectionToken<string>({ debugName: 'otherCompToken' });

// ❌ provide(otherCompToken) — compile error
// ✅ must supply a factory
providers: () => [provide({ token: otherCompToken, factory: () => '' })]
```

### 4. Unified `debugName` convention

The new `injectionToken` function replaces the positional `desc` string with an optional `debugName` property in the config object — consistent with `signal('value', { debugName: '...' })` and `computed(() => ..., { debugName: '...' })`. This removes the mandatory string argument and unifies the debugging story across all reactive primitives.

### 5. Possible types

```ts
import { type Provider, type Signal } from '@angular/core';

declare const TOKEN_TYPE: unique symbol;
declare const TOKEN_MULTI: unique symbol;
declare const PROVIDABLE_TOKEN: unique symbol;

// ── InjectionToken ──────────────────────────────────────────────

// Single public type
export interface InjectionToken<T> {
  readonly [TOKEN_TYPE]: T;
  readonly [TOKEN_MULTI]?: boolean;
}

// Internal — NOT exported
interface ProvidableToken<T> extends InjectionToken<T> {
  readonly [PROVIDABLE_TOKEN]: true;
}

// ── injectionToken ──────────────────────────────────────────────

// Without factory — returns InjectionToken<T>
export function injectionToken<T>(config?: { debugName?: string }): InjectionToken<T>;

// With factory — returns ProvidableToken<T>
export function injectionToken<T>(config: {
  debugName?: string;
  factory: () => T;
}): ProvidableToken<T>;

// Auto-provided (requires factory)
export function injectionToken<T>(config: {
  debugName?: string;
  autoProvided: true;
  factory: () => T;
}): ProvidableToken<T>;

// Multi without factory
export function injectionToken<T>(config: {
  debugName?: string;
  multi: true;
}): InjectionToken<T[]>;

// Multi with factory
export function injectionToken<T>(config: {
  debugName?: string;
  multi: true;
  factory: () => T;
}): ProvidableToken<T[]>;

// Auto-provided multi (requires factory)
export function injectionToken<T>(config: {
  debugName?: string;
  autoProvided: true;
  multi: true;
  factory: () => T;
}): ProvidableToken<T[]>;

// ── inject ──────────────────────────────────────────────────────

export function inject<T>(token: InjectionToken<T>): T;

// ── provide ─────────────────────────────────────────────────────

// Shorthand — only accepts ProvidableToken (has factory)
export function provide<T>(token: ProvidableToken<T>): Provider;

// Object form — accepts any InjectionToken or class
export function provide<T>(config: {
  token: InjectionToken<T> | (new (...args: any[]) => T);
  factory: () => T extends (infer U)[] ? U : T;
}): Provider;
```

---

## Full example

```ts
import { Component, inject, input, signal } from '@angular/core';
import { injectionToken, provide } from '@angular/core';

const compToken = injectionToken({
  debugName: 'compToken',
  factory: () => {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      decrease: () => counter.update(v => v - 1),
      increase: () => counter.update(v => v + 1),
    };
  },
});

const rootToken = injectionToken({
  debugName: 'rootToken',
  autoProvided: true,
  factory: () => {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      decrease: () => counter.update(v => v - 1),
      increase: () => counter.update(v => v + 1),
    };
  },
});

const otherCompToken = injectionToken<string>({ debugName: 'otherCompToken' });

const multiToken = injectionToken({
  debugName: 'multiToken',
  multi: true,
  factory: () => Math.random(),
});

class Store {}

@Component({
  selector: 'app-counter',
  template: `
    <h1>Counter</h1>
    <div>Value: {{ compCounter.value() }}</div>
    <button (click)="compCounter.decrease()">-</button>
    <button (click)="compCounter.increase()">+</button>
  `,
  providers: [
    provide(compToken),
    provide(multiToken),
    provide(multiToken),
    provide({ token: multiToken, factory: () => 10 }),
    provide({ token: otherCompToken, factory: () => '' }),
    provide({ token: Store, factory: () => new Store() }),
  ],
})
export class CounterComponent {
  initialValue = input<number>();

  rootCounter = inject(rootToken);
  compCounter = inject(compToken);
  multi = inject(multiToken); // number[]
  store = inject(Store);
}
```
