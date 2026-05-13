import {
  type InputSignal,
  type ModelSignal,
  type OutputEmitterRef,
  type Signal,
  afterNextRender,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import {
  type ComponentInstance,
  type ComponentBindingValue,
  type DerivationInstance,
  type DirectiveInstance,
  type InjectableToken,
  type InjectableMultiToken,
  type OptionalFragmentBinding,
  type Ref,
  type RequiredFragmentBinding,
  type TemplateMarkup,
  type __ReservedBindingsConstraint,
  type __WrapSelectionDiagnostics,
  component,
  derivation,
  directive,
  fragment,
  inject,
  injectionToken,
  provide,
  ref,
  refMany,
} from './ng-types';

declare const tmpl: TemplateMarkup;

interface User {
  id: string;
  name: string;
}
interface Item {
  id: string;
  desc: string;
}

// ────────────────────────────────────────────────────────────────
// TEST HELPERS
//
// This file is compile-time only: most declarations exist solely to
// exercise type contracts and are intentionally not referenced at runtime.
// ────────────────────────────────────────────────────────────────

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type MergeProps<Left, Right> = Omit<Left, keyof Right> & Right;

// ────────────────────────────────────────────────────────────────
// 1. TEMPLATE MARKUP
//
// TemplateMarkup is a branded type — distinct from plain objects.
// ────────────────────────────────────────────────────────────────

// TemplateMarkup is assignable to itself
const _tmplAssign: TemplateMarkup = tmpl;

// TemplateMarkup is not assignable from a plain object
// @ts-expect-error plain object is not TemplateMarkup
const _tmplNotPlain: TemplateMarkup = {};

// ────────────────────────────────────────────────────────────────
// 2. BRANDED BINDING TYPES — fragment nominality
//
// FragmentBinding optional/required forms are distinct.
// ────────────────────────────────────────────────────────────────

// Required vs optional fragment are distinct types
type ReqIsOpt =
  RequiredFragmentBinding<void> extends OptionalFragmentBinding<void>
    ? 'LEAK'
    : 'OK';
const _reqIsOpt: ReqIsOpt = 'OK';

type OptIsReq =
  OptionalFragmentBinding<void> extends RequiredFragmentBinding<void>
    ? 'LEAK'
    : 'OK';
const _optIsReq: OptIsReq = 'OK';

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — basics
// ────────────────────────────────────────────────────────────────

// —— Shorthand return: raw template ——

const Minimal = component({
  setup: () => tmpl,
});

const StyledComp = component({
  setup: () => tmpl,
  style: `.danger { color: red; }`,
});

const StyledUrlComp = component({
  setup: () => tmpl,
  styleUrl: './my-comp.css',
});

const MinimalProviders = component({
  setup: () => tmpl,
  providers: () => [],
});

// —— Full form return: { template } ——

const MinimalFull = component({
  setup: () => ({ template: tmpl }),
});

const MinimalFullProviders = component({
  setup: () => ({ template: tmpl }),
  providers: () => [],
});

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — bindings (input, model, output, fragment)
//
// Setup receives raw Angular types: InputSignal, ModelSignal,
// OutputEmitterRef, FragmentBinding.
// ────────────────────────────────────────────────────────────────

const UserDetail = component.withDirectiveForwarding({
  bindings: {
    user: input.required<User>(),
    email: model.required<string>(),
    makeAdmin: output<void>(),
    children: fragment<void>(),
  },
  setup: ({ user, email, makeAdmin, children }) => {
    const _u: User = user();
    const _e: string = email();
    const _children: OptionalFragmentBinding<void> | undefined = children;
    const _rendered = children?.();
    email.set('new');
    makeAdmin.emit();
    return tmpl;
  },
});

// fragment.required: children must be present in setup
const RequiredChildren = component({
  bindings: {
    children: fragment.required<void>(),
  },
  setup: ({ children }) => {
    const _c: RequiredFragmentBinding<void> = children;
    const _rendered = children();
    // @ts-expect-error required fragment is not assignable to optional fragment shape
    const _mustBeOptional: OptionalFragmentBinding<void> | undefined = children;
    return tmpl;
  },
});

// Reserved names enforcement on component bindings:
// - children must be fragment(...)
// @ts-expect-error reserved name 'children' must use fragment(...)
const _NegChildrenMustBeFragment = component({
  bindings: {
    children: input<string>(),
  },
  setup: () => tmpl,
});

// Parameterized fragment: callable with declared arguments
const RenderItem = component({
  bindings: {
    itemTpl: fragment.required<[Item]>(),
  },
  setup: ({ itemTpl }) => {
    const _ok = itemTpl({ id: '1', desc: 'A' });
    // @ts-expect-error missing required argument
    itemTpl();
    return tmpl;
  },
});

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — bindings aliasing (TS destructuring in setup)
//
// Standard destructuring rename (e.g. { class: className }) lets
// developers alias bindings at the setup level without any
// framework-specific mechanism.
// ────────────────────────────────────────────────────────────────

// Component: alias input via destructuring
const AliasedInput = component({
  bindings: {
    class: input<string>(),
    style: input<string>(),
  },
  setup: ({ class: className, style: inlineStyle }) => {
    const _cls: string | undefined = className();
    const _sty: string | undefined = inlineStyle();
    return tmpl;
  },
});

// Component: alias model and output via destructuring
const AliasedModelOutput = component({
  bindings: {
    value: model.required<number>(),
    change: output<number>(),
  },
  setup: ({ value: val, change: onChange }) => {
    const _v: number = val();
    val.set(42);
    onChange.emit(1);
    return tmpl;
  },
});

// Directive: alias bindings via destructuring
const aliasedDirective = directive({
  host: ref<HTMLElement>(),
  bindings: {
    message: input.required<string>(),
    dismiss: output<void>(),
  },
  setup: ({ message: msg, dismiss: onDismiss }, { host: el }) => {
    const _m: string = msg();
    onDismiss.emit();
    const _el: Ref<HTMLElement | undefined> = el;
  },
});

// Derivation: alias bindings via destructuring
const aliasedDerivation = derivation({
  bindings: {
    qty: input.required<number>(),
    item: input.required<Item>(),
  },
  setup: ({ qty: quantity, item: product }) => {
    const _q: number = quantity();
    const _p: Item = product();
    return computed(() => product().desc + ' x ' + quantity());
  },
});

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — providers receive only inputs (not models/outputs)
// ────────────────────────────────────────────────────────────────

class Store { readonly __brand = 'Store' as const; }

// All four binding kinds: providers excludes everything except InputSignal
const AllBindingKinds = component({
  bindings: {
    a: input.required<string>(),
    b: model<string>(),
    c: output<void>(),
    d: fragment<void>(),
  },
  setup: (b) => tmpl,
  providers: (inputs) => {
    const _a: InputSignal<string> = inputs.a;
    // @ts-expect-error b is model, excluded from providers
    inputs.b;
    // @ts-expect-error c is output, excluded from providers
    inputs.c;
    // @ts-expect-error d is fragment, excluded from providers
    inputs.d;
    return [];
  },
});

// Output-only + model-only: providers has zero keys
const OutputModelOnly = component({
  bindings: {
    change: output<string>(),
    val: model<number>(),
  },
  setup: ({ change, val }) => tmpl,
  providers: (inputs) => {
    type Keys = keyof typeof inputs;
    const _check: Keys = undefined as never;
    return [];
  },
});

const Counter = component({
  bindings: {
    c: input.required<number>(),
  },
  setup: () => tmpl,
  providers: ({ c }) => {
    const _cInput: InputSignal<number> = c;
    return [provide({ token: Store, factory: () => new Store() })];
  },
});

const WithMixed = component({
  bindings: {
    name: input.required<string>(),
    age: input<number>(),
    email: model<string>(),
    save: output<void>(),
  },
  setup: ({ name, age, email, save }) => tmpl,
  providers: (inputs) => {
    const _name: InputSignal<string> = inputs.name;
    const _age: InputSignal<number | undefined> = inputs.age;
    // @ts-expect-error email is a model, not an input
    inputs.email;
    // @ts-expect-error save is an output, not an input
    inputs.save;
    return [];
  },
});

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — expose
//
// expose defines the public interface accessible via ref and
// inject. Components without expose resolve to void / undefined.
// ────────────────────────────────────────────────────────────────

const Child = component({
  setup: () => {
    const text = signal('');
    const _internal = signal(0);

    return {
      template: tmpl,
      expose: { text: text.asReadonly() },
    };
  },
});

// Shorthand: no expose → raw template
const NoExpose = component({
  setup: () => tmpl,
});

// Expose with inputs: inputs surfaced through expose
const ExposedInput = component({
  bindings: {
    name: input.required<string>(),
    age: input<number>(),
  },
  setup: ({ name, age }) => ({
    template: tmpl,
    expose: { name, age },
  }),
});

const exposedInputRef = ref(ExposedInput);
const _exposedName: InputSignal<string> | undefined = exposedInputRef()?.name;
const _exposedAge: InputSignal<number | undefined> | undefined =
  exposedInputRef()?.age;

// Mixed: inputs + local signals in expose
const MixedExpose = component({
  bindings: {
    label: input.required<string>(),
    count: model<number>(),
  },
  setup: ({ label, count }) => {
    const doubled = computed(() => (count() ?? 0) * 2);

    return {
      template: tmpl,
      expose: { label, doubled },
    };
  },
});

const mixedRef = ref(MixedExpose);
const _mixedLabel: InputSignal<string> | undefined = mixedRef()?.label;
const _mixedDoubled: Signal<number> | undefined = mixedRef()?.doubled;

// Void expose through ref: resolves to Ref<undefined>, not Ref<void | undefined>
const voidExposeRef = ref(NoExpose);
const _voidExposeCheck: Ref<undefined> = voidExposeRef;

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — withDirectiveForwarding
// ────────────────────────────────────────────────────────────────

const ForwardingDefault = component.withDirectiveForwarding({
  setup: () => tmpl,
});
type _ForwardingDefaultType = Assert<
  IsEqual<typeof ForwardingDefault, ComponentInstance<{}, void, HTMLElement>>
>;

const ButtonForwarding = component.withDirectiveForwarding<HTMLButtonElement>({
  setup: () => tmpl,
});
type _ButtonForwardingType = Assert<
  IsEqual<
    typeof ButtonForwarding,
    ComponentInstance<{}, void, HTMLButtonElement>
  >
>;

// @ts-expect-error host must be an HTMLElement subtype
const _NegInvalidHost = component.withDirectiveForwarding<string>({
  setup: () => tmpl,
});

const _NegForwardingMetadataInSetup = component.withDirectiveForwarding({
  bindings: {
    label: input<string>(),
  },
  setup: (bindings) => {
    // @ts-expect-error forwarding metadata is not visible in setup bindings
    bindings.directiveForwarding;
    return tmpl;
  },
});

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — wrapper with selected bindings + forwarding marker
//
// Target passed as first arg; C is inferred from the value
// (consistent with ref(Child), inject(Child), etc.).
// setup receives selected bindings only.
// @forward() is a compile-time forwarding marker used in
// wrapper templates.
//
// @forward() has dual meaning:
// - component elements: binding and directives forwarding (wrapper remainder)
// - native elements: directive forwarding
// ────────────────────────────────────────────────────────────────

const UserDetailWrapper = component.wrap(UserDetail, {
  bindings: {
    user: input.required<User>(),
  },
  setup: ({ user }) => {
    const _u: User = user();
    return tmpl;
  },
});

// setup first arg includes only selected keys
const _NegSelectedOnly = component.wrap(UserDetail, {
  bindings: { user: input.required<User>() },
  setup: ({
    user,
    // @ts-expect-error email is not selected in wrapper bindings
    email,
  }) => tmpl,
});

// bindings should NOT accept keys outside the target type
const _NegExtra = component.wrap(UserDetail, {
  // @ts-expect-error nonsense is not in target bindings
  bindings: {
    user: input.required<User>(),
    nonsense: input<string>(),
  },
  setup: () => tmpl,
});

// bindings should NOT accept wrong inner types
const _NegWrongType = component.wrap(UserDetail, {
  // @ts-expect-error user input type should be User
  bindings: {
    user: input.required<string>(),
  },
  setup: () => tmpl,
});

// bindings should preserve target binding kind
const _NegWrongKind = component.wrap(UserDetail, {
  // @ts-expect-error makeAdmin is an output on target, not an input
  bindings: {
    makeAdmin: input<void>(),
  },
  setup: () => tmpl,
});

// bindings should NOT allow subtype narrowing in wrappers
const WideInput = component({
  bindings: {
    value: input.required<string | number>(),
  },
  setup: ({ value }) => tmpl,
});

const _NegNarrowedSubtype = component.wrap(WideInput, {
  // @ts-expect-error wrapper bindings must exactly match target binding type
  bindings: {
    value: input.required<string>(),
  },
  setup: () => tmpl,
});

// bindings should NOT allow supertype widening in wrappers
const NarrowInput = component({
  bindings: {
    value: input.required<string>(),
  },
  setup: ({ value }) => tmpl,
});

const _NegWidenedSupertype = component.wrap(NarrowInput, {
  // @ts-expect-error wrapper bindings must exactly match target binding type
  bindings: {
    value: input.required<string | number>(),
  },
  setup: () => tmpl,
});

// Wrap with empty selected bindings: all target bindings are in forwarding remainder
interface Simple {
  id: string;
}

const Base = component({
  bindings: {
    item: input.required<Simple>(),
    selected: model<boolean>(),
    click: output<void>(),
  },
  setup: ({ item, selected, click }) => tmpl,
});

const ForwardAll = component.wrap(Base, {
  bindings: {},
  setup: (bindings) => {
    // @ts-expect-error empty selection should expose no setup keys
    bindings.item;
    return tmpl;
  },
});

// Wrapper providers should receive selected inputs only (Option A)
const WrapperProviders = component.wrap(UserDetail, {
  bindings: {
    user: input.required<User>(),
  },
  setup: ({ user }) => tmpl,
  providers: (inputs) => {
    const _user: InputSignal<User> = inputs.user;
    // @ts-expect-error email is not selected, excluded from wrapper providers
    inputs.email;
    // @ts-expect-error makeAdmin is not selected, excluded from wrapper providers
    inputs.makeAdmin;
    // @ts-expect-error children is not selected, excluded from wrapper providers
    inputs.children;
    return [];
  },
});

// Wrapper providers expose only selected INPUT bindings, even if selected
// bindings include models/outputs.
const WrapperProvidersSelectedKinds = component.wrap(Base, {
  bindings: {
    item: input.required<Simple>(),
    selected: model<boolean>(),
    click: output<void>(),
  },
  setup: ({ item, selected, click }) => tmpl,
  providers: (inputs) => {
    const _item: InputSignal<Simple> = inputs.item;
    // @ts-expect-error selected is a model, excluded from providers
    inputs.selected;
    // @ts-expect-error click is an output, excluded from providers
    inputs.click;
    return [];
  },
});

const ForwardingWrapper = component.wrap(ButtonForwarding, {
  bindings: {},
  setup: () => tmpl,
});
type _ForwardingWrapperPreservesHost = Assert<
  IsEqual<
    typeof ForwardingWrapper,
    ComponentInstance<{}, void, HTMLButtonElement>
  >
>;

const NoForwardingTarget = component({
  setup: () => tmpl,
});
const NoForwardingWrapper = component.wrap(NoForwardingTarget, {
  bindings: {},
  setup: () => tmpl,
});
type _NoForwardingWrapperKeepsNever = Assert<
  IsEqual<typeof NoForwardingWrapper, ComponentInstance<{}, void, never>>
>;

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — forward collision precedence (compiler contract)
//
// Rule: explicit bindings override remainder bindings, regardless of
// attribute order in source.
// Scope: applies uniformly to all binding kinds
// (input/model/output/fragment).
// Example:
//   <Target @forward() user={explicit} />  -> explicit wins for `user`
//   <Target user={explicit} @forward() />  -> explicit wins for `user`
//
// The tests below model compiler-normalized output where remainder keys are
// applied first and explicit keys are applied last.
// ────────────────────────────────────────────────────────────────

type FromRemainder = {
  user: 'remainder';
  email: 'remainder-email';
  click: 'remainder-click';
};

type FromExplicit = {
  user: 'explicit';
};

// <Target @forward() user={explicit} />
type ForwardThenExplicit = MergeProps<FromRemainder, FromExplicit>;
type _ForwardThenExplicitUser = Assert<
  IsEqual<ForwardThenExplicit['user'], 'explicit'>
>;
type _ForwardThenExplicitKeepsOthers = Assert<
  IsEqual<ForwardThenExplicit['email'], 'remainder-email'>
>;

// <Target user={explicit} @forward() />
type ExplicitThenForward = MergeProps<FromRemainder, FromExplicit>;
type _ExplicitThenForwardUser = Assert<
  IsEqual<ExplicitThenForward['user'], 'explicit'>
>;
type _ExplicitThenForwardKeepsOthers = Assert<
  IsEqual<ExplicitThenForward['click'], 'remainder-click'>
>;

// ────────────────────────────────────────────────────────────────
// 7. DIRECTIVE — host as separate config, expose
//
// host is a top-level config property (not a binding) because it
// is framework-provided context, not consumer-bindable.
// setup receives bindings as first arg, { host } as second.
// ────────────────────────────────────────────────────────────────

// Directive with expose
const tooltip = directive({
  host: ref<HTMLElement>(),
  bindings: {
    message: input.required<string>(),
    dismiss: output<void>(),
  },
  setup: ({ message, dismiss }, { host }) => {
    const _hostEl: Ref<HTMLElement | undefined> = host;
    const _msg: string = message();
    dismiss.emit();

    return { toggle: () => {} };
  },
});

// Directive without bindings
const ripple = directive({
  host: ref<HTMLElement>(),
  setup: ({}, { host }) => {
    const _hostEl: Ref<HTMLElement | undefined> = host;
  },
});

// Directive with void expose: ref resolves to Ref<undefined>
const voidDir = directive({
  host: ref<HTMLElement>(),
  setup: ({}, { host }) => {},
});
const voidDirRef = ref(voidDir);
const _voidDirCheck: Ref<undefined> = voidDirRef;

// Directive expose flows through ref with correct type
const typedDir = directive({
  host: ref<HTMLButtonElement>(),
  bindings: { label: input<string>() },
  setup: ({ label }, { host }) => ({ getLabel: () => label() }),
});
const typedDirRef = ref(typedDir);
const _typedDirRefCheck: Ref<
  { getLabel: () => string | undefined } | undefined
> = typedDirRef;

// Host type constraint: narrows to specific element type
const buttonOnly = directive({
  host: ref<HTMLButtonElement>(),
  bindings: {
    label: input<string>(),
  },
  setup: ({ label }, { host }) => {
    const _hostEl: Ref<HTMLButtonElement | undefined> = host;
    const _l: string | undefined = label();
  },
});

const inputOnly = directive({
  host: ref<HTMLInputElement>(),
  bindings: {
    label: input<string>(),
  },
  setup: ({ label }, { host }) => {
    const _hostEl: Ref<HTMLInputElement | undefined> = host;
    const _l: string | undefined = label();
  },
});

// Directive exposing its input
const highlight = directive({
  host: ref<HTMLElement>(),
  bindings: {
    color: input.required<string>(),
  },
  setup: ({ color }, { host }) => ({ color }),
});

const highlightRef = ref(highlight);
const _highlightColor: InputSignal<string> | undefined = highlightRef()?.color;

// Directive accepts fragment bindings (TemplateRef-style use cases)
const directiveWithFragment = directive({
  host: ref<HTMLElement>(),
  bindings: {
    content: fragment.required<void>(),
  },
  setup: ({ content }, { host }) => {
    const _content: RequiredFragmentBinding<void> = content;
    const _rendered = content();
    const _host: Ref<HTMLElement | undefined> = host;
  },
});

// ────────────────────────────────────────────────────────────────
// 7. DIRECTIVE — forwarding compatibility
//
// A directive can attach to a forwarded element only if the
// forwarded element type is assignable to the directive host type.
// ────────────────────────────────────────────────────────────────

type ForwardedElement<C extends ComponentInstance<any, any, any>> =
  C extends ComponentInstance<any, any, infer S> ? S : never;
type DirectiveHost<D extends DirectiveInstance<any, any, any>> =
  D extends DirectiveInstance<infer H, any, any> ? H : never;
type DirectiveFitsForwardedElement<
  C extends ComponentInstance<any, any, any>,
  D extends DirectiveInstance<any, any, any>,
> =
  ForwardedElement<C> extends never
    ? true
    : ForwardedElement<C> extends DirectiveHost<D>
      ? true
      : false;

type _ButtonForwardingAcceptsButtonDirective = Assert<
  IsEqual<
    DirectiveFitsForwardedElement<typeof ButtonForwarding, typeof buttonOnly>,
    true
  >
>;
type _ButtonForwardingAcceptsGenericDirective = Assert<
  IsEqual<
    DirectiveFitsForwardedElement<typeof ButtonForwarding, typeof tooltip>,
    true
  >
>;
// @ts-expect-error HTMLInputElement host directive is incompatible with HTMLButtonElement forwarded element
const _negButtonForwardingRejectsInputDirective: DirectiveFitsForwardedElement<
  typeof ButtonForwarding,
  typeof inputOnly
> = true;

// ────────────────────────────────────────────────────────────────
// 8. DERIVATION — only inputs, setup returns Signal<T>
// ────────────────────────────────────────────────────────────────

const simulation = derivation({
  bindings: {
    qty: input.required<number>(),
    item: input.required<Item>(),
  },
  setup: ({ qty, item }) => computed(() => item().desc + ' x ' + qty()),
});

const _simType: DerivationInstance<
  { qty: InputSignal<number>; item: InputSignal<Item> },
  string
> = simulation;

// Derivation without bindings: setup receives no args
const simple = derivation({
  setup: () => computed(() => 42),
});

const _simpleType: DerivationInstance<{}, number> = simple;

// Derivation must reject non-input bindings
// @ts-expect-error derivations cannot declare model bindings
const _NegDerivationNonInput = derivation({
  bindings: {
    changed: model<number>(),
  },
  setup: () => computed(() => 1),
});

// @ts-expect-error derivations cannot declare output bindings
const _NegDerivationOutput = derivation({
  bindings: {
    changed: output<number>(),
  },
  setup: () => computed(() => 1),
});

// @ts-expect-error derivations cannot declare fragment bindings
const _NegDerivationFragment = derivation({
  bindings: {
    content: fragment<void>(),
  },
  setup: () => computed(() => 1),
});

// ────────────────────────────────────────────────────────────────
// 9. REF UTILITIES — ref, refMany, read-only enforcement
//
// ref()  → single instance (Ref<T | undefined>)
// refMany() → multiple instances (Ref<T[]>)
// Both resolve after afterNextRender.
// ────────────────────────────────────────────────────────────────

// Native element
const divRef = ref<HTMLDivElement>();
const _divRefType: Ref<HTMLDivElement | undefined> = divRef;

// Component with expose
const childRef = ref(Child);
const _childRefType: Ref<{ text: Signal<string> } | undefined> = childRef;
const _childRefAsSignal: Signal<{ text: Signal<string> } | undefined> =
  childRef;

// Component without expose
const noExposeRef = ref(NoExpose);
const _noExposeType: Ref<undefined> = noExposeRef;

// Directive with expose
const tooltipRef = ref(tooltip);
const _tooltipRefType: Ref<{ toggle: () => void } | undefined> = tooltipRef;

// Directive without expose
const rippleRef = ref(ripple);
const _rippleRefType: Ref<undefined> = rippleRef;

// refMany
const manyChildren = refMany(Child);
const _manyType: Ref<{ text: Signal<string> }[]> = manyChildren;
const _manyAsSignal: Signal<{ text: Signal<string> }[]> = manyChildren;

// refMany without expose
const manyNoExpose = refMany(NoExpose);
const _manyNoExposeType: Ref<undefined[]> = manyNoExpose;

const manyRipple = refMany(ripple);
const _manyRippleType: Ref<undefined[]> = manyRipple;

// Refs are read-only — .set() must not exist
// @ts-expect-error
divRef.set(document.createElement('div'));
// @ts-expect-error
childRef.set({ text: signal('') });
// @ts-expect-error
tooltipRef.set({ toggle: () => {} });
// @ts-expect-error
manyChildren.set([]);

// Passing a ref as an input
const Sibling = component({
  bindings: {
    childRef: input<{ text: Signal<string> } | undefined>(),
  },
  setup: ({ childRef }) => {
    const _val = childRef();
    return tmpl;
  },
});

// Full parent scenario: refs across components and directives
const Parent = component({
  setup: () => {
    const el = ref<HTMLDivElement>();
    const child = ref(Child);
    const tlp = ref(tooltip);
    const many = refMany(Child);

    afterNextRender(() => {
      const _el: HTMLDivElement | undefined = el();
      const _child: { text: Signal<string> } | undefined = child();
      const _tlp: { toggle: () => void } | undefined = tlp();
      const _many: { text: Signal<string> }[] = many();
    });

    return tmpl;
  },
});

// ────────────────────────────────────────────────────────────────
// 10. INJECTION TOKEN
// ────────────────────────────────────────────────────────────────

// Token without factory — returns InjectableToken
const noFactoryToken = injectionToken<string>();

const _noFactoryTokenType: InjectableToken<string> = noFactoryToken;

// Token with factory — returns InjectableToken (ProvidableToken is assignable)
const withFactoryToken = injectionToken({
  factory: () => {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      increase: () => counter.update((v) => v + 1),
    };
  },
});

const _withFactoryTokenType: InjectableToken<{
  value: Signal<number>;
  increase: () => void;
}> = withFactoryToken;

// Auto-provided: factory invoked once at root scope
const rootToken = injectionToken({
  autoProvided: true,
  factory: () => {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      decrease: () => counter.update((v) => v - 1),
    };
  },
});

const _rootTokenType: InjectableToken<{
  value: Signal<number>;
  decrease: () => void;
}> = rootToken;

// Multi without factory — returns InjectableMultiToken<T>
const multiNoFactoryToken = injectionToken<number>({
  multi: true,
});

const _multiNoFactoryTokenType: InjectableMultiToken<number> = multiNoFactoryToken;

// Multi with factory — returns InjectableMultiToken<T> (ProvidableMultiToken is assignable)
const multiToken = injectionToken({
  multi: true,
  factory: () => Math.random(),
});

const _multiTokenType: InjectableMultiToken<number> = multiToken;

// Auto-provided multi: factory invoked once at root scope, collects into T[]
const rootMultiToken = injectionToken({
  autoProvided: true,
  multi: true,
  factory: () => Math.random(),
});

const _rootMultiTokenType: InjectableMultiToken<number> = rootMultiToken;

// Explicit autoProvided: false — accepted on all non-auto-provided overloads
const explicitFalseNoFactory = injectionToken<string>({ autoProvided: false });
const _explicitFalseNoFactoryType: InjectableToken<string> = explicitFalseNoFactory;

const explicitFalseWithFactory = injectionToken({ autoProvided: false, factory: () => 99 });
const _explicitFalseWithFactoryType: InjectableToken<number> = explicitFalseWithFactory;

const explicitFalseMultiNoFactory = injectionToken<number>({ autoProvided: false, multi: true });
const _explicitFalseMultiNoFactoryType: InjectableMultiToken<number> = explicitFalseMultiNoFactory;

const explicitFalseMultiWithFactory = injectionToken({ autoProvided: false, multi: true, factory: () => 'x' });
const _explicitFalseMultiWithFactoryType: InjectableMultiToken<string> = explicitFalseMultiWithFactory;

// Explicit multi: false — accepted on all non-multi overloads
const explicitMultiFalseNoFactory = injectionToken<string>({ multi: false });
const _explicitMultiFalseNoFactoryType: InjectableToken<string> = explicitMultiFalseNoFactory;

const explicitMultiFalseWithFactory = injectionToken({ multi: false, factory: () => 42 });
const _explicitMultiFalseWithFactoryType: InjectableToken<number> = explicitMultiFalseWithFactory;

const explicitMultiFalseAutoProvided = injectionToken({ multi: false, autoProvided: true, factory: () => 'y' });
const _explicitMultiFalseAutoProvidedType: InjectableToken<string> = explicitMultiFalseAutoProvided;

// Single token with array value type
const arrayValueToken = injectionToken<string[]>({ debugName: 'tags' });
const _arrayValueTokenType: InjectableToken<string[]> = arrayValueToken;

// Single token with array value type and factory
const arrayValueWithFactory = injectionToken({ factory: () => ['a', 'b', 'c'] });
const _arrayValueWithFactoryType: InjectableToken<string[]> = arrayValueWithFactory;

// provide({ token, factory }) for array-valued non-multi token: factory returns the full array
const _provideArrayValue = provide({ token: arrayValueToken, factory: () => ['x', 'y'] });
const _provideArrayValueWithFactory = provide({ token: arrayValueWithFactory, factory: () => ['z'] });

// Multi token is NOT assignable to InjectableToken — the two hierarchies are
// structurally incompatible.
// @ts-expect-error InjectableMultiToken is not assignable to InjectableToken
const _multiNotAssignableToNonMulti: typeof arrayValueToken = multiNoFactoryToken;

// Empty object config — equivalent to no-arg call
const emptyConfigToken = injectionToken<string>({});
const _emptyConfigTokenType: InjectableToken<string> = emptyConfigToken;

// Negative: autoProvided: true without factory — compile-time error
// @ts-expect-error autoProvided: true requires a factory
const _negAutoProvidedNoFactory = injectionToken<string>({ autoProvided: true });

// Negative: autoProvided: true + multi: true without factory — compile-time error
// @ts-expect-error autoProvided: true + multi: true requires a factory
const _negAutoProvidedMultiNoFactory = injectionToken<number>({ autoProvided: true, multi: true });

// ────────────────────────────────────────────────────────────────
// 11. INJECT
// ────────────────────────────────────────────────────────────────

// inject(Component) → expose type
const _injectedChild: { text: Signal<string> } = inject(Child);

// inject(Component without expose) → void
const _injectedNoExpose: void = inject(NoExpose);

// inject(Directive) → expose type
const _injectedTooltip: { toggle: () => void } = inject(tooltip);

// inject(InjectableToken) → token type
const _injectedWithFactory: { value: Signal<number>; increase: () => void } =
  inject(withFactoryToken);
const _injectedNoFactory: string = inject(noFactoryToken);
const _injectedMulti: number[] = inject(multiToken);
const _injectedMultiNoFactory: number[] = inject(multiNoFactoryToken);

// inject(Class) → class instance
const _injectedStore: Store = inject(Store);

// ────────────────────────────────────────────────────────────────
// 12. PROVIDE
// ────────────────────────────────────────────────────────────────

// provide shorthand — only works with InjectableToken (with factory)
const _providersShorthand = [
  provide(withFactoryToken),
  provide(multiToken),
  provide(rootToken),
];

// provide shorthand with factory-less token — compile-time error
// @ts-expect-error provide(token) shorthand requires token with factory
provide(noFactoryToken);

// @ts-expect-error provide(token) shorthand requires token with factory
provide(multiNoFactoryToken);

// Object form — works with both InjectableToken (base) and ProvidableToken
const _providersObjectForm = [
  provide({ token: noFactoryToken, factory: () => 'explicit' }),
  provide({ token: multiNoFactoryToken, factory: () => 42 }),
  provide({ token: withFactoryToken, factory: () => ({ value: signal(0).asReadonly(), increase: () => {} }) }),
  provide({ token: Store, factory: () => new Store() }),
];

// Multi provide factory returns a single item, not an array.
// @ts-expect-error factory for multi token must return number, not number[]
provide({ token: multiToken, factory: () => [1, 2, 3] });

// Array-valued non-multi token: factory returns the full array (not unwrapped)
// @ts-expect-error factory for non-multi string[] token must return string[], not string
provide({ token: arrayValueToken, factory: () => 'single' });

// Class token: factory must return an instance of the class
// @ts-expect-error factory returns boolean, not Store
provide({ token: Store, factory: () => true });

// @ts-expect-error factory returns string, not Store
provide({ token: Store, factory: () => 'not a store' });

// Shorthand with auto-provided multi token (ProvidableMultiToken)
const _provideRootMultiShorthand = provide(rootMultiToken);

// Object form with auto-provided token (override factory at component level)
const _provideRootTokenOverride = provide({ token: rootToken, factory: () => ({ value: signal(0).asReadonly(), decrease: () => {} }) });

// Object form with ProvidableMultiToken (override factory)
const _provideMultiTokenOverride = provide({ token: multiToken, factory: () => 99 });

// Negative: wrong factory return type for single token
// @ts-expect-error factory returns number, not string
provide({ token: noFactoryToken, factory: () => 123 });

// Negative: wrong factory return type for multi token with factory
// @ts-expect-error factory returns string, not number
provide({ token: multiToken, factory: () => 'wrong' });

// Negative: provide(Class) shorthand — classes are not ProvidableToken
// @ts-expect-error provide(Class) shorthand is not allowed, must use object form
provide(Store);

// ────────────────────────────────────────────────────────────────
// INTERFACE CONFORMANCE — satisfies on bindings and expose
//
// Opt-in structural check, same as class implements:
// the developer chooses to add satisfies, TS validates the shape.
//
// satisfies applies excess-property checking on object literals,
// so the interface must cover all keys in the object — or use
// an intersection with Record<string, ComponentBindingValue>
// to allow extra keys in the component binding surface.
// ────────────────────────────────────────────────────────────────

// -- Bindings conformance: component --------------

interface Sortable {
  sortKey: InputSignal<string>;
  sortDirection: InputSignal<'asc' | 'desc'>;
}

// Exact match: all bindings are in the interface
const SortableTable = component({
  bindings: {
    sortKey: input.required<string>(),
    sortDirection: input.required<'asc' | 'desc'>(),
  } satisfies Sortable,
  setup: ({ sortKey, sortDirection }) => tmpl,
});

// Extra bindings: interface + Record allows additional keys
const SortableTableExtra = component({
  bindings: {
    sortKey: input.required<string>(),
    sortDirection: input.required<'asc' | 'desc'>(),
    pageSize: input<number>(),
  } satisfies Sortable & Record<string, ComponentBindingValue>,
  setup: ({ sortKey, sortDirection, pageSize }) => tmpl,
});

// -- Bindings conformance: multiple interfaces ----

interface Paginated {
  page: InputSignal<number>;
  pageSize: InputSignal<number>;
}

const SortablePaginatedTable = component({
  bindings: {
    sortKey: input.required<string>(),
    sortDirection: input.required<'asc' | 'desc'>(),
    page: input.required<number>(),
    pageSize: input.required<number>(),
  } satisfies Sortable & Paginated,
  setup: ({ sortKey, sortDirection, page, pageSize }) => tmpl,
});

// -- Bindings conformance: directive --------------

interface Dismissable {
  message: InputSignal<string>;
  dismiss: OutputEmitterRef<void>;
}

const dismissableTooltip = directive({
  host: ref<HTMLElement>(),
  bindings: {
    message: input.required<string>(),
    dismiss: output<void>(),
  } satisfies Dismissable,
  setup: ({ message, dismiss }, { host }) => {},
});

// -- Bindings conformance: derivation -------------

interface QuantityBound {
  qty: InputSignal<number>;
  item: InputSignal<Item>;
}

const quantityDerivation = derivation({
  bindings: {
    qty: input.required<number>(),
    item: input.required<Item>(),
  } satisfies QuantityBound,
  setup: ({ qty, item }) => computed(() => qty() * 2),
});

// -- Expose conformance: component ----------------

interface Toggleable {
  toggle: () => void;
  isOpen: Signal<boolean>;
}

const Accordion = component({
  setup: () => {
    const open = signal(false);

    return {
      template: tmpl,
      expose: {
        toggle: () => open.update((v) => !v),
        isOpen: open.asReadonly(),
      } satisfies Toggleable,
    };
  },
});

// ref infers expose correctly through satisfies
const accordionRef = ref(Accordion);
const _accordionRefType: Ref<Toggleable | undefined> = accordionRef;

// -- Expose conformance: directive ----------------

const toggleDirective = directive({
  host: ref<HTMLElement>(),
  setup: ({}, { host }) => {
    const open = signal(false);

    return {
      toggle: () => open.update((v) => !v),
      isOpen: open.asReadonly(),
    } satisfies Toggleable;
  },
});

const toggleDirRef = ref(toggleDirective);
const _toggleDirRefType: Ref<Toggleable | undefined> = toggleDirRef;

// -- Negative: missing key in bindings ------------

const _NegMissingKey = component({
  bindings: {
    sortKey: input.required<string>(),
    // @ts-expect-error sortDirection is missing from Sortable
  } satisfies Sortable,
  setup: ({ sortKey }) => tmpl,
});

// -- Negative: wrong type in bindings -------------

const _NegWrongBindingType = component({
  bindings: {
    sortKey: input.required<string>(),
    // @ts-expect-error sortDirection should be InputSignal<'asc' | 'desc'>, not InputSignal<number>
    sortDirection: input<number>(),
  } satisfies Sortable,
  setup: ({ sortKey, sortDirection }) => tmpl,
});

// -- Negative: missing key in expose --------------

const _NegMissingExpose = component({
  setup: () => ({
    template: tmpl,
    expose: {
      toggle: () => {},
      // @ts-expect-error isOpen is missing from Toggleable
    } satisfies Toggleable,
  }),
});

// ────────────────────────────────────────────────────────────────
// DIAGNOSTIC CONTRACTS — wrapper + reserved names
//
// Keep these checks at the end: they validate the shape of type-level
// diagnostics, not core API behavior.
// ────────────────────────────────────────────────────────────────

type UserDetailBindings = {
  user: InputSignal<User>;
  email: ModelSignal<string>;
  makeAdmin: OutputEmitterRef<void>;
  children: OptionalFragmentBinding<void>;
};

type _NoWrapDiag = __WrapSelectionDiagnostics<
  { user: InputSignal<User> },
  UserDetailBindings
>;
type _NoWrapDiagKeys = Assert<IsEqual<keyof _NoWrapDiag, never>>;

type _WrapUnknownDiag = __WrapSelectionDiagnostics<
  { user: InputSignal<User>; nonsense: InputSignal<string | undefined> },
  UserDetailBindings
>;
type _WrapUnknownKey = Assert<
  IsEqual<_WrapUnknownDiag['__wrap_unknown_keys__']['keys'], 'nonsense'>
>;
type _WrapUnknownMessage = Assert<
  IsEqual<
    _WrapUnknownDiag['__wrap_unknown_keys__']['message'],
    'wrapper bindings contain keys not present in target bindings'
  >
>;

type _WrapKindDiag = __WrapSelectionDiagnostics<
  { makeAdmin: InputSignal<void | undefined> },
  UserDetailBindings
>;
type _WrapKindKey = Assert<
  IsEqual<_WrapKindDiag['__wrap_kind_mismatch__']['keys'], 'makeAdmin'>
>;
type _WrapKindMessage = Assert<
  IsEqual<
    _WrapKindDiag['__wrap_kind_mismatch__']['message'],
    'wrapper binding kind must match target binding kind'
  >
>;

type _WrapTypeDiag = __WrapSelectionDiagnostics<
  { user: InputSignal<string> },
  UserDetailBindings
>;
type _WrapTypeKey = Assert<
  IsEqual<_WrapTypeDiag['__wrap_type_mismatch__']['keys'], 'user'>
>;
type _WrapTypeMessage = Assert<
  IsEqual<
    _WrapTypeDiag['__wrap_type_mismatch__']['message'],
    'wrapper binding type must exactly match target binding type'
  >
>;

type _ReservedChildrenDiag = __ReservedBindingsConstraint<{
  children: InputSignal<string>;
}>;
type _ReservedChildrenMsg = Assert<
  IsEqual<
    _ReservedChildrenDiag['__reserved_children_error__'],
    'children binding must use fragment(...) or fragment.required(...)'
  >
>;

type _ReservedOk = __ReservedBindingsConstraint<{
  children: OptionalFragmentBinding<void>;
}>;
type _ReservedOkKeys = Assert<IsEqual<keyof _ReservedOk, never>>;
