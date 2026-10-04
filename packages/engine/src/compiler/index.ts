import type { CompileResult } from './ast.ts';
import { Checker } from './checker.ts';
import { CompileError } from './lexer.ts';
import { Parser } from './parser.ts';

export type { CompileResult, Program } from './ast.ts';
export { diagnosticLimit } from './checker.ts';

/**
 * Parse and check a script. The parser stops at the first syntax error; the checker goes on past
 * each failing statement or expression and reports every independent error it finds, by line
 * and column, with the `request.*` calls the engine cannot run beside them.
 */
export function compile(source: string): CompileResult {
  try {
    const version = Number(source.match(/^\s*\/\/@version\s*=\s*(\d+)/m)?.[1] ?? 1);
    if (version !== 5 && version !== 6)
      throw new CompileError(
        'unsupported',
        1,
        `Pine v${version} is outside the supported v5/v6 language versions.`,
      );
    const program = new Parser(source, version).parse();
    const checker = new Checker(program);
    checker.run();
    const diagnostics = checker.diagnostics();
    if (diagnostics.length) return { success: false, diagnostics };
    return { success: true, program, diagnostics: [] };
  } catch (error) {
    if (error instanceof CompileError) return { success: false, diagnostics: [error.diagnostic] };
    throw error;
  }
}
