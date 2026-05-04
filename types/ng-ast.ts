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

/**
 * Nested DOM content is lowered by the parser into a synthetic
 * FragmentNode { name: 'children', parameters: [], children: [...] }
 * appended to the `fragments` array. There is no separate `children`
 * field — implicit children and explicit @fragment declarations
 * share the same representation.
 */
export interface ElementNode extends BaseNode {
  type: 'Element';
  name: string;
  forwardMarker?: ForwardMarkerNode;
  attributes: TextAttributeNode[];
  inputs: BoundAttributeNode[];
  outputs: BoundEventNode[];
  models: BoundModelNode[];
  directives: DirectiveBindingNode[];
  references: RefNode[];
  fragments: FragmentNode[];
  i18n?: I18nMeta;
}

// ────────────────────────────────────────────────────────────────
// 5. ATTRIBUTE & BINDING NODES
// ────────────────────────────────────────────────────────────────

export enum BindingType {
  Property = 0,
  Attribute = 1,
  Class = 2,
  Style = 3,
  Animation = 4,
  Input = 5,
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
  bindingType: BindingType;
  value: AST;
  once: boolean;
  isShorthand?: boolean;
  unit?: string;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
  i18n?: I18nMeta;
}

export interface BoundEventNode extends BaseNode {
  type: 'BoundEvent';
  name: string;
  target?: string;
  phase?: string;
  handler: AST;
  isShorthand?: boolean;
  keySpan?: SourceSpan;
  handlerSpan?: SourceSpan;
}

export interface BoundModelNode extends BaseNode {
  type: 'BoundModel';
  name: string;
  value: AST;
  isShorthand?: boolean;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
  i18n?: I18nMeta;
}

/**
 * Unified ref node for elements, components, and directives.
 * `target` is always a Variable — the framework wires it at creation time.
 */
export interface RefNode extends BaseNode {
  type: 'Ref';
  target: Variable;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

// ────────────────────────────────────────────────────────────────
// 6. DIRECTIVE BINDING NODES
// ────────────────────────────────────────────────────────────────

export interface DirectiveBindingNode extends BaseNode {
  type: 'DirectiveBinding';
  directiveName: string;
  inputs: DirectiveInputNode[];
  outputs: DirectiveOutputNode[];
  models: DirectiveModelNode[];
  when?: DirectiveWhenNode;
  ref?: RefNode;
  keySpan?: SourceSpan;
}

export interface DirectiveInputNode extends BaseNode {
  type: 'DirectiveInput';
  name: string;
  value: AST;
  once: boolean;
  isShorthand?: boolean;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

export interface DirectiveOutputNode extends BaseNode {
  type: 'DirectiveOutput';
  name: string;
  handler: AST;
  isShorthand?: boolean;
  keySpan?: SourceSpan;
  handlerSpan?: SourceSpan;
}

export interface DirectiveModelNode extends BaseNode {
  type: 'DirectiveModel';
  name: string;
  value: AST;
  isShorthand?: boolean;
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
// 7. TEXT & INTERPOLATION NODES
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
// 8. @let DECLARATION
// ────────────────────────────────────────────────────────────────

export interface LetNode extends BaseNode {
  type: 'Let';
  name: string;
  value: AST;
}

// ────────────────────────────────────────────────────────────────
// 9. CONTROL FLOW
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
// 10. TEMPLATE DIRECTIVES — @render, @derive
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
  derivation: AST;
  inputs: DerivationInputNode[];
}

export interface DerivationInputNode extends BaseNode {
  type: 'DerivationInput';
  name: string;
  value: AST;
}

// ────────────────────────────────────────────────────────────────
// 11. FRAGMENT NODES
// ────────────────────────────────────────────────────────────────

export interface FragmentNode extends BaseNode {
  type: 'Fragment';
  name: string;
  parameters: FragmentParameterNode[];
  children: TemplateNode[];
}

export interface FragmentParameterNode extends BaseNode {
  type: 'FragmentParameter';
  name: string;
  typeAnnotation: TypeNode;
}

// ────────────────────────────────────────────────────────────────
// 12. EXPRESSION AST
// ────────────────────────────────────────────────────────────────

export type AST =
  | LiteralPrimitive
  | LiteralArray
  | LiteralMap
  | Binary
  | Conditional
  | PropertyRead
  | PropertyWrite
  | SafePropertyRead
  | KeyedRead
  | KeyedWrite
  | FunctionCall
  | SafeMethodCall
  | MethodCall
  | Variable
  | Unary;

export interface LiteralPrimitive extends BaseAST {
  type: 'LiteralPrimitive';
  value: string | number | boolean | null | undefined;
}

export interface LiteralArray extends BaseAST {
  type: 'LiteralArray';
  expressions: AST[];
}

export interface LiteralMap extends BaseAST {
  type: 'LiteralMap';
  keys: LiteralMapKey[];
  values: AST[];
}

export interface LiteralMapKey {
  key: string;
  quoted: boolean;
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '===' | '!=='
  | '<' | '>' | '<=' | '>='
  | '&&' | '||' | '??';

export interface Binary extends BaseAST {
  type: 'Binary';
  operation: BinaryOperator;
  left: AST;
  right: AST;
}

export interface Conditional extends BaseAST {
  type: 'Conditional';
  condition: AST;
  trueExp: AST;
  falseExp: AST;
}

export interface PropertyRead extends BaseAST {
  type: 'PropertyRead';
  receiver: AST;
  name: string;
}

export interface PropertyWrite extends BaseAST {
  type: 'PropertyWrite';
  receiver: AST;
  name: string;
  value: AST;
}

export interface SafePropertyRead extends BaseAST {
  type: 'SafePropertyRead';
  receiver: AST;
  name: string;
}

export interface KeyedRead extends BaseAST {
  type: 'KeyedRead';
  receiver: AST;
  key: AST;
}

export interface KeyedWrite extends BaseAST {
  type: 'KeyedWrite';
  receiver: AST;
  key: AST;
  value: AST;
}

export interface FunctionCall extends BaseAST {
  type: 'FunctionCall';
  target: AST | null;
  name: string;
  args: AST[];
}

export interface SafeMethodCall extends BaseAST {
  type: 'SafeMethodCall';
  receiver: AST;
  name: string;
  args: AST[];
}

export interface MethodCall extends BaseAST {
  type: 'MethodCall';
  receiver: AST;
  name: string;
  args: AST[];
}

export interface Variable extends BaseAST {
  type: 'Variable';
  name: string;
}

export type UnaryOperator = '-' | '+' | '!';

export interface Unary extends BaseAST {
  type: 'Unary';
  operator: UnaryOperator;
  expression: AST;
}

// ────────────────────────────────────────────────────────────────
// 13. METADATA TYPES
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

export interface I18nMeta {
  id?: string;
  customId?: string;
  legacyIds?: string[];
  description?: string;
  meaning?: string;
}

// ────────────────────────────────────────────────────────────────
// 14. VISITOR
// ────────────────────────────────────────────────────────────────

export interface TemplateAstVisitor<T = void> {
  visitElement(element: ElementNode, context: T): void;
  visitText(text: TextNode, context: T): void;
  visitTextInterpolation(interpolation: TextInterpolationNode, context: T): void;
  visitLet(letNode: LetNode, context: T): void;
  visitFragment(fragmentNode: FragmentNode, context: T): void;
  visitIf(ifNode: IfNode, context: T): void;
  visitIfConditionBranch(branch: IfConditionBranch, context: T): void;
  visitElseBranch(branch: ElseBranch, context: T): void;
  visitFor(forNode: ForNode, context: T): void;
  visitForEmpty(forEmpty: ForEmptyNode, context: T): void;
  visitSwitch(switchNode: SwitchNode, context: T): void;
  visitSwitchCase(switchCase: SwitchCaseNode, context: T): void;
  visitSwitchDefault(switchDefault: SwitchDefaultNode, context: T): void;
  visitRender(renderNode: RenderNode, context: T): void;
  visitDerive(deriveNode: DeriveNode, context: T): void;
  visitDerivationInput(input: DerivationInputNode, context: T): void;
  visitTextAttribute(attr: TextAttributeNode, context: T): void;
  visitBoundAttribute(attr: BoundAttributeNode, context: T): void;
  visitBoundEvent(event: BoundEventNode, context: T): void;
  visitBoundModel(model: BoundModelNode, context: T): void;
  visitRef(ref: RefNode, context: T): void;
  visitDirectiveBinding(directive: DirectiveBindingNode, context: T): void;
  visitDirectiveInput(input: DirectiveInputNode, context: T): void;
  visitDirectiveOutput(output: DirectiveOutputNode, context: T): void;
  visitDirectiveModel(model: DirectiveModelNode, context: T): void;
  visitDirectiveWhen(when: DirectiveWhenNode, context: T): void;
  visitFragmentParameter(param: FragmentParameterNode, context: T): void;
  visitRenderOptions(options: RenderOptionsNode, context: T): void;
}

// ────────────────────────────────────────────────────────────────
// 15. TRAVERSAL UTILITIES
// ────────────────────────────────────────────────────────────────

export function walkAll<T>(nodes: TemplateNode[], visitor: TemplateAstVisitor<T>, context: T): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'Element':
        visitor.visitElement(node, context);
        for (const attr of node.attributes) visitor.visitTextAttribute(attr, context);
        for (const input of node.inputs) visitor.visitBoundAttribute(input, context);
        for (const output of node.outputs) visitor.visitBoundEvent(output, context);
        for (const model of node.models) visitor.visitBoundModel(model, context);
        for (const ref of node.references) visitor.visitRef(ref, context);
        for (const dir of node.directives) {
          visitor.visitDirectiveBinding(dir, context);
          for (const input of dir.inputs) visitor.visitDirectiveInput(input, context);
          for (const output of dir.outputs) visitor.visitDirectiveOutput(output, context);
          for (const model of dir.models) visitor.visitDirectiveModel(model, context);
          if (dir.when) visitor.visitDirectiveWhen(dir.when, context);
          if (dir.ref) visitor.visitRef(dir.ref, context);
        }
        for (const frag of node.fragments) {
          visitor.visitFragment(frag, context);
          for (const param of frag.parameters) visitor.visitFragmentParameter(param, context);
          walkAll(frag.children, visitor, context);
        }
        break;
      case 'Text':
        visitor.visitText(node, context);
        break;
      case 'TextInterpolation':
        visitor.visitTextInterpolation(node, context);
        break;
      case 'Let':
        visitor.visitLet(node, context);
        break;
      case 'If':
        visitor.visitIf(node, context);
        for (const branch of node.branches) {
          if (branch.type === 'IfConditionBranch') {
            visitor.visitIfConditionBranch(branch, context);
          } else {
            visitor.visitElseBranch(branch, context);
          }
          walkAll(branch.children, visitor, context);
        }
        break;
      case 'For':
        visitor.visitFor(node, context);
        walkAll(node.children, visitor, context);
        if (node.empty) {
          visitor.visitForEmpty(node.empty, context);
          walkAll(node.empty.children, visitor, context);
        }
        break;
      case 'Switch':
        visitor.visitSwitch(node, context);
        for (const branch of node.cases) {
          if (branch.type === 'SwitchCase') {
            visitor.visitSwitchCase(branch, context);
          } else {
            visitor.visitSwitchDefault(branch, context);
          }
          walkAll(branch.children, visitor, context);
        }
        break;
      case 'Render':
        visitor.visitRender(node, context);
        if (node.options) visitor.visitRenderOptions(node.options, context);
        break;
      case 'Derive':
        visitor.visitDerive(node, context);
        for (const input of node.inputs) visitor.visitDerivationInput(input, context);
        break;
      case 'Fragment':
        visitor.visitFragment(node, context);
        for (const param of node.parameters) visitor.visitFragmentParameter(param, context);
        walkAll(node.children, visitor, context);
        break;
    }
  }
}

export function findElementsByName(ast: TemplateAST, name: string): ElementNode[] {
  const elements: ElementNode[] = [];
  const noop = () => {};
  const visitor: TemplateAstVisitor<void> = {
    visitElement: (element) => {
      if (element.name === name) elements.push(element);
    },
    visitText: noop,
    visitTextInterpolation: noop,
    visitLet: noop,
    visitFragment: noop,
    visitIf: noop,
    visitIfConditionBranch: noop,
    visitElseBranch: noop,
    visitFor: noop,
    visitForEmpty: noop,
    visitSwitch: noop,
    visitSwitchCase: noop,
    visitSwitchDefault: noop,
    visitRender: noop,
    visitDerive: noop,
    visitDerivationInput: noop,
    visitTextAttribute: noop,
    visitBoundAttribute: noop,
    visitBoundEvent: noop,
    visitBoundModel: noop,
    visitRef: noop,
    visitDirectiveBinding: noop,
    visitDirectiveInput: noop,
    visitDirectiveOutput: noop,
    visitDirectiveModel: noop,
    visitDirectiveWhen: noop,
    visitFragmentParameter: noop,
    visitRenderOptions: noop,
  };
  walkAll(ast.nodes, visitor, undefined as void);
  return elements;
}
