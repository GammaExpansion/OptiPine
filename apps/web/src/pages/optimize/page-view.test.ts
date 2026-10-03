import { expect, test } from 'vitest';
import type { OptimizationState } from '../../workflows/optimize-session.ts';
import { resultsOutdated, showsResults, showsWalkForward } from './page-view.ts';

const results = {} as NonNullable<OptimizationState['results']>;
const running = { status: 'running' } as OptimizationState['run'];
const done = { status: 'done', startedAt: 0, finishedAt: 1 } as const;

test('the panels show with results or a live run, the O1 empty state otherwise', () => {
  expect(showsResults({ results: null, run: { status: 'idle' }, outdated: null })).toBe(false);
  expect(showsResults({ results: null, run: running, outdated: null })).toBe(true);
  expect(
    showsResults({ results: null, run: { ...done, status: 'cancelled' }, outdated: null }),
  ).toBe(false);
  expect(showsResults({ results, run: done, outdated: { reasons: [] } })).toBe(true);
});

test('results are dimmed as outdated only while no run shows its live views (R5)', () => {
  expect(resultsOutdated({ results, run: done, outdated: { reasons: [] } })).toBe(false);
  expect(resultsOutdated({ results, run: done, outdated: { reasons: ['ranges'] } })).toBe(true);
  expect(resultsOutdated({ results, run: running, outdated: { reasons: ['ranges'] } })).toBe(false);
});

test('walk-forward results or a walk-forward run lay out W1 instead of R1', () => {
  expect(showsWalkForward({ walkForward: null })).toBe(false);
  expect(
    showsWalkForward({ walkForward: {} as NonNullable<OptimizationState['walkForward']> }),
  ).toBe(true);
});
