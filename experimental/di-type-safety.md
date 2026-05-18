# Message 1

Hey!

I took the liberty of summarizing some tickets around type-safety gaps that the compiler does not currently catch — spanning `inject()`, `InjectionToken`, `ProviderToken`, and multi-provider patterns. In my opinion, they are strictly correlated. I hope you don't mind.

### 1. Generic class tokens lose their type parameter on injection

When injecting a class with a generic type parameter, the explicit generic on `inject<T>()` works, but the inferred form does not preserve the specialization:

```ts
import { Component, ElementRef, inject } from '@angular/core';

@Component({
  selector: 'App',
  template: ``,
})
export class App {
  // ❌ hostEl is ElementRef<any>, expecting ElementRef<HTMLElement>
  hostElInferred = inject(ElementRef<HTMLElement>);
}
```

The issue is that `ProviderToken` erases the generic parameter during inference — `ElementRef<HTMLElement>` is widened to `ElementRef<any>`.

> **Note:** this issue boils down to the coding pattern that `inject` uses, but it is not specific to `inject`: queries are affected as well.

**Related issues:** `https://github.com/angular/angular/issues/53894`, `https://github.com/angular/angular/issues/48126`

### 2. `InjectionToken` type-safety gaps

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
- The factory return type is not checked against the token's declared type.

**Related issues:** `https://github.com/angular/angular/issues/28778`, `https://github.com/angular/angular/issues/51675`, `https://github.com/angular/angular/issues/55555`

### 4. Default factory not usable as a shorthand provider

A token declared with a `factory` cannot be passed directly into a component's `providers` array. The factory applies only when the token uses `providedIn: 'root'`:

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

**Related issues:** `https://github.com/angular/angular/issues/49807`

### 5. Inconsistent debugging-name convention

`InjectionToken` takes a positional `desc` string, while signal-based APIs (`signal`, `computed`, `linkedSignal`) use an optional `debugName` property that the compiler sets automatically.

**Related issues:** `https://github.com/angular/angular/issues/58845`

# Message 2

Following the recent introduction of the `@Service` decorator, and considering that all the issues are type-related, I've experimented with code and come up with a userland holistic solution that hopefully addresses all the problems. I left out queries.

Working demo: https://stackblitz.com/edit/stackblitz-starters-l8rydbu9

```ts
import { injectionToken, provide, injectStrict } from './injection-token';

// Token with factory
const counterToken = injectionToken({
  debugName: 'counterToken',
  factory: () => {
    const count = signal(0);
    return {
      value: count.asReadonly(),
      increment: () => count.update((v) => v + 1),
    };
  },
});

// Auto-provided (root)
const loggerToken = injectionToken({
  debugName: 'loggerToken',
  autoProvided: true,
  factory: () => ({ log: (msg: string) => msg }),
});

// Multi token
const pluginToken = injectionToken.multi({
  debugName: 'pluginToken',
  factory: () => ({ name: 'default' }),
});

// Token without factory
const configToken = injectionToken<{ apiUrl: string }>({
  debugName: 'configToken',
});

// Unknown token without factory
const unknownTypeToken = injectionToken<unknown>();

// legacy token
const legacyToken = new InjectionToken<number>('legacyToken');

// classes
class Store {
  x: string;
  constructor(x?: string) {
    this.x = x ?? 'store';
  }
}
class Store2 extends Store {}

@Injectable()
class Store3 {
  injectable = 'injectable';
}

class C<T extends number> {}
// const x = injectStrict(C); // ✅

abstract class AC<T extends string> {}
// const y = injectStrict(AC); // ✅

@Component({
  selector: `Comp`,
  imports: [JsonPipe],
  providers: [
    provide(counterToken),
    provide(pluginToken),
    provide(pluginToken, () => ({ name: 'custom' })),
    provide(configToken, () => ({ apiUrl: '/api' })),
    // provide(configToken),  // ✅ compile error: configToken has no TOKEN_HAS_FACTORY
    provide(unknownTypeToken, () => ''),
    provide(legacyToken, () => 10),
    provide(Store, () => new Store('provide')),
    provide(Store2, () => injectStrict(Store)),
    provide(Store3, () => new Store3()),
  ],
  template: `
    counter: {{ counter.value() }}
    <button (click)="counter.increment()">+</button>
    <hr />
    
    logger: {{ logger.log(Date.now().toString()) }}
    <hr />
    
    plugins: {{ plugins | json }}
    <hr />
    
    config: {{ config | json }}
    <hr />
    
    unknown: {{ unknown | json }}
    <hr />
    
    legacy: {{ legacyToken | json }}
    <hr />
    
    Store: {{ store | json }}
    <hr />
    
    Store2: {{ store2 | json }}
    <hr />
    
    Store3: {{ store3 | json }}
    <hr />
    
    variant: {{ variant | json }}
  `,
})
export class Comp {
  Date = Date;

  elRef = injectStrict(ElementRef<HTMLButtonElement>);

  counter = injectStrict(counterToken);
  logger = injectStrict(loggerToken);
  plugins = injectStrict(pluginToken);
  config = injectStrict(configToken);

  // c = injectStrict<string>(counterToken); // ✅ compile error
  unknown = <string>injectStrict(unknownTypeToken); // ✅ cast string
  legacyToken = injectStrict(legacyToken);

  store = injectStrict(Store);
  store2 = injectStrict(Store2);
  store3 = injectStrict(Store3);

  variant = injectStrict(new HostAttributeToken('variant'), {
    optional: true,
  });
  app = injectStrict(App);

  method() {
    const el = this.elRef.nativeElement; // ✅ HTMLButtonElement
  }
}

@Component({
  selector: 'app-root',
  imports: [Comp],
  template: `
    <h1>injectionToken + provide</h1>
    <Comp variant="primary" />
  `,
})
export class App {
  test = signal('');
}
```

<details>
<summary><strong>Explanation</strong></summary>

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
- **Shorthand** `provide(token)` compiles only if the token was created with a factory.
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

</details>


# Message 3

As I see it, any userland solution must address the type safety issues highlighted in this ticket. While introducing new APIs or replacing legacy ones is generally acceptable (e.g., `provide`, `InjectionToken`), replacing `inject` (and queries) is far more complex because it is already a modern API. In practice, a medium-to-high-level breaking change is required.

Some questions for the team:
1. Would it be acceptable to go with some sort of `inject.strict` API together with `provide` / `injectionToken` or equivalent at the core level? I mean `inject.strict` as an alternative to `inject`, with the idea of merging the two in the future.
2. As an alternative to 1: a better `inject` with strict types in addition to `inject.weak` (backward compatibility).
3. I checked our code and we are using the `inject<...>` form quite a lot — it still seems to be a migratable pattern, though. A tedious and long process, but valuable in the end. Am I missing something obvious?

That said, there is no disagreement that designing APIs is difficult. It just sounds a bit strange that such type-safety problems surface around one of Angular's most popular features: DI. 😅

Thanks a lot!
