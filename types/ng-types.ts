import {
  HostAttributeToken,
  InjectionToken,
  type InjectOptions,
  type InputSignal,
  type ModelSignal,
  type OutputEmitterRef,
  type Provider,
  type Signal,
} from '@angular/core';

// ────────────────────────────────────────────────────────────────
// 1. TEMPLATE MARKUP
//
// Branded type so the compiler can distinguish a raw template
// return (shorthand) from an object return (full form).
// The AST payload is phantom type metadata: the compiler produces
// TemplateMarkup<TAst> from the DSL, while public APIs can accept
// the default TemplateMarkup alias when they do not inspect the tree.
//
// TemplateAST is nominal and opaque here. The shape of a parsed `@{ }`
// literal is the compiler's concern; this layer only needs a distinct
// token so a specific markup type cannot be mistaken for the generic
// one. See ng-dsl-type-checking-spec.md §2.1 (MARKUP-LITERAL).
// ────────────────────────────────────────────────────────────────

declare const TEMPLATE: unique symbol;
declare const TEMPLATE_AST: unique symbol;
declare const TEMPLATE_AST_BRAND: unique symbol;

export interface TemplateAST {
  readonly [TEMPLATE_AST_BRAND]: true;
}

export type TemplateMarkup<TAst extends TemplateAST = TemplateAST> = {
  readonly [TEMPLATE]: true;
  readonly [TEMPLATE_AST]: TAst;
};

export type TemplateAstOf<T extends TemplateMarkup> =
  T extends TemplateMarkup<infer TAst> ? TAst : never;

// ────────────────────────────────────────────────────────────────
// 2. BRANDED BINDING TYPES
//
// These do not exist in Angular today. They use unique symbols
// so TypeScript treats each as a distinct nominal type rather
// than a plain object.
// ────────────────────────────────────────────────────────────────

declare const FRAGMENT: unique symbol;
declare const FRAGMENT_OPTIONAL: unique symbol;
declare const FRAGMENT_REQUIRED: unique symbol;

type IsTuple<T extends readonly unknown[]> = number extends T['length']
  ? false
  : true;

// Tuple types declare the fragment's parameter list. Open array types are
// treated as a single array payload, not as a variadic list of array items.
type FragmentArgs<T> = [T] extends [void]
  ? []
  : T extends readonly unknown[]
    ? IsTuple<T> extends true
      ? [...T]
      : [T]
    : [T];

export type OptionalFragmentBinding<T> = {
  (...args: FragmentArgs<T>): TemplateMarkup;
  readonly [FRAGMENT]: T;
  readonly [FRAGMENT_OPTIONAL]: true;
};
export type RequiredFragmentBinding<T> = {
  (...args: FragmentArgs<T>): TemplateMarkup;
  readonly [FRAGMENT]: T;
  readonly [FRAGMENT_REQUIRED]: true;
};
export type FragmentBinding<T> =
  | OptionalFragmentBinding<T>
  | RequiredFragmentBinding<T>;

export declare function fragment<T>(): OptionalFragmentBinding<T>;
export declare namespace fragment {
  export function required<T>(): RequiredFragmentBinding<T>;
}

// ────────────────────────────────────────────────────────────────
// 3. REF
//
// Read-only signal populated by the framework. Extends Signal<T>
// with a branded symbol so the template compiler can distinguish
// ref targets from regular signals.
//
// Also used as the directive host declaration: host: ref<H>().
// ────────────────────────────────────────────────────────────────

declare const REF: unique symbol;

export interface Ref<T> extends Signal<T> {
  readonly [REF]: true;
}

// ────────────────────────────────────────────────────────────────
// 4. BINDING SURFACES
//
// One union of every binding value, aliased per surface. The surfaces are
// not structurally layered: each declares the same constraint and narrows it
// with a mapped validator instead, because the narrowing has to name the
// offending key (mapping it to `never`) rather than reject the whole record.
// - Component: ValidateComponentBindings — reserves `children` / `ref` (§5)
// - Directive: no validator — all four kinds allowed, no reserved names
// - Derivation: ValidateDerivationBindings — inputs only (§9)
//
// The three aliases are exported so consumers can write the interface
// conformance checks of `satisfies` against the right surface, e.g.
// `satisfies Sortable & Record<string, ComponentBindingValue>`.
// ────────────────────────────────────────────────────────────────

type AnyBindingValue =
  | InputSignal<any>
  | ModelSignal<any>
  | OutputEmitterRef<any>
  | OptionalFragmentBinding<any>
  | RequiredFragmentBinding<any>;

export type DirectiveBindingValue = AnyBindingValue;
export type ComponentBindingValue = AnyBindingValue;
// Pre-validation constraint: `derivation(...)` accepts this union and then
// rejects everything but inputs via ValidateDerivationBindings (D043).
export type DerivationBindingValue = AnyBindingValue;

// ────────────────────────────────────────────────────────────────
// 5. INSTANCE TYPES & SHARED HELPERS
//
// ComponentInstance has bindings + expose + template + forward-surface
// metadata.
// DirectiveInstance adds a host element type (H) — a directive
// must be attached to a DOM element.
//
// ExposeOf<T> works for components and directives thanks to structural match
// on EXPOSE. ComponentTemplateOf<T> exposes the template markup metadata that
// component(...) inferred from setup's return value.
//
// InputsOnly<B> filters a bindings record to InputSignal keys
// only (excluding ModelSignal, which extends InputSignal in
// Angular's type hierarchy). Used by `providers`.
// ────────────────────────────────────────────────────────────────

declare const BINDINGS: unique symbol;
declare const EXPOSE: unique symbol;
declare const COMPONENT_TEMPLATE: unique symbol;
declare const HOST: unique symbol;
declare const FORWARD_SURFACE: unique symbol;

export type ComponentInstance<
  B,
  E = void,
  S extends HTMLElement = never,
  TMarkup extends TemplateMarkup = TemplateMarkup,
> = {
  readonly [BINDINGS]: B;
  readonly [EXPOSE]: E;
  readonly [FORWARD_SURFACE]: S;
  readonly [COMPONENT_TEMPLATE]: TMarkup;
};

export type DirectiveInstance<H extends HTMLElement, B, E = void> = {
  readonly [HOST]: H;
  readonly [BINDINGS]: B;
  readonly [EXPOSE]: E;
};

type ExposeOf<T> = T extends { readonly [EXPOSE]: infer E } ? E : never;

export type ComponentTemplateOf<T extends ComponentInstance<any, any, any>> =
  T extends { readonly [COMPONENT_TEMPLATE]: infer TMarkup } ? TMarkup : never;

/**
 * Documentation-only shape for the Angular DSL intrinsic element map.
 *
 * The real compiler/tooling owns the complete native tag registry. These
 * helper types describe the contract used by template type checking:
 * a native tag resolves to a concrete HTMLElement subtype, and that host
 * type is then used for native bindings, directive compatibility,
 * @forward() validation, and native refs.
 */
export interface IntrinsicElementDescriptor<H extends HTMLElement> {
  readonly element: H;
}

export type IntrinsicElementHost<T> =
  T extends IntrinsicElementDescriptor<infer H> ? H : never;

type InputKeys<B> = {
  [K in keyof B]: B[K] extends ModelSignal<any>
    ? never
    : B[K] extends InputSignal<any>
      ? K
      : never;
}[keyof B];

type InputsOnly<B> = Pick<B, InputKeys<B>>;

type SetupBindingValue<V> =
  V extends OptionalFragmentBinding<infer T>
    ? OptionalFragmentBinding<T> | undefined
    : V;

type SetupBindings<B> = {
  [K in keyof B]: SetupBindingValue<B[K]>;
};

type ValidateComponentBindings<
  B extends Record<string, ComponentBindingValue>,
> = {
  [K in keyof B]: K extends 'ref'
    ? never
    : K extends 'children'
      ? B[K] extends FragmentBinding<void>
        ? B[K]
        : never
      : B[K];
};

// Test-only export for diagnostic contract checks in ng-types.spec.ts
export type __ValidateComponentBindings<
  B extends Record<string, ComponentBindingValue>,
> = ValidateComponentBindings<B>;

// ────────────────────────────────────────────────────────────────
// 6. REF UTILITIES
//
// ref()  — single instance, resolves after afterNextRender.
// refMany() — multiple instances (e.g. inside @for).
//
// Each has overloads for native elements, components, and
// directives. The expose type is inferred from the target.
//
// Type resolution rules:
//   - Native element (ref<H>()): the template compiler checks
//     ref={x} against the tag's IntrinsicElements entry, so
//     <div ref={el}> is valid only if el is Ref<HTMLDivElement>.
//   - Component (ref<typeof Comp>()): resolves to
//     Signal<expose | undefined>, where expose is inferred from the
//     component's setup return. typeof is required because const
//     declarations only exist in the value namespace.
//   - Directive (ref<typeof dir>()): resolves to
//     Signal<expose | undefined>, where expose is the directive's
//     setup() return value.
//   - refMany<typeof Type>(): collects multiple instances
//     (e.g. inside @for) into Signal<expose[]>.
//   - refMany<H>(): collects multiple native element instances
//     into Signal<H[]>.
// ────────────────────────────────────────────────────────────────

// Native element
export function ref<H extends HTMLElement>(): Ref<H | undefined>;
// Component or Directive (expose inferred from type parameter)
export function ref<
  T extends
    | ComponentInstance<unknown, unknown, any>
    | DirectiveInstance<HTMLElement, unknown, unknown>,
>(): Ref<ExposeOf<T> extends void ? undefined : ExposeOf<T> | undefined>;

export function ref(): any {
  return {} as any;
}

// Native element
export function refMany<H extends HTMLElement>(): Ref<H[]>;
// Component or Directive (expose inferred from type parameter)
export function refMany<
  T extends
    | ComponentInstance<unknown, unknown, any>
    | DirectiveInstance<HTMLElement, unknown, unknown>,
>(): Ref<ExposeOf<T> extends void ? [] : ExposeOf<T>[]>;

export function refMany(): any {
  return {} as any;
}

// ────────────────────────────────────────────────────────────────
// 7. COMPONENT
//
// setup returns TemplateMarkup directly or { template, expose? }.
//
// component(...) declares every component. `bindings` is the public API;
// setup receives those binding objects; providers receive inputs only.
//
// `forward: surface<S>()` declares a public directive-compatible surface.
// S must extend HTMLElement and is realized by exactly one compatible native
// @forward() placement in the template (D027 on multiple). Omitting `forward`
// leaves no inference site for S, so it falls back to its `never` default —
// a plain component and a forwarding component share one signature.
//
// surface<S>() is a declaration, not a value: a phantom brand behind a
// `declare function`, with no implementation to call and nothing to allocate.
// It sits in a value position for the same reason `fragment.required<void>()`
// does — so the type can be written where TypeScript will infer it — and the
// compiler erases the config key. setup never receives it.
//
// S is a promise, not a fact: @forward() validation checks H ⊑ S, so a
// component may deliberately declare a wider surface (`HTMLElement`) than the
// element it forwards to, keeping the internal tag out of its public API.
// That is why the surface is declared rather than inferred from the template.
//
// @forward() is marker-only: no runtime forwarding object, no spread. The
// enclosing component's surface defines the payload — directives applied at
// the call site — and the marked native element defines where they land.
// ────────────────────────────────────────────────────────────────

declare const SURFACE_DECL: unique symbol;

export type Surface<H extends HTMLElement> = {
  readonly [SURFACE_DECL]: H;
};

export declare function surface<H extends HTMLElement>(): Surface<H>;

type SetupReturn<E, TMarkup extends TemplateMarkup = TemplateMarkup> =
  | { template: TMarkup; expose: E } // full form with expose
  | { template: TMarkup } // full form, no expose
  | TMarkup; // shorthand: raw template

// With bindings
export function component<
  B extends Record<string, ComponentBindingValue>,
  E = void,
  S extends HTMLElement = never,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(
  config: {
    bindings: B & ValidateComponentBindings<B>;
    forward?: Surface<S>;
    setup: (bindings: SetupBindings<B>) => SetupReturn<E, TMarkup>;
    providers?: (inputs: InputsOnly<B>) => Provider[];
    style?: string;
    styleUrl?: string;
  },
): ComponentInstance<B, E, S, TMarkup>;

// No bindings
export function component<
  E = void,
  S extends HTMLElement = never,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(config: {
  bindings?: never;
  forward?: Surface<S>;
  setup: () => SetupReturn<E, TMarkup>;
  providers?: () => Provider[];
  style?: string;
  styleUrl?: string;
}): ComponentInstance<{}, E, S, TMarkup>;

export function component(config: any): any {
  return config;
}

// ────────────────────────────────────────────────────────────────
// 8. DIRECTIVE
//
// Single-call, all generics inferred:
//   H from host, B from bindings, E from setup return.
//
// host is a separate config property — not a binding — because
// it is framework-provided context, not something the consumer
// can bind to. setup receives bindings as the first argument and
// { host } as the second.
// ────────────────────────────────────────────────────────────────

// With bindings
export function directive<
  H extends HTMLElement,
  B extends Record<string, DirectiveBindingValue>,
  E = void,
>(config: {
  host: Ref<H | undefined>;
  bindings: B;
  setup: (
    bindings: SetupBindings<B>,
    context: { host: Ref<H | undefined> },
  ) => E;
}): DirectiveInstance<H, B, E>;

// No bindings
export function directive<H extends HTMLElement, E = void>(config: {
  host: Ref<H | undefined>;
  bindings?: never;
  setup: (bindings: {}, context: { host: Ref<H | undefined> }) => E;
}): DirectiveInstance<H, {}, E>;

export function directive(config: any): any {
  return config as any;
}

// ────────────────────────────────────────────────────────────────
// 9. DERIVATION
//
// Template-scoped reactive computation. Only InputSignal bindings
// are allowed (no host, no outputs, no models — a derivation has
// no DOM surface). setup must return Signal<T>.
//
// Scoped like @let — the name is not accessible outside the block
// it is declared in. Lifetime matches a pure pipe: created when
// the enclosing embedded view is created, destroyed when that view
// is destroyed, recomputed (not recreated) when signal inputs
// change. In a @for loop each iteration owns an independent
// instance with its own injection context.
// ────────────────────────────────────────────────────────────────

declare const RESULT: unique symbol;

export type DerivationInstance<B, T> = {
  readonly [BINDINGS]: B;
  readonly [RESULT]: T;
};

type ValidateDerivationBindings<
  B extends Record<string, DerivationBindingValue>,
> = {
  [K in keyof B]: B[K] extends InputSignal<any>
    ? B[K] extends ModelSignal<any>
      ? never
      : B[K]
    : never;
};

// With bindings (input-only; rejects model, output, fragment via never)
export function derivation<
  B extends Record<string, DerivationBindingValue>,
  T,
>(config: {
  bindings: B & ValidateDerivationBindings<B>;
  setup: (bindings: B) => Signal<T>;
}): DerivationInstance<B, T>;

// No bindings
export function derivation<T>(config: {
  bindings?: never;
  setup: () => Signal<T>;
}): DerivationInstance<{}, T>;

export function derivation(config: any): any {
  return config as any;
}

// ────────────────────────────────────────────────────────────────
// 10. INJECTION TOKEN
//
// Branded DI tokens whose value types are derived from the token itself.
//
// DiTokenContract<Injects, Provides> is the internal source of
// truth for both injection and provider factory typing:
//   - Injects  is the value returned by inject(token)
//   - Provides is the value contributed by provide(token, factory)
//
// Single-value token:
//   DiToken<T> injects T and explicit providers contribute T.
//
// Multi-value token:
//   DiMultiToken<T> injects T[] and each provider contributes one T.
//
// Factory-bearing tokens are eligible for the provide(token)
// shorthand. Tokens without a factory must use provide(token, factory).
//
// autoProvided: true is only valid for single-value tokens with a
// factory. It registers that factory once at root scope.
// ────────────────────────────────────────────────────────────────

declare const TOKEN_INJECTS: unique symbol;
declare const TOKEN_PROVIDES: unique symbol;
declare const TOKEN_MULTI: unique symbol;
declare const TOKEN_WITH_FACTORY: unique symbol;

interface DiTokenContract<Injects, Provides> {
  readonly [TOKEN_INJECTS]: Injects;
  readonly [TOKEN_PROVIDES]: Provides;
}

// Base token — inject() returns T, provide factory returns T.
export interface DiToken<T> extends DiTokenContract<T, T> {}

// Multi token — inject() returns T[], provide factory returns one T item.
export interface DiMultiToken<T>
  extends DiTokenContract<T[], T> {
  readonly [TOKEN_MULTI]: T;
}

// Single token with factory (shorthand-eligible).
interface DiTokenWithFactory<T> extends DiToken<T> {
  readonly [TOKEN_WITH_FACTORY]: true;
}

// Multi token with factory (shorthand-eligible).
interface DiMultiTokenWithFactory<T> extends DiMultiToken<T> {
  readonly [TOKEN_WITH_FACTORY]: true;
}

// Config: multi token with factory. Shorthand-eligible.
interface DiMultiTokenWithFactoryConfig<T> {
  debugName?: string;
  factory: () => T;
}

// Config: single token with factory (autoProvided accepted).
interface DiTokenWithFactoryConfig<T> {
  debugName?: string;
  factory: () => T;
  autoProvided?: boolean;
  multi?: never;
}

// Config: multi token without factory (explicit type parameter required).
interface DiMultiTokenBaseConfig {
  debugName?: string;
}

// Config: single token without factory (explicit type parameter required).
interface DiTokenBaseConfig {
  debugName?: string;
  autoProvided?: false;
  multi?: never;
}

export function injectionToken<T>(
  config: DiTokenWithFactoryConfig<T>,
): DiTokenWithFactory<T>;
export function injectionToken<T>(
  config?: DiTokenBaseConfig,
): DiToken<T>;

export function injectionToken(_config?: any): any {
  return {} as any;
}

export namespace injectionToken {
  export declare function multi<T>(
    config: DiMultiTokenWithFactoryConfig<T>,
  ): DiMultiTokenWithFactory<T>;
  export declare function multi<T>(
    config?: DiMultiTokenBaseConfig,
  ): DiMultiToken<T>;
}

(injectionToken as any).multi = (_config?: any) => ({} as any);

// ────────────────────────────────────────────────────────────────
// 11. INJECT
//
// Strict token-derived injection. The generic parameter is the token
// type, not the injected value type, so inject<string>(token) is
// rejected.
//
// Result mapping:
//   inject(Component) → component expose type
//   inject(Directive) → directive expose type
//   inject(DiToken)   → contract Injects type
//   inject(Class)     → class instance
//
// Optional injection follows Angular's native shape:
//   optional: true returns InjectResult<T> | null.
//   optional false/omitted returns InjectResult<T>.
// ────────────────────────────────────────────────────────────────

type AbstractCtor<T = any> = abstract new (...args: any[]) => T;

type StrictInjectionToken =
  | ComponentInstance<any, any, any>
  | DirectiveInstance<any, any, any>
  | DiTokenContract<any, any>
  | InjectionToken<any>
  | AbstractCtor<any>;

type InjectResult<T> =
  T extends ComponentInstance<any, infer E, any>
    ? E
    : T extends DirectiveInstance<any, any, infer E>
      ? E
      : T extends DiTokenContract<infer V, any>
        ? V
        : T extends InjectionToken<infer V>
          ? V
          : T extends AbstractCtor<infer V>
            ? V
            : never;

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

export function inject(_token: any): any {
  return {} as any;
}

// ────────────────────────────────────────────────────────────────
// 12. PROVIDE
//
// Provider factory helper with token-derived return typing.
//
// Shorthand form:
//   provide(tokenWithFactory)
//   Uses the factory declared by injectionToken({ factory }) or
//   injectionToken.multi({ factory }). Factory-less tokens and classes
//   are intentionally rejected.
//
// Explicit form:
//   provide(tokenOrClass, factory)
//   Supplies or overrides the provider factory.
//
// The factory return type is the token contract's Provides type:
//   DiToken<T>      providers return T.
//   DiMultiToken<T> providers return one T item, not T[].
//   Class tokens    providers return an instance assignable to the class.
// ────────────────────────────────────────────────────────────────

type ProvideValue<T> =
  T extends DiTokenContract<any, infer V>
    ? V
    : T extends InjectionToken<infer V>
      ? V
      : T extends AbstractCtor<infer V>
        ? V
        : never;

type DiTokenWithAnyFactory = DiTokenContract<any, any> & {
  readonly [TOKEN_WITH_FACTORY]: true;
};

type DefaultProviderToken = DiTokenWithAnyFactory;

type ExplicitProviderToken =
  | DiTokenContract<any, any>
  | InjectionToken<any>
  | AbstractCtor<any>;

export function provide<const T extends DefaultProviderToken>(
  token: T,
): Provider;
export function provide<const T extends ExplicitProviderToken>(
  token: T,
  factory: () => ProvideValue<T>,
): Provider;

export function provide(_token: any, _factory?: any): any {
  return {} as any;
}
