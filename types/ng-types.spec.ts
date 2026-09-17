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
  type ComponentTemplateOf,
  type DerivationBindingValue,
  type DerivationInstance,
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
  type Surface,
  type __ValidateComponentBindings,
  component,
  derivation,
  directive,
  fragment,
  inject,
  injectionToken,
  provide,
  ref,
  refMany,
  surface,
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

// A declared forward surface does not change how bindings are inferred.
const UserDetail = component({
  forward: surface<HTMLElement>(),
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

// The bindings record is inferred from the object, not hand-written: the
// UserDetailBindings alias must stay in sync with what component(...)
// actually infers.
type _UserDetailBindingsInferred = Assert<
  IsEqual<
    typeof UserDetail extends ComponentInstance<infer B, any, any, any>
      ? B
      : never,
    UserDetailBindings
  >
>;

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
const _NegChildrenMustBeFragment = component({
  // @ts-expect-error reserved name 'children' must use fragment(...)
  bindings: {
    children: input<string>(),
  },
  setup: () => tmpl,
});

// - ref cannot be used as a binding name in components
const _NegRefReserved = component({
  // @ts-expect-error reserved name 'ref' cannot be a component binding
  bindings: {
    ref: input<string>(),
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

// input<T>() vs input<T>(default): supplying a default removes undefined from
// the signal type. This is the distinction that decides what a provider factory
// closing over the input is allowed to return (see §7).
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

// Optional *parameterized* fragment: undefined in setup, and still requires its
// declared arguments once narrowed. Mirrors the readme's DataTable rowTemplate.
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

// A provider factory may close over an input and pass the InputSignal itself
// as a () => T getter (the readme's input-driven CounterStore).
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

// An input without a default reads as T | undefined, so it is not assignable
// where the factory must return T. Documented examples have hit this.
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

// Zero-parameter setup returning expose: neither bindings nor host are needed
// in the body, and the expose still flows through ref (readme's tooltip sketch).
const toggleOnly = directive({
  host: ref<HTMLElement>(),
  setup: () => ({ toggle: () => {} }),
});

const toggleOnlyRef = ref<typeof toggleOnly>();
const _toggleOnlyRefType: Ref<{ toggle: () => void } | undefined> =
  toggleOnlyRef;

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
// 11. COMPONENT — forward surface
//
// `forward: surface<S>()` declares the surface in a value position, so one
// component(...) signature covers plain and forwarding components: with the
// key present S is inferred from it, with the key absent there is no
// inference site and S falls back to its `never` default.
// ────────────────────────────────────────────────────────────────

const ForwardingButton = component({
  forward: surface<HTMLButtonElement>(),
  setup: () => tmpl,
});
type _ForwardingButtonType = Assert<
  IsEqual<
    typeof ForwardingButton,
    ComponentInstance<{}, void, HTMLButtonElement>
  >
>;

// WITH bindings: S, B, E and TMarkup are all inferred from one config object —
// no type argument anywhere. Mirrors the readme's Button (forwarding directives
// to an internal element), including class/style binding names aliased in setup.
const ButtonWithBindings = component({
  forward: surface<HTMLButtonElement>(),
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

// The bindings record is inferred from the object — never hand-written.
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

// TemplateMarkup<TAst> survives a config carrying `forward`.
// RESOLVED-FORWARD-HOSTS reads T(C) to locate the single @forward() placement,
// so a forwarding component is precisely the case that must not lose its
// template AST.
type _ForwardingKeepsTemplateAst = Assert<
  IsEqual<
    TemplateAstOf<ComponentTemplateOf<typeof ButtonWithBindings>>,
    SpecificTemplateAST
  >
>;

const _NegInvalidSurface = component({
  // @ts-expect-error forward surface must be an HTMLElement subtype
  forward: surface<string>(),
  setup: () => tmpl,
});

const _NegComponentAsSurface = component({
  // @ts-expect-error component instances are not valid forward surface types
  forward: surface<typeof UserDetail>(),
  setup: () => tmpl,
});

const _NegDirectiveAsSurface = component({
  // @ts-expect-error directive instances are not valid forward surface types
  forward: surface<typeof tooltip>(),
  setup: () => tmpl,
});

// The surface is a declaration, not a binding: it is never visible in setup
// and cannot be smuggled into the bindings record.
const _NegSurfaceInSetup = component({
  forward: surface<HTMLElement>(),
  bindings: {
    label: input<string>(),
  },
  setup: (bindings) => {
    // @ts-expect-error forward surface metadata is not visible in setup bindings
    bindings.forward;
    return tmpl;
  },
});
type _SurfaceIsNotABindingValue = Assert<
  IsEqual<Surface<HTMLElement> extends ComponentBindingValue ? true : false, false>
>;

// A second forward surface, used by §12's directive-compatibility checks.
const ForwardingInput = component({
  forward: surface<HTMLInputElement>(),
  setup: () => tmpl,
});
type _ForwardingInputType = Assert<
  IsEqual<typeof ForwardingInput, ComponentInstance<{}, void, HTMLInputElement>>
>;

// `forward` omitted: no inference site, so F(C) = never.
const NoForwardingTarget = component({
  setup: () => tmpl,
});
type _NoForwardSurface = Assert<
  IsEqual<typeof NoForwardingTarget, ComponentInstance<{}, void, never>>
>;

// ────────────────────────────────────────────────────────────────
// 12. DIRECTIVE — forwarding compatibility
//
// Directive host must accept the component's forward surface.
// ────────────────────────────────────────────────────────────────

type ForwardSurfaceOf<C extends ComponentInstance<any, any, any>> =
  C extends ComponentInstance<any, any, infer S> ? S : never;
type DirectiveHost<D extends DirectiveInstance<any, any, any>> =
  D extends DirectiveInstance<infer H, any, any> ? H : never;
type DirectiveFitsForwardSurface<
  C extends ComponentInstance<any, any, any>,
  D extends DirectiveInstance<any, any, any>,
> =
  ForwardSurfaceOf<C> extends never
    ? false
    : ForwardSurfaceOf<C> extends DirectiveHost<D>
      ? true
      : false;

type _ButtonAcceptsButtonDirective = Assert<
  IsEqual<
    DirectiveFitsForwardSurface<typeof ForwardingButton, typeof buttonOnly>,
    true
  >
>;
type _ButtonAcceptsGenericDirective = Assert<
  IsEqual<
    DirectiveFitsForwardSurface<typeof ForwardingButton, typeof tooltip>,
    true
  >
>;
// @ts-expect-error input-host directive cannot attach to a button forward surface
const _negButtonRejectsInputDirective: DirectiveFitsForwardSurface<
  typeof ForwardingButton,
  typeof inputOnly
> = true;

type _InputAcceptsInputDirective = Assert<
  IsEqual<
    DirectiveFitsForwardSurface<typeof ForwardingInput, typeof inputOnly>,
    true
  >
>;
type _InputAcceptsGenericDirective = Assert<
  IsEqual<
    DirectiveFitsForwardSurface<typeof ForwardingInput, typeof tooltip>,
    true
  >
>;
// @ts-expect-error button-host directive cannot attach to an input forward surface
const _negInputRejectsButtonDirective: DirectiveFitsForwardSurface<
  typeof ForwardingInput,
  typeof buttonOnly
> = true;

type _PlainComponentRejectsDirective = Assert<
  IsEqual<
    DirectiveFitsForwardSurface<typeof NoForwardingTarget, typeof tooltip>,
    false
  >
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

// Derivation without bindings: setup receives no args
const simple = derivation({
  setup: () => computed(() => 42),
});

const _simpleType: DerivationInstance<{}, number> = simple;

// Derivation must reject non-input bindings
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
const _negAutoProvidedNoFactory = injectionToken<string>({
  // @ts-expect-error autoProvided: true requires a factory
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
// 15. INJECT
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
// 16. PROVIDE
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

// Extra bindings: the Record intersection needs a surface-specific alias, same
// as the component case above — hence DerivationBindingValue is exported.
const quantityDerivationExtra = derivation({
  bindings: {
    qty: input.required<number>(),
    item: input.required<Item>(),
    discount: input<number>(),
  } satisfies QuantityBound & Record<string, DerivationBindingValue>,
  setup: ({ qty, discount }) => computed(() => qty() * (discount() ?? 1)),
});

// The alias is pre-validation: ValidateDerivationBindings still rejects
// non-inputs, so widening with it cannot smuggle a model in.
const _NegDerivationBindingValueStillValidated = derivation({
  // @ts-expect-error derivations cannot declare model bindings
  bindings: {
    changed: model<number>(),
  } satisfies Record<string, DerivationBindingValue>,
  setup: () => computed(() => 1),
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

// ref is reserved — any binding named 'ref' on a component is an error
type _ReservedRefDiag = __ValidateComponentBindings<{
  ref: InputSignal<string>;
}>;
type _ReservedRefMsg = Assert<
  IsEqual<
    _ReservedRefDiag['ref'],
    never
  >
>;
