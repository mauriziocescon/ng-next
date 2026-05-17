# `injectionToken` — Userland Implementation Draft

## Feasibility Summary

**Yes, this can be delivered entirely in userland** without any private Angular APIs. The implementation uses the public `InjectionToken` constructor (which internally calls `ɵɵdefineInjectable` when `providedIn` is set). The branded types are purely compile-time — zero runtime cost.

### What works without any Angular changes

| Feature | Mechanism |
|---------|-----------|
| Branded nominal types | TypeScript `unique symbol` brands — compile-time only |
| `injectionToken()` factory | Creates a standard `InjectionToken` instance via its public constructor |
| `autoProvided` | For single tokens only, passes `{ providedIn: 'root', factory }` to the `InjectionToken` constructor |
| `provide()` shorthand | Returns a standard `{ provide, useFactory, multi? }` object |
| Multi at token level | `injectionToken.multi(...)` returns a branded multi token; `provide()` emits `multi: true` on the provider |
| Token-derived `inject()`/`provide()` typing | A token contract stores both the injected value type and the provider contribution type |
| `debugName` convention | Passed as the `_desc` string to `InjectionToken` constructor |
| `injectStrict()` for classes | Delegates to Angular's `inject()` with a class constructor token |
| Legacy `InjectionToken<T>` support | Works for `injectStrict(token)` and `provide(token, factory)` explicit providers |

### What requires Angular-side changes

| Feature | Why |
|---------|-----|
| Preventing `inject<string>(numberToken)` on Angular's native `inject()` | Cannot be fixed in userland. Requires Angular to remove or constrain the generic parameter on `inject()`. The userland `injectStrict()` wrapper avoids the issue with token-derived generics. |

---

## Implementation

```ts
// injection-token.ts — drop-in userland library

import {
  HostAttributeToken,
  InjectionToken,
  type InjectOptions,
  type Provider,
  inject as ngInject,
} from '@angular/core';

// ─── Branded symbols (compile-time only) ────────────────────────

declare const TOKEN_INJECTS: unique symbol;
declare const TOKEN_PROVIDES: unique symbol;
declare const TOKEN_MULTI: unique symbol;
declare const TOKEN_WITH_FACTORY: unique symbol;

// ─── Token contract ─────────────────────────────────────────────

/**
 * Internal compile-time contract for token-derived APIs.
 *
 * `Injects` is the value returned by `injectStrict(token)`.
 * `Provides` is the value contributed by `provide(token, factory)`.
 *
 * Single token: injects T,   provides T.
 * Multi token:  injects T[], provides T.
 */
interface DiTokenContract<Injects, Provides> {
  readonly [TOKEN_INJECTS]: Injects;
  readonly [TOKEN_PROVIDES]: Provides;
}

// ─── Public token interfaces ────────────────────────────────────

/**
 * A nominally-typed single-value DI token.
 *
 * Use `injectStrict(token)` to retrieve the value — returns `T`.
 * Use `provide(token, factory)` to register a provider.
 *
 * @see {@link injectionToken} to create one.
 */
export interface DiToken<T>
  extends InjectionToken<T>,
    DiTokenContract<T, T> {}

/**
 * A nominally-typed multi-value DI token.
 *
 * Each `provide()` call contributes one `T` item.
 * `injectStrict(token)` returns `T[]`.
 *
 * @see {@link injectionToken.multi} to create one.
 */
export interface DiMultiToken<T>
  extends InjectionToken<T[]>,
    DiTokenContract<T[], T> {
  readonly [TOKEN_MULTI]: T;
}

// ─── Internal shorthand-eligible token interfaces ───────────────

/**
 * A single-value token created with a factory.
 * Eligible for the `provide(token)` shorthand (no explicit factory needed).
 *
 * @see {@link injectionToken} with a `factory` option.
 */
interface DiTokenWithFactory<T> extends DiToken<T> {
  readonly [TOKEN_WITH_FACTORY]: true;
  /** @internal stored factory for provide() shorthand */
  readonly __factory: () => T;
}

/**
 * A multi-value token created with a factory.
 * Eligible for the `provide(token)` shorthand (no explicit factory needed).
 *
 * @see {@link injectionToken.multi} with a `factory` option.
 */
interface DiMultiTokenWithFactory<T> extends DiMultiToken<T> {
  readonly [TOKEN_WITH_FACTORY]: true;
  /** @internal stored factory for provide() shorthand */
  readonly __factory: () => T;
}

// ─── Config interfaces ──────────────────────────────────────────

interface DiTokenBaseConfig {
  debugName?: string;
  autoProvided?: false;
}

interface DiTokenWithFactoryConfig<T> {
  debugName?: string;
  factory: () => T;
  autoProvided?: boolean;
}

interface DiMultiTokenBaseConfig {
  debugName?: string;
}

interface DiMultiTokenWithFactoryConfig<T> {
  debugName?: string;
  factory: () => T;
}

// ─── injectionToken() overloads ─────────────────────────────────

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
export function injectionToken<T>(config: DiTokenWithFactoryConfig<T>): DiTokenWithFactory<T>;

/**
 * Creates a DI token without a factory.
 * Must be provided explicitly via `provide(token, factory)`.
 *
 * @example
 * const CONFIG = injectionToken<AppConfig>({ debugName: 'CONFIG' });
 * // provide(CONFIG)         ← compile error
 * // provide(CONFIG, () => ({...}))  ← OK
 */
export function injectionToken<T>(config?: DiTokenBaseConfig): DiToken<T>;

// ─── injectionToken() implementation ────────────────────────────

export function injectionToken<T>(config?: any): any {
  return createInjectionToken(config, false);
}

export namespace injectionToken {
  /**
   * Creates a multi-value DI token with a built-in factory.
   * Can be provided via the `provide(token)` shorthand — each call contributes one `T`.
   *
   * @example
   * const PLUGINS = injectionToken.multi({
   *   debugName: 'PLUGINS',
   *   factory: () => defaultPlugin(),
   * });
   * // provide(PLUGINS)  ← contributes one entry using the built-in factory
   */
  export function multi<T>(
    config: DiMultiTokenWithFactoryConfig<T>,
  ): DiMultiTokenWithFactory<T>;

  /**
   * Creates a multi-value DI token without a factory.
   * Must be provided explicitly via `provide(token, factory)`.
   *
   * @example
   * const HOOKS = injectionToken.multi<Hook>({ debugName: 'HOOKS' });
   * // provide(HOOKS, () => myHook)  ← contributes one Hook
   */
  export function multi<T>(config?: DiMultiTokenBaseConfig): DiMultiToken<T>;
  export function multi<T>(config?: any): any {
    return createInjectionToken(config, true);
  }
}

function createInjectionToken<T>(config: any, multi: boolean): any {
  const desc = config?.debugName ?? '';
  const factory = config?.factory;
  const autoProvided = config?.autoProvided ?? false;

  if (multi && autoProvided) {
    throw new Error('autoProvided is not supported for multi tokens.');
  }

  // Create a standard InjectionToken.
  // For multi tokens, the runtime type is T[] but the token is keyed by instance identity.
  let token: InjectionToken<any>;

  if (factory && autoProvided) {
    // autoProvided single token: register with providedIn:'root' so the injector picks it up automatically
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
  if (multi) {
    (token as any).__multi = true;
  }

  return token;
}

// ─── provide() token aliases ────────────────────────────────────

type AbstractCtor<T = any> = abstract new (...args: any[]) => T;

type StrictInjectionToken =
  | DiTokenContract<any, any>
  | InjectionToken<any>
  | AbstractCtor<any>;

type InjectResult<T> =
  T extends DiTokenContract<infer V, any> ? V :
  T extends InjectionToken<infer V> ? V :
  T extends AbstractCtor<infer V> ? V :
  never;

type ProvideValue<T> =
  T extends DiTokenContract<any, infer V> ? V :
  T extends InjectionToken<infer V> ? V :
  T extends AbstractCtor<infer V> ? V :
  never;

type DiTokenWithAnyFactory = DiTokenContract<any, any> & {
  readonly [TOKEN_WITH_FACTORY]: true;
};

type DefaultProviderToken = DiTokenWithAnyFactory;

type ExplicitProviderToken =
  | DiTokenContract<any, any>
  | InjectionToken<any>
  | AbstractCtor<any>;

// ─── provide() overloads ────────────────────────────────────────

/**
 * Provides a token using its built-in factory.
 *
 * For multi tokens, each call contributes one entry.
 *
 * @example
 * providers: [provide(counterToken)]
 * providers: [provide(pluginToken), provide(pluginToken)]  // two entries
 */
export function provide<const T extends DefaultProviderToken>(token: T): Provider;

/**
 * Provides a token or class with an explicit factory.
 *
 * For multi tokens, the factory returns one `T` item.
 *
 * @example
 * provide(configToken, () => ({ apiUrl: '/api' }))
 * provide(pluginToken, () => ({ name: 'custom' }))
 * provide(legacyToken, () => 10)
 * provide(Store, () => new Store())
 */
export function provide<const T extends ExplicitProviderToken>(
  token: T,
  factory: () => ProvideValue<T>,
): Provider;

// ─── provide() implementation ───────────────────────────────────

export function provide(token: any, explicitFactory?: () => unknown): Provider {
  const factory = explicitFactory ?? (token as any).__factory;

  if (!factory) {
    throw new Error(
      `provide() shorthand requires a token created with a factory. ` +
        `Use provide(token, factory) instead.`,
    );
  }

  const multi = !!(token as any).__multi;
  return { provide: token, useFactory: factory, multi };
}

// ─── Strict inject() wrapper ────────────────────────────────────

/**
 * Injects a strict token or class instance.
 *
 * The generic represents the token type, not the injected value type, so
 * `injectStrict<string>(token)` is rejected.
 *
 * Optional injection is intentionally modeled with literal option shapes only.
 * A broadly typed `InjectOptions` object is rejected because accepting it would
 * require a compatibility overload that reintroduces Angular's value-generic
 * escape hatch.
 *
 * @example
 * const counter = injectStrict(counterToken); // { value: Signal<number>; ... }
 * const plugins = injectStrict(pluginToken); // Plugin[]
 * const store = injectStrict(Store);          // Store
 */
export function injectStrict<const T extends StrictInjectionToken>(
  token: T,
): InjectResult<T>;
/** @see {@link injectStrict} */
export function injectStrict<const T extends StrictInjectionToken>(
  token: T,
  options: InjectOptions & { optional?: false },
): InjectResult<T>;
/** @see {@link injectStrict} — returns `null` if not provided and `optional: true`. */
export function injectStrict<const T extends StrictInjectionToken>(
  token: T,
  options: InjectOptions & { optional: true },
): InjectResult<T> | null;
/**
 * Injects a static attribute from the host node.
 *
 * This mirrors Angular's HostAttributeToken overloads and is separate from
 * strict DI-token injection.
 */
export function injectStrict(token: HostAttributeToken): string;
/** Injects a static host attribute, returning `null` when optional and absent. */
export function injectStrict(
  token: HostAttributeToken,
  options: { optional: true },
): string | null;
/** Injects a required static host attribute. */
export function injectStrict(
  token: HostAttributeToken,
  options: { optional: false },
): string;

export function injectStrict(token: any, options?: InjectOptions): any {
  return ngInject(token, options as any);
}
```

---

## Why this works

### Token identity as Map key

The R3Injector uses the token **instance** as the key in its internal `records` Map. Our `injectionToken()` creates a real `InjectionToken` instance, so it participates in DI exactly like any other token.

### `autoProvided` → `providedIn: 'root'`

When `autoProvided: true` is used on a single-value token, we pass `{ providedIn: 'root', factory }` to the `InjectionToken` constructor. This causes the constructor to internally set `ɵprov` on the token. The R3Injector's `injectableDefInScope` check then finds it and auto-creates the record — identical to `@Injectable({ providedIn: 'root' })`.

### `provide()` → standard `Provider`

`provide(token)` returns `{ provide: token, useFactory: factory, multi: true/false }`. This is a standard `FactoryProvider` that Angular's `processProvider` handles natively. No patching needed. The explicit factory form works for `DiToken`, legacy `InjectionToken`, and class tokens.

### Multi at runtime

Multi is a **provider-level** flag in Angular's DI. The proposed API makes the token's cardinality explicit with `injectionToken.multi(...)`; `provide()` reads the token's multi metadata and emits `{ multi: true }` on each provider entry automatically.

### Token contract and branded types — zero runtime cost

The `TOKEN_INJECTS`, `TOKEN_PROVIDES`, `TOKEN_MULTI`, and `TOKEN_WITH_FACTORY` symbols are `declare`-only — they never exist at runtime. TypeScript uses them for structural incompatibility (nominal typing) and token-derived API results. This means:
- `DiToken<number>` is not assignable to `DiToken<string>`
- `DiMultiToken<T>` is not assignable to `DiToken<T[]>` (they're separate hierarchies)
- `injectStrict(token)` returns the contract's `Injects` type
- `provide(token, factory)` requires the factory to return the contract's `Provides` type
- `provide(token)` only compiles if the token has `TOKEN_WITH_FACTORY`

Legacy Angular `InjectionToken<T>` values are supported only in explicit forms:
- `injectStrict(legacyToken)` returns `T`
- `provide(legacyToken, factory)` requires the factory to return `T`
- `provide(legacyToken)` remains rejected because legacy tokens do not carry `TOKEN_WITH_FACTORY`

---

## Limitations & Trade-offs

### 1. Native `inject()` generic override cannot be blocked

Angular's `inject<T>(token: ProviderToken<T>): T` allows `inject<string>(numberToken)`. This is a TypeScript-level issue that can only be fixed by Angular removing the explicit generic parameter from `inject()`. The userland `injectStrict()` wrapper avoids this by making its generic represent the token type, not the injected value type.

### 2. `injectStrict()` vs `inject()`

The userland version exports `injectStrict()` as a stricter typed wrapper. Developers must use it instead of Angular's `inject()` to get the generic-override protection. This is the main ergonomic cost. `injectStrict<string>(token)` is rejected because `string` is not a valid token type.

To preserve that guarantee, dynamic options objects typed as `InjectOptions` are not accepted by `injectStrict()`. Call sites must pass literal/static option shapes such as `{ optional: true }` or `{ optional: false }`, or use Angular's native `inject()` when they intentionally need dynamic `InjectOptions` compatibility.

**Alternative**: because the branded multi tokens also extend `InjectionToken<T[]>`, Angular's native `inject()` already returns `T[]` for them. The wrapper is still needed to *prevent* the generic override footgun and to make `provide()` factories use the token contract's `Provides` type.

Legacy `InjectionToken<T>` values can be accepted by the wrapper for compatibility, but they do not gain the nominal `DiToken`/`DiMultiToken` separation. Multi legacy tokens are only typed correctly if they are declared as `InjectionToken<T[]>`.

### 3. `__factory` and `__multi` are runtime properties

These are non-standard properties on the token instance. They're prefixed with `__` to avoid collisions. A more robust approach would use a `WeakMap` side-table:

```ts
const tokenMeta = new WeakMap<InjectionToken<any>, { factory?: () => any; isMulti?: boolean }>();
```

### 4. Userland feasibility

`autoProvided` is userland-feasible for single tokens because it maps to `providedIn: 'root'`. `injectionToken.multi(...)` is userland-feasible because it is provider metadata plus `provide()` emitting `multi: true`. `autoProvided + multi` is intentionally unsupported.

### 5. No private API dependency

The implementation uses only the public `InjectionToken` constructor and Angular's `inject()` function. The `providedIn: 'root'` behavior that powers `autoProvided` is documented and stable public API.

---

## Usage Example

```ts
import { Component, InjectionToken } from '@angular/core';
import { injectionToken, provide, injectStrict } from './injection-token';
import { signal } from '@angular/core';

// Token with factory (component-scoped)
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

// Auto-provided (root-scoped)
const loggerToken = injectionToken({
  debugName: 'loggerToken',
  autoProvided: true,
  factory: () => ({ log: (msg: string) => console.log(msg) }),
});

// Multi token
const pluginToken = injectionToken.multi({
  debugName: 'pluginToken',
  factory: () => ({ name: 'default' }),
});

// Token without factory
const configToken = injectionToken<{ apiUrl: string }>({ debugName: 'configToken' });

// Single token with array value type
const tagsToken = injectionToken<string[]>({ debugName: 'tags' });

// Multi token without factory
const orderedPluginToken = injectionToken.multi<{ order: number }>({
  debugName: 'orderedPluginToken',
});

// Legacy Angular token: supported for explicit providers and injection.
const legacyToken = new InjectionToken<number>('legacyToken');

// Plain class
class Store {
  items = signal<string[]>([]);
}

@Component({
  providers: [
    provide(counterToken),                                    // uses built-in factory
    provide(pluginToken),                                     // multi: contributes one entry
    provide(pluginToken, () => ({ name: 'custom' })),         // multi: another entry
    provide(configToken, () => ({ apiUrl: '/api' })),         // explicit factory
    provide(tagsToken, () => ['a', 'b']),                     // array-valued single token
    provide(orderedPluginToken, () => ({ order: 1 })),        // multi token without factory
    provide(legacyToken, () => 10),                           // legacy InjectionToken<T>
    provide(Store, () => new Store()),                        // class token with factory
    // provide(configToken),  // ← compile error: configToken has no TOKEN_WITH_FACTORY
    // provide(legacyToken),  // ← compile error: legacy token has no TOKEN_WITH_FACTORY
  ],
  template: `...`,
})
export class MyComponent {
  counter = injectStrict(counterToken);        // inferred: { value: Signal<number>; increment: () => void }
  logger = injectStrict(loggerToken);          // inferred: { log: (msg: string) => void }
  plugins = injectStrict(pluginToken);         // inferred: { name: string }[]
  config = injectStrict(configToken);          // inferred: { apiUrl: string }
  maybeConfig = injectStrict(configToken, { optional: true }); // inferred: { apiUrl: string } | null
  tags = injectStrict(tagsToken);              // inferred: string[]
  ordered = injectStrict(orderedPluginToken);  // inferred: { order: number }[]
  legacy = injectStrict(legacyToken);          // inferred: number
  store = injectStrict(Store);                 // inferred: Store
}
```

---

## On `inject()` Extra Overloads

See the dedicated section at the end of this document.

### The core tension

Your proposal can model strict injection with token-derived overloads:

```ts
export function inject<const T extends StrictInjectionToken>(
  token: T,
): InjectResult<T>;

export function inject<const T extends StrictInjectionToken>(
  token: T,
  options: InjectOptions & { optional?: false },
): InjectResult<T>;

export function inject<const T extends StrictInjectionToken>(
  token: T,
  options: InjectOptions & { optional: true },
): InjectResult<T> | null;

export function inject(token: HostAttributeToken): string;
export function inject(
  token: HostAttributeToken,
  options: { optional: true },
): string | null;
export function inject(
  token: HostAttributeToken,
  options: { optional: false },
): string;
```

The generic is the token type, not the injected value type. This preserves optional injection support while rejecting value overrides such as `inject<string>(counterToken)`. To keep that guarantee, the overload set intentionally does not include Angular's broad `inject<T>(token: ProviderToken<T>, options: InjectOptions): T | null` compatibility overload. For Angular's native `inject()`, changing the public generic behavior would still be a framework-level API decision. Here's the analysis:

### Option A: Modify Angular's `inject()` (framework-level change)

**Pros:**
- Single `inject()` function — no cognitive split
- Multi tokens automatically return `T[]`
- Can remove the exploitable generic parameter
- Optional injection returns `InjectResult<T> | null`

**Cons:**
- Breaking change to a core public API
- Every existing `InjectionToken<T>` would need to be compatible with the new overloads
- Existing call sites that rely on value-generic override behavior would need migration

**Feasibility:** Requires Angular team buy-in. The overloads are additive (existing `ProviderToken<T>` still works), but removing the generic override is breaking.

### Option B: Userland `injectStrict()` wrapper (this draft)

**Pros:**
- Zero breaking changes
- Ships today as an npm package
- Opt-in per-project

**Cons:**
- Two inject functions in the codebase (`inject` and `injectStrict`)
- Developers must remember which to use
- IDE auto-imports may suggest the wrong one

### Option C: Augment Angular's `inject()` via module augmentation

```ts
// In your library's type augmentation file:
declare module '@angular/core' {
  export function inject<const T extends StrictInjectionToken>(
    token: T,
  ): InjectResult<T>;
  export function inject<const T extends StrictInjectionToken>(
    token: T,
    options: InjectOptions & { optional?: false },
  ): InjectResult<T>;
  export function inject<const T extends StrictInjectionToken>(
    token: T,
    options: InjectOptions & { optional: true },
  ): InjectResult<T> | null;
}
```

**Pros:**
- Single `inject()` function
- No runtime wrapper — zero overhead

**Cons:**
- Module augmentation for functions is unreliable in TypeScript (works for interfaces/namespaces, not standalone functions)
- **Does not actually work** — you cannot add overloads to an already-exported function via `declare module`

### Recommendation

**For userland delivery: Option B** (`injectStrict()` wrapper). It's the only approach that works today without Angular changes.

**For eventual Angular integration: Option A**, but with a migration path:
1. Add token-derived overloads with optional injection support to `inject()`
2. Deprecate the explicit generic parameter `inject<T>()` via a lint rule
3. Eventually remove it in a major version

The key insight is that `DiMultiToken<T>` carries two type channels: it extends `InjectionToken<T[]>` for Angular compatibility, while the internal token contract records that `provide()` contributes one `T` item. The token-derived overloads are primarily about **preventing misuse** (generic override, mixing multi/non-multi, wrong provider factory values), not about enabling new runtime behavior.
