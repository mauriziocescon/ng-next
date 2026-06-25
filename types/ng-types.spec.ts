import {
  type InputSignal,
  type ModelSignal,
  type OutputEmitterRef,
  type Signal,
  HostAttributeToken,
  InjectionToken,
  afterNextRender,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import type { TemplateAST } from './ng-ast';

import {
  type ComponentInstance,
  type ComponentBindingValue,
  type ComponentTemplateOf,
  type DerivationInstance,
  type DirectiveInstance,
  type IntrinsicElementDescriptor,
  type IntrinsicElementHost,
  type DiToken,
  type DiMultiToken,
  type OptionalFragmentBinding,
  type Ref,
  type RequiredFragmentBinding,
  type TemplateAstOf,
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

interface SpecificTemplateAST extends TemplateAST {
  readonly __specificTemplate: true;
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

declare const specificTmpl: TemplateMarkup<SpecificTemplateAST>;

// Specific TemplateMarkup is assignable to the generic TemplateMarkup API
const _specificTmplAssign: TemplateMarkup = specificTmpl;

type _SpecificTemplateAst = Assert<
  IsEqual<TemplateAstOf<typeof specificTmpl>, SpecificTemplateAST>
>;

// @ts-expect-error generic TemplateMarkup does not carry the specific AST
const _genericTmplNotSpecific: TemplateMarkup<SpecificTemplateAST> = tmpl;

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
// 3. INTRINSIC ELEMENT HOST CONTRACT
//
// The Angular DSL parser keeps native tag names as template syntax, but the
// type checker resolves them through an IntrinsicElements-like registry.
// These tests model the part of that registry used by directive hosts,
// @forward(), and native refs.
// ────────────────────────────────────────────────────────────────

interface TestIntrinsicElements {
  div: IntrinsicElementDescriptor<HTMLDivElement>;
  input: IntrinsicElementDescriptor<HTMLInputElement>;
  button: IntrinsicElementDescriptor<HTMLButtonElement>;
}

type TestHost<K extends keyof TestIntrinsicElements> =
  IntrinsicElementHost<TestIntrinsicElements[K]>;

type _IntrinsicButtonHost = Assert<
  IsEqual<TestHost<'button'>, HTMLButtonElement>
>;
type _IntrinsicInputHost = Assert<
  IsEqual<TestHost<'input'>, HTMLInputElement>
>;

// @ts-expect-error an input intrinsic host is not a button host
const _negIntrinsicInputIsNotButton: HTMLButtonElement =
  undefined as unknown as TestHost<'input'>;

// ────────────────────────────────────────────────────────────────
// 4. COMPONENT — basics
// ────────────────────────────────────────────────────────────────

// Shorthand return: raw template
const Minimal = component({
  setup: () => tmpl,
});

// style + styleUrl + providers all accepted (single combined check)
const StyledWithProviders = component({
  setup: () => tmpl,
  style: `.danger { color: red; }`,
  styleUrl: './my-comp.css',
  providers: () => [],
});

// Full form return: { template }
const MinimalFull = component({
  setup: () => ({ template: tmpl }),
});

// Component instances preserve the specific TemplateMarkup<TAst> returned by setup
const SpecificTemplateComponent = component({
  setup: () => specificTmpl,
});

type _SpecificComponentTemplateAst = Assert<
  IsEqual<
    TemplateAstOf<ComponentTemplateOf<typeof SpecificTemplateComponent>>,
    SpecificTemplateAST
  >
>;

const SpecificTemplateFullComponent = component({
  setup: () => ({ template: specificTmpl }),
});

type _SpecificFullComponentTemplateAst = Assert<
  IsEqual<
    TemplateAstOf<ComponentTemplateOf<typeof SpecificTemplateFullComponent>>,
    SpecificTemplateAST
  >
>;

// ────────────────────────────────────────────────────────────────
// 5. COMPONENT — bindings (input, model, output, fragment)
//
// Setup receives raw Angular types: InputSignal, ModelSignal,
// OutputEmitterRef, FragmentBinding.
// ────────────────────────────────────────────────────────────────

type UserDetailBindings = {
  user: InputSignal<User>;
  email: ModelSignal<string>;
  makeAdmin: OutputEmitterRef<void>;
  children: OptionalFragmentBinding<void>;
};

// TS-only spec: spell out bindings after the explicit proxy surface generic.
const UserDetail = component.proxy<HTMLElement, UserDetailBindings>({
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
    const _rendered: TemplateMarkup | undefined = children?.();
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
    const _rendered: TemplateMarkup = children();
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

// Void fragment: callable with no arguments only
const RenderVoidFragment = component({
  bindings: {
    emptyTpl: fragment<void>(),
  },
  setup: ({ emptyTpl }) => {
    const _args: Assert<IsEqual<Parameters<NonNullable<typeof emptyTpl>>, []>> =
      true;
    const _ok = emptyTpl?.();
    // @ts-expect-error void fragment does not accept payload arguments
    emptyTpl?.({ id: '1', desc: 'A' });
    return tmpl;
  },
});

// Tuple fragments define the fragment parameter list
const RenderTupleFragment = component({
  bindings: {
    itemTpl: fragment.required<[Item]>(),
    indexedItemTpl: fragment.required<[Item, number]>(),
    readonlyItemTpl: fragment.required<readonly [Item]>(),
  },
  setup: ({ itemTpl, indexedItemTpl, readonlyItemTpl }) => {
    const item: Item = { id: '1', desc: 'A' };
    const _singleArgs: Assert<IsEqual<Parameters<typeof itemTpl>, [Item]>> =
      true;
    const _multiArgs: Assert<
      IsEqual<Parameters<typeof indexedItemTpl>, [Item, number]>
    > = true;
    const _readonlyTupleArgs: Assert<
      IsEqual<Parameters<typeof readonlyItemTpl>, [Item]>
    > = true;

    itemTpl(item);
    indexedItemTpl(item, 0);
    readonlyItemTpl(item);
    // @ts-expect-error tuple fragment requires the declared argument
    itemTpl();
    // @ts-expect-error tuple fragment does not accept extra arguments
    itemTpl(item, 0);
    // @ts-expect-error tuple fragment enforces argument order
    indexedItemTpl(0, item);
    return tmpl;
  },
});

// Open array fragments are a single array payload, not variadic item args
const RenderArrayPayloadFragment = component({
  bindings: {
    rowsTpl: fragment.required<Item[]>(),
    readonlyRowsTpl: fragment.required<readonly Item[]>(),
  },
  setup: ({ rowsTpl, readonlyRowsTpl }) => {
    const item: Item = { id: '1', desc: 'A' };
    const rows: Item[] = [item];
    const readonlyRows: readonly Item[] = rows;
    const _arrayArgs: Assert<IsEqual<Parameters<typeof rowsTpl>, [Item[]]>> =
      true;
    const _readonlyArrayArgs: Assert<
      IsEqual<Parameters<typeof readonlyRowsTpl>, [readonly Item[]]>
    > = true;

    rowsTpl(rows);
    readonlyRowsTpl(readonlyRows);
    // @ts-expect-error open array fragment requires the whole array payload
    rowsTpl(item);
    // @ts-expect-error open array fragment is not variadic
    rowsTpl(item, item);
    // @ts-expect-error open array fragment still requires its payload
    rowsTpl();
    // @ts-expect-error readonly array payload still expects an array, not an item
    readonlyRowsTpl(item);
    return tmpl;
  },
});

// ────────────────────────────────────────────────────────────────
// 6. COMPONENT — bindings aliasing (TS destructuring in setup)
//
// Standard destructuring rename (e.g. { class: className }) lets
// developers alias bindings at the setup level without any
// framework-specific mechanism. Works the same in all setup
// contexts (component, directive, derivation).
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

// ────────────────────────────────────────────────────────────────
// 7. COMPONENT — providers receive only inputs (not models/outputs)
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

// Concrete provide(...) usage in providers
const Counter = component({
  bindings: {
    c: input.required<number>(),
  },
  setup: () => tmpl,
  providers: ({ c }) => {
    const _cInput: InputSignal<number> = c;
    return [provide(Store, () => new Store())];
  },
});

// ────────────────────────────────────────────────────────────────
// 8. COMPONENT — expose
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

// Mixed: inputs + local signals in expose (subsumes input-only expose)
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

const mixedRef = ref<typeof MixedExpose>();
const _mixedLabel: InputSignal<string> | undefined = mixedRef()?.label;
const _mixedDoubled: Signal<number> | undefined = mixedRef()?.doubled;

// Void expose through ref: resolves to Ref<undefined>, not Ref<void | undefined>
const voidExposeRef = ref<typeof NoExpose>();
const _voidExposeCheck: Ref<undefined> = voidExposeRef;

// ────────────────────────────────────────────────────────────────
// 9. DIRECTIVE — host as separate config, expose
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
const voidDirRef = ref<typeof voidDir>();
const _voidDirCheck: Ref<undefined> = voidDirRef;

// Directive expose flows through ref with correct type
const typedDir = directive({
  host: ref<HTMLButtonElement>(),
  bindings: { label: input<string>() },
  setup: ({ label }, { host }) => ({ getLabel: () => label() }),
});
const typedDirRef = ref<typeof typedDir>();
const _typedDirRefCheck: Ref<
  { getLabel: () => string | undefined } | undefined
> = typedDirRef;

// Host type constraint: narrows to specific element type
const buttonOnly = directive({
  host: ref<HTMLButtonElement>(),
  bindings: { label: input<string>() },
  setup: ({ label }, { host }) => {},
});

const inputOnly = directive({
  host: ref<HTMLInputElement>(),
  bindings: { label: input<string>() },
  setup: ({ label }, { host }) => {},
});

// Directive exposing its input
const highlight = directive({
  host: ref<HTMLElement>(),
  bindings: {
    color: input.required<string>(),
  },
  setup: ({ color }, { host }) => ({ color }),
});

const highlightRef = ref<typeof highlight>();
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
// 10. REF UTILITIES — ref, refMany, read-only enforcement
//
// ref()  → single instance (Ref<T | undefined>)
// refMany() → multiple instances (Ref<T[]>)
// Both resolve after afterNextRender.
// ────────────────────────────────────────────────────────────────

// Native element
const divRef = ref<HTMLDivElement>();
const _divRefType: Ref<HTMLDivElement | undefined> = divRef;

// Component with expose
const childRef = ref<typeof Child>();
const _childRefType: Ref<{ text: Signal<string> } | undefined> = childRef;

// Ref<T> extends Signal<T>
const _childRefAsSignal: Signal<{ text: Signal<string> } | undefined> =
  childRef;

// Component without expose
const noExposeRef = ref<typeof NoExpose>();
const _noExposeType: Ref<undefined> = noExposeRef;

// Directive with expose
const tooltipRef = ref<typeof tooltip>();
const _tooltipRefType: Ref<{ toggle: () => void } | undefined> = tooltipRef;

// Directive without expose
const rippleRef = ref<typeof ripple>();
const _rippleRefType: Ref<undefined> = rippleRef;

// refMany — component with expose
const manyChildren = refMany<typeof Child>();
const _manyType: Ref<{ text: Signal<string> }[]> = manyChildren;

// refMany — native element
const manyDivs = refMany<HTMLDivElement>();
const _manyDivsType: Ref<HTMLDivElement[]> = manyDivs;

// refMany without expose → Ref<[]>
const manyNoExpose = refMany<typeof NoExpose>();
const _manyNoExposeType: Ref<[]> = manyNoExpose;

// Refs are read-only — .set() must not exist (representative: single + many)
// @ts-expect-error
divRef.set(document.createElement('div'));
// @ts-expect-error
manyChildren.set([]);

// ref() must not accept runtime arguments — generic-only
// @ts-expect-error ref does not accept a runtime argument
ref(Child);
// @ts-expect-error refMany does not accept a runtime argument
refMany(Child);

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

// ────────────────────────────────────────────────────────────────
// 11. COMPONENT — proxy, directive forwarding surface
// ────────────────────────────────────────────────────────────────

const _NegProxyRequiresExplicitSurface = component.proxy({
  // @ts-expect-error component.proxy requires an explicit proxy surface type
  setup: () => tmpl,
});

const ButtonProxy = component.proxy<HTMLButtonElement>({
  setup: () => tmpl,
});
type _ButtonProxyType = Assert<
  IsEqual<
    typeof ButtonProxy,
    ComponentInstance<{}, void, HTMLButtonElement>
  >
>;

// @ts-expect-error proxy surface must be an HTMLElement subtype
const _NegInvalidProxySurface = component.proxy<string>({
  setup: () => tmpl,
});

const _NegProxyMetadataInSetup = component.proxy<
  HTMLElement,
  { label: InputSignal<string | undefined> }
>({
  bindings: {
    label: input<string>(),
  },
  setup: (bindings) => {
    // @ts-expect-error proxy surface metadata is not visible in setup bindings
    bindings.proxySurface;
    return tmpl;
  },
});

const _NegComponentAsProxySurface = (
  // @ts-expect-error component instances are not valid proxy surface types
  component.proxy<typeof UserDetail>({
    setup: () => tmpl,
  })
);

// @ts-expect-error directive instances are not valid proxy surface types
const _NegDirectiveAsProxySurface = component.proxy<typeof tooltip>({
  setup: () => tmpl,
});

// ────────────────────────────────────────────────────────────────
// 12. COMPONENT — wrap with selected bindings + forwarding marker
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

// setup sees selected keys only
const _NegSelectedOnly = component.wrap(UserDetail, {
  bindings: { user: input.required<User>() },
  setup: ({
    user,
    // @ts-expect-error email is not selected in wrapper bindings
    email,
  }) => tmpl,
});

// selected keys must exist on target
const _NegExtra = component.wrap(UserDetail, {
  // @ts-expect-error nonsense is not in target bindings
  bindings: {
    user: input.required<User>(),
    nonsense: input<string>(),
  },
  setup: () => tmpl,
});

// selected binding types must match exactly
const _NegWrongType = component.wrap(UserDetail, {
  // @ts-expect-error user input type should be User
  bindings: {
    user: input.required<string>(),
  },
  setup: () => tmpl,
});

// selected binding kinds must match
const _NegWrongKind = component.wrap(UserDetail, {
  // @ts-expect-error makeAdmin is an output on target, not an input
  bindings: {
    makeAdmin: input<void>(),
  },
  setup: () => tmpl,
});

// no narrowing
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

// no widening
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

// empty selection means setup gets no target bindings
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

// providers see selected inputs only
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

// providers still exclude selected models/outputs
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

// Wrapper preserves proxy surface from target
const ProxyWrapper = component.wrap(ButtonProxy, {
  bindings: {},
  setup: () => tmpl,
});
type _ProxyWrapperPreservesHost = Assert<
  IsEqual<
    typeof ProxyWrapper,
    ComponentInstance<{}, void, HTMLButtonElement>
  >
>;

const InputProxy = component.proxy<HTMLInputElement>({
  setup: () => tmpl,
});
const InputProxyWrapper = component.wrap(InputProxy, {
  bindings: {},
  setup: () => tmpl,
});
type _InputProxyWrapperPreservesHost = Assert<
  IsEqual<
    typeof InputProxyWrapper,
    ComponentInstance<{}, void, HTMLInputElement>
  >
>;

const NoForwardingTarget = component({
  setup: () => tmpl,
});
const NoProxyWrapper = component.wrap(NoForwardingTarget, {
  bindings: {},
  setup: () => tmpl,
});
type _NoProxyWrapperKeepsNever = Assert<
  IsEqual<typeof NoProxyWrapper, ComponentInstance<{}, void, never>>
>;

// component.wrap is inference-only; explicit generics are invalid
// @ts-expect-error component.wrap is inference-only; explicit generics are invalid
const _NegWrapperExplicitGeneric = component.wrap<HTMLButtonElement>(
  UserDetail,
  {
    bindings: {},
    setup: () => tmpl,
  },
);

// ────────────────────────────────────────────────────────────────
// 13. COMPONENT — forward collision precedence (compiler contract)
//
// Explicit target bindings win over forwarded remainder, independent of
// source order and binding kind. MergeProps models this: Right wins.
// ────────────────────────────────────────────────────────────────

type FromRemainder = {
  user: 'remainder';
  email: 'remainder-email';
  click: 'remainder-click';
};

type FromExplicit = {
  user: 'explicit';
};

type Merged = MergeProps<FromRemainder, FromExplicit>;
type _MergedExplicitWins = Assert<IsEqual<Merged['user'], 'explicit'>>;
type _MergedKeepsRemainder = Assert<IsEqual<Merged['email'], 'remainder-email'>>;

// ────────────────────────────────────────────────────────────────
// 14. DIRECTIVE — forwarding compatibility
//
// Directive host must accept the component's proxy surface.
// ────────────────────────────────────────────────────────────────

type ProxySurface<C extends ComponentInstance<any, any, any>> =
  C extends ComponentInstance<any, any, infer S> ? S : never;
type DirectiveHost<D extends DirectiveInstance<any, any, any>> =
  D extends DirectiveInstance<infer H, any, any> ? H : never;
type DirectiveFitsProxySurface<
  C extends ComponentInstance<any, any, any>,
  D extends DirectiveInstance<any, any, any>,
> =
  ProxySurface<C> extends never
    ? false
    : ProxySurface<C> extends DirectiveHost<D>
      ? true
      : false;

type _ButtonProxyAcceptsButtonDirective = Assert<
  IsEqual<
    DirectiveFitsProxySurface<typeof ButtonProxy, typeof buttonOnly>,
    true
  >
>;
type _ButtonProxyAcceptsGenericDirective = Assert<
  IsEqual<
    DirectiveFitsProxySurface<typeof ButtonProxy, typeof tooltip>,
    true
  >
>;
// @ts-expect-error input-host directive cannot attach to a button proxy surface
const _negButtonProxyRejectsInputDirective: DirectiveFitsProxySurface<
  typeof ButtonProxy,
  typeof inputOnly
> = true;

type _InputProxyWrapperAcceptsInputDirective = Assert<
  IsEqual<
    DirectiveFitsProxySurface<
      typeof InputProxyWrapper,
      typeof inputOnly
    >,
    true
  >
>;
type _InputProxyWrapperAcceptsGenericDirective = Assert<
  IsEqual<
    DirectiveFitsProxySurface<typeof InputProxyWrapper, typeof tooltip>,
    true
  >
>;
// @ts-expect-error button-host directive cannot attach to an input proxy surface
const _negInputProxyWrapperRejectsButtonDirective: DirectiveFitsProxySurface<
  typeof InputProxyWrapper,
  typeof buttonOnly
> = true;

type _NoProxyWrapperRejectsDirective = Assert<
  IsEqual<
    DirectiveFitsProxySurface<typeof NoProxyWrapper, typeof tooltip>,
    false
  >
>;
type _PlainComponentRejectsDirective = Assert<
  IsEqual<
    DirectiveFitsProxySurface<typeof NoForwardingTarget, typeof tooltip>,
    false
  >
>;

// ────────────────────────────────────────────────────────────────
// 15. DERIVATION — only inputs, setup returns Signal<T>
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
// 16. INJECTION TOKEN
// ────────────────────────────────────────────────────────────────

// Token without factory — returns DiToken
const noFactoryToken = injectionToken<string>();
const _noFactoryTokenType: DiToken<string> = noFactoryToken;

// Token with factory — returns DiToken (DiTokenWithFactory is assignable)
const withFactoryToken = injectionToken({
  factory: () => {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      increase: () => counter.update((v) => v + 1),
    };
  },
});
const _withFactoryTokenType: DiToken<{
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
const _rootTokenType: DiToken<{
  value: Signal<number>;
  decrease: () => void;
}> = rootToken;

// Multi without factory — returns DiMultiToken<T>
const multiNoFactoryToken = injectionToken.multi<number>();
const _multiNoFactoryTokenType: DiMultiToken<number> = multiNoFactoryToken;

// Multi with factory — returns DiMultiToken<T> (DiMultiTokenWithFactory is assignable)
const multiToken = injectionToken.multi({
  factory: () => Math.random(),
});
const _multiTokenType: DiMultiToken<number> = multiToken;

// Explicit autoProvided: false — accepted
const explicitFalseWithFactory = injectionToken({
  autoProvided: false,
  factory: () => 99,
});
const _explicitFalseWithFactoryType: DiToken<number> = explicitFalseWithFactory;

// Single token with array value type
const arrayValueToken = injectionToken<string[]>({ debugName: 'tags' });
const _arrayValueTokenType: DiToken<string[]> = arrayValueToken;

// Single token with array value type and factory
const arrayValueWithFactory = injectionToken({
  factory: () => ['a', 'b', 'c'],
});
const _arrayValueWithFactoryType: DiToken<string[]> = arrayValueWithFactory;

// provide(token, factory) for array-valued non-multi token: factory returns the full array
const _provideArrayValue = provide(arrayValueToken, () => ['x', 'y']);

// Multi token is NOT assignable to DiToken
// @ts-expect-error DiMultiToken is not assignable to DiToken
const _multiNotAssignableToNonMulti: typeof arrayValueToken =
  multiNoFactoryToken;

// Empty object config — equivalent to no-arg call
const emptyConfigToken = injectionToken<string>({});
const _emptyConfigTokenType: DiToken<string> = emptyConfigToken;

// Unknown token preserves unknown as the inject result
const unknownTypeToken = injectionToken<unknown>();
const _unknownValue: unknown = inject(unknownTypeToken);
const _unknownCast = <string>inject(unknownTypeToken);

// Negative: autoProvided: true without factory
// @ts-expect-error autoProvided: true requires a factory
const _negAutoProvidedNoFactory = injectionToken<string>({
  autoProvided: true,
});

// Negative: multi is no longer a config flag on injectionToken(...)
// @ts-expect-error use injectionToken.multi(...) for multi tokens
const _negOldMultiNoFactory = injectionToken<number>({ multi: true });

// @ts-expect-error multi: false is no longer accepted; omit the option
const _negOldMultiFalseNoFactory = injectionToken<string>({ multi: false });

// Negative: autoProvided is not valid on injectionToken.multi(...)
const _negMultiAutoProvidedTrue = injectionToken.multi({
  // @ts-expect-error autoProvided is not an option for injectionToken.multi(...)
  autoProvided: true,
  factory: () => 1,
});

// ────────────────────────────────────────────────────────────────
// 17. INJECT
// ────────────────────────────────────────────────────────────────

// inject(Component) → expose type
const _injectedChild: { text: Signal<string> } = inject(Child);

// inject(Component without expose) → void
const _injectedNoExpose: void = inject(NoExpose);

// inject(Directive) → expose type
const _injectedTooltip: { toggle: () => void } = inject(tooltip);

// inject(DiToken) → token type
const _injectedWithFactory: { value: Signal<number>; increase: () => void } =
  inject(withFactoryToken);
const _injectedNoFactory: string = inject(noFactoryToken);
const _injectedMulti: number[] = inject(multiToken);
const _injectedMultiNoFactory: number[] = inject(multiNoFactoryToken);

// optional: true → T | null; optional: false / omitted → T
const _optionalInjectedNoFactory: string | null = inject(noFactoryToken, {
  optional: true,
});
const _requiredInjectedNoFactory: string = inject(noFactoryToken, {
  optional: false,
});

// @ts-expect-error generic is token type, not value type
inject<string>(withFactoryToken);

// @ts-expect-error generic is token type, not value type
inject<string>(multiToken);

// inject(Class) → class instance
const _injectedStore: Store = inject(Store);

// inject(abstract class) → class instance
abstract class AbstractService {
  abstract run(): void;
}
class ConcreteService extends AbstractService {
  run() {}
}

const _injectedAbstract: AbstractService = inject(AbstractService);

// inject(generic class) → class instance
class GenericClass<T extends number> {
  value!: T;
}
const _injectedGeneric: GenericClass<number> = inject(GenericClass);

// inject(generic abstract class) → class instance
abstract class GenericAbstract<T extends string> {
  abstract get(): T;
}
const _injectedGenericAbstract: GenericAbstract<string> =
  inject(GenericAbstract);

// inject(HostAttributeToken) → string
const _injectedAttr: string = inject(new HostAttributeToken('role'));
const _injectedAttrOptional: string | null = inject(
  new HostAttributeToken('role'),
  { optional: true },
);

// inject(legacy InjectionToken<T>) → T
const legacyToken = new InjectionToken<number>('legacyToken');
const _injectedLegacy: number = inject(legacyToken);
const _injectedLegacyOptional: number | null = inject(legacyToken, {
  optional: true,
});

// ────────────────────────────────────────────────────────────────
// 18. PROVIDE
// ────────────────────────────────────────────────────────────────

// provide shorthand — only works with DiToken (with factory)
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

// Explicit factory form — works with both DiToken (base) and DiTokenWithFactory
const _providersExplicitFactory = [
  provide(noFactoryToken, () => 'explicit'),
  provide(multiNoFactoryToken, () => 42),
  provide(withFactoryToken, () => ({
    value: signal(0).asReadonly(),
    increase: () => {},
  })),
  provide(Store, () => new Store()),
  provide(legacyToken, () => 10),
  provide(rootToken, () => ({
    value: signal(0).asReadonly(),
    decrease: () => {},
  })),
  provide(multiToken, () => 99),
];

// Multi provide factory returns a single item, not an array
// @ts-expect-error factory for multi token must return number, not number[]
provide(multiToken, () => [1, 2, 3]);

// Array-valued non-multi token: factory returns the full array
// @ts-expect-error factory for non-multi string[] token must return string[]
provide(arrayValueToken, () => 'single');

// Class token: factory must return an instance of the class
// @ts-expect-error factory returns boolean, not Store
provide(Store, () => true);

// Abstract class token: factory must return an instance of the abstract class
const _provideAbstract = provide(AbstractService, () => new ConcreteService());

// @ts-expect-error factory returns string, not AbstractService
provide(AbstractService, () => 'wrong');

// Negative: wrong factory return type for single token
// @ts-expect-error factory returns number, not string
provide(noFactoryToken, () => 123);

// Negative: wrong factory return type for multi token
// @ts-expect-error factory returns string, not number
provide(multiToken, () => 'wrong');

// Negative: provide(Class) shorthand — classes are not DiTokenWithFactory
// @ts-expect-error class shorthand is not allowed; use explicit factory form
provide(Store);

// Negative: legacy InjectionToken shorthand — not DiTokenWithFactory
// @ts-expect-error legacy token shorthand is not allowed; use explicit factory form
provide(legacyToken);

// Negative: wrong factory return type for legacy token
// @ts-expect-error factory returns string, not number
provide(legacyToken, () => 'wrong');

// ────────────────────────────────────────────────────────────────
// 19. INTERFACE CONFORMANCE — satisfies on bindings and expose
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
const accordionRef = ref<typeof Accordion>();
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

const toggleDirRef = ref<typeof toggleDirective>();
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
    // @ts-expect-error sortDirection should be InputSignal<'asc' | 'desc'>
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
// 20. DIAGNOSTIC CONTRACTS — wrapper + reserved names
//
// Keep these checks at the end: they validate the shape of type-level
// diagnostics, not core API behavior.
// ────────────────────────────────────────────────────────────────

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
    'children binding must use fragment<void>() or fragment.required<void>()'
  >
>;

type _ReservedOk = __ReservedBindingsConstraint<{
  children: OptionalFragmentBinding<void>;
}>;
type _ReservedOkKeys = Assert<IsEqual<keyof _ReservedOk, never>>;
