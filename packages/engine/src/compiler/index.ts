import type { CompileResult } from './ast.ts';
import { Checker } from './checker.ts';
import { CompileError } from './lexer.ts';
import { Parser } from './parser.ts';

export type { CompileResult, Program } from './ast.ts';
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
    new Checker(program).run();
    return { success: true, program, diagnostics: [] };
  } catch (error) {
    if (error instanceof CompileError) return { success: false, diagnostics: [error.diagnostic] };
    throw error;
  }
}
