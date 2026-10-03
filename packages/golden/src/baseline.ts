import { readFile, writeFile } from 'node:fs/promises';
import { preservedMatches } from './compare.ts';
import type { CaseResult, SuiteResult } from './run.ts';

/** An accepted case omits per-run timing, so re-accepting unchanged results changes nothing. */
export type BaselineCase = Omit<CaseResult, 'milliseconds'>;

/** What regression checks read: an accepted baseline or a fresh suite result. */
export interface BaselineLike {
  schemaVersion: SuiteResult['schemaVersion'];
  comparisonFingerprint: string;
  cases: readonly BaselineCase[];
}

export interface Baseline extends Omit<SuiteResult, 'generatedAt' | 'cases'> {
  cases: BaselineCase[];
  reason: string;
}

export function regressions(
  baseline: BaselineLike,
  current: SuiteResult,
  measurementChange = false,
): string[] {
  const failures: string[] = [];
  for (const result of current.cases)
    if (
      result.verified &&
      (result.status === 'crash' || result.checks.some((check) => check.status === 'crash'))
    )
      failures.push(`${result.key}: verified case crashed`);
  if (baseline.schemaVersion !== current.schemaVersion)
    failures.push('Baseline schema changed; migrate the accepted baseline before comparison');
  if (baseline.comparisonFingerprint !== current.comparisonFingerprint && !measurementChange)
    failures.push('Comparison rules changed; an explicit measurement baseline update is required');
  const cases = new Map(current.cases.map((c) => [c.key, c]));
  for (const before of baseline.cases.filter((c) => c.verified)) {
    const after = cases.get(before.key);
    if (!after) {
      failures.push(`${before.key}: tracked fixture not run`);
      continue;
    }
    if (!after.verified) failures.push(`${before.key}: verified fixture removed from the gate`);
    const fixtureChanged = before.fingerprint !== after.fingerprint;
    if (fixtureChanged && !measurementChange)
      failures.push(
        `${before.key}: fixture inputs/expectations changed; an explicit measurement baseline update is required`,
      );
    const checks = new Map(after.checks.map((c) => [c.id, c]));
    for (const prior of before.checks) {
      const next = checks.get(prior.id);
      if (!next) {
        failures.push(`${before.key} ${prior.id}: tracked check missing`);
        continue;
      }
      if (prior.tier !== next.tier)
        failures.push(`${before.key} ${prior.id}: tracked check changed tiers`);
      const observationsChanged = prior.measurementFingerprint !== next.measurementFingerprint;
      if (observationsChanged && !measurementChange)
        failures.push(
          `${before.key} ${prior.id}: observations or precision changed; an explicit measurement baseline update is required`,
        );
      // A changed metadata field or plot cannot excuse an unrelated regression. Reset only
      // checks whose expected observations/precision changed, with an explicit explanation.
      // Legacy baselines without fingerprints remain strict rather than being silently reset.
      const sameObservations = !(
        measurementChange &&
        observationsChanged &&
        prior.measurementFingerprint &&
        next.measurementFingerprint
      );
      if (
        sameObservations &&
        (prior.total === 0 ? 1 : prior.matched / prior.total) >
          (next.total === 0 ? 1 : next.matched / next.total) + Number.EPSILON
      )
        failures.push(
          `${before.key} ${prior.id}: score decreased (${prior.matched}/${prior.total} -> ${next.matched}/${next.total})`,
        );
      if (sameObservations && !preservedMatches(prior, next))
        failures.push(`${before.key} ${prior.id}: previously matching assertion regressed`);
      if (
        ['match', 'mismatch'].includes(prior.status) &&
        ['unsupported', 'crash'].includes(next.status)
      )
        failures.push(
          `${before.key} ${prior.id}: previously executable check is now ${next.status}`,
        );
      if (sameObservations && (next.matchingPrefix ?? 0) < (prior.matchingPrefix ?? 0))
        failures.push(`${before.key} ${prior.id}: matching trade prefix shortened`);
    }
  }
  return failures;
}

export async function acceptBaseline(
  path: string,
  result: SuiteResult,
  reason: string,
  measurementChange = false,
): Promise<void> {
  if (!result.fullRun) throw new Error('Baseline acceptance requires an unfiltered full suite run');
  if (!reason.trim()) throw new Error('Baseline acceptance requires a reason');
  if (result.cases.some((c) => c.verified && c.status === 'crash'))
    throw new Error('Cannot accept a baseline containing verified crashes');
  let previous: Baseline | undefined;
  try {
    previous = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (previous) {
    const failures = regressions(previous, result, measurementChange);
    if (failures.length) throw new Error(`Baseline regression:\n${failures.join('\n')}`);
  }
  await writeFile(path, `${JSON.stringify(accepted(result, reason), null, 2)}\n`);
}

/** Timing and generation timestamps vary run to run and carry no assertion; keep them out. */
export function accepted(result: SuiteResult, reason: string): Baseline {
  const { generatedAt: _generatedAt, ...suite } = result;
  return {
    ...suite,
    cases: suite.cases.map(({ milliseconds: _milliseconds, ...rest }) => rest),
    reason,
  };
}
