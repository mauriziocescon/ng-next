import {
  type InputSignal,
  type ModelSignal,
  type OutputEmitterRef,
  type Signal,
  HostAttributeToken,
  InjectionToken,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import {
  type ComponentInstance,
  type ComponentBindingValue,
  type ComponentRootOf,
  type ComponentTemplateOf,
  type RootNode,
  type DerivationBindingValue,
  type DerivationInstance,
  type DirectiveHostType,
  type DirectiveInstance,
  type IntrinsicElementDescriptor,
  type IntrinsicElementHost,
  type DiToken,
  type DiMultiToken,
  type OptionalFragmentBinding,
  type Ref,
  type RequiredFragmentBinding,
  type TemplateAST,
  type TemplateAstOf,
  type TemplateMarkup,
  type __ValidateComponentBindings,
  component,
  derivation,
  directive,
  element,
  fragment,
  inject,
  injectionToken,
  isRootNode,
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

// ────────────────────────────────────────────────────────────────
// 1. TEMPLATE MARKUP
//
// TemplateMarkup is a branded type — distinct from plain objects.
// ────────────────────────────────────────────────────────────────

const _tmplAssign: TemplateMarkup = tmpl;

declare const specificTmpl: TemplateMarkup<SpecificTemplateAST>;

const _specificTmplAssign: TemplateMarkup = specificTmpl;

type _SpecificTemplateAst = Assert<
  IsEqual<TemplateAstOf<typeof specificTmpl>, SpecificTemplateAST>
>;

// @ts-expect-error generic TemplateMarkup does not carry the specific AST
const _genericTmplNotSpecific: TemplateMarkup<SpecificTemplateAST> = tmpl;

// @ts-expect-error plain object is not TemplateMarkup
const _tmplNotPlain: TemplateMarkup = {};

// ────────────────────────────────────────────────────────────────
// 2. BRANDED BINDING TYPES — fragment nominality
//
// FragmentBinding optional/required forms are distinct.
// ────────────────────────────────────────────────────────────────

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
// component root types, and native refs.
// ────────────────────────────────────────────────────────────────

interface TestIntrinsicElements {
  div: IntrinsicElementDescriptor<HTMLDivElement>;
  input: IntrinsicElementDescriptor<HTMLInputElement>;
  button: IntrinsicElementDescriptor<HTMLButtonElement>;
  svg: IntrinsicElementDescriptor<SVGSVGElement>;
  circle: IntrinsicElementDescriptor<SVGCircleElement>;
}

type TestHost<K extends keyof TestIntrinsicElements> =
  IntrinsicElementHost<TestIntrinsicElements[K]>;

type _IntrinsicButtonHost = Assert<
  IsEqual<TestHost<'button'>, HTMLButtonElement>
>;
type _IntrinsicInputHost = Assert<
  IsEqual<TestHost<'input'>, HTMLInputElement>
>;
type _IntrinsicSvgHost = Assert<
  IsEqual<TestHost<'svg'>, SVGSVGElement>
>;
type _IntrinsicCircleHost = Assert<
  IsEqual<TestHost<'circle'>, SVGCircleElement>
>;

// @ts-expect-error an input intrinsic host is not a button host
const _negIntrinsicInputIsNotButton: HTMLButtonElement =
  undefined as unknown as TestHost<'input'>;

// @ts-expect-error an svg intrinsic host is not an html host
const _negIntrinsicSvgIsNotHtml: HTMLElement =
  undefined as unknown as TestHost<'svg'>;

type _ContainerRootIsNotHtml = Assert<
  IsEqual<RootNode extends HTMLElement ? true : false, false>
>;
type _HtmlIsNotContainerRoot = Assert<
  IsEqual<HTMLElement extends RootNode ? true : false, false>
>;
type _ContainerRootIsNotSvg = Assert<
  IsEqual<RootNode extends SVGElement ? true : false, false>
>;
type _SvgIsNotContainerRoot = Assert<
  IsEqual<SVGElement extends RootNode ? true : false, false>
>;

type _HtmlIsHostType = Assert<
  IsEqual<HTMLButtonElement extends DirectiveHostType ? true : false, true>
>;
type _SvgIsHostType = Assert<
  IsEqual<SVGSVGElement extends DirectiveHostType ? true : false, true>
>;
type _ContainerIsHostType = Assert<
  IsEqual<RootNode extends DirectiveHostType ? true : false, true>
>;

// @ts-expect-error a RootNode cannot stand in for a DOM element
const _negContainerAsElement: HTMLElement =
  undefined as unknown as RootNode;
// @ts-expect-error nor the reverse
const _negElementAsContainer: RootNode =
  undefined as unknown as HTMLElement;
// @ts-expect-error a RootNode cannot stand in for an SVG element
const _negContainerAsSvgElement: SVGElement =
  undefined as unknown as RootNode;
// @ts-expect-error nor the reverse
const _negSvgElementAsContainer: RootNode =
  undefined as unknown as SVGElement;

declare const containerHost: RootNode;
// @ts-expect-error RootNode exposes no DOM members
const _negContainerHasNoDomMembers = containerHost.tagName;

declare const someHost: DirectiveHostType;
if (isRootNode(someHost)) {
  type _NarrowedToContainer = Assert<IsEqual<typeof someHost, RootNode>>;
} else {
  type _NarrowedToElement = Assert<
    IsEqual<typeof someHost, HTMLElement | SVGElement>
  >;
  const _tagName: string = someHost.tagName;
}

declare const maybeHost: HTMLElement | RootNode | undefined;
// @ts-expect-error undefined is not a DirectiveHostType
const _negGuardOnMaybeHost = isRootNode(maybeHost);

// ────────────────────────────────────────────────────────────────
// 4. COMPONENT — basics
// ────────────────────────────────────────────────────────────────

const Minimal = component({
  setup: () => tmpl,
});

const StyledWithProviders = component({
  setup: () => tmpl,
  style: `.danger { color: red; }`,
  styleUrl: './my-comp.css',
  providers: () => [],
});

const MinimalFull = component({
  setup: () => ({ template: tmpl }),
});

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

const UserDetail = component({
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

type _UserDetailBindingsInferred = Assert<
  IsEqual<
    typeof UserDetail extends ComponentInstance<infer B, any, any>
      ? B
      : never,
    UserDetailBindings
  >
>;

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

const _NegChildrenMustBeFragment = component({
  // @ts-expect-error reserved name 'children' must use fragment(...)
  bindings: {
    children: input<string>(),
  },
  setup: () => tmpl,
});

const _NegRefReserved = component({
  // @ts-expect-error reserved name 'ref' cannot be a component binding
  bindings: {
    ref: input<string>(),
  },
  setup: () => tmpl,
});

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

const InputDefaults = component({
  bindings: {
    req: input.required<string>(),
    optional: input<'info' | 'warn'>(),
    defaulted: input<'info' | 'warn'>('info'),
  },
  setup: ({ req, optional, defaulted }) => {
    const _r: string = req();
    const _o: 'info' | 'warn' | undefined = optional();
    const _d: 'info' | 'warn' = defaulted();
    // @ts-expect-error an input without a default may be undefined
    const _oNarrowed: 'info' | 'warn' = optional();
    return tmpl;
  },
});

interface Row {
  id: string;
}

const DataTable = component({
  bindings: {
    rows: input.required<Row[]>(),
    selected: model<Row | null>(),
    sort: output<{ key: string }>(),
    rowTemplate: fragment<[Row]>(),
  },
  setup: ({ rows, selected, sort, rowTemplate }) => {
    const _rows: Row[] = rows();
    const _sel: Row | null | undefined = selected();
    sort.emit({ key: 'id' });

    const _frag: OptionalFragmentBinding<[Row]> | undefined = rowTemplate;
    const _args: Assert<
      IsEqual<Parameters<NonNullable<typeof rowTemplate>>, [Row]>
    > = true;
    const _rendered: TemplateMarkup | undefined = rowTemplate?.(rows()[0]);
    // @ts-expect-error optional parameterized fragment still requires its argument
    rowTemplate?.();
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

class CounterStore {
  readonly value: Signal<number>;

  constructor(initial: () => number) {
    this.value = computed(() => initial());
  }
}

const CounterWithStore = component({
  bindings: {
    c: input.required<number>(),
  },
  setup: () => tmpl,
  providers: ({ c }) => [provide(CounterStore, () => new CounterStore(c))],
});

const seedToken = injectionToken.multi({ factory: () => 0 });

const SeededFromInput = component({
  bindings: {
    initialValue: input<number>(),
  },
  setup: () => tmpl,
  providers: ({ initialValue }) => [
    // @ts-expect-error input<number>() reads as number | undefined; factory must return number
    provide(seedToken, () => initialValue()),
    provide(seedToken, () => initialValue() ?? 0),
  ],
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

const NoExpose = component({
  setup: () => tmpl,
});

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

// ────────────────────────────────────────────────────────────────
// 9. DIRECTIVE — host as separate config, expose
//
// host is a top-level config property (not a binding) because it
// is framework-provided context, not consumer-bindable.
// setup receives bindings as first arg, { host } as second.
// ────────────────────────────────────────────────────────────────

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

const ripple = directive({
  host: ref<HTMLElement>(),
  setup: ({}, { host }) => {
    const _hostEl: Ref<HTMLElement | undefined> = host;
  },
});

const typedDir = directive({
  host: ref<HTMLButtonElement>(),
  bindings: { label: input<string>() },
  setup: ({ label }, { host }) => ({ getLabel: () => label() }),
});
const typedDirRef = ref<typeof typedDir>();
const _typedDirRefCheck: Ref<
  { getLabel: () => string | undefined } | undefined
> = typedDirRef;

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

const svgOnly = directive({
  host: ref<SVGSVGElement>(),
  bindings: { label: input<string>() },
  setup: ({ label }, { host }) => {
    const _hostEl: Ref<SVGSVGElement | undefined> = host;
  },
});

const highlight = directive({
  host: ref<HTMLElement>(),
  bindings: {
    color: input.required<string>(),
  },
  setup: ({ color }, { host }) => ({ color }),
});

const highlightRef = ref<typeof highlight>();
const _highlightColor: InputSignal<string> | undefined = highlightRef()?.color;

const toggleOnly = directive({
  host: ref<HTMLElement>(),
  setup: () => ({ toggle: () => {} }),
});

const toggleOnlyRef = ref<typeof toggleOnly>();
const _toggleOnlyRefType: Ref<{ toggle: () => void } | undefined> =
  toggleOnlyRef;

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

const containerOnly = directive({
  host: ref<RootNode>(),
  setup: ({}, { host }) => {
    const _hostRef: Ref<RootNode | undefined> = host;
  },
});

const logDirective = directive({
  host: ref<HTMLElement | SVGElement | RootNode>(),
  bindings: { tag: input<string>('') },
  setup: ({ tag }, { host }) => {
    const _hostRef: Ref<HTMLElement | SVGElement | RootNode | undefined> = host;
    const _tag: string = tag();
    const el = host();
    if (el !== undefined && !isRootNode(el)) {
      const _tagName: string = el.tagName;
    }
  },
});

// ────────────────────────────────────────────────────────────────
// 10. REF UTILITIES — ref, refMany, read-only enforcement
//
// ref()  → single instance (Ref<T | undefined>)
// refMany() → multiple instances (Ref<T[]>)
// Both resolve after afterNextRender.
// ────────────────────────────────────────────────────────────────

const divRef = ref<HTMLDivElement>();
const _divRefType: Ref<HTMLDivElement | undefined> = divRef;

const svgRef = ref<SVGSVGElement>();
const _svgRefType: Ref<SVGSVGElement | undefined> = svgRef;

const childRef = ref<typeof Child>();
const _childRefType: Ref<{ text: Signal<string> } | undefined> = childRef;

const _childRefAsSignal: Signal<{ text: Signal<string> } | undefined> =
  childRef;

const noExposeRef = ref<typeof NoExpose>();
const _noExposeType: Ref<undefined> = noExposeRef;

const tooltipRef = ref<typeof tooltip>();
const _tooltipRefType: Ref<{ toggle: () => void } | undefined> = tooltipRef;

const rippleRef = ref<typeof ripple>();
const _rippleRefType: Ref<undefined> = rippleRef;

const manyChildren = refMany<typeof Child>();
const _manyType: Ref<{ text: Signal<string> }[]> = manyChildren;

const manyDivs = refMany<HTMLDivElement>();
const _manyDivsType: Ref<HTMLDivElement[]> = manyDivs;

const manySvgs = refMany<SVGSVGElement>();
const _manySvgsType: Ref<SVGSVGElement[]> = manySvgs;

const manyNoExpose = refMany<typeof NoExpose>();
const _manyNoExposeType: Ref<[]> = manyNoExpose;

// @ts-expect-error
divRef.set(document.createElement('div'));
// @ts-expect-error
manyChildren.set([]);

// @ts-expect-error ref does not accept a runtime argument
ref(Child);
// @ts-expect-error refMany does not accept a runtime argument
refMany(Child);

const containerRef = ref<RootNode>();
const _containerRefType: Ref<RootNode | undefined> = containerRef;

const manyContainers = refMany<RootNode>();
const _manyContainersType: Ref<RootNode[]> = manyContainers;

const containerOnlyRef = ref<typeof containerOnly>();
const _containerOnlyRefType: Ref<undefined> = containerOnlyRef;

// ────────────────────────────────────────────────────────────────
// 11. COMPONENT — rootNode declaration (element<...>())
//
// A component declares its root type with `rootNode: element<T>()`, defaulting
// to RootNode when omitted. The declared root is reflected in ComponentInstance
// as its fourth parameter, so it is observable via ComponentRootOf and two
// components that differ only in their root differ in type.
// ────────────────────────────────────────────────────────────────

const ButtonWithBindings = component({
  rootNode: element<HTMLButtonElement>(),
  bindings: {
    type: input<'button' | 'submit' | 'reset'>('button'),
    class: input<string>(''),
    style: input<string>(''),
    disabled: input<boolean>(false),
    click: output<void>(),
    children: fragment.required<void>(),
  },
  setup: ({ type, class: className, style, disabled, click, children }) => {
    const _t: 'button' | 'submit' | 'reset' = type();
    const _c: string = className();
    const _s: string = style();
    const _d: boolean = disabled();
    const _rendered: TemplateMarkup = children();
    click.emit();
    return specificTmpl;
  },
  providers: (inputs) => {
    const _type: InputSignal<'button' | 'submit' | 'reset'> = inputs.type;
    // @ts-expect-error click is an output, excluded from providers
    inputs.click;
    // @ts-expect-error children is a fragment, excluded from providers
    inputs.children;
    return [];
  },
});

type _ButtonWithBindingsInferred = Assert<
  IsEqual<
    typeof ButtonWithBindings extends ComponentInstance<infer B, any, any, any>
      ? B
      : never,
    {
      type: InputSignal<'button' | 'submit' | 'reset'>;
      class: InputSignal<string>;
      style: InputSignal<string>;
      disabled: InputSignal<boolean>;
      click: OutputEmitterRef<void>;
      children: RequiredFragmentBinding<void>;
    }
  >
>;

type _RootNodeKeepsTemplateAst = Assert<
  IsEqual<
    TemplateAstOf<ComponentTemplateOf<typeof ButtonWithBindings>>,
    SpecificTemplateAST
  >
>;

const FlaggedNoBindings = component({
  rootNode: element<HTMLElement>(),
  setup: () => tmpl,
});

const SvgRootNoBindings = component({
  rootNode: element<SVGSVGElement>(),
  setup: () => tmpl,
});

const DefaultRootNoBindings = component({
  // @ts-expect-error RootNode is not a declarable root (only the omitted default)
  rootNode: element<RootNode>(),
  setup: () => tmpl,
});

const UnionRootNoBindings = component({
  // @ts-expect-error a RootNode-containing union is not a declarable root
  rootNode: element<HTMLElement | RootNode>(),
  setup: () => tmpl,
});

const PlainNoBindings = component({
  setup: () => tmpl,
});

type _NativeRootIsReflected = Assert<
  IsEqual<ComponentRootOf<typeof FlaggedNoBindings>, HTMLElement>
>;
type _SvgNativeRootIsReflected = Assert<
  IsEqual<ComponentRootOf<typeof SvgRootNoBindings>, SVGSVGElement>
>;
type _NativeRootDiffersFromDefault = Assert<
  IsEqual<
    IsEqual<typeof FlaggedNoBindings, typeof PlainNoBindings>,
    false
  >
>;
type _OmittedRootDefaultsToRootNode = Assert<
  IsEqual<ComponentRootOf<typeof PlainNoBindings>, RootNode>
>;
type _FlaggedShape = Assert<
  IsEqual<
    typeof FlaggedNoBindings,
    ComponentInstance<{}, void, TemplateMarkup, HTMLElement>
  >
>;

const _NegRootNodeRawBoolean = component({
  // @ts-expect-error rootNode accepts only an element<...>() declaration
  rootNode: true,
  setup: () => tmpl,
});

const _NegRootNodeRawObject = component({
  // @ts-expect-error rootNode accepts only an element<...>() declaration
  rootNode: {},
  setup: () => tmpl,
});

const _NegRootNodeOutOfDomain = component({
  // @ts-expect-error element<string>() is not a native element (R extends HTMLElement | SVGElement)
  rootNode: element<string>(),
  setup: () => tmpl,
});

const _NegRootNodeIsRootNode = component({
  // @ts-expect-error RootNode is the default, never a declarable root
  rootNode: element<RootNode>(),
  setup: () => tmpl,
});

const _NegRootNodeIsUnion = component({
  // @ts-expect-error a RootNode-containing union is not a declarable root
  rootNode: element<HTMLElement | RootNode>(),
  setup: () => tmpl,
});

const _NegRootNodeInSetup = component({
  rootNode: element<HTMLElement>(),
  bindings: {
    label: input<string>(),
  },
  setup: (bindings) => {
    // @ts-expect-error rootNode is not visible in setup bindings
    bindings.rootNode;
    return tmpl;
  },
});

// ────────────────────────────────────────────────────────────────
// 12. DIRECTIVE — host compatibility with the component's rootNode
//
// A directive applied at <C .../> attaches to C's root, so its declared host
// type must accept that root. The roots here are read back out of REAL
// component instances via ComponentRootOf, then checked against each
// directive's host — plain directive.host vs component-root assignability.
// ────────────────────────────────────────────────────────────────

const ButtonRootComponent = component({
  rootNode: element<HTMLButtonElement>(),
  setup: () => tmpl,
});
const InputRootComponent = component({
  rootNode: element<HTMLInputElement>(),
  setup: () => tmpl,
});
const SvgRootComponent = component({
  rootNode: element<SVGSVGElement>(),
  setup: () => tmpl,
});
const NoElementRootComponent = component({
  // Inert (RootNode) root is expressed by omitting rootNode, not by declaring it.
  setup: () => tmpl,
});

type ButtonRootType = ComponentRootOf<typeof ButtonRootComponent>;
type InputRootType = ComponentRootOf<typeof InputRootComponent>;
type SvgRootType = ComponentRootOf<typeof SvgRootComponent>;
type NoElementRootType = ComponentRootOf<typeof NoElementRootComponent>;

type DirectiveHost<D extends DirectiveInstance<any, any, any>> =
  D extends DirectiveInstance<infer H, any, any> ? H : never;

type DirectiveFitsRoot<RootType, D extends DirectiveInstance<any, any, any>> =
  RootType extends DirectiveHost<D> ? true : false;

type _ButtonRootAcceptsButtonDirective = Assert<
  IsEqual<DirectiveFitsRoot<ButtonRootType, typeof buttonOnly>, true>
>;
type _ButtonRootAcceptsGenericDirective = Assert<
  IsEqual<DirectiveFitsRoot<ButtonRootType, typeof tooltip>, true>
>;
type _InputRootAcceptsInputDirective = Assert<
  IsEqual<DirectiveFitsRoot<InputRootType, typeof inputOnly>, true>
>;
type _InputRootAcceptsGenericDirective = Assert<
  IsEqual<DirectiveFitsRoot<InputRootType, typeof tooltip>, true>
>;
type _SvgRootAcceptsSvgDirective = Assert<
  IsEqual<DirectiveFitsRoot<SvgRootType, typeof svgOnly>, true>
>;
type _SvgRootRejectsHtmlDirective = Assert<
  IsEqual<DirectiveFitsRoot<SvgRootType, typeof tooltip>, false>
>;
type _ButtonRootRejectsSvgDirective = Assert<
  IsEqual<DirectiveFitsRoot<ButtonRootType, typeof svgOnly>, false>
>;
type _SvgRootAcceptsLogicalDirective = Assert<
  IsEqual<DirectiveFitsRoot<SvgRootType, typeof logDirective>, true>
>;
// @ts-expect-error an input-host directive cannot attach to a <button> root
const _negButtonRootRejectsInputDirective: DirectiveFitsRoot<
  ButtonRootType,
  typeof inputOnly
> = true;
// @ts-expect-error a button-host directive cannot attach to an <input> root
const _negInputRootRejectsButtonDirective: DirectiveFitsRoot<
  InputRootType,
  typeof buttonOnly
> = true;

type _NoElementRootRejectsDomDirective = Assert<
  IsEqual<DirectiveFitsRoot<NoElementRootType, typeof tooltip>, false>
>;
type _NoElementRootAcceptsContainerDirective = Assert<
  IsEqual<DirectiveFitsRoot<NoElementRootType, typeof containerOnly>, true>
>;

type _NoElementRootAcceptsLogicalDirective = Assert<
  IsEqual<DirectiveFitsRoot<NoElementRootType, typeof logDirective>, true>
>;
type _ButtonRootAcceptsLogicalDirective = Assert<
  IsEqual<DirectiveFitsRoot<ButtonRootType, typeof logDirective>, true>
>;

type _ButtonRootRejectsContainerDirective = Assert<
  IsEqual<DirectiveFitsRoot<ButtonRootType, typeof containerOnly>, false>
>;

// ────────────────────────────────────────────────────────────────
// 13. DERIVATION — only inputs, setup returns Signal<T>
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

const simple = derivation({
  setup: () => computed(() => 42),
});

const _simpleType: DerivationInstance<{}, number> = simple;

const _NegDerivationNonInput = derivation({
  // @ts-expect-error derivations cannot declare model bindings
  bindings: {
    changed: model<number>(),
  },
  setup: () => computed(() => 1),
});

const _NegDerivationOutput = derivation({
  // @ts-expect-error derivations cannot declare output bindings
  bindings: {
    changed: output<number>(),
  },
  setup: () => computed(() => 1),
});

const _NegDerivationFragment = derivation({
  // @ts-expect-error derivations cannot declare fragment bindings
  bindings: {
    content: fragment<void>(),
  },
  setup: () => computed(() => 1),
});

// ────────────────────────────────────────────────────────────────
// 14. INJECTION TOKEN
// ────────────────────────────────────────────────────────────────

const noFactoryToken = injectionToken<string>();
const _noFactoryTokenType: DiToken<string> = noFactoryToken;

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

const multiNoFactoryToken = injectionToken.multi<number>();
const _multiNoFactoryTokenType: DiMultiToken<number> = multiNoFactoryToken;

const multiToken = injectionToken.multi({
  factory: () => Math.random(),
});
const _multiTokenType: DiMultiToken<number> = multiToken;

const explicitFalseWithFactory = injectionToken({
  autoProvided: false,
  factory: () => 99,
});
const _explicitFalseWithFactoryType: DiToken<number> = explicitFalseWithFactory;

const arrayValueToken = injectionToken<string[]>({ debugName: 'tags' });
const _arrayValueTokenType: DiToken<string[]> = arrayValueToken;

const arrayValueWithFactory = injectionToken({
  factory: () => ['a', 'b', 'c'],
});
const _arrayValueWithFactoryType: DiToken<string[]> = arrayValueWithFactory;

const _provideArrayValue = provide(arrayValueToken, () => ['x', 'y']);

// @ts-expect-error DiMultiToken is not assignable to DiToken
const _multiNotAssignableToNonMulti: typeof arrayValueToken =
  multiNoFactoryToken;

const emptyConfigToken = injectionToken<string>({});
const _emptyConfigTokenType: DiToken<string> = emptyConfigToken;

const unknownTypeToken = injectionToken<unknown>();
const _unknownValue: unknown = inject(unknownTypeToken);
const _unknownCast = <string>inject(unknownTypeToken);

const _negAutoProvidedNoFactory = injectionToken<string>({
  // @ts-expect-error autoProvided: true requires a factory
  autoProvided: true,
});

// @ts-expect-error use injectionToken.multi(...) for multi tokens
const _negOldMultiNoFactory = injectionToken<number>({ multi: true });

// @ts-expect-error multi: false is no longer accepted; omit the option
const _negOldMultiFalseNoFactory = injectionToken<string>({ multi: false });

const _negMultiAutoProvidedTrue = injectionToken.multi({
  // @ts-expect-error autoProvided is not an option for injectionToken.multi(...)
  autoProvided: true,
  factory: () => 1,
});

// ────────────────────────────────────────────────────────────────
// 15. INJECT
// ────────────────────────────────────────────────────────────────

const _injectedChild: { text: Signal<string> } = inject(Child);

const _injectedNoExpose: void = inject(NoExpose);

const _injectedTooltip: { toggle: () => void } = inject(tooltip);

const _injectedWithFactory: { value: Signal<number>; increase: () => void } =
  inject(withFactoryToken);
const _injectedNoFactory: string = inject(noFactoryToken);
const _injectedMulti: number[] = inject(multiToken);
const _injectedMultiNoFactory: number[] = inject(multiNoFactoryToken);

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

const _injectedStore: Store = inject(Store);

abstract class AbstractService {
  abstract run(): void;
}
class ConcreteService extends AbstractService {
  run() {}
}

const _injectedAbstract: AbstractService = inject(AbstractService);

class GenericClass<T extends number> {
  value!: T;
}
const _injectedGeneric: GenericClass<number> = inject(GenericClass);

abstract class GenericAbstract<T extends string> {
  abstract get(): T;
}
const _injectedGenericAbstract: GenericAbstract<string> =
  inject(GenericAbstract);

const _injectedAttr: string = inject(new HostAttributeToken('role'));
const _injectedAttrOptional: string | null = inject(
  new HostAttributeToken('role'),
  { optional: true },
);

const legacyToken = new InjectionToken<number>('legacyToken');
const _injectedLegacy: number = inject(legacyToken);
const _injectedLegacyOptional: number | null = inject(legacyToken, {
  optional: true,
});

// ────────────────────────────────────────────────────────────────
// 16. PROVIDE
// ────────────────────────────────────────────────────────────────

const _providersShorthand = [
  provide(withFactoryToken),
  provide(multiToken),
  provide(rootToken),
];

// @ts-expect-error provide(token) shorthand requires token with factory
provide(noFactoryToken);

// @ts-expect-error provide(token) shorthand requires token with factory
provide(multiNoFactoryToken);

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

// @ts-expect-error factory for multi token must return number, not number[]
provide(multiToken, () => [1, 2, 3]);

// @ts-expect-error factory for non-multi string[] token must return string[]
provide(arrayValueToken, () => 'single');

// @ts-expect-error factory returns boolean, not Store
provide(Store, () => true);

const _provideAbstract = provide(AbstractService, () => new ConcreteService());

// @ts-expect-error factory returns string, not AbstractService
provide(AbstractService, () => 'wrong');

// @ts-expect-error factory returns number, not string
provide(noFactoryToken, () => 123);

// @ts-expect-error factory returns string, not number
provide(multiToken, () => 'wrong');

// @ts-expect-error class shorthand is not allowed; use explicit factory form
provide(Store);

// @ts-expect-error legacy token shorthand is not allowed; use explicit factory form
provide(legacyToken);

// @ts-expect-error factory returns string, not number
provide(legacyToken, () => 'wrong');

// ────────────────────────────────────────────────────────────────
// 17. INTERFACE CONFORMANCE — satisfies on bindings and expose
//
// Opt-in structural check, same as class implements:
// the developer chooses to add satisfies, TS validates the shape.
//
// satisfies applies excess-property checking on object literals,
// so the interface must cover all keys in the object — or use
// an intersection with Record<string, ComponentBindingValue>
// to allow extra keys in the component binding surface.
// ────────────────────────────────────────────────────────────────

interface Sortable {
  sortKey: InputSignal<string>;
  sortDirection: InputSignal<'asc' | 'desc'>;
}

const SortableTable = component({
  bindings: {
    sortKey: input.required<string>(),
    sortDirection: input.required<'asc' | 'desc'>(),
  } satisfies Sortable,
  setup: ({ sortKey, sortDirection }) => tmpl,
});

const SortableTableExtra = component({
  bindings: {
    sortKey: input.required<string>(),
    sortDirection: input.required<'asc' | 'desc'>(),
    pageSize: input<number>(),
  } satisfies Sortable & Record<string, ComponentBindingValue>,
  setup: ({ sortKey, sortDirection, pageSize }) => tmpl,
});

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

const quantityDerivationExtra = derivation({
  bindings: {
    qty: input.required<number>(),
    item: input.required<Item>(),
    discount: input<number>(),
  } satisfies QuantityBound & Record<string, DerivationBindingValue>,
  setup: ({ qty, discount }) => computed(() => qty() * (discount() ?? 1)),
});

const _NegDerivationBindingValueStillValidated = derivation({
  // @ts-expect-error derivations cannot declare model bindings
  bindings: {
    changed: model<number>(),
  } satisfies Record<string, DerivationBindingValue>,
  setup: () => computed(() => 1),
});

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

const accordionRef = ref<typeof Accordion>();
const _accordionRefType: Ref<Toggleable | undefined> = accordionRef;

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

const _NegMissingKey = component({
  bindings: {
    sortKey: input.required<string>(),
    // @ts-expect-error sortDirection is missing from Sortable
  } satisfies Sortable,
  setup: ({ sortKey }) => tmpl,
});

const _NegWrongBindingType = component({
  bindings: {
    sortKey: input.required<string>(),
    // @ts-expect-error sortDirection should be InputSignal<'asc' | 'desc'>
    sortDirection: input<number>(),
  } satisfies Sortable,
  setup: ({ sortKey, sortDirection }) => tmpl,
});

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
// 18. DIAGNOSTIC CONTRACTS — reserved names
//
// Keep these checks at the end: they validate the shape of type-level
// diagnostics, not core API behavior.
// ────────────────────────────────────────────────────────────────

type _ReservedChildrenDiag = __ValidateComponentBindings<{
  children: InputSignal<string>;
}>;
type _ReservedChildrenMsg = Assert<
  IsEqual<
    _ReservedChildrenDiag['children'],
    never
  >
>;

type _ReservedOk = __ValidateComponentBindings<{
  children: OptionalFragmentBinding<void>;
}>;
type _ReservedOkCheck = Assert<IsEqual<_ReservedOk['children'], OptionalFragmentBinding<void>>>;

type _ReservedRefDiag = __ValidateComponentBindings<{
  ref: InputSignal<string>;
}>;
type _ReservedRefMsg = Assert<
  IsEqual<
    _ReservedRefDiag['ref'],
    never
  >
>;
