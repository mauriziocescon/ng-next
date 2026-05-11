# `InjectionToken` Pain Points and Proposed Fixes

This document describes current Angular `InjectionToken` pain points and how the proposed `injectionToken` API (see [readme](../readme.md#dependency-injection-enhancements)) addresses them.

---

## 1. Type safety gaps in `InjectionToken`

Today, `InjectionToken` has several type-safety holes:

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

**Proposed fix:** the new `injectionToken` function uses branded types (`TOKEN_TYPE`, `TOKEN_MULTI`, `TOKEN_FACTORY`) so that:

- tokens are nominally typed — assignment between `InjectionToken<number>` and `InjectionToken<string>` is a compile error,
- `inject()` infers `T` from the token — no generic override needed or allowed.

---

## 2. Multi-token support

Today, `multi` is only a provider-level flag with no type-level representation:

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

**Proposed fix:** the new API encodes `multi` directly on the token. The token's type becomes `T[]`, each `provide()` call contributes a single `T` item, and `inject()` correctly returns `T[]`:

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

// Usage in providers
providers: () => [
  provide(multiToken),
  provide(multiToken),
  provide({ token: multiToken, factory: () => 10 }),
]

// inject returns number[]
const multi = inject(multiToken);
```

---

## 3. Default factory not usable as a shorthand provider

A token with a `factory` cannot be used directly in `providers` today:

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

**Proposed fix:** the new API distinguishes three token shapes:

1. **Token with factory** — supports `provide(token)` shorthand at any injector level:

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

---

## 4. Inconsistent debugging name convention

Today, `InjectionToken` requires a positional `desc` string for debugging, while signal APIs use an optional `debugName` property that the compiler sets automatically:

```ts
// Current
const token = new InjectionToken<number>('test');

// Proposed — aligns with signal debugName convention
const token = injectionToken<number>({ debugName: 'test' });
```

**Proposed fix:** the new `injectionToken` function replaces the positional `desc` string with an optional `debugName` property in the config object — consistent with `signal('value', { debugName: '...' })` and `computed(() => ..., { debugName: '...' })`. This removes the mandatory string argument and unifies the debugging story across all reactive primitives.
