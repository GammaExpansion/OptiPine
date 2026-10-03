import type { Expression, Program } from './ast.ts';
import { qualifiedName } from './ast.ts';

/** Reassignment can depend on control flow even when both assigned values are constants.
 * Treat these plot dependencies as series without changing compilation acceptance rules. */
export class PlotDependencies {
  private assigned = new Set<string>();
  private definitions = new Map<string, unknown>();

  constructor(program: Program) {
    const scan = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if ('kind' in node && node.kind === 'assignment' && 'target' in node) {
        const target = node.target;
        if (
          target &&
          typeof target === 'object' &&
          'kind' in target &&
          target.kind === 'identifier' &&
          'name' in target &&
          typeof target.name === 'string'
        )
          this.assigned.add(target.name);
      }
      for (const child of Object.values(node)) scan(child);
    };
    scan(program);
    for (const node of program.body) {
      if (node.kind === 'declaration')
        for (const name of node.names) this.definitions.set(name, node.value);
      if (node.kind === 'function') this.definitions.set(node.name, node.body);
    }
  }

  mutable(expression: Expression): boolean {
    const visited = new Set<string>();
    const reference = (name: string): boolean => {
      if (this.assigned.has(name)) return true;
      if (visited.has(name)) return false;
      visited.add(name);
      return scan(this.definitions.get(name));
    };
    const scan = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      if ('kind' in node) {
        if (node.kind === 'identifier' && 'name' in node && typeof node.name === 'string')
          return reference(node.name);
        if (node.kind === 'call') {
          const name = qualifiedName((node as Extract<Expression, { kind: 'call' }>).callee);
          if (name && reference(name)) return true;
        }
      }
      return Object.values(node).some(scan);
    };
    return scan(expression);
  }
}
