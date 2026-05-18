# Dependency Injection: type-safety gaps and ergonomic improvements

## Summary

Angular's DI system has several type-safety gaps that the compiler does not catch — spanning `inject()`, `InjectionToken`, `ProviderToken`, and multi-provider patterns. This document catalogues the current limitations and motivates the introduction of new APIs.

## Current limitations

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

Ref: `https://github.com/angular/angular/issues/53894`, `https://github.com/angular/angular/issues/48126`

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

Ref: `https://github.com/angular/angular/issues/46815`, `https://github.com/angular/angular/issues/33883`, `https://github.com/angular/angular/issues/55555`

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

Ref: `https://github.com/angular/angular/issues/28778`, `https://github.com/angular/angular/issues/51675`, `https://github.com/angular/angular/issues/55555`

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

Ref: `https://github.com/angular/angular/issues/49807`

### 5. Inconsistent debugging name convention

`InjectionToken` takes a positional `desc` string, while signal-based APIs (`signal`, `computed`, `linkedSignal`) use an optional `debugName` property that the compiler sets automatically:

Ref: `https://github.com/angular/angular/issues/58845`
