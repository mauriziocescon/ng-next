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

import type { TemplateAST } from './ng-ast';

// ────────────────────────────────────────────────────────────────
// 1. TEMPLATE MARKUP
//
// Branded type so the compiler can distinguish a raw template
// return (shorthand) from an object return (full form).
// The AST payload is phantom type metadata: the compiler produces
// TemplateMarkup<TAst> from the DSL, while public APIs can accept
// the default TemplateMarkup alias when they do not inspect the tree.
// ────────────────────────────────────────────────────────────────

declare const TEMPLATE: unique symbol;
declare const TEMPLATE_AST: unique symbol;

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
// Layered binding model:
// - Derivation: inputs only
// - Directive: derivation + model/output/fragment
// - Component: directive
// ────────────────────────────────────────────────────────────────

type AnyBindingValue =
  | InputSignal<any>
  | ModelSignal<any>
  | OutputEmitterRef<any>
  | OptionalFragmentBinding<any>
  | RequiredFragmentBinding<any>;

export type DerivationBindingValue = InputSignal<any>;
export type DirectiveBindingValue = AnyBindingValue;
export type ComponentBindingValue = AnyBindingValue;

// ────────────────────────────────────────────────────────────────
// 5. INSTANCE TYPES & SHARED HELPERS
//
// ComponentInstance has bindings + expose + template + proxy-surface
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
declare const PROXY_SURFACE: unique symbol;

export type ComponentInstance<
  B,
  E = void,
  S extends HTMLElement = never,
  TMarkup extends TemplateMarkup = TemplateMarkup,
> = {
  readonly [BINDINGS]: B;
  readonly [EXPOSE]: E;
  readonly [PROXY_SURFACE]: S;
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

type TargetBindings<C extends ComponentInstance<unknown, unknown, any>> =
  C extends { readonly [BINDINGS]: infer B } ? B : never;

type ProxySurfaceOf<C extends ComponentInstance<any, any, any>> =
  C extends { readonly [PROXY_SURFACE]: infer S } ? S : never;

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

type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type HasOwnKeys<T extends object> = keyof T extends never ? false : true;

type BindingKind<V> =
  V extends ModelSignal<any>
    ? 'model'
    : V extends InputSignal<any>
      ? 'input'
      : V extends OutputEmitterRef<any>
        ? 'output'
        : V extends FragmentBinding<any>
          ? 'fragment'
          : 'unknown';

type ExtraKeys<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> = Exclude<keyof Sel, keyof All>;

type KindMismatchKeys<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> = {
  [K in Extract<keyof Sel, keyof All>]: IsExact<
    BindingKind<Sel[K]>,
    BindingKind<All[K]>
  > extends true
    ? never
    : K;
}[Extract<keyof Sel, keyof All>];

type TypeMismatchKeys<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> = {
  [K in Extract<keyof Sel, keyof All>]: IsExact<
    BindingKind<Sel[K]>,
    BindingKind<All[K]>
  > extends true
    ? IsExact<Sel[K], All[K]> extends true
      ? never
      : K
    : never;
}[Extract<keyof Sel, keyof All>];

type WrapUnknownKeysError<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> =
  ExtraKeys<Sel, All> extends never
    ? {}
    : {
        __wrap_unknown_keys__: {
          message: 'wrapper bindings contain keys not present in target bindings';
          keys: ExtraKeys<Sel, All>;
        };
      };

type WrapKindMismatchError<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> =
  KindMismatchKeys<Sel, All> extends never
    ? {}
    : {
        __wrap_kind_mismatch__: {
          message: 'wrapper binding kind must match target binding kind';
          keys: KindMismatchKeys<Sel, All>;
        };
      };

type WrapTypeMismatchError<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> =
  TypeMismatchKeys<Sel, All> extends never
    ? {}
    : {
        __wrap_type_mismatch__: {
          message: 'wrapper binding type must exactly match target binding type';
          keys: TypeMismatchKeys<Sel, All>;
        };
      };

type WrapSelectionDiagnostics<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> = WrapUnknownKeysError<Sel, All> &
  WrapKindMismatchError<Sel, All> &
  WrapTypeMismatchError<Sel, All>;

type ValidateWrapSelection<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> =
  HasOwnKeys<WrapSelectionDiagnostics<Sel, All>> extends true
    ? Sel & WrapSelectionDiagnostics<Sel, All>
    : Sel;

type SetupBindingValue<V> =
  V extends OptionalFragmentBinding<infer T>
    ? OptionalFragmentBinding<T> | undefined
    : V;

type SetupBindings<B> = {
  [K in keyof B]: SetupBindingValue<B[K]>;
};

type ReservedBindingsConstraint<
  B extends Record<string, ComponentBindingValue>,
> = 'children' extends keyof B
  ? B['children'] extends FragmentBinding<unknown>
    ? {}
    : {
        __reserved_children_error__:
          'children binding must use fragment(...) or fragment.required(...)';
      }
  : unknown;

// Test-only exports for diagnostic contract checks in ng-types.spec.ts
export type __WrapSelectionDiagnostics<
  Sel extends Record<string, unknown>,
  All extends Record<string, unknown>,
> = WrapSelectionDiagnostics<Sel, All>;

export type __ReservedBindingsConstraint<
  B extends Record<string, ComponentBindingValue>,
> = ReservedBindingsConstraint<B>;

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
// component(...) declares a normal component. `bindings` is the public API;
// setup receives those binding objects; providers receive inputs only.
//
// component.proxy<S>(...) declares a public directive-compatible surface.
// S is explicit, must extend HTMLElement, and is realized by one or more
// compatible native @forward() placements in the template.
//
// component.wrap(Target, ...) declares a wrapper around Target. Selected
// bindings go to setup; the target remainder is placed on wrapped target
// placement(s) by @forward(). If Target has a proxy surface, the wrapper
// inherits that surface and can pass directives through the same @forward()
// chain. A non-proxy target cannot receive forwarded directives.
//
// @forward() is marker-only: no runtime forwarding object, no spread. The
// enclosing component API defines the payload; marked nodes define where it
// lands. Explicit bindings on a wrapped target override forwarded ones.
// ────────────────────────────────────────────────────────────────

type SetupReturn<E, TMarkup extends TemplateMarkup = TemplateMarkup> =
  | { template: TMarkup; expose: E } // full form with expose
  | { template: TMarkup } // full form, no expose
  | TMarkup; // shorthand: raw template

// With bindings
export function component<
  B extends Record<string, ComponentBindingValue>,
  E = void,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(
  config: {
    bindings: B;
    setup: (bindings: SetupBindings<B>) => SetupReturn<E, TMarkup>;
    providers?: (inputs: InputsOnly<B>) => Provider[];
    style?: string;
    styleUrl?: string;
  } & ReservedBindingsConstraint<B>,
): ComponentInstance<B, E, never, TMarkup>;

// No bindings
export function component<
  E = void,
  TMarkup extends TemplateMarkup = TemplateMarkup,
>(config: {
  setup: () => SetupReturn<E, TMarkup>;
  providers?: () => Provider[];
  style?: string;
  styleUrl?: string;
}): ComponentInstance<{}, E, never, TMarkup>;

export function component(config: any): any {
  return config;
}

// Component namespace helpers
export namespace component {
  export declare function proxy<
    S extends HTMLElement = never,
    B extends Record<string, ComponentBindingValue> = never,
    E = void,
    TMarkup extends TemplateMarkup = TemplateMarkup,
  >(
    config: [S] extends [never]
      ? {
          __proxy_surface_error__:
            'component.proxy requires an explicit HTMLElement surface type';
        }
      : {
          bindings: B;
          setup: (bindings: SetupBindings<B>) => SetupReturn<E, TMarkup>;
          providers?: (inputs: InputsOnly<B>) => Provider[];
          style?: string;
          styleUrl?: string;
        } & ReservedBindingsConstraint<B>,
  ): ComponentInstance<B, E, S, TMarkup>;

  export declare function proxy<
    S extends HTMLElement = never,
    E = void,
    TMarkup extends TemplateMarkup = TemplateMarkup,
  >(
    config: [S] extends [never]
      ? {
          __proxy_surface_error__:
            'component.proxy requires an explicit HTMLElement surface type';
        }
      : {
          setup: () => SetupReturn<E, TMarkup>;
          providers?: () => Provider[];
          style?: string;
          styleUrl?: string;
        },
  ): ComponentInstance<{}, E, S, TMarkup>;

  export declare function wrap<
    ExplicitWrapperGenericsAreNotAllowed extends never = never,
    C extends ComponentInstance<unknown, unknown, any> = ComponentInstance<
      unknown,
      unknown,
      any
    >,
    Sel extends Record<string, ComponentBindingValue> = {},
    E = void,
    TMarkup extends TemplateMarkup = TemplateMarkup,
  >(
    target: C,
    config: TargetBindings<C> extends Record<string, ComponentBindingValue>
      ? {
          bindings: ValidateWrapSelection<Sel, TargetBindings<C>>;
          setup: (bindings: SetupBindings<Sel>) => SetupReturn<E, TMarkup>;
          providers?: (inputs: InputsOnly<Sel>) => Provider[];
          style?: string;
          styleUrl?: string;
        }
      : never,
  ): ComponentInstance<
    TargetBindings<C>,
    E,
    ProxySurfaceOf<C>,
    TMarkup
  >;
}

(component as any).proxy = (config: any) => config;
(component as any).wrap = (_target: any, config: any) => config;

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

type DerivationBindingsConstraint<
  B extends Record<string, DerivationBindingValue>,
> = {
  [K in keyof B]: B[K] extends ModelSignal<any> ? never : B[K];
};

// With bindings (input-only; excludes ModelSignal explicitly)
export function derivation<
  B extends Record<string, DerivationBindingValue>,
  T,
>(config: {
  bindings: B & DerivationBindingsConstraint<B>;
  setup: (bindings: B) => Signal<T>;
}): DerivationInstance<B, T>;

// No bindings
export function derivation<T>(config: {
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
}

// Config: multi token without factory (explicit type parameter required).
interface DiMultiTokenBaseConfig {
  debugName?: string;
}

// Config: single token without factory (explicit type parameter required).
interface DiTokenBaseConfig {
  debugName?: string;
  autoProvided?: false;
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
