# `injectionToken` — Userland Implementation Draft

## Feasibility Summary

**Yes, this can be delivered entirely in userland** without any private Angular APIs. The implementation uses the public `InjectionToken` constructor (which internally calls `ɵɵdefineInjectable` when `providedIn` is set). The branded types are purely compile-time — zero runtime cost.

### What works without any Angular changes

| Feature | Mechanism |
|---------|-----------|
| Branded nominal types | TypeScript `unique symbol` brands — compile-time only |
| `injectionToken()` factory | Creates a standard `InjectionToken` instance via its public constructor |
| `autoProvided` | Passes `{ providedIn: 'root', factory }` to the `InjectionToken` constructor |
| `provide()` shorthand | Returns a standard `{ provide, useFactory, multi? }` object |
| Multi at token level | Compile-time brand + `provide()` emits `multi: true` on the provider |
| `debugName` convention | Passed as the `_desc` string to `InjectionToken` constructor |
| `injectToken()` for classes | Delegates to Angular's `inject()` with a class constructor token |

### What requires Angular-side changes

| Feature | Why |
|---------|-----|
| Preventing `inject<string>(numberToken)` generic override | Cannot be fixed in userland. Requires Angular to remove or constrain the generic parameter on `inject()`. |

---

## Implementation

```ts
// injection-token.ts — drop-in userland library

import {
  InjectionToken,
  Provider,
  inject as ngInject,
  InjectOptions,
} from '@angular/core';

// ─── Branded symbols (compile-time only) ────────────────────────

declare const TOKEN_VALUE: unique symbol;
declare const TOKEN_MULTI: unique symbol;
declare const TOKEN_HAS_FACTORY: unique symbol;

// ─── Public token interfaces ────────────────────────────────────

/**
 * A nominally-typed single-value DI token.
 *
 * Use `injectToken(token)` to retrieve the value — returns `T`.
 * Use `provide({ token, factory })` to register a provider.
 *
 * @see {@link injectionToken} to create one.
 */
export interface InjectableToken<T> extends InjectionToken<T> {
  readonly [TOKEN_VALUE]: T;
}

/**
 * A nominally-typed multi-value DI token.
 *
 * Each `provide()` call contributes one `T` item.
 * `injectToken(token)` returns `T[]`.
 *
 * @see {@link injectionToken} to create one.
 */
export interface InjectableMultiToken<T> extends InjectionToken<T[]> {
  readonly [TOKEN_MULTI]: T;
}

/**
 * A single-value token created with a factory.
 * Eligible for the `provide(token)` shorthand (no explicit factory needed).
 *
 * @see {@link injectionToken} with a `factory` option.
 */
export interface ProvidableToken<T> extends InjectableToken<T> {
  readonly [TOKEN_HAS_FACTORY]: true;
  /** @internal stored factory for provide() shorthand */
  readonly __factory: () => T;
}

/**
 * A multi-value token created with a factory.
 * Eligible for the `provide(token)` shorthand (no explicit factory needed).
 *
 * @see {@link injectionToken} with `factory` and `multi: true`.
 */
export interface ProvidableMultiToken<T> extends InjectableMultiToken<T> {
  readonly [TOKEN_HAS_FACTORY]: true;
  /** @internal stored factory for provide() shorthand */
  readonly __factory: () => T;
}

// ─── Config interfaces ──────────────────────────────────────────

interface InjectionTokenBaseConfig {
  debugName?: string;
  multi?: false;
  autoProvided?: false;
}

interface InjectionTokenMultiConfig {
  debugName?: string;
  multi: true;
  autoProvided?: false;
}

interface InjectionTokenWithFactoryConfig<T> {
  debugName?: string;
  factory: () => T;
  multi?: false;
  autoProvided?: boolean;
}

interface InjectionTokenMultiWithFactoryConfig<T> {
  debugName?: string;
  factory: () => T;
  multi: true;
  autoProvided?: boolean;
}

// ─── injectionToken() overloads ─────────────────────────────────

/**
 * Creates a DI token without a factory.
 * Must be provided explicitly via `provide({ token, factory })`.
 *
 * @example
 * const CONFIG = injectionToken<AppConfig>({ debugName: 'CONFIG' });
 * // provide(CONFIG)         ← compile error
 * // provide({ token: CONFIG, factory: () => ({...}) })  ← OK
 */
export function injectionToken<T>(config?: InjectionTokenBaseConfig): InjectableToken<T>;

/**
 * Creates a multi-value DI token without a factory.
 * Must be provided explicitly via `provide({ token, factory })`.
 *
 * @example
 * const HOOKS = injectionToken<Hook>({ debugName: 'HOOKS', multi: true });
 * // provide({ token: HOOKS, factory: () => myHook })  ← contributes one Hook
 */
export function injectionToken<T>(config: InjectionTokenMultiConfig): InjectableMultiToken<T>;

/**
 * Creates a DI token with a built-in factory.
 * Can be provided via the `provide(token)` shorthand.
 *
 * If `autoProvided: true`, the factory runs at root scope automatically.
 *
 * @example
 * const COUNTER = injectionToken({
 *   debugName: 'COUNTER',
 *   factory: () => signal(0),
 * });
 * // provide(COUNTER)  ← uses the built-in factory
 */
export function injectionToken<T>(config: InjectionTokenWithFactoryConfig<T>): ProvidableToken<T>;

/**
 * Creates a multi-value DI token with a built-in factory.
 * Can be provided via the `provide(token)` shorthand — each call contributes one `T`.
 *
 * @example
 * const PLUGINS = injectionToken({
 *   debugName: 'PLUGINS',
 *   multi: true,
 *   factory: () => defaultPlugin(),
 * });
 * // provide(PLUGINS)  ← contributes one entry using the built-in factory
 */
export function injectionToken<T>(
  config: InjectionTokenMultiWithFactoryConfig<T>,
): ProvidableMultiToken<T>;

// ─── injectionToken() implementation ────────────────────────────

export function injectionToken<T>(config?: any): any {
  const desc = config?.debugName ?? '';
  const factory = config?.factory;
  const autoProvided = config?.autoProvided ?? false;

  // Create a standard InjectionToken.
  // For multi tokens, the runtime type is T[] but the token is keyed by instance identity.
  let token: InjectionToken<any>;

  if (factory && autoProvided) {
    // autoProvided: register with providedIn:'root' so the injector picks it up automatically
    token = new InjectionToken<T>(desc, {
      providedIn: 'root',
      factory,
    });
  } else if (factory) {
    // Has factory but NOT autoProvided: create a bare token (no providedIn).
    // The factory is stored for the provide() shorthand but does NOT auto-register.
    token = new InjectionToken<T>(desc);
  } else {
    // No factory: bare token
    token = new InjectionToken<T>(desc);
  }

  // Attach the factory for provide() shorthand usage
  if (factory) {
    (token as any).__factory = factory;
  }

  // Mark multi tokens (runtime flag for provide() to read)
  if (config?.multi) {
    (token as any).__multi = true;
  }

  return token;
}

// ─── provide() overloads ────────────────────────────────────────

/**
 * Provides a token using its built-in factory.
 *
 * @param token A `ProvidableToken` created with `injectionToken({ factory })`.
 * @returns A `Provider` suitable for a component/directive/route `providers` array.
 *
 * @example
 * providers: [provide(counterToken)]
 */
export function provide<T>(token: ProvidableToken<T>): Provider;

/**
 * Provides a multi token using its built-in factory. Each call contributes one entry.
 *
 * @param token A `ProvidableMultiToken` created with `injectionToken({ factory, multi: true })`.
 *
 * @example
 * providers: [provide(pluginToken), provide(pluginToken)]  // two entries
 */
export function provide<T>(token: ProvidableMultiToken<T>): Provider;

/**
 * Provides a single-value token with an explicit factory.
 *
 * @param config.token The `InjectableToken` to provide.
 * @param config.factory A factory returning `T`.
 *
 * @example
 * provide({ token: configToken, factory: () => ({ apiUrl: '/api' }) })
 */
export function provide<T>(config: { token: InjectableToken<T>; factory: () => T }): Provider;

/**
 * Provides a multi-value token with an explicit factory. The factory returns one `T` item.
 *
 * @param config.token The `InjectableMultiToken` to provide.
 * @param config.factory A factory returning a single `T` contribution.
 *
 * @example
 * provide({ token: pluginToken, factory: () => ({ name: 'custom' }) })
 */
export function provide<T>(config: { token: InjectableMultiToken<T>; factory: () => T }): Provider;

/**
 * Provides a class token with an explicit factory.
 *
 * @param config.token A class constructor (concrete or abstract).
 * @param config.factory A factory returning an instance of `T`.
 *
 * @example
 * provide({ token: Store, factory: () => new Store() })
 */
export function provide<T>(config: { token: abstract new (...args: any[]) => T; factory: () => T }): Provider;

// ─── provide() implementation ───────────────────────────────────

export function provide(tokenOrConfig: any): Provider {
  // Object form: { token, factory }
  if (tokenOrConfig && typeof tokenOrConfig === 'object' && 'token' in tokenOrConfig) {
    const { token, factory } = tokenOrConfig;
    const multi = !!(token as any).__multi;
    return { provide: token, useFactory: factory, multi };
  }

  // Shorthand form: provide(token) — token must have __factory
  const token = tokenOrConfig;
  const factory = (token as any).__factory;
  if (!factory) {
    throw new Error(
      `provide() shorthand requires a token created with a factory. ` +
        `Use provide({ token, factory }) instead.`,
    );
  }
  const multi = !!(token as any).__multi;
  return { provide: token, useFactory: factory, multi };
}

// ─── Typed inject() wrapper ─────────────────────────────────────

/**
 * Injects a multi-value token. Returns `T[]`.
 *
 * @param token An `InjectableMultiToken<T>` — each registered provider contributes one `T`.
 * @returns The collected array of all provided values.
 *
 * @example
 * const plugins = injectToken(pluginToken); // Plugin[]
 */
export function injectToken<T>(token: InjectableMultiToken<T>): T[];
/** @see {@link injectToken} */
export function injectToken<T>(
  token: InjectableMultiToken<T>,
  options: InjectOptions & { optional?: false },
): T[];
/** @see {@link injectToken} — returns `null` if not provided and `optional: true`. */
export function injectToken<T>(
  token: InjectableMultiToken<T>,
  options: InjectOptions,
): T[] | null;

/**
 * Injects a single-value token or a class instance.
 *
 * @param token An `InjectableToken<T>` or a class constructor (concrete or abstract).
 * @returns The provided value or class instance.
 *
 * @example
 * const counter = injectToken(counterToken); // { value: Signal<number>; ... }
 * const store = injectToken(Store);          // Store
 */
export function injectToken<T>(token: InjectableToken<T> | (abstract new (...args: any[]) => T)): T;
/** @see {@link injectToken} */
export function injectToken<T>(
  token: InjectableToken<T> | (abstract new (...args: any[]) => T),
  options: InjectOptions & { optional?: false },
): T;
/** @see {@link injectToken} — returns `null` if not provided and `optional: true`. */
export function injectToken<T>(
  token: InjectableToken<T> | (abstract new (...args: any[]) => T),
  options: InjectOptions,
): T | null;

export function injectToken(token: any, options?: InjectOptions): any {
  return ngInject(token, options as any);
}
```

---

## Why this works

### Token identity as Map key

The R3Injector uses the token **instance** as the key in its internal `records` Map. Our `injectionToken()` creates a real `InjectionToken` instance, so it participates in DI exactly like any other token.

### `autoProvided` → `providedIn: 'root'`

When `autoProvided: true`, we pass `{ providedIn: 'root', factory }` to the `InjectionToken` constructor. This causes the constructor to internally set `ɵprov` on the token. The R3Injector's `injectableDefInScope` check then finds it and auto-creates the record — identical to `@Injectable({ providedIn: 'root' })`.

### `provide()` → standard `Provider`

`provide(token)` returns `{ provide: token, useFactory: factory, multi: true/false }`. This is a standard `FactoryProvider` that Angular's `processProvider` handles natively. No patching needed. The object form `provide({ token: Store, factory: () => new Store() })` works identically for class tokens.

### Multi at runtime

Multi is a **provider-level** flag in Angular's DI. The token itself doesn't carry multi semantics at runtime — it's the `{ multi: true }` on each provider entry that triggers the array-collection behavior in `R3Injector.processProvider`. Our `provide()` function reads the `__multi` flag from the token and emits `multi: true` automatically.

### Branded types — zero runtime cost

The `TOKEN_VALUE`, `TOKEN_MULTI`, and `TOKEN_HAS_FACTORY` symbols are `declare`-only — they never exist at runtime. TypeScript uses them for structural incompatibility (nominal typing). This means:
- `InjectableToken<number>` is not assignable to `InjectableToken<string>`
- `InjectableMultiToken<T>` is not assignable to `InjectableToken<T[]>` (they're separate hierarchies)
- `provide(token)` only compiles if the token has `TOKEN_HAS_FACTORY`

---

## Limitations & Trade-offs

### 1. `inject()` generic override cannot be blocked

Angular's `inject<T>(token: ProviderToken<T>): T` allows `inject<string>(numberToken)`. This is a TypeScript-level issue that can only be fixed by Angular removing the explicit generic parameter from `inject()`. The userland `injectToken()` wrapper avoids this by not exposing a generic parameter that can be overridden.

### 2. `injectToken()` vs `inject()`

The userland version exports `injectToken()` as a typed wrapper. Developers must use it instead of Angular's `inject()` to get the multi-token `T[]` return type. This is the main ergonomic cost.

**Alternative**: if the branded tokens extend `InjectionToken<T[]>` for multi (which they do — `InjectableMultiToken<T> extends InjectionToken<T[]>`), then Angular's native `inject()` already returns `T[]`. The wrapper is only needed to *prevent* the generic override footgun.

### 3. `__factory` and `__multi` are runtime properties

These are non-standard properties on the token instance. They're prefixed with `__` to avoid collisions. A more robust approach would use a `WeakMap` side-table:

```ts
const tokenMeta = new WeakMap<InjectionToken<any>, { factory?: () => any; multi?: boolean }>();
```

### 4. No private API dependency

The implementation uses only the public `InjectionToken` constructor and Angular's `inject()` function. The `providedIn: 'root'` behavior that powers `autoProvided` is documented and stable public API.

---

## Usage Example

```ts
import { Component } from '@angular/core';
import { injectionToken, provide, injectToken } from './injection-token';
import { signal } from '@angular/core';

// Token with factory (component-scoped)
const counterToken = injectionToken({
  debugName: 'counterToken',
  factory: () => {
    const count = signal(0);
    return {
      value: count.asReadonly(),
      increment: () => count.update(v => v + 1),
    };
  },
});

// Auto-provided (root-scoped)
const loggerToken = injectionToken({
  debugName: 'loggerToken',
  autoProvided: true,
  factory: () => ({ log: (msg: string) => console.log(msg) }),
});

// Multi token
const pluginToken = injectionToken({
  debugName: 'pluginToken',
  multi: true,
  factory: () => ({ name: 'default' }),
});

// Token without factory
const configToken = injectionToken<{ apiUrl: string }>({ debugName: 'configToken' });

// Plain class
class Store {
  items = signal<string[]>([]);
}

@Component({
  providers: [
    provide(counterToken),                                    // uses built-in factory
    provide(pluginToken),                                     // multi: contributes one entry
    provide({ token: pluginToken, factory: () => ({ name: 'custom' }) }), // multi: another entry
    provide({ token: configToken, factory: () => ({ apiUrl: '/api' }) }), // explicit factory
    provide({ token: Store, factory: () => new Store() }),    // class token with factory
    // provide(configToken),  // ← compile error: configToken has no TOKEN_HAS_FACTORY
  ],
  template: `...`,
})
export class MyComponent {
  counter = injectToken(counterToken);       // inferred: { value: Signal<number>; increment: () => void }
  logger = injectToken(loggerToken);         // inferred: { log: (msg: string) => void }
  plugins = injectToken(pluginToken);        // inferred: { name: string }[]
  config = injectToken(configToken);         // inferred: { apiUrl: string }
  store = injectToken(Store);                // inferred: Store
}
```

---

## On `inject()` Extra Overloads

See the dedicated section at the end of this document.

### The core tension

Your proposal adds overloads to Angular's `inject()`:

```ts
export function inject<T>(token: InjectableMultiToken<T>): T[];
export function inject<T>(token: InjectableToken<T>): T;
```

This creates a **breaking change** in Angular's public API surface. Here's the analysis:

### Option A: Modify Angular's `inject()` (framework-level change)

**Pros:**
- Single `inject()` function — no cognitive split
- Multi tokens automatically return `T[]`
- Can remove the exploitable generic parameter

**Cons:**
- Breaking change to a core public API
- Every existing `InjectionToken<T>` would need to be compatible with the new overloads
- Overload resolution order is fragile — `InjectableMultiToken<T>` must precede `InjectableToken<T>` or multi tokens fall through

**Feasibility:** Requires Angular team buy-in. The overloads are additive (existing `ProviderToken<T>` still works), but removing the generic override is breaking.

### Option B: Userland `injectToken()` wrapper (this draft)

**Pros:**
- Zero breaking changes
- Ships today as an npm package
- Opt-in per-project

**Cons:**
- Two inject functions in the codebase (`inject` for classes, `injectToken` for branded tokens)
- Developers must remember which to use
- IDE auto-imports may suggest the wrong one

### Option C: Augment Angular's `inject()` via module augmentation

```ts
// In your library's type augmentation file:
declare module '@angular/core' {
  export function inject<T>(token: InjectableMultiToken<T>): T[];
  export function inject<T>(token: InjectableToken<T>): T;
}
```

**Pros:**
- Single `inject()` function
- No runtime wrapper — zero overhead

**Cons:**
- Module augmentation for functions is unreliable in TypeScript (works for interfaces/namespaces, not standalone functions)
- **Does not actually work** — you cannot add overloads to an already-exported function via `declare module`

### Recommendation

**For userland delivery: Option B** (`injectToken()` wrapper). It's the only approach that works today without Angular changes.

**For eventual Angular integration: Option A**, but with a migration path:
1. Add the new overloads to `inject()` (non-breaking — they're more specific)
2. Deprecate the explicit generic parameter `inject<T>()` via a lint rule
3. Eventually remove it in a major version

The key insight is that `InjectableMultiToken<T> extends InjectionToken<T[]>`, so passing a multi token to today's `inject()` already returns `T[]` correctly. The overloads are primarily about **preventing misuse** (generic override, mixing multi/non-multi), not about enabling new runtime behavior.
