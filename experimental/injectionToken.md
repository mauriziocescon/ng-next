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
      multi: true, // ⚠️ multi is untyped — no compile-time enforcement
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
- `multi` is encoded in the token type — `provide()` enforces single-item factory return,
- `inject()` infers `T` from the token — no generic override needed or allowed.

---

## 2. Default factory not usable as a shorthand provider

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

**Proposed fix:** the new API distinguishes two token shapes:

- `InjectionTokenBase<T>` — no factory, must use `provide({ token, factory })`,
- `InjectionToken<T>` — has factory, supports `provide(token)` shorthand.

The shorthand invokes the token's factory in the current injector scope (not only root):

```ts
const barToken = injectionToken({
  debugName: 'Bar',
  factory: () => inject(FooService).bar,
});

// shorthand works at any level
providers: () => [provide(barToken)]
```

---

## 3. Inconsistent debugging name convention

Today, `InjectionToken` requires a positional `desc` string for debugging, while signal APIs use an optional `debugName` property that the compiler sets automatically:

```ts
// Current
const token = new InjectionToken<number>('test');

// Proposed — aligns with signal debugName convention
const token = injectionToken<number>({ debugName: 'test' });
```

**Proposed fix:** the new `injectionToken` function replaces the positional `desc` string with an optional `debugName` property in the config object — consistent with `signal('value', { debugName: '...' })` and `computed(() => ..., { debugName: '...' })`. This removes the mandatory string argument and unifies the debugging story across all reactive primitives.

