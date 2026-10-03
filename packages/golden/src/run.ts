import { readComparisonFingerprint } from './fingerprint.ts';
import { compile, run } from '@pine/engine';
import type { Diagnostic, RunInput, RunResult } from '@pine/engine';
import { discoverFixtures, loadFixture } from './load.ts';
import type { Fixture } from './load.ts';
import {
  compareCompilation,
  compareMetrics,
  comparePlots,
  compareTrades,
  unavailable,
} from './compare.ts';
import type { Check, Status, Tier } from './compare.ts';

export interface Engine {
  compile(source: string): { success: boolean; diagnostics: Diagnostic[] };
  run(source: string, input: RunInput): RunResult;
}
export interface CaseResult {
  key: string;
  kind: string;
  version: number;
  verified: boolean;
  fingerprint: string;
  status: Status;
  checks: Check[];
  diagnostics: Diagnostic[];
  warnings: string[];
  settingsProvenance: Record<string, string>;
  marketProvenance: Record<string, string>;
  milliseconds: number;
}
export interface SuiteResult {
  schemaVersion: 1;
  comparisonFingerprint: string;
  generatedAt: string;
  fullRun: boolean;
  cases: CaseResult[];
  summary: {
    cases: number;
    verified: number;
    unverified: number;
    statuses: Record<Status, number>;
    tiers: Record<
      Tier,
      {
        matched: number;
        total: number;
        match: number;
        mismatch: number;
        unsupported: number;
        crash: number;
      }
    >;
  };
}
export interface Selection {
  kind?: string;
  version?: number;
  case?: string;
}

function overall(checks: Check[]): Status {
  return checks.some((c) => c.status === 'crash')
    ? 'crash'
    : checks.some((c) => c.status === 'unsupported')
      ? 'unsupported'
      : checks.some((c) => c.status === 'mismatch')
        ? 'mismatch'
        : 'match';
}

function executionUnavailable(
  fixture: Fixture,
  status: 'crash' | 'unsupported',
  message: string,
): Check[] {
  const checks = comparePlots(fixture.plots, []);
  if (fixture.report) {
    checks.push(
      ...compareTrades(fixture.report.trades, [], {
        currency: '',
        pointvalue: 1,
        initialCapital: 1,
      }),
    );
    checks.push(...compareMetrics(fixture.report.metrics, {}));
  }
  return checks.map((check) => ({
    ...check,
    ...unavailable(check.id, check.tier, check.total, status, message),
    ...(check.matchingPrefix === undefined ? {} : { matchingPrefix: 0 }),
  }));
}

export function runFixture(fixture: Fixture, engine: Engine = { compile, run }): CaseResult {
  const started = performance.now(),
    checks: Check[] = [],
    diagnostics: Diagnostic[] = [],
    warnings = [...fixture.warnings];
  try {
    const compiled = engine.compile(fixture.source);
    diagnostics.push(...compiled.diagnostics);
    checks.push(compareCompilation(fixture.meta.expect ?? { compile: 'ok' }, compiled));
    if (fixture.input) {
      if (!compiled.success)
        checks.push(
          ...executionUnavailable(
            fixture,
            compiled.diagnostics.some((d) => d.kind === 'unsupported') ? 'unsupported' : 'crash',
            'Compilation did not produce an executable program',
          ),
        );
      else {
        const output = engine.run(fixture.source, fixture.input);
        diagnostics.push(...output.diagnostics);
        warnings.push(
          ...(output.warnings ?? []).map(
            (warning) => `L${warning.line} ${warning.function}: ${warning.message}`,
          ),
        );
        const error = output.diagnostics[0];
        if (error)
          checks.push(
            ...executionUnavailable(
              fixture,
              error.kind === 'unsupported' ? 'unsupported' : 'crash',
              error.message,
            ),
          );
        else {
          checks.push(...comparePlots(fixture.plots, output.plots));
          if (fixture.report) {
            checks.push(
              ...compareTrades(fixture.report.trades, output.trades, {
                currency: String(
                  fixture.report.properties.Currency ?? fixture.input.syminfo.currency ?? 'USD',
                ),
                pointvalue: Number(fixture.input.syminfo.pointvalue ?? 1),
                initialCapital: Number(fixture.input.settings?.initial_capital ?? 1_000_000),
                lastBarIndex: fixture.input.bars.length - 1,
                chartTimezone: fixture.meta.chart_timezone,
              }),
            );
            checks.push(...compareMetrics(fixture.report.metrics, output.metrics));
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (!checks.length) checks.push(unavailable('compile', 'compilation', 1, 'crash', message));
    if (fixture.input) checks.push(...executionUnavailable(fixture, 'crash', message));
    diagnostics.push({ kind: 'runtime', line: 1, message });
  }
  return {
    key: fixture.key,
    kind: fixture.meta.kind,
    version: fixture.meta.pine_version,
    verified: fixture.meta.verified,
    fingerprint: fixture.fingerprint,
    status: overall(checks),
    checks,
    diagnostics,
    warnings,
    settingsProvenance: fixture.settingsProvenance,
    marketProvenance: fixture.marketProvenance,
    milliseconds: Math.round((performance.now() - started) * 100) / 100,
  };
}

export function summarize(cases: CaseResult[]): SuiteResult['summary'] {
  const statuses = { match: 0, mismatch: 0, unsupported: 0, crash: 0 };
  const tiers = Object.fromEntries(
    ['compilation', 'series', 'trades', 'metrics'].map((t) => [
      t,
      { matched: 0, total: 0, ...statuses },
    ]),
  ) as SuiteResult['summary']['tiers'];
  for (const c of cases) {
    if (!c.verified) continue;
    statuses[c.status]++;
    for (const check of c.checks) {
      const tier = tiers[check.tier];
      tier[check.status]++;
      tier.matched += check.matched;
      tier.total += check.total;
    }
  }
  const verified = cases.filter((c) => c.verified).length;
  return { cases: cases.length, verified, unverified: cases.length - verified, statuses, tiers };
}

export function selected(key: string, selection: Selection): boolean {
  const [kind, version] = key.split('/');
  if (selection.kind && kind !== selection.kind) return false;
  if (selection.version && version !== `v${selection.version}`) return false;
  if (selection.case) {
    const regex = new RegExp(
      selection.case
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*'),
    );
    if (!regex.test(key)) return false;
  }
  return true;
}

export async function runSuite(
  root: string,
  selection: Selection = {},
  onCase?: (result: CaseResult) => void,
): Promise<SuiteResult> {
  const cases: CaseResult[] = [];
  const paths = await discoverFixtures(root);
  const comparisonFingerprint = await readComparisonFingerprint();
  for (const path of paths) {
    const key = path
      .slice(root.length)
      .replace(/^[/\\]/, '')
      .replaceAll('\\', '/');
    if (!selected(key, selection)) continue;
    let result: CaseResult;
    try {
      result = runFixture(await loadFixture(path, root));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = {
        key,
        kind: key.split('/')[0],
        version: Number(key.split('/')[1]?.slice(1)),
        verified: true,
        fingerprint: '',
        status: 'crash',
        checks: [unavailable('fixture/load', 'compilation', 1, 'crash', message)],
        diagnostics: [{ kind: 'runtime', line: 1, message }],
        warnings: [],
        settingsProvenance: {},
        marketProvenance: {},
        milliseconds: 0,
      };
    }
    cases.push(result);
    onCase?.(result);
  }
  if (!cases.length) throw new Error('No fixture matched the selection');
  return {
    schemaVersion: 1,
    comparisonFingerprint,
    generatedAt: new Date().toISOString(),
    fullRun: !Object.values(selection).some((v) => v !== undefined),
    cases,
    summary: summarize(cases),
  };
}
