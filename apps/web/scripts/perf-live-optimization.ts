import { cp, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { FeedDataset } from '@pine/market-data';
import { cpus, totalmem, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';
import { build } from 'vite';
import { createAppServer } from '../server/app.ts';
import { fixedClock } from '../e2e/market-fixtures.ts';
import { snapshotIntervals, statistics } from './perf-statistics.ts';
import { aggregateHours } from './perf-market.ts';
import type {} from './perf-live-browser.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(
  new URL(`../test-results/perf/${process.env.PERF_LABEL ?? 'measurement'}/`, import.meta.url),
);
const buildDirectory = fileURLToPath(new URL('../.e2e-dist/perf/', import.meta.url));
const port = Number(process.env.PERF_PORT ?? 6274);
const combinations = Number(process.env.PERF_COMBINATIONS ?? 20_000);
const windowCombinations = Number(process.env.PERF_WINDOW_COMBINATIONS ?? 3_000);
const timeout = Number(process.env.PERF_TIMEOUT_MS ?? 7_200_000);
const selected = process.env.PERF_SCENARIOS?.split(',');
const timeframe = process.env.PERF_TIMEFRAME ?? '240';
const trace = process.env.PERF_TRACE === '1';
if (!['60', '240'].includes(timeframe)) throw new Error('PERF_TIMEFRAME must be 60 or 240');
await mkdir(output, { recursive: true });

await build({
  root,
  mode: 'production',
  logLevel: 'warn',
  build: { outDir: buildDirectory, sourcemap: true },
  plugins: [
    {
      name: 'measurement-entry',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [
          {
            tag: 'script',
            attrs: { type: 'module', src: '/scripts/perf-live-browser.ts' },
            injectTo: 'head',
          },
        ],
      },
    },
  ],
});
// Keep the exact minified sources and maps next to each trace, even after another build.
if (trace) await cp(`${buildDirectory}/assets`, `${output}/assets`, { recursive: true });
// Refuse market traffic at the server as well as intercepting it in Playwright.
// The production server's middleware also sees asset requests.
const offlineServer = createAppServer(buildDirectory, (request, response, next) => {
  if (request.url?.startsWith('/api/market')) response.writeHead(503).end();
  else next();
});
await new Promise<void>((resolve, reject) => {
  offlineServer.once('error', reject);
  offlineServer.listen(port, '127.0.0.1', resolve);
});
const browser = await chromium.launch({
  headless: process.env.PERF_HEADED !== '1',
  args: ['--enable-precise-memory-info'],
});

/** Worker isolates are separate heaps; the page's JSHeapUsedSize cannot detect a retained analysis run. */
async function heap(browser: Browser, cdp: CDPSession, collect: boolean) {
  if (collect) await cdp.send('HeapProfiler.collectGarbage');
  const main = await cdp.send('Runtime.getHeapUsage');
  const connection = await browser.newBrowserCDPSession();
  const { targetInfos } = await connection.send('Target.getTargets');
  const workers: { url: string; usedSize: number }[] = [];
  for (const target of targetInfos.filter((target) => target.type === 'worker')) {
    const { sessionId } = await connection.send('Target.attachToTarget', {
      targetId: target.targetId,
    });
    let id = 0;
    async function request(method: string): Promise<{ usedSize: number }> {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          connection.off('Target.receivedMessageFromTarget', receive);
          reject(new Error(`Worker heap timeout: ${method}`));
        }, 15_000);
        function receive(event: { sessionId: string; message: string }) {
          if (event.sessionId !== sessionId) return;
          const reply = JSON.parse(event.message);
          if (reply.id !== requestId) return;
          clearTimeout(timer);
          connection.off('Target.receivedMessageFromTarget', receive);
          if (reply.error) reject(new Error(JSON.stringify(reply.error)));
          else resolve(reply.result);
        }
        connection.on('Target.receivedMessageFromTarget', receive);
        void connection
          .send('Target.sendMessageToTarget', {
            sessionId,
            message: JSON.stringify({ id: requestId, method }),
          })
          .catch(reject);
      });
    }
    try {
      if (collect) await request('HeapProfiler.collectGarbage');
      workers.push({ url: target.url, usedSize: (await request('Runtime.getHeapUsage')).usedSize });
    } finally {
      await connection.send('Target.detachFromTarget', { sessionId });
    }
  }
  await connection.detach();
  return {
    main: main.usedSize,
    workers,
    workerTotal: workers.reduce((sum, worker) => sum + worker.usedSize, 0),
  };
}

async function painted(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function interact(page: Page, phone: boolean, walk: boolean, late: boolean) {
  const uiActions: { label: string; startedRunning: boolean; finishedRunning: boolean }[] = [];
  async function action(label: string, perform: () => Promise<unknown>) {
    const startedRunning = await page.evaluate(() => window.liveProbe.state().status === 'running');
    await page.evaluate(
      (name) => window.liveProbe.label(name),
      `${late ? 'late' : 'early'}:${label}`,
    );
    await perform();
    await painted(page);
    await page.evaluate(() => window.liveProbe.label(''));
    const finishedRunning = await page.evaluate(
      () => window.liveProbe.state().status === 'running',
    );
    uiActions.push({ label, startedRunning, finishedRunning });
  }
  async function tab(name: string) {
    if (phone) await page.getByRole('tab', { name, exact: true }).click();
  }
  await tab('Summary');
  await action('summary', () =>
    page
      .getByRole('radio', {
        name: walk ? (late ? 'Per window' : 'Stitched') : late ? 'Distribution' : 'IS vs OOS',
        exact: true,
      })
      .click(),
  );
  await tab('Settings');
  await page.getByRole('button', { name: /^By (IS profit|Profit factor)/ }).click();
  const objective = page.getByRole('dialog', { name: 'Ranking objective', exact: true });
  await action('objective', () =>
    objective
      .getByRole('radio', {
        name: late ? 'IS profit' : 'Profit factor',
        exact: true,
      })
      .click(),
  );
  const filters = page.getByRole('group', { name: 'Filters', exact: true }).last();
  await action('filter', () =>
    filters
      .getByRole('button', { name: /^Remove / })
      .first()
      .click(),
  );
  const settings = await page.evaluate(() => window.liveProbe.state().settings);
  if (
    settings.objective !== (late ? 'netProfit' : 'profitFactor') ||
    settings.filters !== (late ? 0 : 1)
  )
    throw new Error(`Ranking UI did not apply: ${JSON.stringify(settings)}`);
  if (!walk) {
    await tab('Parameter map');
    const canvas = page.getByTestId('parameter-map');
    await action('map-hover', () => canvas.hover({ position: { x: 85, y: 60 } }));
    await tab('Leaderboard');
    await action('leaderboard-page', () =>
      page.getByRole('button', { name: 'Next page', exact: true }).click(),
    );
    await page.getByRole('region', { name: 'Leaderboard', exact: true }).last().hover();
    await action('leaderboard-scroll', () => page.mouse.wheel(0, 480));
    if (phone) {
      await tab('Sensitivity');
      await painted(page);
      await tab('Summary');
    }
  } else {
    await tab('Windows');
    await action('windows-scroll', () => page.mouse.wheel(0, 400));
    await tab('Summary');
  }
  return uiActions;
}

const reports: unknown[] = [];
try {
  for (const rate of [1, 4])
    for (const phone of [false, true])
      for (const walk of [false, true]) {
        const name = `${walk ? 'walk' : 'is-oos'}-${phone ? 'phone' : 'desktop'}-${rate}x`;
        if (selected && !selected.includes(name)) continue;
        console.log(`${new Date().toISOString()} ${name}: starting`);
        const context = await browser.newContext({
          viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
          locale: 'en-US',
          serviceWorkers: 'block',
        });
        const page = await context.newPage();
        page.setDefaultTimeout(60_000);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        // Only Date is shifted. Playwright's clock also replaces rAF/performance.now, which would
        // mix synthetic timestamps with native PerformanceObserver/Event Timing timestamps.
        await page.addInitScript((time) => {
          const OriginalDate = Date;
          const epoch = OriginalDate.now();
          window.Date = new Proxy(OriginalDate, {
            construct(target, args) {
              return Reflect.construct(
                target,
                args.length ? args : [time + OriginalDate.now() - epoch],
              );
            },
            get(target, key) {
              return key === 'now'
                ? () => time + OriginalDate.now() - epoch
                : Reflect.get(target, key);
            },
          });
        }, fixedClock.valueOf());
        const recorded: FeedDataset = JSON.parse(
          gunzipSync(
            await readFile(
              new URL('../e2e/fixtures/market/btc-two-years.json.gz', import.meta.url),
            ),
          ).toString('utf8'),
        );
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== `http://127.0.0.1:${port}`) {
            errors.push(`External request blocked: ${url.origin}`);
            await route.abort();
          } else if (url.pathname === '/api/market/bars') {
            const requested = url.searchParams.get('timeframe') ?? '60';
            const dataset = {
              ...recorded,
              input: {
                ...recorded.input,
                timeframe: requested,
                bars: aggregateHours(recorded.input.bars, Number(requested) / 60),
              },
            };
            await route.fulfill({ json: dataset });
          } else if (url.pathname.startsWith('/api/market')) {
            errors.push(`Unexpected market request: ${url.pathname}`);
            await route.abort();
          } else await route.continue();
        });
        await page.goto(`http://127.0.0.1:${port}`);
        await page
          .getByRole('button', {
            name: 'Load example: Trend Breakout, BTCUSDT 1 hour',
            exact: true,
          })
          .click();
        if (timeframe === '240') {
          if (phone)
            await page
              .getByRole('combobox', { name: 'Timeframe', exact: true })
              .selectOption('240');
          else await page.getByRole('radio', { name: '4h', exact: true }).click();
          await page.getByRole('button', { name: 'Use this data', exact: true }).click();
        }
        await page.getByRole('button', { name: 'Optimize', exact: true }).click();
        await page.waitForFunction(() => !!window.liveProbe);
        await page.evaluate(
          ({ walk, count }) => window.liveProbe.configure(walk ? 'walk-forward' : 'in-out', count),
          { walk, count: walk ? windowCombinations : combinations },
        );
        await page.waitForFunction(() => window.liveProbe.state().ready);
        const setup = await page.evaluate(() => window.liveProbe.state());
        if (setup.combinations !== (walk ? windowCombinations : combinations))
          throw new Error(`${name}: incorrect search size: ${setup.combinations}`);
        const before = await heap(browser, cdp, true);
        if (process.env.PERF_PROFILE === '1' || trace) {
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.start');
        }
        if (trace)
          await cdp.send('Tracing.start', {
            traceConfig: {
              recordMode: 'recordAsMuchAsPossible',
              traceBufferSizeInKb: 512 * 1_024,
              excludedCategories: ['*'],
              includedCategories: [
                'devtools.timeline',
                'disabled-by-default-devtools.timeline',
                'v8',
                'blink.user_timing',
              ],
            },
            transferMode: 'ReturnAsStream',
          });
        if (phone) await page.getByRole('tab', { name: 'Settings', exact: true }).click();
        await page.evaluate(() => window.liveProbe.begin());
        if (trace) await page.evaluate(() => performance.mark('perf-live-begin'));
        await page.getByRole('button', { name: 'Start', exact: true }).last().click();
        if (phone) await page.getByRole('tab', { name: 'Summary', exact: true }).click();
        const started = Date.now();
        const heapSamples: { at: number; bytes: number }[] = [];
        const interactionErrors: string[] = [];
        const uiActions = [];
        let early = false;
        let late = false;
        let lastLog = 0;
        while (true) {
          const state = await page.evaluate(() => window.liveProbe.state());
          if (state.settled) break;
          if (state.status === 'failed' || Date.now() - started > timeout)
            throw new Error(`${name}: ${JSON.stringify(state)}`);
          const progress = state.progress;
          const fraction = progress
            ? walk
              ? ((progress.window?.index ?? 0) + progress.completed / Math.max(1, progress.total)) /
                (progress.window?.count ?? 1)
              : progress.completed / Math.max(1, progress.total)
            : 0;
          if ((!early && fraction > 0.15) || (!late && fraction > (walk ? 0.6 : 0.8))) {
            const isLate = early;
            if (early) late = true;
            else early = true;
            try {
              uiActions.push({
                late: isLate,
                actions: await interact(page, phone, walk, isLate),
              });
            } catch (error) {
              interactionErrors.push(String(error));
              console.error(`${name}: interaction failed: ${String(error)}`);
              await page.screenshot({ path: `${output}/${name}-interaction.png` });
            }
          }
          heapSamples.push({
            at: Date.now() - started,
            bytes: (await cdp.send('Runtime.getHeapUsage')).usedSize,
          });
          if (Date.now() - lastLog > 30_000) {
            console.log(`${name}: ${JSON.stringify(progress)}`);
            lastLog = Date.now();
          }
          await page.waitForTimeout(1_000);
        }
        await painted(page);
        if (trace) await page.evaluate(() => performance.mark('perf-live-end'));
        const raw = await page.evaluate(() => window.liveProbe.end());
        if (trace) {
          const complete = new Promise<{ stream?: string; dataLossOccurred: boolean }>((resolve) =>
            cdp.once('Tracing.tracingComplete', resolve),
          );
          await cdp.send('Tracing.end');
          const capture = await complete;
          if (capture.dataLossOccurred || !capture.stream)
            throw new Error(`${name}: incomplete Chrome trace`);
          const handle = capture.stream;
          const file = await open(`${output}/${name}.trace.json`, 'w');
          try {
            while (true) {
              const chunk = await cdp.send('IO.read', { handle });
              await file.write(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
              if (chunk.eof) break;
            }
          } finally {
            await file.close();
            await cdp.send('IO.close', { handle });
          }
        }
        if (process.env.PERF_PROFILE === '1' || trace)
          await writeFile(
            `${output}/${name}.cpuprofile`,
            JSON.stringify((await cdp.send('Profiler.stop')).profile),
          );
        const finished = await heap(browser, cdp, false);
        const retained = await heap(browser, cdp, true);
        const completed = await page.evaluate(() => window.liveProbe.state());
        if (!early || !late)
          interactionErrors.push('Run ended before both interaction checkpoints');
        if (errors.length || interactionErrors.length) process.exitCode = 1;
        await page.screenshot({ path: `${output}/${name}.png` });
        // A small completed run replaces the large one. Two replacements reveal stale memo retention.
        const replacements = [];
        const replacementIdleHeaps = [];
        for (let index = 0; index < 2; index++) {
          await page.evaluate(() => window.liveProbe.configure('in-out', 8));
          await page.waitForFunction(() => window.liveProbe.state().ready);
          if (phone) await page.getByRole('tab', { name: 'Settings', exact: true }).click();
          await page.getByRole('button', { name: 'Re-optimize', exact: true }).last().click();
          await page.waitForFunction(() => window.liveProbe.state().settled, undefined, {
            timeout,
          });
          replacements.push(await heap(browser, cdp, true));
          await page.waitForTimeout(2_000);
          replacementIdleHeaps.push(await heap(browser, cdp, true));
        }
        const intervals = snapshotIntervals(raw.snapshots);
        const groups = (samples: { name: string; duration: number }[]) =>
          Object.fromEntries(
            [...new Set(samples.map((sample) => sample.name))].map((key) => [
              key,
              statistics(
                samples.filter((sample) => sample.name === key).map((sample) => sample.duration),
              ),
            ]),
          );
        const report = {
          name,
          setup,
          completed,
          durationMs: raw.end - raw.start,
          tasks: statistics(
            raw.tasks
              .filter((task) => task.at < (raw.runEnd ?? raw.end))
              .map((task) => task.duration),
          ),
          finishingTasks: statistics(
            raw.tasks
              .filter((task) => task.at >= (raw.runEnd ?? raw.end))
              .map((task) => task.duration),
          ),
          frames: statistics(
            raw.frames
              .filter((frame) => frame.at < (raw.runEnd ?? raw.end))
              .map((frame) => frame.duration),
          ),
          events: groups(raw.events),
          snapshots: {
            ...statistics(intervals),
            min: Math.min(...intervals),
            below250: intervals.filter((interval) => interval < 249).length,
          },
          viewIntervals: statistics(raw.views.slice(1).map((at, index) => at - raw.views[index])),
          messages: groups(raw.messages),
          transfers: {
            maxAppendTrials: Math.max(0, ...raw.messages.map((sample) => sample.trials ?? 0)),
            reproductionRequests: raw.messages.filter((sample) => sample.name === 'reproduce')
              .length,
            reproductionSnapshots: raw.messages.filter((sample) => sample.bars !== undefined)
              .length,
          },
          interactions: groups(raw.interactions),
          heap: {
            before,
            peakMain: Math.max(...heapSamples.map((sample) => sample.bytes)),
            finished,
            retained,
            replacements,
            replacementIdleHeaps,
          },
          errors,
          interactionErrors,
          uiActions,
        };
        await writeFile(`${output}/${name}-raw.json`, JSON.stringify({ ...raw, heapSamples }));
        await writeFile(`${output}/${name}.json`, JSON.stringify(report, null, 2));
        reports.push(report);
        console.log(
          `${name}: ${JSON.stringify({ tasks: report.tasks, frames: report.frames, snapshots: report.snapshots, errors, interactionErrors })}`,
        );
        await context.close();
      }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        machine: {
          cpu: cpus()[0].model,
          logicalProcessors: cpus().length,
          ramBytes: totalmem(),
          os: `${platform()} ${release()}`,
          node: process.version,
          chromium: browser.version(),
        },
        combinations,
        timeframe,
        windowCombinations,
        reports,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  offlineServer.closeAllConnections();
  await new Promise<void>((resolve) => offlineServer.close(() => resolve()));
}
