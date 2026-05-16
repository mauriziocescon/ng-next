# `injectionToken`: a type-safe, shorthand-friendly DI primitive

## Summary

The current `InjectionToken` API has type-safety gaps (no nominal typing, unchecked factory return types, overridable generics on `inject()`), no type-level representation of `multi`, no way to use a token's factory as a provider shorthand, and a naming convention inconsistent with signal-based APIs. This issue proposes a new `injectionToken()` function that fixes all of these through branded types, token-level multi encoding, shorthand support for tokens with factories, single-token auto-provisioning, and a unified `debugName` convention.

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
