import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

/** Parse JSX so comments, code strings, SVG paths and message ids are not mistaken for copy. */
function copyViolations(source: string, filename: string): string[] {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: string[] = [];
  const report = (node: ts.Node) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    violations.push(`${filename}:${line + 1}: ${node.getText(file)}`);
  };
  const isCopy = (node: ts.Node) =>
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text.trim() !== '';
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && node.text.trim()) report(node);
    if (
      ts.isJsxExpression(node) &&
      !ts.isJsxAttribute(node.parent) &&
      node.expression &&
      isCopy(node.expression)
    )
      report(node);
    if (
      ts.isJsxAttribute(node) &&
      ['aria-label', 'title', 'placeholder', 'alt'].includes(node.name.getText(file))
    ) {
      const value = node.initializer;
      if (
        value &&
        (isCopy(value) ||
          (ts.isJsxExpression(value) && value.expression && isCopy(value.expression)))
      )
        report(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return violations;
}

test('copy guard recognizes text and literal attributes using the TypeScript AST', () => {
  assert.equal(copyViolations('<button title="Save">Save</button>', 'sample.tsx').length, 2);
  assert.ok(copyViolations('<img alt={"Chart"}/>', 'sample.tsx').length > 0);
  assert.ok(copyViolations('<input placeholder={`Name`}/>', 'sample.tsx').length > 0);
  assert.ok(copyViolations('<button aria-label="Run"/>', 'sample.tsx').length > 0);
  assert.ok(copyViolations('<p>{"Copy"}</p>', 'sample.tsx').length > 0);
  assert.deepEqual(
    copyViolations(
      '<button title={t("shell.runBacktest")}>{t("shell.runBacktest")}</button>',
      'sample.tsx',
    ),
    [],
  );
  assert.deepEqual(
    copyViolations('<div className={"layout"} data-testid="pane" />', 'sample.tsx'),
    [],
  );
});

test('all TSX copy comes from the catalogs', () => {
  const src = fileURLToPath(new URL('../', import.meta.url));
  const violations = globSync('**/*.tsx', { cwd: src }).flatMap((path) =>
    copyViolations(
      readFileSync(new URL(path.replaceAll('\\', '/'), new URL('../', import.meta.url)), 'utf8'),
      path,
    ),
  );
  assert.deepEqual(violations, []);
});
