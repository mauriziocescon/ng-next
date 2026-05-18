# Dependency Injection: type-safety gaps and ergonomic improvements

## Description

Angular's DI system has several type-safety gaps that the compiler does not catch — spanning `inject()`, `InjectionToken`, `ProviderToken`, and multi-provider patterns. This issue catalogues the current limitations and motivates the introduction of new APIs.

## Problems

### 1. Generic class tokens lose their type parameter on injection

When injecting a class with a generic type parameter, the explicit generic on `inject<T>()` works but the inferred form does not preserve the specialization:

```ts
import { Component, ElementRef, inject } from '@angular/core';

@Component({
  selector: 'App',
  template: ``,
})
export class App {
  // ✅ hostEl is ElementRef<HTMLElement>
  hostElExplicit = inject<ElementRef<HTMLElement>>(ElementRef);

  // ❌ hostEl is ElementRef<any>, expecting ElementRef<HTMLElement>
  hostElInferred = inject(ElementRef<HTMLElement>);
}
```

The issue is that `ProviderToken` (and the underlying `AbstractType`/`Type` interfaces) erases the generic parameter during inference — `ElementRef<HTMLElement>` is widened to `ElementRef<any>`.

> **Note:** this issue boils down to the coding pattern that `inject` is using, but it is not specific to `inject`: queries are affected as well.

**Related issues:** `https://github.com/angular/angular/issues/53894`, `https://github.com/angular/angular/issues/48126`

### 2. `InjectionToken` type safety gaps

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

**Related issues:** `https://github.com/angular/angular/issues/46815`, `https://github.com/angular/angular/issues/33883`, `https://github.com/angular/angular/issues/55555`

### 3. Multi-token support

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

**Related issues:** `https://github.com/angular/angular/issues/28778`, `https://github.com/angular/angular/issues/51675`, `https://github.com/angular/angular/issues/55555`

### 4. Default factory not usable as a shorthand provider

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

**Related issues:** `https://github.com/angular/angular/issues/49807`

### 5. Inconsistent debugging name convention

`InjectionToken` takes a positional `desc` string, while signal-based APIs (`signal`, `computed`, `linkedSignal`) use an optional `debugName` property that the compiler sets automatically.

**Related issues:** `https://github.com/angular/angular/issues/58845`

## Possible solution

Following the recent introduction of `@Service` decorator and considering all the issues are related to types, I've played with types and come up with a userland holistic solution that addresses problems 2–5 without any Angular-internal changes. Problem 1 (`ProviderToken` generic erasure) requires a framework-level fix to the `ProviderToken` type definition.

The solution introduces three new APIs:

### `injectionToken()` — branded, nominal DI tokens

Replaces `new InjectionToken(...)` with a factory function that returns nominally-typed tokens:

```ts
// Single token with factory (shorthand-eligible)
const counterToken = injectionToken({
  debugName: 'counterToken',
  factory: () => signal(0),
});

// Single token without factory (explicit provider required)
const configToken = injectionToken<{ apiUrl: string }>({ debugName: 'configToken' });

// Auto-provided at root scope
const loggerToken = injectionToken({
  debugName: 'loggerToken',
  autoProvided: true,
  factory: () => ({ log: (msg: string) => console.log(msg) }),
});

// Multi token — inject() returns T[], each provide() contributes one T
const pluginToken = injectionToken.multi({
  debugName: 'pluginToken',
  factory: () => ({ name: 'default' }),
});
```

Key properties:
- **Nominal typing** via `unique symbol` brands — `DiToken<number>` is not assignable to `DiToken<string>`, and `DiMultiToken<T>` is not assignable to `DiToken<T[]>`.
- **Multi encoded at the token level** — `inject(multiToken)` returns `T[]`; `provide(multiToken, factory)` requires the factory to return one `T` item. Mixing `multi: true` / `multi: false` for the same token is structurally impossible.
- **`debugName` convention** — aligns with signal-based APIs.

### `provide()` — type-safe provider helper

Replaces raw `{ provide, useFactory, multi }` objects:

```ts
providers: [
  provide(counterToken),                          // shorthand: uses built-in factory
  provide(pluginToken),                           // multi: contributes one entry
  provide(pluginToken, () => ({ name: 'custom' })), // multi: another entry
  provide(configToken, () => ({ apiUrl: '/api' })), // explicit factory
  provide(Store, () => new Store()),              // class token
]
```

Key properties:
- **Shorthand** `provide(token)` only compiles if the token was created with a factory.
- **Factory return type** is checked against the token contract's `Provides` type.
- **Multi flag** is emitted automatically for multi tokens — no manual `multi: true`.

### `injectStrict()` — generic-override-proof injection

A wrapper around Angular's `inject()` whose generic parameter is the *token type*, not the *value type*:

```ts
const counter = injectStrict(counterToken);        // { value: Signal<number>; ... }
const plugins = injectStrict(pluginToken);         // { name: string }[]
const config  = injectStrict(configToken);         // { apiUrl: string }
const maybe   = injectStrict(configToken, { optional: true }); // { apiUrl: string } | null
const store   = injectStrict(Store);               // Store
const attr    = injectStrict(new HostAttributeToken('role'));   // string
```

Key properties:
- `injectStrict<string>(counterToken)` is a compile error — the generic must be a valid token type.
- Optional injection is supported via literal `{ optional: true }` shapes.
- Legacy `InjectionToken<T>` values are accepted for backward compatibility.

### What this does NOT fix

Problem 1 (generic class token erasure) cannot be really solved in userland. It requires Angular to update the `ProviderToken` / `AbstractType` / `Type` type definitions to preserve generic type arguments through inference.

### Working example

Types and a working demo: `https://stackblitz.com/edit/stackblitz-starters-l8rydbu9`
