// ────────────────────────────────────────────────────────────────
// 1. SOURCE LOCATION
// ────────────────────────────────────────────────────────────────

export interface ParseSourceFile {
  content: string;
  url: string;
}

export interface ParseLocation {
  file: ParseSourceFile;
  offset: number;
  line: number;
  col: number;
}

export interface SourceSpan {
  start: ParseLocation;
  end: ParseLocation;
  fullStart: ParseLocation;
  details?: string;
}

/**
 * ParseSpan and AbsoluteSourceSpan are structurally identical `{start, end}`
 * number pairs measuring different origins, so both carry a brand to keep them
 * from being interchangeable. SourceSpan has a distinct shape (ParseLocation
 * fields) and cannot be confused with either, so it needs none.
 */
export interface ParseSpan {
  readonly __brand: 'ParseSpan';
  start: number;
  end: number;
}

export interface AbsoluteSourceSpan {
  readonly __brand: 'AbsoluteSourceSpan';
  start: number;
  end: number;
}

// ────────────────────────────────────────────────────────────────
// 2. BASE NODES
// ────────────────────────────────────────────────────────────────

export interface BaseNode {
  sourceSpan: SourceSpan;
  startSourceSpan?: SourceSpan;
  endSourceSpan?: SourceSpan;
}

/**
 * Span pair for anything lifted out of the markup literal and handed to the
 * TypeScript layer: `span` is relative to the enclosing `@{ }`, `sourceSpan`
 * is absolute in the file so TypeScript diagnostics can be mapped back
 * (spec §2, DIAGNOSTIC-MAPPING).
 */
export interface BaseAST {
  span: ParseSpan;
  sourceSpan: AbsoluteSourceSpan;
}

// ────────────────────────────────────────────────────────────────
// 3. TEMPLATE ROOT & NODE UNION
// ────────────────────────────────────────────────────────────────

export interface TemplateAST extends BaseNode {
  type: 'Template';
  nodes: TemplateNode[];
}

export type TemplateNode =
  | ElementNode
  | TextNode
  | TextInterpolationNode
  | ControlFlowNode
  | TemplateDirectiveNode
  | FragmentNode
  | LetNode;

// ────────────────────────────────────────────────────────────────
// 4. ELEMENT NODE
// ────────────────────────────────────────────────────────────────

export interface ForwardMarkerNode extends BaseNode {
  type: 'ForwardMarker';
}

export interface ElementNode extends BaseNode {
  type: 'Element';
  name: string;
  forwardMarker?: ForwardMarkerNode;
  attributes: TextAttributeNode[];
  inputs: BoundAttributeNode[];
  outputs: BoundEventNode[];
  models: BoundModelNode[];
  classes: ClassBindingNode[];
  styles: StyleBindingNode[];
  animations: AnimateBindingNode[];
  references: RefNode[];
  directives: DirectiveBindingNode[];
  /**
   * Child nodes. Populated for native tags. For a component element, nested
   * content is lowered into `fragments` instead and this list stays empty.
   */
  children: TemplateNode[];
  /**
   * Fragments delivered to a component element: inline `@fragment name(...)`
   * declarations and the implicit `children` fragment.
   *
   * Always empty for a native tag — a native element has no binding surface to
   * deliver a fragment to. A standalone `@fragment` declaration nested inside a
   * native element is a `FragmentNode` in `children`, not here (spec §10.1).
   */
  fragments: FragmentNode[];
  i18n?: I18nMeta;
}

// ────────────────────────────────────────────────────────────────
// 5. ATTRIBUTE & BINDING NODES
// ────────────────────────────────────────────────────────────────

export interface ClassBindingNode extends BaseNode {
  type: 'ClassBinding';
  name: string;
  value: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

export interface StyleBindingNode extends BaseNode {
  type: 'StyleBinding';
  name: string;
  value: AST;
  unit?: string;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

export interface TextAttributeNode extends BaseNode {
  type: 'TextAttribute';
  name: string;
  value: string;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
  i18n?: I18nMeta;
}

export interface BoundAttributeNode extends BaseNode {
  type: 'BoundAttribute';
  name: string;
  value: AST;
  once: boolean;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
  i18n?: I18nMeta;
}

export interface BoundEventNode extends BaseNode {
  type: 'BoundEvent';
  /**
   * Event name. For animation callbacks this is `animate:enter` /
   * `animate:leave`; the DSL has no global-target syntax (`window:`/`document:`),
   * so there is no separate target field.
   */
  name: string;
  handler: AST;
  keySpan?: SourceSpan;
  handlerSpan?: SourceSpan;
}

export interface BoundModelNode extends BaseNode {
  type: 'BoundModel';
  name: string;
  value: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
  i18n?: I18nMeta;
}

export interface AnimateBindingNode extends BaseNode {
  type: 'AnimateBinding';
  phase: 'enter' | 'leave';
  kind: 'class' | 'event';
  value?: AST;
  handler?: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
  handlerSpan?: SourceSpan;
}

// ────────────────────────────────────────────────────────────────
// 6. REF NODES
// ────────────────────────────────────────────────────────────────

export interface RefNode extends BaseNode {
  type: 'Ref';
  target: TemplateIdentifier;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

// ────────────────────────────────────────────────────────────────
// 7. DIRECTIVE BINDING NODES
// ────────────────────────────────────────────────────────────────

export interface DirectiveBindingNode extends BaseNode {
  type: 'DirectiveBinding';
  directiveName: string;
  inputs: DirectiveInputNode[];
  outputs: DirectiveOutputNode[];
  models: DirectiveModelNode[];
  fragments: DirectiveFragmentNode[];
  when?: DirectiveWhenNode;
  ref?: RefNode;
  keySpan?: SourceSpan;
}

export interface DirectiveInputNode extends BaseNode {
  type: 'DirectiveInput';
  name: string;
  value: AST;
  once: boolean;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

export interface DirectiveOutputNode extends BaseNode {
  type: 'DirectiveOutput';
  name: string;
  handler: AST;
  keySpan?: SourceSpan;
  handlerSpan?: SourceSpan;
}

export interface DirectiveModelNode extends BaseNode {
  type: 'DirectiveModel';
  name: string;
  value: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

export interface DirectiveFragmentNode extends BaseNode {
  type: 'DirectiveFragment';
  name: string;
  value: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

export interface DirectiveWhenNode extends BaseNode {
  type: 'DirectiveWhen';
  condition: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

// ────────────────────────────────────────────────────────────────
// 8. TEXT & INTERPOLATION NODES
// ────────────────────────────────────────────────────────────────

export interface TextNode extends BaseNode {
  type: 'Text';
  value: string;
}

export interface TextInterpolationNode extends BaseNode {
  type: 'TextInterpolation';
  expression: AST;
  i18n?: I18nMeta;
}

// ────────────────────────────────────────────────────────────────
// 9. @let DECLARATION
// ────────────────────────────────────────────────────────────────

export interface LetNode extends BaseNode {
  type: 'Let';
  name: string;
  value: AST;
}

// ────────────────────────────────────────────────────────────────
// 10. CONTROL FLOW
// ────────────────────────────────────────────────────────────────

export type ControlFlowNode =
  | IfNode
  | ForNode
  | SwitchNode;

export interface IfNode extends BaseNode {
  type: 'If';
  branches: IfBranchNode[];
}

export type IfBranchNode = IfConditionBranch | ElseBranch;

export interface IfConditionBranch extends BaseNode {
  type: 'IfConditionBranch';
  expression: AST;
  expressionAlias?: string;
  children: TemplateNode[];
}

export interface ElseBranch extends BaseNode {
  type: 'ElseBranch';
  children: TemplateNode[];
}

export interface ForNode extends BaseNode {
  type: 'For';
  itemName: string;
  itemSpan: SourceSpan;
  expression: AST;
  trackBy: AST;
  children: TemplateNode[];
  empty?: ForEmptyNode;
  contextVariables: ForContextVariable[];
}

export interface ForContextVariable {
  kind: '$index' | '$count' | '$first' | '$last' | '$even' | '$odd';
  alias?: string;
}

export interface ForEmptyNode extends BaseNode {
  type: 'ForEmpty';
  children: TemplateNode[];
}

export interface SwitchNode extends BaseNode {
  type: 'Switch';
  expression: AST;
  cases: SwitchBranchNode[];
}

export type SwitchBranchNode = SwitchCaseNode | SwitchDefaultNode;

export interface SwitchCaseNode extends BaseNode {
  type: 'SwitchCase';
  expression: AST;
  children: TemplateNode[];
}

export interface SwitchDefaultNode extends BaseNode {
  type: 'SwitchDefault';
  children: TemplateNode[];
}

// ────────────────────────────────────────────────────────────────
// 11. TEMPLATE DIRECTIVES — @render, @derive
// ────────────────────────────────────────────────────────────────

export type TemplateDirectiveNode =
  | RenderNode
  | DeriveNode;

export interface RenderNode extends BaseNode {
  type: 'Render';
  expression: AST;
  options?: RenderOptionsNode;
}

export interface RenderOptionsNode extends BaseNode {
  type: 'RenderOptions';
  injector?: AST;
}

export interface DeriveNode extends BaseNode {
  type: 'Derive';
  name: string;
  derivation: TemplateIdentifier;
  inputs: DerivationInputNode[];
}

export interface DerivationInputNode extends BaseNode {
  type: 'DerivationInput';
  name: string;
  value: AST;
  once: boolean;
}

// ────────────────────────────────────────────────────────────────
// 12. FRAGMENT NODES
// ────────────────────────────────────────────────────────────────

export interface FragmentNode extends BaseNode {
  type: 'Fragment';
  name: string;
  origin: 'explicit' | 'implicitChildren';
  parameters: FragmentParameterNode[];
  children: TemplateNode[];
}

export interface FragmentParameterNode extends BaseNode {
  type: 'FragmentParameter';
  name: string;
  typeAnnotation: TypeNode;
}

// ────────────────────────────────────────────────────────────────
// 13. EXPRESSIONS
//
// Template expressions are plain TypeScript expressions. The `.ng` parser
// owns the template grammar; each `{ ... }` region is handed to the
// TypeScript parser, and the resulting expression node is carried opaquely
// here. Typing is TypeScript's job — see spec §2 (EXPRESSION,
// RESTRICTED-FORMS, DIAGNOSTIC-MAPPING).
//
// This file deliberately does not model expression internals. A curated
// subset would have to track TypeScript's grammar forever, and every
// omission becomes a construct the DSL silently cannot express.
//
// TNode is generic so this file stays dependency-free as a specification;
// a compiler instantiates it with `ts.Expression`.
// ────────────────────────────────────────────────────────────────

export interface TemplateExpression<TNode = unknown> extends BaseAST {
  readonly __brand: 'TemplateExpression';
  /** The TypeScript expression parsed from this region. */
  readonly node: TNode;
}

/**
 * Alias kept so every binding/handler/condition site reads as `AST`, matching
 * the spec's `Γ ⊢ e : T` judgments.
 *
 * Note on TNode: the node interfaces below declare bare `AST`, i.e.
 * `TemplateExpression<unknown>`. A typed expression is assignable *into* a
 * node, but reading `node.value.node` back yields `unknown` — a compiler
 * narrows once at the boundary. Threading TNode through every node interface
 * would parameterize the whole tree for little gain in a specification.
 */
export type AST<TNode = unknown> = TemplateExpression<TNode>;

/**
 * A single lexical name. Used where the DSL grammar admits only a bare
 * identifier rather than an arbitrary expression (spec §1): `ref` targets and
 * the derivation reference in `@derive name = derivation(...)`.
 */
export interface TemplateIdentifier extends BaseAST {
  readonly __brand: 'TemplateIdentifier';
  name: string;
}

// ────────────────────────────────────────────────────────────────
// 14. METADATA TYPES
// ────────────────────────────────────────────────────────────────

export type TypeNode =
  | TypeReference
  | UnionType
  | IntersectionType
  | TupleType
  | ArrayType
  | TypeLiteral
  | KeywordType
  | FunctionType
  | ObjectLiteralType
  | IndexedAccessType
  | ConditionalType
  | MappedType
  | InferType
  | TemplateLiteralType
  | TypeofType
  | KeyofType
  | RestType
  | ParenthesizedType;

export interface TypeReference {
  kind: 'TypeReference';
  name: string;
  typeArguments?: TypeNode[];
}

export interface UnionType {
  kind: 'UnionType';
  types: TypeNode[];
}

export interface IntersectionType {
  kind: 'IntersectionType';
  types: TypeNode[];
}

export interface TupleType {
  kind: 'TupleType';
  elements: TupleElement[];
}

export interface TupleElement {
  type: TypeNode;
  label?: string;
  optional?: boolean;
  rest?: boolean;
}

export interface ArrayType {
  kind: 'ArrayType';
  elementType: TypeNode;
}

export interface TypeLiteral {
  kind: 'TypeLiteral';
  value: string | number | boolean | bigint | null;
}

export interface KeywordType {
  kind: 'KeywordType';
  keyword: 'string' | 'number' | 'boolean' | 'void' | 'never' | 'any' | 'unknown' | 'undefined' | 'null' | 'object' | 'symbol' | 'bigint';
}

export interface FunctionType {
  kind: 'FunctionType';
  parameters: FunctionTypeParameter[];
  returnType: TypeNode;
  typeParameters?: TypeParameterDeclaration[];
}

export interface FunctionTypeParameter {
  name: string;
  type: TypeNode;
  optional?: boolean;
  rest?: boolean;
}

export interface TypeParameterDeclaration {
  name: string;
  constraint?: TypeNode;
  default?: TypeNode;
}

export interface ObjectLiteralType {
  kind: 'ObjectLiteralType';
  members: ObjectTypeMember[];
}

export interface ObjectTypeMember {
  name: string;
  type: TypeNode;
  optional?: boolean;
  readonly?: boolean;
}

export interface IndexedAccessType {
  kind: 'IndexedAccessType';
  objectType: TypeNode;
  indexType: TypeNode;
}

export interface ConditionalType {
  kind: 'ConditionalType';
  checkType: TypeNode;
  extendsType: TypeNode;
  trueType: TypeNode;
  falseType: TypeNode;
}

export interface MappedType {
  kind: 'MappedType';
  typeParameter: TypeParameterDeclaration;
  nameType?: TypeNode;
  type: TypeNode;
  optional?: '+' | '-' | boolean;
  readonly?: '+' | '-' | boolean;
}

export interface InferType {
  kind: 'InferType';
  typeParameter: TypeParameterDeclaration;
}

export interface TemplateLiteralType {
  kind: 'TemplateLiteralType';
  head: string;
  spans: TemplateLiteralSpan[];
}

export interface TemplateLiteralSpan {
  type: TypeNode;
  literal: string;
}

export interface TypeofType {
  kind: 'TypeofType';
  expression: string;
}

export interface KeyofType {
  kind: 'KeyofType';
  type: TypeNode;
}

export interface RestType {
  kind: 'RestType';
  type: TypeNode;
}

export interface ParenthesizedType {
  kind: 'ParenthesizedType';
  type: TypeNode;
}

/**
 * Extraction metadata attached by the i18n pipeline. Carried by the AST so the
 * shape is not lost, but no judgment in the type-checking spec reads it —
 * i18n is out of scope there.
 */
export interface I18nMeta {
  id?: string;
  customId?: string;
  legacyIds?: string[];
  description?: string;
  meaning?: string;
}

// ────────────────────────────────────────────────────────────────
// 15. VISITOR
// ────────────────────────────────────────────────────────────────

/**
 * All methods are optional: a visitor implements only the node kinds it cares
 * about, and `walkAll` skips the rest while still traversing children.
 */
export interface TemplateAstVisitor<T = void> {
  visitElement?(element: ElementNode, context: T): void;
  visitForwardMarker?(marker: ForwardMarkerNode, context: T): void;
  visitText?(text: TextNode, context: T): void;
  visitTextInterpolation?(interpolation: TextInterpolationNode, context: T): void;
  visitLet?(letNode: LetNode, context: T): void;
  visitFragment?(fragmentNode: FragmentNode, context: T): void;
  visitIf?(ifNode: IfNode, context: T): void;
  visitIfConditionBranch?(branch: IfConditionBranch, context: T): void;
  visitElseBranch?(branch: ElseBranch, context: T): void;
  visitFor?(forNode: ForNode, context: T): void;
  visitForEmpty?(forEmpty: ForEmptyNode, context: T): void;
  visitSwitch?(switchNode: SwitchNode, context: T): void;
  visitSwitchCase?(switchCase: SwitchCaseNode, context: T): void;
  visitSwitchDefault?(switchDefault: SwitchDefaultNode, context: T): void;
  visitRender?(renderNode: RenderNode, context: T): void;
  visitDerive?(deriveNode: DeriveNode, context: T): void;
  visitDerivationInput?(input: DerivationInputNode, context: T): void;
  visitTextAttribute?(attr: TextAttributeNode, context: T): void;
  visitBoundAttribute?(attr: BoundAttributeNode, context: T): void;
  visitBoundEvent?(event: BoundEventNode, context: T): void;
  visitBoundModel?(model: BoundModelNode, context: T): void;
  visitClassBinding?(classBinding: ClassBindingNode, context: T): void;
  visitStyleBinding?(styleBinding: StyleBindingNode, context: T): void;
  visitAnimateBinding?(animate: AnimateBindingNode, context: T): void;
  visitRef?(ref: RefNode, context: T): void;
  visitDirectiveBinding?(directive: DirectiveBindingNode, context: T): void;
  visitDirectiveInput?(input: DirectiveInputNode, context: T): void;
  visitDirectiveOutput?(output: DirectiveOutputNode, context: T): void;
  visitDirectiveModel?(model: DirectiveModelNode, context: T): void;
  visitDirectiveFragment?(fragment: DirectiveFragmentNode, context: T): void;
  visitDirectiveWhen?(when: DirectiveWhenNode, context: T): void;
  visitFragmentParameter?(param: FragmentParameterNode, context: T): void;
  visitRenderOptions?(options: RenderOptionsNode, context: T): void;
}

// ────────────────────────────────────────────────────────────────
// 16. TRAVERSAL UTILITIES
// ────────────────────────────────────────────────────────────────

export function walkAll<T>(nodes: TemplateNode[], visitor: TemplateAstVisitor<T>, context: T): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'Element':
        visitor.visitElement?.(node, context);
        if (node.forwardMarker) visitor.visitForwardMarker?.(node.forwardMarker, context);
        for (const attr of node.attributes) visitor.visitTextAttribute?.(attr, context);
        for (const input of node.inputs) visitor.visitBoundAttribute?.(input, context);
        for (const output of node.outputs) visitor.visitBoundEvent?.(output, context);
        for (const model of node.models) visitor.visitBoundModel?.(model, context);
        for (const cls of node.classes) visitor.visitClassBinding?.(cls, context);
        for (const sty of node.styles) visitor.visitStyleBinding?.(sty, context);
        for (const anim of node.animations) visitor.visitAnimateBinding?.(anim, context);
        for (const ref of node.references) visitor.visitRef?.(ref, context);
        for (const dir of node.directives) {
          visitor.visitDirectiveBinding?.(dir, context);
          for (const input of dir.inputs) visitor.visitDirectiveInput?.(input, context);
          for (const output of dir.outputs) visitor.visitDirectiveOutput?.(output, context);
          for (const model of dir.models) visitor.visitDirectiveModel?.(model, context);
          for (const frag of dir.fragments) visitor.visitDirectiveFragment?.(frag, context);
          if (dir.when) visitor.visitDirectiveWhen?.(dir.when, context);
          if (dir.ref) visitor.visitRef?.(dir.ref, context);
        }
        for (const frag of node.fragments) {
          visitor.visitFragment?.(frag, context);
          for (const param of frag.parameters) visitor.visitFragmentParameter?.(param, context);
          walkAll(frag.children, visitor, context);
        }
        walkAll(node.children, visitor, context);
        break;
      case 'Text':
        visitor.visitText?.(node, context);
        break;
      case 'TextInterpolation':
        visitor.visitTextInterpolation?.(node, context);
        break;
      case 'Let':
        visitor.visitLet?.(node, context);
        break;
      case 'If':
        visitor.visitIf?.(node, context);
        for (const branch of node.branches) {
          if (branch.type === 'IfConditionBranch') {
            visitor.visitIfConditionBranch?.(branch, context);
          } else {
            visitor.visitElseBranch?.(branch, context);
          }
          walkAll(branch.children, visitor, context);
        }
        break;
      case 'For':
        visitor.visitFor?.(node, context);
        walkAll(node.children, visitor, context);
        if (node.empty) {
          visitor.visitForEmpty?.(node.empty, context);
          walkAll(node.empty.children, visitor, context);
        }
        break;
      case 'Switch':
        visitor.visitSwitch?.(node, context);
        for (const branch of node.cases) {
          if (branch.type === 'SwitchCase') {
            visitor.visitSwitchCase?.(branch, context);
          } else {
            visitor.visitSwitchDefault?.(branch, context);
          }
          walkAll(branch.children, visitor, context);
        }
        break;
      case 'Render':
        visitor.visitRender?.(node, context);
        if (node.options) visitor.visitRenderOptions?.(node.options, context);
        break;
      case 'Derive':
        visitor.visitDerive?.(node, context);
        for (const input of node.inputs) visitor.visitDerivationInput?.(input, context);
        break;
      case 'Fragment':
        visitor.visitFragment?.(node, context);
        for (const param of node.parameters) visitor.visitFragmentParameter?.(param, context);
        walkAll(node.children, visitor, context);
        break;
    }
  }
}
