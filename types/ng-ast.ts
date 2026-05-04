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
  start: number;
  end: number;
}

export interface AbsoluteSourceSpan {
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

export interface TemplateAST {
  type: 'Template';
  nodes: TemplateNode[];
  sourceSpan: SourceSpan;
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
//
// Represents both native HTML elements and component elements.
// isForwarded corresponds to @forward() in the template DSL.
// ────────────────────────────────────────────────────────────────

export interface ElementNode extends BaseNode {
  type: 'Element';
  name: string;
  isForwarded?: boolean;
  attributes: TextAttributeNode[];
  inputs: BoundAttributeNode[];
  outputs: BoundEventNode[];
  models: BoundModelNode[];
  directives: DirectiveBindingNode[];
  references: ReferenceNode[];
  children: TemplateNode[];
  fragments: FragmentNode[];
  i18n?: I18nMeta;
}

// ────────────────────────────────────────────────────────────────
// 5. ATTRIBUTE & BINDING NODES
//
// TextAttributeNode: static attribute (e.g. type="text")
// BoundAttributeNode: bind:prop={expr}, class:name={expr},
//   style:prop={expr}, animate:name={expr}, or shorthand prop={expr}
// BoundEventNode: on:event={handler}
// BoundModelNode: model:prop={signal}
// ReferenceNode: ref={variable}
// ────────────────────────────────────────────────────────────────

export enum BindingType {
  Property = 0,
  Attribute = 1,
  Class = 2,
  Style = 3,
  Animation = 4,
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
  keySpan?: SourceSpan;
  handlerSpan?: SourceSpan;
}

export interface BoundModelNode extends BaseNode {
  type: 'BoundModel';
  name: string;
  value: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

export interface ReferenceNode extends BaseNode {
  type: 'Reference';
  name: string;
  value: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

// ────────────────────────────────────────────────────────────────
// 6. DIRECTIVE BINDING NODES
//
// use:directive(input={expr} on:output={handler}):when={cond}:ref={r}
//
// DirectiveBindingNode groups all bindings for a single use:
// directive application on an element.
// Modifiers (:when, :ref) sit outside the directive's own bindings.
// ────────────────────────────────────────────────────────────────

export interface DirectiveBindingNode extends BaseNode {
  type: 'DirectiveBinding';
  directiveName: string;
  inputs: DirectiveInputNode[];
  outputs: DirectiveOutputNode[];
  models: DirectiveModelNode[];
  fragments: DirectiveFragmentNode[];
  modifiers: DirectiveModifierNode[];
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

export interface DirectiveModifierNode extends BaseNode {
  type: 'DirectiveModifier';
  name: 'when' | 'ref';
  value: AST;
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

// {expr} — single expression interpolation
export interface TextInterpolationNode extends BaseNode {
  type: 'TextInterpolation';
  expression: AST;
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
// 9. CONTROL FLOW — @if, @for, @switch
// ────────────────────────────────────────────────────────────────

export type ControlFlowNode =
  | IfNode
  | ForNode
  | SwitchNode;

export interface IfNode extends BaseNode {
  type: 'If';
  branches: IfBranchNode[];
}

export interface IfBranchNode extends BaseNode {
  type: 'IfBranch';
  expression: AST | null; // null for @else
  children: TemplateNode[];
  expressionAlias?: string;
}

export interface ForNode extends BaseNode {
  type: 'For';
  item: Variable;
  expression: AST;
  trackBy: AST;
  children: TemplateNode[];
  empty?: ForEmptyNode;
  itemAlias?: string;
  contextVariables?: Variable[];
}

export interface ForEmptyNode extends BaseNode {
  type: 'ForEmpty';
  children: TemplateNode[];
}

export interface SwitchNode extends BaseNode {
  type: 'Switch';
  expression: AST;
  cases: SwitchCaseNode[];
}

export interface SwitchCaseNode extends BaseNode {
  type: 'SwitchCase';
  expression: AST | null; // null for @default
  children: TemplateNode[];
}

// ────────────────────────────────────────────────────────────────
// 10. TEMPLATE DIRECTIVES — @render, @derive
//
// These are template-level constructs (not element directives).
// @render invokes a fragment; @derive creates a template-scoped
// reactive computation from a derivation factory.
// ────────────────────────────────────────────────────────────────

export type TemplateDirectiveNode =
  | RenderNode
  | DeriveNode;

// @render(fragment(args), { injector })
export interface RenderNode extends BaseNode {
  type: 'Render';
  fragment: AST;
  args: AST[];
  options?: RenderOptionsNode;
}

export interface RenderOptionsNode extends BaseNode {
  type: 'RenderOptions';
  injector?: AST;
}

// @derive varName = derivationRef(key={expr} ...)
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
//
// @fragment name(param: Type) { ... }
//
// Inline fragments declared inside a component element are
// auto-passed as the matching fragment binding.
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
//
// Expressions inside {}, binding values, and control flow
// conditions. Mirrors Angular's existing expression parser output.
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
  | ThisReceiver
  | ImplicitReceiver
  | Chain
  | Variable
  | Unary
  | PrefixNot;

export interface LiteralPrimitive extends BaseAST {
  type: 'LiteralPrimitive';
  value: any;
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

export interface Binary extends BaseAST {
  type: 'Binary';
  operation: string;
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

export interface ThisReceiver extends BaseAST {
  type: 'ThisReceiver';
}

export interface ImplicitReceiver extends BaseAST {
  type: 'ImplicitReceiver';
}

export interface Chain extends BaseAST {
  type: 'Chain';
  expressions: AST[];
}

export interface Variable extends BaseAST {
  type: 'Variable';
  name: string;
}

export interface Unary extends BaseAST {
  type: 'Unary';
  operator: string;
  expr: AST;
}

export interface PrefixNot extends BaseAST {
  type: 'PrefixNot';
  expression: AST;
}

// ────────────────────────────────────────────────────────────────
// 13. METADATA TYPES
// ────────────────────────────────────────────────────────────────

export interface TypeNode {
  type: string;
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
//
// Visitor pattern for AST traversal. Each template node kind
// has a corresponding visit method.
// ────────────────────────────────────────────────────────────────

export interface TemplateAstVisitor<T = any> {
  visitElement(element: ElementNode, context: T): any;
  visitText(text: TextNode, context: T): any;
  visitTextInterpolation(interpolation: TextInterpolationNode, context: T): any;
  visitLet(letNode: LetNode, context: T): any;
  visitIf(ifNode: IfNode, context: T): any;
  visitFor(forNode: ForNode, context: T): any;
  visitSwitch(switchNode: SwitchNode, context: T): any;
  visitRender(renderNode: RenderNode, context: T): any;
  visitDerive(deriveNode: DeriveNode, context: T): any;
  visitFragment(fragmentNode: FragmentNode, context: T): any;
}

// ────────────────────────────────────────────────────────────────
// 15. TRAVERSAL UTILITIES
// ────────────────────────────────────────────────────────────────

export function visitAll(nodes: TemplateNode[], visitor: TemplateAstVisitor): void {
  nodes.forEach(node => {
    switch (node.type) {
      case 'Element':
        visitor.visitElement(node, visitor);
        break;
      case 'Text':
        visitor.visitText(node, visitor);
        break;
      case 'TextInterpolation':
        visitor.visitTextInterpolation(node, visitor);
        break;
      case 'Let':
        visitor.visitLet(node, visitor);
        break;
      case 'If':
        visitor.visitIf(node, visitor);
        break;
      case 'For':
        visitor.visitFor(node, visitor);
        break;
      case 'Switch':
        visitor.visitSwitch(node, visitor);
        break;
      case 'Render':
        visitor.visitRender(node, visitor);
        break;
      case 'Derive':
        visitor.visitDerive(node, visitor);
        break;
      case 'Fragment':
        visitor.visitFragment(node, visitor);
        break;
    }
  });
}

export function findElementsByName(ast: TemplateAST, name: string): ElementNode[] {
  const elements: ElementNode[] = [];
  const visitor: TemplateAstVisitor = {
    visitElement: (element: ElementNode) => {
      if (element.name === name) {
        elements.push(element);
      }
      visitAll(element.children, visitor);
      visitAll(element.fragments, visitor);
    },
    visitText: () => {},
    visitTextInterpolation: () => {},
    visitLet: () => {},
    visitIf: (ifNode: IfNode) => {
      ifNode.branches.forEach(branch => visitAll(branch.children, visitor));
    },
    visitFor: (forNode: ForNode) => {
      visitAll(forNode.children, visitor);
      if (forNode.empty) {
        visitAll(forNode.empty.children, visitor);
      }
    },
    visitSwitch: (switchNode: SwitchNode) => {
      switchNode.cases.forEach(c => visitAll(c.children, visitor));
    },
    visitRender: () => {},
    visitDerive: () => {},
    visitFragment: (fragmentNode: FragmentNode) => {
      visitAll(fragmentNode.children, visitor);
    },
  };
  visitAll(ast.nodes, visitor);
  return elements;
}
