export { discoverFixtures, loadChart, loadFixture } from './load.ts';
export type { Fixture, FixtureMeta } from './load.ts';
export { runFixture, runSuite, selected, summarize } from './run.ts';
export type { CaseResult, Engine, Selection, SuiteResult } from './run.ts';
export { acceptBaseline, regressions } from './baseline.ts';
export type { Baseline } from './baseline.ts';
export type { Check, Difference, Status, Tier, Tolerance } from './compare.ts';
export { defaultBaselinePath, defaultFixtureRoot } from './resources.ts';
