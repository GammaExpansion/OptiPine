import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  discoverFixtures,
  loadFixture,
  acceptBaseline,
  regressions,
  runSuite,
  selected,
  defaultFixtureRoot,
  defaultBaselinePath,
} from '@pine/golden';
import type { CaseResult, Selection } from '@pine/golden';

interface Arguments {
  command: string;
  options: Map<string, string>;
  root: string;
  selection: Selection;
}

/** Runs inside main() so an option mistake prints one line instead of a stack trace. */
function parseArguments(argv: readonly string[]): Arguments {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift()! : 'run';
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) throw new Error(`Unexpected argument: ${args[i]}`);
    const key = args[i].slice(2);
    if (['help', 'explain', 'measurement-change'].includes(key)) options.set(key, 'true');
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--'))
        throw new Error(`Missing value for --${key}`);
      options.set(key, args[++i]);
    }
  }
  const allowed = [
    'help',
    'explain',
    'measurement-change',
    'root',
    'kind',
    'version',
    'case',
    'json',
    'baseline',
    'reason',
  ];
  for (const key of options.keys())
    if (!allowed.includes(key)) throw new Error(`Unknown option: --${key}`);
  const root = options.has('root') ? resolve(options.get('root')!) : defaultFixtureRoot;
  const selection: Selection = {
    kind: options.get('kind'),
    version: options.has('version') ? Number(options.get('version')) : undefined,
    case: options.get('case'),
  };
  if (selection.kind && !['parse', 'indicator', 'strategy'].includes(selection.kind))
    throw new Error('--kind must be parse, indicator, or strategy');
  if (selection.version !== undefined && ![5, 6].includes(selection.version))
    throw new Error('--version must be 5 or 6');
  return { command, options, root, selection };
}

function printCase(c: CaseResult, explain: boolean) {
  const scores = ['compilation', 'series', 'trades', 'metrics']
    .map((tier) => {
      const checks = c.checks.filter((check) => check.tier === tier);
      if (!checks.length) return '';
      const matched = checks.reduce((n, check) => n + check.matched, 0),
        total = checks.reduce((n, check) => n + check.total, 0);
      return `${tier} ${matched}/${total}`;
    })
    .filter(Boolean)
    .join(', ');
  console.log(
    `${c.verified ? '' : '[unverified] '}${c.status.padEnd(11)} ${c.key}: ${scores} (${c.milliseconds} ms)`,
  );
  const bad = c.checks.filter((check) => check.status !== 'match');
  if (explain)
    for (const check of bad)
      console.log(`  ${check.id}: ${check.status} ${JSON.stringify(check.firstDifference)}`);
  else if (bad[0]) console.log(`  ${bad[0].id}: ${JSON.stringify(bad[0].firstDifference)}`);
  for (const warning of c.warnings) console.log(`  note: ${warning}`);
}

async function main() {
  const { command, options, root, selection } = parseArguments(process.argv.slice(2));
  if (options.has('help')) {
    console.log(
      'Pine golden compatibility runner\n\nnpm run pine -- [list|run|check|accept] [options]\n\n--kind parse|indicator|strategy  --version 5|6  --case <substring or *>\n--root <fixtures>  Default: @pine/golden bundled fixtures\n--json <report.json>  --explain\n--baseline <path>  Default: golden-baseline.json in the fixture root\n--reason <baseline change explanation>\n--measurement-change  Explicitly accept changed observations or comparison rules\n\nrun exits nonzero unless all selected verified cases match. check compares a full\nrun to the accepted baseline. accept always runs the complete suite. Measurement\nupdates preserve unaffected checks, cases and execution support. Unverified cases\nremain visible and do not gate changes.',
    );
    return;
  }
  if (command === 'list') {
    for (const path of await discoverFixtures(root)) {
      const key = path
        .slice(root.length)
        .replace(/^[/\\]/, '')
        .replaceAll('\\', '/');
      if (selected(key, selection)) {
        const f = await loadFixture(path, root);
        console.log(`${key}${f.meta.verified ? '' : ' [unverified]'}`);
      }
    }
    return;
  }
  if (!['run', 'check', 'accept'].includes(command)) throw new Error(`Unknown command: ${command}`);
  if (command !== 'run' && Object.values(selection).some((v) => v !== undefined))
    throw new Error(`${command} requires a full unfiltered suite run`);
  const result = await runSuite(root, selection, (c) => printCase(c, options.has('explain')));
  if (options.has('json'))
    await writeFile(resolve(options.get('json')!), `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `\n${result.summary.verified} verified, ${result.summary.unverified} unverified. ${JSON.stringify(result.summary.statuses)}`,
  );
  for (const [tier, summary] of Object.entries(result.summary.tiers))
    console.log(
      `${tier}: ${summary.matched}/${summary.total} assertions, ${JSON.stringify({ match: summary.match, mismatch: summary.mismatch, unsupported: summary.unsupported, crash: summary.crash })}`,
    );
  const baselinePath = options.has('baseline')
    ? resolve(options.get('baseline')!)
    : options.has('root')
      ? resolve(root, 'golden-baseline.json')
      : defaultBaselinePath;
  if (command === 'accept') {
    await acceptBaseline(
      baselinePath,
      result,
      options.get('reason') ?? '',
      options.has('measurement-change'),
    );
    console.log(`Accepted baseline: ${baselinePath}`);
  } else if (command === 'check') {
    let text: string;
    try {
      text = await readFile(baselinePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error(
          `No accepted baseline at ${baselinePath}; run \`npm run pine -- accept --reason "..."\` first.`,
        );
      throw error;
    }
    const baseline = JSON.parse(text);
    const failures = regressions(baseline, result);
    if (failures.length) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    } else console.log('Regression baseline preserved.');
  } else if (result.cases.some((c) => c.verified && c.status !== 'match')) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
