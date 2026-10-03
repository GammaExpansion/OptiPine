import type { Diagnostic } from '../types.ts';

export interface Node {
  id: number;
  line: number;
  column: number;
}
export interface Program extends Node {
  kind: 'program';
  version: 5 | 6;
  body: Statement[];
}
export interface Literal extends Node {
  kind: 'literal';
  value: number | string | boolean | null;
  valueType: 'int' | 'float' | 'string' | 'bool' | 'color' | 'na';
}
export interface Identifier extends Node {
  kind: 'identifier';
  name: string;
}
export interface Member extends Node {
  kind: 'member';
  object: Expression;
  property: string;
}
export interface History extends Node {
  kind: 'history';
  object: Expression;
  offset: Expression;
}
export interface Unary extends Node {
  kind: 'unary';
  operator: string;
  argument: Expression;
}
export interface Binary extends Node {
  kind: 'binary';
  operator: string;
  left: Expression;
  right: Expression;
}
export interface Conditional extends Node {
  kind: 'conditional';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}
export interface Argument {
  name?: string;
  value: Expression;
}
export interface Call extends Node {
  kind: 'call';
  callee: Expression;
  args: Argument[];
  typeArgs: string[];
  /** Semantic resolution keeps execution independent of runtime value shapes. */
  resolvedName?: string;
  implicitReceiver?: boolean;
  /** User function body checked with this call's concrete parameter types. */
  specializedBody?: Statement[];
  /** Plot argument qualifiers let execution retain series colours without repeating constants. */
  plotQualifiers?: ('const' | 'input' | 'simple' | 'series')[];
}
export interface Tuple extends Node {
  kind: 'tuple';
  elements: Expression[];
}
export interface If extends Node {
  kind: 'if';
  test: Expression;
  consequent: Statement[];
  alternate: Statement[];
}
export interface Switch extends Node {
  kind: 'switch';
  expression?: Expression;
  cases: { test?: Expression; body: Statement[] }[];
}
export type Expression =
  | Literal
  | Identifier
  | Member
  | History
  | Unary
  | Binary
  | Conditional
  | Call
  | Tuple
  | If
  | Switch;
export interface Declaration extends Node {
  kind: 'declaration';
  names: string[];
  type?: string;
  qualifier?: 'const' | 'input' | 'simple' | 'series';
  mode: 'default' | 'var' | 'varip';
  value: Expression;
}
export interface Assignment extends Node {
  kind: 'assignment';
  target: Expression;
  operator: ':=' | '+=' | '-=' | '*=' | '/=' | '%=';
  value: Expression;
}
export interface ExpressionStatement extends Node {
  kind: 'expression';
  expression: Expression;
}
export interface Parameter {
  name: string;
  type?: string;
  qualifier?: string;
  default?: Expression;
}
export interface FunctionDeclaration extends Node {
  kind: 'function';
  name: string;
  params: Parameter[];
  body: Statement[];
  method: boolean;
  exported: boolean;
}
export interface TypeDeclaration extends Node {
  kind: 'type';
  name: string;
  fields: Parameter[];
  exported: boolean;
}
export interface EnumDeclaration extends Node {
  kind: 'enum';
  name: string;
  fields: { name: string; title?: string }[];
}
export interface For extends Node {
  kind: 'for';
  name: string;
  from: Expression;
  to: Expression;
  step?: Expression;
  body: Statement[];
}
export interface ForIn extends Node {
  kind: 'forIn';
  names: string[];
  iterable: Expression;
  body: Statement[];
}
export interface While extends Node {
  kind: 'while';
  test: Expression;
  body: Statement[];
}
export interface Control extends Node {
  kind: 'break' | 'continue';
}
export type Statement =
  | Declaration
  | Assignment
  | ExpressionStatement
  | FunctionDeclaration
  | TypeDeclaration
  | EnumDeclaration
  | For
  | ForIn
  | While
  | Control;
export interface CompileResult {
  success: boolean;
  program?: Program;
  diagnostics: Diagnostic[];
}

export function qualifiedName(expression: Expression): string | undefined {
  if (expression.kind === 'identifier') return expression.name;
  if (expression.kind === 'member') {
    const parent = qualifiedName(expression.object);
    return parent ? `${parent}.${expression.property}` : undefined;
  }
  return undefined;
}
