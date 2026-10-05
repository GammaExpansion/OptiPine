// Every screen and state of the A 行情终端 direction, one entry per artboard.
// Two pages: 回测 shows ONE parameter set (chart, equity, report, trades, inputs);
// 优化 shows the aggregate over MANY parameter sets (summary chart, leaderboard, map, sensitivity, windows).
import * as D from './data.mjs';
import * as C from './charts.mjs';
import * as X from './x.mjs';
import * as P from './panels.mjs';
import * as O from './over.mjs';
import * as A from './agg.mjs';
import { dockEquity } from './equity.mjs';
import { sheet } from './sheet.mjs';
import {
  I,
  dot,
  seg,
  rmChip,
  addChip,
  header,
  status,
  runBtn,
  cancelBtn,
  R_IDLE,
  dockTabs,
  exportBtn,
  compiled,
  main,
  screen,
  crop,
  backdrop,
} from './ui.mjs';
const { TA, fmt, sfmt } = X;
const f1 = D.f1;
const { PG, PG_DONE } = A;

export const rows = [];
let cur = null;
const row = (title) => rows.push((cur = { title, boards: [] }));
const add = (name, title, html, w = 1440, h = 900) => cur.boards.push({ name, title, html, w, h });
const addCrop = (name, title, html, r) => add(name, title, crop(html, r), r.w, r.h);
const m = (...parts) => main(parts.join('\n'));
const ASIDE = { x: 1104, y: 48, w: 336, h: 852 };
// 优化 results: header 48 + range bar 44 + summary chart 232, selection bar 60 at the bottom
const MAPCOL = { x: 624, y: 324, w: 480, h: 516 };
const LBCOL = { x: 0, y: 324, w: 624, h: 516 };

// ---------- 回测 page
function bt({
  head = {},
  right = R_IDLE,
  top = P.topPrice(),
  tabs = {},
  dock = P.dockReport(),
  side = P.asideParams({ head: '' }),
  overlay = '',
} = {}) {
  return screen({
    head: header({ pages: PG, page: 0, right, ...head }),
    body: m(top, dockTabs({ right: exportBtn('导出报告'), ...tabs }), dock) + side,
    overlay,
  });
}
const top1 = () => P.topPrice();

// ---------- 优化 page
const IDLE_OPT = status('<span class="t3">尚未运行优化</span>');
const DONE_STATUS = status(
  '<span class="t3">优化 2,214 组，用时 10:09</span><a href="#" class="dn">2 组报错</a>',
);
const DONE_SIDE = P.asideOpt({
  head: '',
  footer: A.runFooter('2,214', '组', '上次用时 10:09，7 个线程', '重新优化'),
});
const SEL1 = A.selBar(
  '#1',
  [
    ['Length', '28'],
    ['Multiplier', '2.00'],
    ['Source', 'close'],
    ['止损', '关'],
  ],
  [
    ['样本内', '+22,200', 'up'],
    ['样本外', '+12,340', 'up'],
    ['邻域均值', '+19,090', ''],
  ],
);
function optSetup({
  mode = 'split',
  body = A.emptyOpt,
  side,
  right = IDLE_OPT,
  overlay = '',
} = {}) {
  return screen({
    head: header({ pages: PG, page: 1, right }),
    body: m(A.rangeBar(mode), body) + (side ?? P.asideOpt({ mode, head: '' })),
    overlay,
  });
}
function optDone({
  right = DONE_STATUS,
  mode = 'split',
  chart = A.FAN(),
  lb = {},
  map = {},
  lbCol,
  mapCol,
  sel = SEL1,
  side = DONE_SIDE,
  dim = false,
  pages = PG_DONE,
  overlay = '',
} = {}) {
  const sec = A.section(
    (lbCol ?? P.lbCol({ mode, ...lb })) + (mapCol ?? P.mapCol({ mode, ...map })),
    dim,
  );
  return screen({
    head: header({ pages, page: 1, right }),
    body: m(A.rangeBar(mode === 'many' ? 'split' : mode), chart, sec, sel) + side,
    overlay,
  });
}
const WF_STATUS = status(
  '<span class="t3">滚动 6 窗，用时 29:06</span><a href="#" class="dn">2 组报错</a>',
);
const WF_SIDE = P.asideOpt({
  mode: 'wf',
  head: '',
  footer: A.runFooter('13,284', '次回测', '上次用时 29:06，7 个线程', '重新优化'),
});
const SEL_W3 = A.selBar(
  'W3',
  [
    ['样本外', '2024-07-01 – 09-30'],
    ['选中', '26，2.25，close，关'],
  ],
  [
    ['样本内', '+10,450', 'up'],
    ['样本外', '−860', 'dn'],
    ['WFE', '−0.33', 'dn'],
  ],
  { apply: false },
);
const DIV = '<div style="height: 1px; flex: none; background: #23272d"></div>';
function wfPage({
  right = WF_STATUS,
  top = P.topWF({ viewSwitch: false, shadow: false }),
  dock = P.dockWF(),
  sel = SEL_W3,
  side = WF_SIDE,
  pages = PG_DONE,
} = {}) {
  return screen({ head: header({ pages, page: 1, right }), body: m(top, DIV, dock, sel) + side });
}
const WF_DOCK = { x: 0, y: 411, w: 640, h: 429 };

// =====================================================================  1  开始与行情
row('开始与行情');
{
  const step = (
    n,
    title,
    sub,
    action,
  ) => `<div style="display: flex; align-items: center; gap: 14px; height: 60px; border-top: 1px solid #23272d">
<span class="num t2" style="width: 24px; height: 24px; border-radius: 12px; border: 1px solid #3a4048; display: flex; align-items: center; justify-content: center; font-size: 12px; flex: none">${n}</span>
<div style="flex: 1; display: flex; flex-direction: column; gap: 2px"><span style="font-weight: 600">${title}</span><span class="t2" style="font-size: 12.5px">${sub}</span></div>
<div style="display: flex; gap: 8px">${action}</div>
</div>`;
  const topStart = `<div style="height: 430px; flex: none; display: flex; align-items: center; justify-content: center">
<div style="width: 580px; display: flex; flex-direction: column">
<span style="font-size: 18px; font-weight: 600; margin-bottom: 16px">开始回测</span>
${step(1, '策略', '粘贴 Pine Script v5 / v6 策略，或打开 .pine 文件', `<button class="ghost">${I.paste()}粘贴代码</button><button class="ghost">打开文件</button>`)}
${step(2, '行情', 'Binance、Yahoo Finance，或上传 CSV', '<button class="ghost">选择行情</button>')}
${step(3, '运行', '脚本与回测仅在浏览器本地运行', runBtn({ off: true, kbd: false }))}
<div style="border-top: 1px solid #23272d; padding-top: 14px"><a href="#">载入示例：Trend Breakout，BTCUSDT 1 小时</a></div>
</div>
</div>`;
  const emptyCode = `<section style="flex: 1; min-height: 0; background: #111417; padding-top: 10px">
<div class="code"><div class="cl cu"><span class="ln num">1</span><span><span style="display: inline-block; width: 1.5px; height: 15px; background: #e8eaed; vertical-align: -3px"></span><span style="color: #4f565f">在此粘贴策略代码，或拖入 .pine 文件</span></span></div></div>
</section>`;
  add(
    'S1',
    'S1 首次打开',
    screen({
      head: header({
        pages: PG,
        page: 0,
        pageOff: 1,
        script: { state: 'none' },
        data: null,
        right: status('<span class="t3">请先打开脚本并选择行情</span>') + runBtn({ off: true }),
      }),
      body:
        m(topStart, dockTabs({ active: 'Pine 代码', trades: null }), emptyCode) +
        P.asideNoScript({ head: '' }),
    }),
  );

  addCrop(
    'S2',
    'S2 脚本菜单',
    bt({ head: { open: 'script' }, overlay: O.scriptMenu('left: 302px; top: 44px') }),
    { x: 0, y: 0, w: 660, h: 400 },
  );

  const topNoData = `<div style="height: 430px; flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px">
<span style="font-size: 15px; font-weight: 600">尚未加载行情</span><span class="t2">选择品种与时间范围后，此处显示 K 线</span>
<button class="primary" style="margin-top: 6px">选择行情</button>
</div>`;
  const noData = (overlay) =>
    screen({
      head: header({
        pages: PG,
        page: 0,
        pageOff: 1,
        data: null,
        open: 'data',
        right: status('<span class="t3">选择行情后方可运行</span>') + runBtn({ off: true }),
      }),
      body:
        m(
          topNoData,
          dockTabs({ active: 'Pine 代码', trades: null, right: compiled }),
          P.dockCode({ annot: 'value', to: 19 }),
        ) + P.asideParams({ head: '' }),
      overlay,
    });
  add('S3', 'S3 选择行情 · 搜索品种', noData(backdrop(O.importDialog('search'))));
  const dlg = (state) =>
    `<div style="width: 880px; height: 620px; background: #0e1013">${O.importDialog(state)}</div>`;
  add('S4', 'S4 选择行情 · 获取中', dlg('loading'), 880, 620);
  add('S5', 'S5 选择行情 · 预览', dlg('ready'), 880, 620);
  add('S6', 'S6 选择行情 · Yahoo Finance', dlg('yahoo'), 880, 620);
  add('S7', 'S7 选择行情 · 上传 CSV', dlg('csv'), 880, 620);
  add('S8', 'S8 选择行情 · CSV 解析错误', dlg('csvErr'), 880, 620);
  add('S9', 'S9 选择行情 · 数据源拒绝访问', dlg('feedErr'), 880, 620);
  addCrop('S10', 'S10 改日期范围', bt({ overlay: O.rangePopover('left: 828px; top: 44px') }), {
    x: 600,
    y: 0,
    w: 660,
    h: 300,
  });
}

// =====================================================================  2  回测
row('回测');
{
  add('Main', 'B1 回测 · 报告', bt());
  add(
    'B2',
    'B2 回测 · 成交',
    bt({ tabs: { active: '成交', right: exportBtn('导出成交 CSV') }, dock: P.dockTrades() }),
  );
  add(
    'B3',
    'B3 回测 · Pine 代码',
    bt({
      tabs: { active: 'Pine 代码', right: compiled },
      dock: P.dockCode({ annot: 'value', cursor: 15, to: 19 }),
    }),
  );
  add(
    'B4',
    'B4 代码最大化',
    screen({
      head: header({ pages: PG, page: 0, right: R_IDLE }),
      body:
        m(
          dockTabs({ active: 'Pine 代码', right: compiled, maxed: true }),
          `<section style="flex: 1; min-height: 0; background: #111417; padding-top: 10px; overflow: hidden"><div class="code">${P.codeLines({ annot: 'value', cursor: 23 })}</div></section>`,
        ) + P.asideParams({ head: '' }),
    }),
  );
  add('B5', 'B5 回测 · 权益', bt({ tabs: { active: '权益', right: '' }, dock: dockEquity() }));

  const geo = X.candles2(TA, { w: 1104, h: 314, x0: 8, x1: 1036, y0: 10, y1: 290, axisX: 1046 });
  const hi = 92,
    hb = D.candles.bars[hi],
    t142 = X.trades.find((t) => t.id === 142);
  const tip = `<div class="menu num" style="left: ${f1(geo.X(hi) + 16)}px; top: ${f1(geo.Y(hb.l) + 70)}px; padding: 10px 12px; gap: 6px; width: 232px">
<div style="display: flex; align-items: center; gap: 8px"><span style="font-weight: 600">#142</span><span class="up" style="font-weight: 600">多</span><span style="flex: 1"></span><span class="up" style="font-weight: 600">${sfmt(t142.pnl, 2)}</span></div>
<div style="display: flex; justify-content: space-between"><span class="t2">入场 ${X.fmtMD(t142.in)}</span><span>${fmt(t142.inPx, 2)}</span></div>
<div style="display: flex; justify-content: space-between"><span class="t2">出场 ${X.fmtMD(t142.out)}</span><span>${fmt(t142.outPx, 2)}</span></div>
<div style="display: flex; justify-content: space-between"><span class="t2">持仓 ${t142.bars} 根</span><span class="up">${sfmt(t142.pct, 2)}%</span></div>
</div>`;
  add(
    'B6',
    'B6 悬停与成交定位',
    bt({
      top: P.topPrice({
        chart: { cross: { i: hi, price: hb.c }, sel: 142 },
        legend: { hover: hi },
        over: tip,
      }),
      tabs: { active: '成交', right: exportBtn('导出成交 CSV') },
      dock: P.dockTrades({ sel: 142 }),
    }),
  );

  const c7 = X.candles2(TA, {
    w: 1104,
    h: 298,
    x0: 8,
    x1: 1036,
    y0: 10,
    y1: 274,
    axisX: 1046,
    plots: false,
  });
  const rsi = X.rsiPane(TA, { w: 1104, h: 100, x0: 8, x1: 1036, y0: 28, y1: 92, axisX: 1046 });
  const top7 = `${P.legendPrice({ plots: false })}
<div style="height: 298px; flex: none"><svg width="1104" height="298" viewBox="0 0 1104 298" style="display: block" role="img" aria-label="BTCUSDT 1 小时 K 线">${c7.svg}</svg></div>
<div style="height: 100px; flex: none; position: relative; border-top: 1px solid #23272d">
<svg width="1104" height="100" viewBox="0 0 1104 100" style="display: block" role="img" aria-label="RSI 14 副图">${rsi.svg}</svg>
<div class="num" style="position: absolute; left: 12px; top: 5px; display: flex; align-items: center; gap: 8px; font-size: 12px"><span style="width: 12px; height: 2px; background: #8fb8de"></span><span class="t2">RSI</span><span>${rsi.last.toFixed(1)}</span><span class="t3" style="margin-left: 6px">脚本未叠加主图，plot 显示于副图</span></div>
</div>`;
  addCrop(
    'B7',
    'B7 副图指标',
    bt({ head: { script: { name: 'rsi_reversal.pine', state: 'ok' } }, top: top7 }),
    { x: 0, y: 0, w: 1104, h: 478 },
  );
}

// =====================================================================  3  回测的状态
row('回测的状态');
{
  const progressLine =
    '<div style="position: absolute; left: 0; top: 47px; width: 1440px; height: 2px; background: #3a2c16"><div style="width: 34%; height: 100%; margin-left: 27%; background: #f2a33a"></div></div>';
  add(
    'B8',
    'B8 运行中',
    bt({
      right: status(`${I.spin()}<span>运行中，已用时 1.2 秒</span>`) + cancelBtn('取消'),
      top: P.topPrice({ chart: { markOpacity: 0.3 } }),
      dock: P.dockReport({ dim: true }),
      overlay: progressLine,
    }),
  );

  const staleBanner = `<div style="height: 36px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 16px; background: #241c10; border-bottom: 1px solid #3a2c16; font-size: 12.5px">${I.warn(14)}<span style="color: #f5c27a">当前结果基于 Length 20。</span><span class="t2">重新运行后更新。</span><span style="flex: 1"></span><a href="#">恢复为 20</a></div>`;
  add(
    'B9',
    'B9 参数已修改，结果过期',
    bt({
      right: status(`${dot('#f2a33a')}<span class="am">参数已修改，结果尚未更新</span>`) + runBtn(),
      top: P.topPrice({ chart: { markOpacity: 0.3 } }),
      dock: P.dockReport({ dim: true, banner: staleBanner }),
      side: P.asideParams({ len: '28', changed: ['Length'], head: '' }),
    }),
  );

  const BAD = [...X.PINE];
  BAD[14] = 'basis = ta.sma(src, lenght)';
  BAD[15] = 'dev   = mult * ta.stdev(src, lenght)';
  BAD.splice(18, 0, 'daily = request.security(syminfo.tickerid, "D", close)');
  const issue = (
    icon,
    kind,
    kcls,
    where,
    msg,
    on,
  ) => `<button style="display: flex; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #1b1f24; width: 100%${on ? '; background: #1b1f24' : ''}">
<span style="margin-top: 2px">${icon}</span>
<span style="flex: 1; display: flex; flex-direction: column; gap: 3px"><span style="display: flex; align-items: center; gap: 8px"><span class="tag ${kcls}">${kind}</span><span class="num t2">${where}</span></span><span class="code" style="font-size: 12px; white-space: normal">${msg}</span></span>
</button>`;
  const dockIssues = `<section style="flex: 1; min-height: 0; background: #14171b; display: flex">
<div style="width: 500px; flex: none; border-right: 1px solid #23272d; display: flex; flex-direction: column">
${issue(I.err(), '编译错误', 'dn', '第 15 行，第 21 列', "Undeclared identifier 'lenght'", true)}
${issue(I.err(), '编译错误', 'dn', '第 16 行，第 30 列', "Undeclared identifier 'lenght'")}
${issue(I.block(), '不支持', 'bl', '第 19 行', 'request.security() is not supported')}
<div style="flex: 1"></div>
<div class="t3" style="padding: 12px 16px; font-size: 12px; line-height: 1.5">修正错误后方可运行。「不支持」表示引擎尚未实现该功能，包含此类调用的脚本无法产出结果。</div>
</div>
<div style="flex: 1; min-width: 0; background: #111417; padding-top: 10px; overflow: hidden"><div class="code">${P.codeLines(
    {
      from: 9,
      to: 24,
      src: BAD,
      errs: [
        { line: 15, word: 'lenght' },
        { line: 16, word: 'lenght' },
        { line: 19, word: 'request.security', soft: true },
      ],
    },
  )}</div></div>
</section>`;
  add(
    'B10',
    'B10 编译失败',
    bt({
      head: { script: { name: 'trend_breakout.pine', state: 'err' }, pageOff: 1 },
      right: status('<span class="dn">编译失败，2 个错误</span>') + runBtn({ off: true }),
      top: P.topPrice({
        chart: { plots: false, marks: false },
        legend: { plots: false, tools: false },
      }),
      tabs: { active: '问题', issues: 3, bad: true, trades: null, right: '' },
      dock: dockIssues,
      side: P.asideParams({
        head: '',
        dim: true,
        pre: '<div class="note">以下为上次编译成功时的输入，脚本修正后将刷新。</div>',
      }),
    }),
  );

  const BOTTOM = { x: 0, y: 478, w: 1104, h: 422 };
  addCrop(
    'B11',
    'B11 运行失败',
    bt({
      right: status('<span class="dn">运行失败</span>') + runBtn(),
      top: P.topPrice({ chart: { marks: false } }),
      tabs: { issues: 1, bad: true, trades: null, right: '' },
      dock: P.dockEmpty(
        '运行失败，未生成结果',
        '第 31 行在第 1,203 根 K 线处报错。未完成的运行不展示部分结果。',
        '<button class="ghost">查看问题</button><button class="ghost">定位到第 31 行</button>',
      ),
    }),
    BOTTOM,
  );
  addCrop(
    'B12',
    'B12 无成交',
    bt({
      right: status('<span class="t3">20,488 根 K 线，用时 1.7 秒</span>') + runBtn(),
      top: P.topPrice({ chart: { marks: false } }),
      tabs: { trades: 0, right: '' },
      dock: P.dockEmpty(
        '所选区间内无成交',
        '入场条件未被触发。请更换行情区间，或检查入场条件与参数。',
        '<button class="ghost">查看 Pine 代码</button>',
      ),
    }),
    BOTTOM,
  );

  add('B13', 'B13 策略属性', bt({ side: P.asideProps() }));
  addCrop('B14', 'B14 输入控件状态', bt({ side: P.asideInputs() }), ASIDE);
  add(
    'B15',
    'B15 面板收起',
    screen({
      head: header({ pages: PG, page: 0, right: R_IDLE }),
      body:
        m(P.topPrice({ chartH: 784 }), dockTabs({ collapsed: true })) + P.asideParams({ head: '' }),
    }),
  );

  // arriving from 优化: one parameter set from the leaderboard, previewed without overwriting the current inputs
  const previewBanner = `<div style="height: 40px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 16px; background: #241c10; border-bottom: 1px solid #3a2c16; font-size: 12.5px; white-space: nowrap"><span style="color: #f5c27a">正在预览优化结果 <b class="num" style="font-weight: 700">#1</b> 的参数</span><span class="t2 num">Length 28，Multiplier 2.00，close，关；原参数未被修改</span><span style="flex: 1"></span><button class="ghost" style="height: 28px">返回优化</button><button class="primary" style="height: 28px">设为当前参数</button></div>`;
  add(
    'B16',
    'B16 预览优化结果中的一组参数',
    bt({
      head: { pages: PG_DONE },
      right: status('<span class="t3">20,488 根 K 线，用时 2.1 秒</span>') + runBtn(),
      top: previewBanner + top1(),
      tabs: { trades: 91 },
      dock: P.dockReport({ set: 'top' }),
      side: P.asideParams({ len: '28', changed: ['Length'], from: '#1', head: '' }),
    }),
  );
  const applied = O.toast(
    `${I.check(12, '#3fbf8a')}<span>已应用 #1 的参数并重新回测</span><button class="ghost" style="height: 28px">撤销</button><button class="ghost" style="height: 28px">返回优化</button>`,
    'left: 596px; bottom: 20px',
  );
  addCrop(
    'B17',
    'B17 应用参数后',
    bt({
      head: { pages: PG_DONE },
      right: status('<span class="t3">20,488 根 K 线，用时 2.1 秒</span>') + runBtn(),
      top: top1(),
      tabs: { trades: 91 },
      dock: P.dockReport({ set: 'top' }),
      side: P.asideParams({ len: '28', changed: ['Length'], from: '#1', head: '' }),
      overlay: applied,
    }),
    { x: 560, y: 0, w: 880, h: 900 },
  );
}

// =====================================================================  4  优化 · 设置
row('优化 · 设置');
{
  add('O1', 'O1 优化 · 设置（样本内 / 外）', optSetup());
  add('O2', 'O2 优化 · 设置（不验证）', optSetup({ mode: 'none' }));
  add('O3', 'O3 优化 · 设置（滚动窗口）', optSetup({ mode: 'wf', body: A.wfPlan() + A.emptyOpt }));
  addCrop(
    'O4',
    'O4 取值列表',
    optSetup({
      side: P.asideOpt({
        head: '',
        moreOn: true,
        over: O.valuesPopover('left: 100px; top: 246px'),
      }),
    }),
    { ...ASIDE, h: 600 },
  );
  addCrop(
    'O5',
    'O5 组合数超限，切换随机采样',
    optSetup({ side: P.asideOpt({ head: '', many: true, method: 1 }) }),
    ASIDE,
  );
  addCrop(
    'O6',
    'O6 搜索范围校验错误',
    optSetup({ side: P.asideOpt({ head: '', errs: true }) }),
    ASIDE,
  );
  addCrop(
    'O7',
    'O7 排序目标',
    optSetup({
      side: P.asideOpt({ head: '', objOn: true, over: O.objectiveMenu('left: 16px; top: 138px') }),
    }),
    ASIDE,
  );
  add(
    'O8',
    'O8 优化进行中',
    optDone({
      pages: PG,
      right: status(`${I.spin()}<span>优化中 1,373 / 2,214</span>`) + cancelBtn('取消优化'),
      chart: A.SCATTER(508, false, '已完成 1,373 组'),
      lb: {
        live: true,
        count: '已完成 1,373 / 2,214',
        chips: rmChip('交易数 ≥ 5') + rmChip('最大回撤 ≤ 35%'),
      },
      map: { live: true },
      sel: '',
      side: P.asideOpt({ state: 'running', head: '' }),
    }),
  );
}

// =====================================================================  5  优化 · 结果
row('优化 · 结果');
{
  add('R1', 'R1 优化结果 · 前 20 组权益', optDone());
  add('R2', 'R2 优化结果 · 样本内 vs 样本外', optDone({ chart: A.SCATTER() }));
  add('R2b', 'R2b 优化结果 · 盈亏分布', optDone({ chart: A.HIST() }));
  add(
    'R3',
    'R3 优化结果 · 不验证',
    optDone({
      mode: 'none',
      right: status('<span class="t3">优化 369 组，用时 2:31</span>'),
      chart: A.FAN({ split: false, label: '排行前 20 组（全区间盈亏）' }),
      lb: {
        count: '367 / 369 符合',
        chips:
          rmChip('交易数 ≥ 5') +
          rmChip('最大回撤 ≤ 35%') +
          addChip(),
      },
      sel: A.selBar(
        '#1',
        [
          ['Length', '28'],
          ['Multiplier', '2.00'],
          ['Source', 'close'],
          ['止损', '关'],
        ],
        [
          ['盈亏', '+34,540', 'up'],
          ['邻域均值', '+28,670', ''],
        ],
      ),
      side: P.asideOpt({
        mode: 'none',
        head: '',
        footer: A.runFooter('369', '组', '上次用时 2:31，7 个线程', '重新优化'),
      }),
    }),
  );
  const plus5 = `<div class="menu num" style="left: 218px; top: 196px; padding: 8px 12px; gap: 5px; width: 190px">
${[
  ['Source', 'hl2'],
  ['Use trailing stop', '开'],
  ['Trail %', '3.5'],
  ['ATR length', '21'],
  ['Exit after bars', '10'],
]
  .map(
    ([k, v]) =>
      `<div style="display: flex; justify-content: space-between"><span class="t2">${k}</span><span>${v}</span></div>`,
  )
  .join('')}
</div>`;
  add(
    'R4',
    'R4 优化结果 · 7 个参数',
    optDone({
      mode: 'many',
      right: status('<span class="t3">随机 2,000 组，用时 9:12</span>'),
      chart: A.FAN({ sel: X.equityMany, selEnd: 131350 }),
      lb: { count: '1,962 / 2,000 符合', pop: plus5 },
      sel: A.selBar(
        '#1',
        [
          ['Length', '28'],
          ['Multiplier', '2.00'],
          ['止损', '开'],
          ['Trail %', '2.5'],
          ['Exit', '20'],
        ],
        [
          ['样本内', '+20,410', 'up'],
          ['样本外', '+10,940', 'up'],
        ],
      ),
      side: P.asideOpt({
        many: true,
        method: 1,
        head: '',
        footer: A.runFooter('2,000', '组', '上次用时 9:12，7 个线程', '重新优化'),
      }),
    }),
  );
  add(
    'R5',
    'R5 设置已修改，结果过期',
    optDone({
      right: status(`${dot('#f2a33a')}<span class="am">搜索范围已修改，结果尚未更新</span>`),
      chart: A.FAN({ dim: true }),
      dim: true,
      sel: A.selBar(
        '#1',
        [
          ['Length', '28'],
          ['Multiplier', '2.00'],
          ['Source', 'close'],
          ['止损', '关'],
        ],
        [
          ['样本内', '+22,200', 'up'],
          ['样本外', '+12,340', 'up'],
        ],
        { dim: true },
      ),
      side: P.asideOpt({
        head: '',
        footer: A.runFooter('2,214', '组', '设置已修改，需要重新优化', '重新优化'),
      }),
    }),
  );
}

// =====================================================================  6  优化 · 结果的局部状态
row('优化 · 结果的局部状态');
{
  addCrop('R6', 'R6 单元格悬停', optDone({ map: { hover: [38, 1.5] } }), MAPCOL);
  addCrop('R7', 'R7 格内明细（取值过多时分箱）', optDone({ mapCol: O.mapColBinned() }), MAPCOL);
  addCrop('R8', 'R8 单参数优化', optDone({ mapCol: O.mapColOne() }), MAPCOL);
  addCrop(
    'R9',
    'R9 无符合条件的组合',
    optDone({
      lb: {
        empty: true,
        count: '0 / 2,214 符合',
        chips:
          rmChip('交易数 ≥ 5') +
          rmChip('最大回撤 ≤ 35%') +
          rmChip('盈利因子 ≥ 2.5', 'bad') +
          addChip(),
      },
    }),
    LBCOL,
  );
  addCrop(
    'R10',
    'R10 添加条件',
    optDone({
      lb: {
        chips: rmChip('交易数 ≥ 5') + rmChip('最大回撤 ≤ 35%') + addChip(true),
        pop: O.constraintPopover('left: 292px; top: 40px'),
      },
    }),
    LBCOL,
  );
  add(
    'R11',
    'R11 报错组合',
    `<div style="width: 800px; height: 262px; background: #0e1013">${O.failedDialog()}</div>`,
    800,
    262,
  );
  const drag = `<div style="position: absolute; left: 150px; top: 440px; height: 19px; padding: 0 6px; border-radius: 3px; background: #f2a33a; color: #1a1206; font-size: 11px; font-weight: 700; display: flex; align-items: center; box-shadow: 0 6px 16px rgba(0,0,0,.5)">X</div>${O.cursor(162, 450)}
<div class="t2" style="position: absolute; left: 16px; right: 16px; bottom: 6px; font-size: 12px">释放后 X 轴切换为 Source。键盘操作：空格拾取，方向键选择，Enter 确认。</div>`;
  addCrop(
    'R12',
    'R12 拖动换轴',
    optDone({ map: { sensOpts: { drop: 2, noX: true, rowH: 30 }, over: drag } }),
    MAPCOL,
  );
}

// =====================================================================  7  优化 · 滚动窗口
row('优化 · 滚动窗口');
{
  add('W1', 'W1 滚动窗口结果', wfPage());
  add('W2', 'W2 逐窗视图', wfPage({ top: P.topWF({ view: 'lanes', viewSwitch: false }) }));
  addCrop('W3', 'W3 窗口参数图（六窗平均）', wfPage({ dock: P.dockWF({ rightView: 'map' }) }), {
    x: 640,
    y: 411,
    w: 464,
    h: 429,
  });
  const run = { k: 2, frac: 0.41 };
  add(
    'W4',
    'W4 滚动优化进行中',
    wfPage({
      pages: PG,
      right: status(`${I.spin()}<span>滚动优化中，第 3 / 6 窗</span>`) + cancelBtn('取消优化'),
      top: P.topWF({ done: 2, running: run, viewSwitch: false }),
      dock: P.dockWF({ done: 2, running: run }),
      sel: '',
      side: P.asideOpt({ mode: 'wf', state: 'running', head: '' }),
    }),
  );
  addCrop('W5', 'W5 异常窗口', wfPage({ dock: P.dockWF({ odd: true }) }), WF_DOCK);
  addCrop(
    'W6',
    'W6 样本内固定起点',
    wfPage({ top: P.topWF({ windows: X.WF_A, anchored: true, shadow: false, viewSwitch: false }) }),
    { x: 0, y: 48, w: 1104, h: 362 },
  );
}

// =====================================================================  8  通用
row('通用');
{
  const handle = `<div style="position: absolute; left: 1102px; top: 48px; width: 4px; height: 852px; background: #f2a33a"></div>
<div style="position: absolute; left: 1096px; top: 300px; width: 16px; height: 36px; border-radius: 4px; background: #f2a33a; color: #1a1206; display: flex; align-items: center; justify-content: center">${I.grip()}</div>
<div class="menu num" style="left: 1124px; top: 296px; padding: 8px 12px; flex-direction: row; gap: 12px; align-items: center; white-space: nowrap"><span>右栏 336 px</span><span class="t3" style="font-size: 12px">双击恢复默认</span></div>
<svg width="22" height="14" viewBox="0 0 22 14" style="position: absolute; left: 1093px; top: 344px" aria-hidden="true"><path d="M1 7l5-5v3.5h10V2l5 5-5 5V8.5H6V12z" fill="#e8eaed" stroke="#0e1013" stroke-width="1"/></svg>`;
  addCrop('G1', 'G1 拖动分栏', bt({ overlay: handle }), { x: 820, y: 120, w: 580, h: 380 });

  const pageNav = (on) =>
    `<nav style="display: flex; gap: 16px; align-self: stretch; padding: 0 4px" aria-label="页面"><button class="mtab${on === 0 ? ' on' : ''}">回测</button><button class="mtab${on === 1 ? ' on' : ''}">优化</button></nav>`;
  const cT = X.candles2(TA, { w: 1024, h: 300, x0: 8, x1: 956, y0: 10, y1: 276, axisX: 966 });
  const headT = `<header style="height: 48px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid #23272d">
${I.logo()}
${pageNav(0)}
<div style="width: 1px; height: 22px; background: #23272d"></div>
<button class="tb">${I.file()}<span>trend_breakout.pine</span>${dot('#3fbf8a')}${I.chev()}</button>
<button class="tb"><span style="font-weight: 600">BTCUSDT</span>${I.chev()}</button>
${seg(['15m', '1h', '4h', '1D'], 1, { label: '周期' })}
<div style="flex: 1"></div>
${runBtn({ kbd: false })}
<button class="iconbtn" aria-label="关于与许可证" title="关于与许可证">${I.info()}</button>
<a class="iconbtn" href="https://github.com/GammaExpansion/OptiPine" aria-label="在 GitHub 上查看 OptiPine" title="在 GitHub 上查看 OptiPine">${I.github()}</a>
<button class="iconbtn on" style="width: 32px; height: 32px; background: #1b1f24" aria-label="参数面板" aria-pressed="true">${I.panel()}</button>
</header>`;
  const tablet = `<div style="width: 1024px; height: 768px; display: flex; flex-direction: column; background: #0e1013; color: #e8eaed; overflow: hidden; position: relative">
${headT}
<main style="flex: 1; min-height: 0; display: flex; flex-direction: column">
<div style="height: 32px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px; font-size: 12px; white-space: nowrap"><span style="font-weight: 600; font-size: 13px">BTCUSDT</span><span class="t2">1h</span><span class="num dn">收 96,050　−0.21%</span><div style="flex: 1"></div></div>
<div style="height: 300px; flex: none"><svg width="1024" height="300" viewBox="0 0 1024 300" style="display: block" role="img" aria-label="K 线">${cT.svg}</svg></div>
${dockTabs({ right: exportBtn('导出报告') })}
${P.dockReport()}
</main>
<div style="position: absolute; right: 0; top: 48px; bottom: 0; display: flex; box-shadow: -18px 0 36px rgba(0,0,0,.5)">
${P.asideParams({ head: '' })}
</div>
</div>`;
  add('G2', 'G2 平板：右栏收为抽屉', tablet, 1024, 768);

  // phone: the page switch sits in the header; the second row holds script and data
  const phoneHead = (
    page,
    action,
  ) => `<header style="height: 52px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid #23272d">
${I.logo()}
${seg(['回测', '优化'], page, { label: '页面', style: 'height: 36px', each: 'padding: 0 16px; font-size: 13px' })}
<div style="flex: 1"></div>
${action}
<button class="iconbtn" style="width: 44px; height: 44px; margin-right: -8px" aria-label="关于与许可证" title="关于与许可证">${I.info(17)}</button>
</header>
<div style="height: 48px; flex: none; display: flex; align-items: center; gap: 4px; padding: 0 6px; border-bottom: 1px solid #23272d; white-space: nowrap">
<button class="tb" style="height: 44px; min-width: 0; padding: 0 6px"><span style="overflow: hidden; text-overflow: ellipsis; max-width: 76px">trend_breakout.pine</span>${dot('#3fbf8a')}</button>
<button class="tb" style="height: 44px; padding: 0 6px"><span style="font-weight: 600">BTCUSDT</span>${I.chev()}</button>
<button class="tb" style="height: 44px; padding: 0 6px">1h${I.chev()}</button>
<div style="flex: 1"></div>
<div class="seg" role="group" aria-label="语言"><button class="on">中</button><button>EN</button></div>
<a class="iconbtn" style="width: 44px; height: 44px" href="https://github.com/GammaExpansion/OptiPine" aria-label="在 GitHub 上查看 OptiPine" title="在 GitHub 上查看 OptiPine">${I.github(17)}</a>
</div>`;
  const ptab = (items, on) =>
    `<div style="height: 44px; flex: none; display: flex; align-items: stretch; padding: 0 4px; background: #14171b; border-top: 1px solid #23272d; border-bottom: 1px solid #23272d">${items.map((s, k) => `<button class="dtab${k === on ? ' on' : ''}" style="padding: 0 11px">${s}</button>`).join('')}</div>`;
  const cP = X.candles2(TA, { w: 390, h: 292, x0: 4, x1: 330, y0: 10, y1: 268, axisX: 338 });
  const eqP = C.equityChart(TA, {
    w: 390,
    h: 56,
    x0: 4,
    x1: 330,
    y0: 20,
    y1: 48,
    lo: 99000,
    hi: 126000,
    yearLabels: false,
    baseline: 100000,
    series: [
      { vals: D.equityDefault, color: '#9fb3c8', width: 1.2, area: 'rgba(159,179,200,0.10)' },
    ],
    buckets: 120,
  });
  const tile = (l, v, s, c = '') =>
    `<div style="padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid #1f2328"><span class="t2" style="font-size: 12px">${l}</span><span class="${c}" style="font-size: 19px; font-weight: 600">${v}</span><span class="t3" style="font-size: 12px">${s}</span></div>`;
  const phone1 = `<div style="width: 390px; height: 844px; display: flex; flex-direction: column; background: #0e1013; color: #e8eaed; overflow: hidden">
${phoneHead(0, `<button class="primary" style="height: 44px; padding: 0 14px">${I.play()}运行</button>`)}
<div class="num" style="height: 28px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px; font-size: 12px"><span><span class="t3">开 </span><span class="dn">96,116</span></span><span><span class="t3">高 </span><span class="dn">96,209</span></span><span><span class="t3">低 </span><span class="dn">95,955</span></span><span><span class="t3">收 </span><span class="dn">96,050</span></span></div>
<div style="height: 292px; flex: none"><svg width="390" height="292" viewBox="0 0 390 292" style="display: block" role="img" aria-label="K 线">${cP.svg}</svg></div>
${ptab(['报告', '权益', '成交 <span class="cnt">143</span>', '参数', '代码', '问题'], 0)}
<section class="num" style="flex: 1; min-height: 0; background: #14171b; overflow: hidden">
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))">
${tile('净利润', '+18,420.35', '+18.42%', 'up')}${tile('最大回撤（盘中）', '−7,812.10', '−7.81%')}${tile('盈利因子', '1.62', '多 1.67  空 1.57')}${tile('胜率', '47.55%', '68 胜  75 负')}${tile('交易', '143', '多 78  空 65')}${tile('夏普比率', '1.21', '索提诺 1.87')}
</div>
<div style="padding: 12px 14px 0"><table><thead><tr><th style="color: #e8eaed; font-weight: 600; font-size: 12.5px">收益</th><th>全部</th><th>多头</th><th>空头</th></tr></thead><tbody><tr><td>净利润</td><td class="up">+18,420.35</td><td class="up">+11,230.10</td><td class="up">+7,190.25</td></tr><tr><td>毛利润</td><td>47,930.60</td><td>28,110.40</td><td>19,820.20</td></tr><tr><td>毛亏损</td><td>−29,510.25</td><td>−16,880.30</td><td>−12,629.95</td></tr></tbody></table></div>
</section>
</div>`;
  add('G3', 'G3 手机 · 回测', phone1, 390, 844);

  const fanP = A.fanSvg({ w: 390, h: 150, x0: 4, x1: 330, axisX: 338, labels: false });
  const lrow = (
    [L, M, src, tr, is, oos],
    k,
  ) => `<button style="display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 14px; border-bottom: 1px solid #1b1f24; width: 100%${k === 0 ? '; background: #221b11' : ''}">
<span class="${k === 0 ? 'am' : 't2'}" style="width: 20px; font-weight: 600">${k + 1}</span>
<span style="flex: 1; display: flex; flex-direction: column; gap: 1px"><span>Length ${L}，Mult ${M.toFixed(2)}</span><span class="t3" style="font-size: 12px">${src}，止损${tr}</span></span>
<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 1px"><span class="up">${sfmt(is)}</span><span class="t2" style="font-size: 12px">外 ${sfmt(oos)}</span></span>
</button>`;
  const phone2 = `<div style="width: 390px; height: 844px; display: flex; flex-direction: column; background: #0e1013; color: #e8eaed; overflow: hidden">
${phoneHead(1, '<span class="t3 num" style="font-size: 12px">2,214 组，10:09</span>')}
<div class="num" style="height: 28px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px; font-size: 12px; white-space: nowrap"><span style="font-weight: 600">汇总</span><span class="t2">前 20 组权益</span><span style="display: flex; align-items: center; gap: 5px"><span style="width: 12px; height: 0; border-top: 1.6px dashed #cfd6dd"></span><span class="t2">中位数</span></span><span style="display: flex; align-items: center; gap: 5px"><span style="width: 12px; height: 2px; background: #f2a33a"></span><span class="t2">#1</span></span></div>
<div style="height: 150px; flex: none"><svg width="390" height="150" viewBox="0 0 390 150" style="display: block" role="img" aria-label="排行前 20 组的权益">${fanP}</svg></div>
${ptab(['排行', '参数图', '影响度', '设置'], 0)}
<section class="num" style="flex: 1; min-height: 0; background: #14171b; overflow: hidden; display: flex; flex-direction: column">
<div style="height: 48px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 12px; overflow: hidden; white-space: nowrap"><span class="t3" style="font-size: 12px; margin-right: 2px">2,163 组</span>${rmChip('交易数 ≥ 5')}${rmChip('最大回撤 ≤ 35%')}</div>
${D.LEADER.slice(0, 7).map(lrow).join('\n')}
</section>
<div style="height: 76px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: #1b1f24; border-top: 1px solid #2f353c">
<div class="num" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; white-space: nowrap"><span><span class="am" style="font-weight: 700">#1</span>　28，2.00</span><span class="t2" style="font-size: 12px">内 +22,200　外 +12,340</span></div>
<button class="ghost" style="height: 44px; padding: 0 12px">查看回测</button>
<button class="primary" style="height: 44px; padding: 0 12px">应用参数</button>
</div>
</div>`;
  add('G4', 'G4 手机 · 优化结果', phone2, 390, 844);

  add('G5', 'G5 组件与状态', sheet, 1440, 1120);
}
