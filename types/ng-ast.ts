// Angular Signal Components Template AST
// TypeScript interfaces defining the Abstract Syntax Tree for template expressions

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
  | DirectiveNode
  | FragmentNode
  | LetNode;

// Base interfaces
export interface BaseNode {
  sourceSpan: SourceSpan;
  startSourceSpan?: SourceSpan;
  endSourceSpan?: SourceSpan;
}

export interface SourceSpan {
  start: ParseLocation;
  end: ParseLocation;
  fullStart: ParseLocation;
  details?: string;
}

export interface ParseLocation {
  file: ParseSourceFile;
  offset: number;
  line: number;
  col: number;
}

export interface ParseSourceFile {
  content: string;
  url: string;
}

// Element Nodes
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
  children: TemplateNode[]; // Represents the implicit children fragment markup
  fragments: FragmentNode[];
  i18n?: I18nMeta;
}

// Attribute Nodes
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
  once: boolean; // Maintains support for the once: shorthand
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

export interface ReferenceNode extends BaseNode {
  type: 'Reference';
  name: string;
  value: AST;
  keySpan?: SourceSpan;
  valueSpan?: SourceSpan;
}

// Text Nodes
export interface TextNode extends BaseNode {
  type: 'Text';
  value: string;
}

// {expr} — single expression interpolation
export interface TextInterpolationNode extends BaseNode {
  type: 'TextInterpolation';
  expression: AST;
}

// @let declaration
export interface LetNode extends BaseNode {
  type: 'Let';
  name: string;
  value: AST;
}

// Control Flow Nodes
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

// Directive Nodes (Special template directives)
export type DirectiveNode =
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
  name: string; // local variable name
  derivation: AST; // reference to the derivation factory
  inputs: DerivationInputNode[];
}

export interface DerivationInputNode extends BaseNode {
  type: 'DerivationInput';
  name: string;
  value: AST;
}

// Fragment Nodes
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

// Expression AST
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

// Expression AST Nodes
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

export interface BaseAST {
  span: ParseSpan;
  sourceSpan: AbsoluteSourceSpan;
}

export interface ParseSpan {
  start: number;
  end: number;
}

export interface AbsoluteSourceSpan {
  start: number;
  end: number;
}

// Enums and Types
export enum BindingType {
  Property = 0,
  Attribute = 1,
  Class = 2,
  Style = 3,
  Animation = 4,
}

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

// Visitor Pattern for AST Traversal
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

// Utility functions for AST manipulation
export class TemplateAstHelper {
  static findElementsByName(ast: TemplateAST, name: string): ElementNode[] {
    const elements: ElementNode[] = [];
    const visitor: TemplateAstVisitor = {
      visitElement: (element: ElementNode) => {
        if (element.name === name) {
          elements.push(element);
        }
        TemplateAstHelper.visitAll(element.children, visitor);
        TemplateAstHelper.visitAll(element.fragments, visitor);
      },
      visitText: () => {},
      visitTextInterpolation: () => {},
      visitLet: () => {},
      visitIf: (ifNode: IfNode) => {
        ifNode.branches.forEach(branch => TemplateAstHelper.visitAll(branch.children, visitor));
      },
      visitFor: (forNode: ForNode) => {
        TemplateAstHelper.visitAll(forNode.children, visitor);
        if (forNode.empty) {
          TemplateAstHelper.visitAll(forNode.empty.children, visitor);
        }
      },
      visitSwitch: (switchNode: SwitchNode) => {
        switchNode.cases.forEach(caseNode => TemplateAstHelper.visitAll(caseNode.children, visitor));
      },
      visitRender: () => {},
      visitDerive: () => {},
      visitFragment: (fragmentNode: FragmentNode) => {
        TemplateAstHelper.visitAll(fragmentNode.children, visitor);
      },
    };
    this.visitAll(ast.nodes, visitor);
    return elements;
  }

  static visitAll(nodes: TemplateNode[], visitor: TemplateAstVisitor): void {
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
}
