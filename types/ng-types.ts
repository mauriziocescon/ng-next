import {
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
// In practice the compiler produces TemplateMarkup from the DSL;
// here we use `any` as a stand-in.
// ────────────────────────────────────────────────────────────────

declare const TEMPLATE: unique symbol;

export type TemplateMarkup = { readonly [TEMPLATE]: true };

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

type FragmentArgs<T> = [T] extends [void] ? [] : T extends any[] ? T : [T];

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
// ComponentInstance has bindings + expose + directive-forwarding metadata.
// DirectiveInstance adds a host element type (H) — a directive
// must be attached to a DOM element.
//
// ExposeOf<T> works for both thanks to structural match on EXPOSE.
//
// InputsOnly<B> filters a bindings record to InputSignal keys
// only (excluding ModelSignal, which extends InputSignal in
// Angular's type hierarchy). Used by `providers`.
// ────────────────────────────────────────────────────────────────

declare const BINDINGS: unique symbol;
declare const EXPOSE: unique symbol;
declare const HOST: unique symbol;
declare const DIRECTIVE_FORWARDING: unique symbol;

export type ComponentInstance<B, E = void, S extends HTMLElement = never> = {
  readonly [BINDINGS]: B;
  readonly [EXPOSE]: E;
  readonly [DIRECTIVE_FORWARDING]: S;
};

export type DirectiveInstance<H extends HTMLElement, B, E = void> = {
  readonly [HOST]: H;
  readonly [BINDINGS]: B;
  readonly [EXPOSE]: E;
};

type ExposeOf<T> = T extends { readonly [EXPOSE]: infer E } ? E : never;

type TargetBindings<C extends ComponentInstance<unknown, unknown, any>> =
  C extends { readonly [BINDINGS]: infer B } ? B : never;

type DirectiveForwardingHostOf<C extends ComponentInstance<any, any, any>> =
  C extends { readonly [DIRECTIVE_FORWARDING]: infer S } ? S : never;

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
        __reserved_children_error__: 'children binding must use fragment(...) or fragment.required(...)';
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

type SetupReturn<E> =
  | { template: TemplateMarkup; expose: E } // full form with expose
  | { template: TemplateMarkup } // full form, no expose
  | TemplateMarkup; // shorthand: raw template

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT
//
// setup return type — two forms:
//   Shorthand: return raw TemplateMarkup (no expose).
//   Full form: return { template, expose? }.
//
// component(...) — standard mode:
//   B inferred from bindings, setup receives Angular signal types
//   (InputSignal, ModelSignal, OutputEmitterRef, …). providers
//   receives only inputs (not models or outputs) and runs before
//   setup so DI is ready when setup executes.
//
// component.withDirectiveForwarding<S>(...) — directive passthrough:
//   Declares that the component accepts directives on its tag.
//   Directives are propagated to and instantiated on the internal
//   element marked with @forward(). S constrains which directives
//   are compatible: only those whose host is assignable from S
//   are accepted. Conformance of @forward() to S is enforced
//   through IntrinsicElements — the standard TypeScript mechanism
//   for mapping HTML tag names to their types.
//
// component.wrap(Target, ...) — wrapper mode:
//   Target is passed as a value; C is inferred from it (consistent
//   with ref(Child), inject(Child), etc.). bindings are a strict
//   subset of target bindings, preserving key, binding kind, and
//   inner type per selected key. setup receives selected bindings
//   as first arg. Remaining bindings and directives are forwarded
//   to the wrapped component via @forward().
//
// @forward() semantics (shared by directive passthrough and wrap):
//   On elements: forwards directives to that element.
//   On components (wrap): forwards remaining bindings and
//   directives.
//
//   Compile-time marker — the compiler unrolls it into individual
//   remainder bindings. If remainder is non-empty and no @forward()
//   is present, the compiler emits a diagnostic.
//
//   Collision precedence: explicit bindings on the target element
//   always override remainder bindings for the same key, regardless
//   of source order. This applies uniformly to all binding kinds.
// ────────────────────────────────────────────────────────────────

// With bindings
export function component<
  B extends Record<string, ComponentBindingValue>,
  E = void,
>(
  config: {
    bindings: B;
    setup: (bindings: SetupBindings<B>) => SetupReturn<E>;
    providers?: (inputs: InputsOnly<B>) => Provider[];
    style?: string;
    styleUrl?: string;
  } & ReservedBindingsConstraint<B>,
): ComponentInstance<B, E>;

// No bindings
export function component<E = void>(config: {
  setup: () => SetupReturn<E>;
  providers?: () => Provider[];
  style?: string;
  styleUrl?: string;
}): ComponentInstance<{}, E>;

export function component(config: any): any {
  return config;
}

// Wrapper namespace helper (target as first arg, C inferred from value)
export namespace component {
  export declare function withDirectiveForwarding<
    B extends Record<string, ComponentBindingValue>,
    E = void,
  >(
    config: {
      bindings: B;
      setup: (bindings: SetupBindings<B>) => SetupReturn<E>;
      providers?: (inputs: InputsOnly<B>) => Provider[];
      style?: string;
      styleUrl?: string;
    } & ReservedBindingsConstraint<B>,
  ): ComponentInstance<B, E, HTMLElement>;

  export declare function withDirectiveForwarding<
    S extends HTMLElement,
    B extends Record<string, ComponentBindingValue>,
    E = void,
  >(
    config: {
      bindings: B;
      setup: (bindings: SetupBindings<B>) => SetupReturn<E>;
      providers?: (inputs: InputsOnly<B>) => Provider[];
      style?: string;
      styleUrl?: string;
    } & ReservedBindingsConstraint<B>,
  ): ComponentInstance<B, E, S>;

  export declare function withDirectiveForwarding<
    S extends HTMLElement = HTMLElement,
    E = void,
  >(config: {
    setup: () => SetupReturn<E>;
    providers?: () => Provider[];
    style?: string;
    styleUrl?: string;
  }): ComponentInstance<{}, E, S>;

  export declare function wrap<
    C extends ComponentInstance<unknown, unknown, any>,
    Sel extends Record<string, ComponentBindingValue>,
    E = void,
  >(
    target: C,
    config: TargetBindings<C> extends Record<string, ComponentBindingValue>
      ? {
          bindings: ValidateWrapSelection<Sel, TargetBindings<C>>;
          setup: (bindings: SetupBindings<Sel>) => SetupReturn<E>;
          providers?: (inputs: InputsOnly<Sel>) => Provider[];
          style?: string;
          styleUrl?: string;
        }
      : never,
  ): ComponentInstance<TargetBindings<C>, E, DirectiveForwardingHostOf<C>>;
}

(component as any).wrap = (_target: any, config: any) => config;
(component as any).withDirectiveForwarding = (config: any) => config;

// ────────────────────────────────────────────────────────────────
// 7. DIRECTIVE
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
// 8. DERIVATION
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
// 9. REF UTILITIES
//
// ref()  — single instance, resolves after afterNextRender.
// refMany() — multiple instances (e.g. inside @for).
//
// Each has overloads for native elements, components, and
// directives. The expose type is inferred from the target.
// ────────────────────────────────────────────────────────────────

// Native element
export function ref<H extends HTMLElement>(): Ref<H | undefined>;
// Component or Directive (expose inferred)
export function ref<
  T extends
    | ComponentInstance<unknown, unknown, any>
    | DirectiveInstance<HTMLElement, unknown, unknown>,
>(type: T): Ref<ExposeOf<T> extends void ? undefined : ExposeOf<T> | undefined>;

export function ref(_type?: any): any {
  return {} as any;
}

// Component or Directive (expose inferred)
export function refMany<
  T extends
    | ComponentInstance<unknown, unknown, any>
    | DirectiveInstance<HTMLElement, unknown, unknown>,
>(type: T): Ref<ExposeOf<T> extends void ? undefined[] : ExposeOf<T>[]>;

export function refMany(_type?: any): any {
  return {} as any;
}

// ────────────────────────────────────────────────────────────────
// 10. INJECTION TOKEN
//
// Token shapes:
//   InjectableToken<T>      — inject() returns T.
//   InjectableMultiToken<T> — inject() returns T[], each provide()
//                             contributes one T item.
//
// Factory & shorthand:
//   ProvidableToken<T>      — has factory, provide(token) works.
//   ProvidableMultiToken<T> — has factory, provide(token) works.
//   Tokens without factory require provide(token, factory).
//
// Options:
//   autoProvided: true — factory invoked once at root scope.
//                        Only valid for non-multi tokens when factory
//                        is also provided.
//   multi: true        — selects the InjectableMultiToken hierarchy.
//                        Multi tokens are contributed through providers;
//                        they cannot be auto-provided at root.
// ────────────────────────────────────────────────────────────────

declare const TOKEN_VALUE: unique symbol;
declare const TOKEN_MULTI: unique symbol;
declare const TOKEN_HAS_FACTORY: unique symbol;

// Base token — inject() returns T
export interface InjectableToken<T> {
  readonly [TOKEN_VALUE]: T;
}

// Multi token — inject() returns T[], provide factory returns a single T.
export interface InjectableMultiToken<T> {
  readonly [TOKEN_MULTI]: T;
}

// Internal — NOT exported. Single token with factory (shorthand-eligible).
interface ProvidableToken<T> extends InjectableToken<T> {
  readonly [TOKEN_HAS_FACTORY]: true;
}

// Internal — NOT exported. Multi token with factory (shorthand-eligible).
interface ProvidableMultiToken<T> extends InjectableMultiToken<T> {
  readonly [TOKEN_HAS_FACTORY]: true;
}

// Config: multi token with factory. Shorthand-eligible, but not auto-provided.
interface InjectionTokenMultiWithFactory<T> {
  debugName?: string;
  factory: () => T;
  autoProvided?: false;
  multi: true;
}

// Config: single token with factory (autoProvided accepted).
interface InjectionTokenWithFactory<T> {
  debugName?: string;
  factory: () => T;
  autoProvided?: boolean;
  multi?: false;
}

// Config: multi token without factory (explicit type parameter required).
interface InjectionTokenMulti {
  debugName?: string;
  autoProvided?: false;
  multi: true;
}

// Config: single token without factory (explicit type parameter required).
interface InjectionTokenBase {
  debugName?: string;
  autoProvided?: false;
  multi?: false;
}

export function injectionToken<T>(config: InjectionTokenMultiWithFactory<T>): ProvidableMultiToken<T>;
export function injectionToken<T>(config: InjectionTokenWithFactory<T>): ProvidableToken<T>;
export function injectionToken<T>(config: InjectionTokenMulti): InjectableMultiToken<T>;
export function injectionToken<T>(config?: InjectionTokenBase): InjectableToken<T>;

export function injectionToken(_config?: any): any {
  return {} as any;
}

// ────────────────────────────────────────────────────────────────
// 11. INJECT
//
// inject(Component)  → ExposeOf<Component>
// inject(Directive)  → ExposeOf<Directive>
// inject(Token)      → T
// inject(Class)      → instance
// ────────────────────────────────────────────────────────────────

export function inject<B, E, S extends HTMLElement>(
  token: ComponentInstance<B, E, S>,
): ExposeOf<ComponentInstance<B, E, S>>;
export function inject<H extends HTMLElement, B, E>(
  token: DirectiveInstance<H, B, E>,
): ExposeOf<DirectiveInstance<H, B, E>>;
export function inject<T>(token: abstract new (...args: any[]) => T): T;
export function inject<T>(token: InjectableMultiToken<T>): T[];
export function inject<T>(token: InjectableToken<T>): T;

export function inject(_token: any): any {
  return {} as any;
}

// ────────────────────────────────────────────────────────────────
// 12. PROVIDE
//
// Shorthand — provide(token): uses the token's default factory.
// Explicit  — provide(tokenOrClass, factory): overrides or supplies factory.
//
// For multi tokens, factory returns a single item (T),
// not the full array — each provide() call adds one entry.
//
// InjectableMultiToken<T>, InjectableToken<T>, and class tokens all
// contribute a single T value when provided explicitly.
// ────────────────────────────────────────────────────────────────

type AbstractCtor<T = any> = abstract new (...args: any[]) => T;

type DefaultProviderToken<T> =
  | ProvidableMultiToken<T>
  | ProvidableToken<T>;

type ExplicitProviderToken<T> =
  | InjectableMultiToken<T>
  | InjectableToken<T>
  | AbstractCtor<T>;

export function provide<T>(token: DefaultProviderToken<T>): Provider;
export function provide<T>(
  token: ExplicitProviderToken<T>,
  factory: () => T,
): Provider;

export function provide(_token: any, _factory?: any): any {
  return {} as any;
}
