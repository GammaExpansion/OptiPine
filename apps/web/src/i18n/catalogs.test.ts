import assert from 'node:assert/strict';
import { test } from 'node:test';
import { message } from '@pine/messages';
import { marketDataMessageIds } from '@pine/market-data';
import { optimizerMessageIds } from '@pine/optimizer';
import { workerMessageIds } from '@pine/workers';
import { workflowMessageIds, workflowMessage } from '../workflows/messages.ts';
import { catalogAreas, catalogs } from './catalogs.ts';
import { sheetEn } from './sheet-en.ts';
import { sheetZh } from './sheet-zh.ts';
import { translate, type Language } from './translate.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();

test('catalogs have identical keys and placeholders', () => {
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs.zh).sort());
  for (const id of Object.keys(catalogs.en) as (keyof typeof catalogs.en)[]) {
    assert.deepEqual(placeholders(catalogs.en[id]), placeholders(catalogs.zh[id]), id);
    assert.ok(catalogs.en[id].trim() && catalogs.zh[id].trim(), id);
  }
});

test('every English singular form has a base with the same placeholders', () => {
  for (const [id, singular] of Object.entries(catalogs.en)) {
    if (!id.endsWith('.one')) continue;
    const base = id.slice(0, -4) as keyof typeof catalogs.en;
    assert.ok(Object.hasOwn(catalogs.en, base), id);
    assert.deepEqual(placeholders(singular), placeholders(catalogs.en[base]), id);
  }
});

test('report and optimization metric labels are translated in Chinese', () => {
  const ids = [
    'report.netProfit',
    'report.grossProfit',
    'report.grossLoss',
    'report.commission',
    'report.buyHold',
    'report.maxRunUp',
    'report.maxDrawdown',
    'report.openPnl',
    'report.tradeCount',
    'report.totalTrades',
    'report.winningTrades',
    'report.losingTrades',
    'report.winRate',
    'report.averagePnl',
    'report.averageWin',
    'report.averageLoss',
    'report.winLoss',
    'report.sharpe',
    'report.sortino',
    'report.profitFactor',
    'report.largestWin',
    'report.largestLoss',
    'report.averageBars',
    'report.maxContracts',
    'report.marginCalls',
    'report.sortinoDetail',
    'report.returns',
    'report.trades',
    'report.risk',
    'report.all',
    'report.long',
    'report.short',
    'report.metric',
    'report.keyFigures',
    'equity.endingEquity',
    'equity.annualizedReturn',
    'equity.maxDrawdown',
    'equity.duration',
    'equity.returnDrawdown',
    'equity.winningLosing',
    'equity.bestWorst',
    'charts.maxDrawdown',
    'optimize.setup.objective.isNetProfit',
    'optimize.setup.objective.neighbourhoodMean',
    'optimize.map.objective.neighbourhoodMean',
    'optimize.leaderboard.metric.neighbourhoodMean',
    'optimize.summary.inNet',
    'optimize.summary.outNet',
    'optimize.summary.net',
    'optimize.leaderboard.net',
    'optimize.leaderboard.dd',
    'optimize.leaderboard.trades',
    'optimize.wfResults.is',
    'optimize.wfResults.oos',
    'optimize.wfResults.trades',
    'optimize.wfResults.profitableWindows',
    ...(
      [
        'netProfit',
        'annualizedReturn',
        'profitFactor',
        'averagePnl',
        'maxDrawdown',
        'sharpeRatio',
        'sortinoRatio',
      ] as const
    ).flatMap(
      (metric) =>
        [
          `optimize.map.objective.${metric}`,
          `optimize.setup.objective.${metric}`,
          `optimize.setup.metric.${metric}`,
          `optimize.leaderboard.metric.${metric}`,
        ] as const,
    ),
    ...(['trades', 'winRate', 'consecutiveLosses'] as const).flatMap(
      (metric) =>
        [`optimize.setup.metric.${metric}`, `optimize.leaderboard.metric.${metric}`] as const,
    ),
  ] as const;
  for (const id of ids) {
    assert.notEqual(catalogs.zh[id], catalogs.en[id], id);
    assert.match(catalogs.zh[id], /\p{Script=Han}/u, id);
  }
  assert.equal(catalogs.zh['report.maxDrawdown'], '最大回撤（盘中）');
  assert.equal(catalogs.zh['equity.maxDrawdown'], '最大回撤（收盘）');
  assert.equal(catalogs.zh['charts.maxDrawdown'], '最大回撤（收盘）−{value}%');
  // R1 and W1 retain these established abbreviations; full metric names remain translated.
  assert.equal(catalogs.zh['optimize.leaderboard.pf'], 'PF');
  assert.equal(catalogs.zh['optimize.wfResults.wfe'], 'WFE');
});

test('shared metrics agree across report, ranking, filter presets, leaderboard and parameter map', () => {
  // Optimization profit is marked to market at the range end, so it is named apart from the
  // report's closed-trade Net profit, and the same in every optimization view.
  const profit = catalogs.zh['optimize.setup.objective.netProfit'];
  assert.notEqual(profit, catalogs.zh['report.netProfit']);
  for (const prefix of [
    'optimize.map.objective',
    'optimize.setup.metric',
    'optimize.leaderboard.metric',
  ] as const)
    assert.equal(catalogs.zh[`${prefix}.netProfit`], profit);
  for (const [metric, report] of [
    ['profitFactor', 'report.profitFactor'],
    ['averagePnl', 'report.averagePnl'],
    ['sharpeRatio', 'report.sharpe'],
    ['sortinoRatio', 'report.sortino'],
    ['annualizedReturn', 'optimize.setup.objective.annualizedReturn'],
  ] as const) {
    for (const prefix of [
      'optimize.map.objective',
      'optimize.setup.objective',
      'optimize.setup.metric',
      'optimize.leaderboard.metric',
    ] as const) {
      assert.equal(catalogs.zh[`${prefix}.${metric}`], catalogs.zh[report]);
    }
  }
  assert.equal(catalogs.zh['optimize.setup.metric.winRate'], catalogs.zh['report.winRate']);
  assert.equal(catalogs.zh['optimize.leaderboard.metric.winRate'], catalogs.zh['report.winRate']);
  assert.equal(catalogs.zh['optimize.leaderboard.trades'], catalogs.zh['report.tradeCount']);
  assert.equal(catalogs.zh['optimize.wfResults.trades'], catalogs.zh['report.tradeCount']);
});

test('each area has matching languages and every global id has exactly one owner', () => {
  for (const area of Object.keys(catalogAreas.en) as (keyof typeof catalogAreas.en)[]) {
    assert.deepEqual(
      Object.keys(catalogAreas.en[area]).sort(),
      Object.keys(catalogAreas.zh[area]).sort(),
      area,
    );
  }
  for (const language of ['en', 'zh'] as const) {
    const keys = Object.values(catalogAreas[language]).flatMap(Object.keys);
    assert.equal(new Set(keys).size, keys.length, language);
  }
  assert.ok(Object.hasOwn(catalogAreas.en.core, 'shell.backtest'));
  for (const area of ['optimize', 'data', 'script', 'properties', 'sheet', 'licenses'] as const) {
    assert.ok(Object.keys(catalogAreas.en[area]).length > 0, area);
  }
});

test('component-sheet catalogs register their copy only for tests and dev pages', () => {
  for (const [language, sheet] of Object.entries({ en: sheetEn, zh: sheetZh })) {
    assert.ok(Object.keys(sheet).every((id) => /^(sheet\.|charts\.dev)/.test(id)));
    for (const id of Object.keys(sheet) as (keyof typeof sheetEn)[]) {
      assert.equal(translate(message(id), language as Language), sheet[id]);
    }
  }
});

test('both catalogs cover every package and workflow message id', () => {
  for (const catalog of Object.values(catalogs)) {
    for (const id of [
      ...optimizerMessageIds,
      ...marketDataMessageIds,
      ...workerMessageIds,
      ...workflowMessageIds,
    ]) {
      assert.ok(Object.hasOwn(catalog, id), id);
    }
  }
});

test('workflow values and nested property names translate in both languages', () => {
  const minimum = workflowMessage('backtest.inputBelowMin', { title: 'Multiplier', min: 0.25 });
  assert.equal(translate(minimum, 'en'), 'Multiplier must be at least 0.25');
  assert.equal(translate(minimum, 'zh'), 'Multiplier 不得小于 0.25');
  const property = workflowMessage('backtest.propertyInvalid', {
    property: workflowMessage('backtest.property.initialCapital'),
  });
  assert.equal(translate(property, 'en'), 'Fix the value of Initial capital');
  assert.equal(translate(property, 'zh'), '请修正初始资金的值');
});

test('forex refusal translates its count and latest date with one actionable range in both languages', () => {
  for (const count of [1, 11]) {
    const error = message('feedYahooOhlc', {
      symbol: 'EURUSD=X',
      count,
      date: '2022-12-26',
      percent: 0.05,
    });
    assert.equal(
      translate(error, 'en'),
      `Yahoo returned inconsistent OHLC for EURUSD=X, beyond the 0.05% correction limit. Affected days: ${count}; latest: 2022-12-26. Choose a range that starts after 2022-12-26, or use another data source.`,
    );
    assert.equal(
      translate(error, 'zh'),
      `Yahoo 返回的 EURUSD=X 的 OHLC 存在不一致，超出 0.05% 的修正上限。受影响天数：${count}；最近日期：2022-12-26。请选择起始日期晚于 2022-12-26 的范围，或使用其他数据源。`,
    );
  }
});

test('a count of one reads the singular form, where the catalog has one (bug bash #28)', () => {
  const facts = (count: number) =>
    message('run.facts', { count, bars: String(count), seconds: '0.0' });
  assert.equal(translate(facts(1), 'en'), '1 bar, 0.0 s');
  assert.equal(translate(facts(2), 'en'), '2 bars, 0.0 s');
  assert.equal(translate(facts(1), 'zh'), '1 根 K 线，用时 0.0 秒');
  assert.equal(
    translate(workflowMessage('optimize.fixErrors', { count: 1 }), 'en'),
    'Fix the 1 error above first',
  );
  assert.equal(
    translate(workflowMessage('optimize.fixErrors', { count: 2 }), 'en'),
    'Fix the 2 errors above first',
  );
  assert.equal(
    translate(message('optimize.leaderboard.preview', { count: 1 }), 'en'),
    'Would exclude 1 more set.',
  );
  assert.equal(translate(message('report.bars', { value: '1', count: 1 }), 'en'), '1 bar');
  // An id without a singular form reads as usual for a count of one.
  assert.equal(translate(message('optimize.leaderboard.more', { count: 1 }), 'en'), '+1');
});

test('summary, data and duration counts use singular only for numeric one', () => {
  for (const count of [0, 1, 2, 1000]) {
    const shown = count.toLocaleString('en-US');
    const plural = count === 1 ? '' : 's';
    assert.equal(
      translate(message('optimize.summary.histogram', { count, width: 1000 }), 'en'),
      `${shown} set${plural} · bin width 1,000`,
    );
    assert.equal(
      translate(message('optimize.summary.points', { count }), 'en'),
      `One dot per set · ${shown} set${plural}`,
    );
    assert.equal(
      translate(message('data.fetchingAbout', { count }), 'en'),
      `Fetching about ${shown} bar${plural}`,
    );
    assert.equal(translate(message('csv.rows', { count }), 'en'), `${shown} row${plural}`);
    assert.equal(translate(message('csv.errors', { count }), 'en'), `${shown} error${plural}`);
    assert.equal(
      translate(message('equity.days', { count, value: shown }), 'en'),
      `${shown} day${plural}`,
    );
    assert.equal(
      translate(message('equity.years', { count, value: `${shown}.00` }), 'en'),
      `${shown}.00 year${plural}`,
    );
  }
  assert.equal(
    translate(message('optimize.summary.histogram', { count: 1, width: 1000 }), 'zh'),
    '1 组 · 每格 1,000',
  );
});

test('progress agrees with the total and leaderboard agreement with the passing count', () => {
  for (const total of [1, 6]) {
    const values = { count: total, done: 1, total };
    assert.equal(
      translate(message('optimize.wfResults.completed', values), 'en'),
      `1 / ${total} window${total === 1 ? '' : 's'} done`,
    );
    assert.equal(
      translate(message('optimize.run.progressCount', values), 'en'),
      `1 / ${total} combo${total === 1 ? '' : 's'}`,
    );
    assert.equal(
      translate(message('optimize.leaderboard.pass', { count: 1, passing: 1, total }), 'en'),
      `1 / ${total} passes`,
    );
  }
});

test('script facts pluralize inputs and plots independently', () => {
  for (const inputs of [0, 1, 2]) {
    for (const plots of [0, 1, 2]) {
      const facts = message('script.facts', {
        version: 6,
        inputs: message('script.inputs', { count: inputs }),
        plots: message('script.plots', { count: plots }),
        duration: 4,
      });
      assert.equal(
        translate(facts, 'en'),
        `Pine v6, ${inputs} input${inputs === 1 ? '' : 's'}, ${plots} plot${plots === 1 ? '' : 's'}, compiled in 4 ms`,
      );
      assert.equal(
        translate(facts, 'zh'),
        `Pine v6，${inputs} 个输入，${plots} 条 plot，编译 4 ms`,
      );
    }
  }
});
