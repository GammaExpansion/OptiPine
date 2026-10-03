// Dialogs, menus, popovers and the special parameter-map variants.
import * as D from './data.mjs';
import * as X from './x.mjs';
import { I, dot, cb, sw, seg, select, rmChip } from './ui.mjs';
const { fmt, sfmt } = X;
const f1 = D.f1;

// =====================================================================  import dialog
const BTC_DAILY = (() => {
  const r = D.rng(812);
  const W = [
    [0, 16700],
    [3, 22700],
    [7, 24400],
    [10, 20500],
    [11, 27000],
    [15, 30300],
    [20, 26900],
    [24, 25100],
    [25, 30500],
    [29, 30000],
    [33, 26000],
    [37, 25800],
    [42, 28500],
    [43, 34500],
    [48, 37800],
    [52, 42500],
    [54, 46000],
    [55, 41500],
    [57, 43000],
    [61, 62000],
    [62, 68000],
    [63, 73000],
    [64, 65000],
    [67, 63500],
    [69, 58500],
    [73, 69000],
    [77, 61000],
    [79, 57000],
    [81, 67500],
    [83, 54000],
    [86, 59000],
    [88, 57000],
    [91, 63500],
    [95, 72000],
    [97, 88000],
    [98, 91000],
    [99, 98000],
    [101, 101000],
    [102, 106000],
    [104, 93500],
    [107, 105000],
    [109, 97500],
    [112, 84000],
    [114, 81000],
    [118, 76500],
    [119, 85000],
    [121, 94200],
  ];
  const a = W.map(([w, p]) => [Math.min(D.LAST, w * 7), Math.log(p)]);
  a.push([D.LAST, Math.log(96050)]);
  return D.bridge(a, 0.014, r).map(Math.exp);
})();
const AAPL = (() => {
  const r = D.rng(41);
  return D.bridge(
    [
      [0, 173],
      [60, 191],
      [120, 178],
      [170, 195],
      [230, 172],
      [300, 214],
      [360, 232],
      [410, 227],
      [450, 255],
      [500, 213],
      [501, 205],
    ],
    1.6,
    r,
  );
})();
const miniChart = (vals, lo, hi) => {
  const Xs = D.scale(0, vals.length - 1, 0, 440),
    Y = D.scale(lo, hi, 96, 6);
  return `<svg width="440" height="104" viewBox="0 0 440 104" style="display: block" role="img" aria-label="收盘价预览">
<path d="${D.areaPath(vals, Xs, Y, 100, 220)}" fill="rgba(159,179,200,0.10)"/>
<path d="${D.linePath(vals, Xs, Y, 220)}" fill="none" stroke="#9fb3c8" stroke-width="1.3" stroke-linejoin="round"/>
<line x1="0" x2="440" y1="100.5" y2="100.5" stroke="#23272d" stroke-width="1"/>
</svg>`;
};
const ff = (label, control, hint = '') =>
  `<div style="display: flex; flex-direction: column; gap: 6px"><span class="lab">${label}</span>${control}${hint ? `<span class="t3" style="font-size: 12px; line-height: 1.45">${hint}</span>` : ''}</div>`;
const inp = (v, { icon = '', cls = '', sub = '' } = {}) =>
  `<div class="inp${cls ? ' ' + cls : ''}" style="display: flex; align-items: center; gap: 8px">${icon}<span style="flex: 1">${v}</span>${sub ? `<span class="t3" style="font-size: 12px">${sub}</span>` : ''}</div>`;
const pf = (label, v, cls = '') =>
  `<div style="display: flex; flex-direction: column; gap: 5px"><span class="lab">${label}</span><div class="inp num${cls ? ' ' + cls : ''}" style="height: 30px; display: flex; align-items: center">${v}</div></div>`;
const rangeBlock = (on, from, to, presets = ['1 个月', '1 年', '2 年', '全部', '自定义']) =>
  ff(
    '范围',
    `<div style="display: flex; gap: 6px">${presets.map((p, k) => `<button class="chip${k === on ? ' on' : ''}">${p}</button>`).join('')}</div>
<div class="num" style="display: flex; align-items: center; gap: 8px">${inp(from, { icon: I.cal(13, '#7f8790') })}<span class="t3">至</span>${inp(to, { icon: I.cal(13, '#7f8790') })}</div>`,
  );
const profile = (
  title,
  hint,
  vals,
  cls = '',
) => `<div style="display: flex; flex-direction: column; gap: 8px">
<div style="display: flex; align-items: baseline; justify-content: space-between"><span style="font-weight: 600">${title}</span><span class="t3" style="font-size: 12px">${hint}</span></div>
<div style="display: flex; gap: 8px"><div style="flex: 1; min-width: 0">${pf('最小变动价位', vals[0], cls)}</div><div style="flex: 1; min-width: 0">${pf('合约乘数', vals[1], cls)}</div><div style="flex: 1; min-width: 0">${pf('最小下单量', vals[2], cls)}</div><div style="flex: 1.7; min-width: 0">${pf('时区', vals[3])}</div></div>
</div>`;
const previewHead = (a, b) =>
  `<div style="display: flex; align-items: baseline; justify-content: space-between"><span style="font-weight: 600">预览<span class="t2 num" style="font-weight: 400; margin-left: 10px">${a}</span></span><span class="t3" style="font-size: 12px">${b}</span></div>`;
const kv3 = (rows) =>
  `<div style="display: flex; flex-direction: column">${rows.map(([k, v], i) => `<div class="kv num"${i === rows.length - 1 ? ' style="border-bottom: 1px solid #1f2328"' : ''}><span>${k}</span><span>${v}</span></div>`).join('')}</div>`;

export function importDialog(state = 'ready') {
  const tab = { search: 0, loading: 0, ready: 0, feedErr: 0, yahoo: 1, csv: 2, csvErr: 2 }[state];
  const tabs = [
    ['Binance', '加密现货、永续'],
    ['Yahoo Finance', '股票、ETF、指数、外汇'],
    ['上传 CSV', ''],
  ];
  let left,
    right,
    primary = '<button class="primary">使用此数据</button>';
  const tfB = seg(['1m', '5m', '15m', '1h', '4h', '1D', '1W'], 3, {
    label: '周期',
    style: 'align-self: flex-start',
  });
  if (tab === 0) {
    const results = [
      ['BTCUSDT', 'Bitcoin / TetherUS'],
      ['BTCUSDC', 'Bitcoin / USD Coin'],
      ['BTCFDUSD', 'Bitcoin / First Digital USD'],
      ['BTCEUR', 'Bitcoin / Euro'],
      ['WBTCUSDT', 'Wrapped Bitcoin / TetherUS'],
      ['BTCTRY', 'Bitcoin / Turkish Lira'],
    ];
    const sym =
      state === 'search'
        ? `<div style="position: relative">${inp('BTC<span style="display: inline-block; width: 1.5px; height: 15px; background: #e8eaed; vertical-align: -3px; margin-left: 1px"></span>', { icon: I.search(14), cls: 'foc' })}
<div class="menu" style="left: 0; right: 0; top: 36px">${results.map(([s, n], k) => `<button class="mi${k === 0 ? ' on' : ''}"><span style="font-weight: 600; width: 96px">${s}</span><span class="t2" style="flex: 1">${n}</span><span class="t3" style="font-size: 12px">现货</span></button>`).join('')}</div></div>`
        : inp('<span style="font-weight: 600">BTCUSDT</span>', {
            icon: I.search(14),
            sub: 'Bitcoin / TetherUS',
          });
    left = `${ff('市场', seg(['现货', 'USDⓈ-M 永续'], 0, { label: '市场', style: 'align-self: flex-start' }))}
${ff('品种', sym)}
${ff('周期', tfB)}
${rangeBlock(4, '2023-01-02', '2025-05-04')}
<span class="t3" style="font-size: 12px">单次最多 100,000 根，仅加载已收盘的 K 线。</span>`;
    if (state === 'search') {
      right =
        '<div style="flex: 1; display: flex; align-items: center; justify-content: center"><span class="t3">选择品种与日期并获取数据后，此处显示预览</span></div>';
      primary = '<button class="primary off" aria-disabled="true">获取数据</button>';
    } else if (state === 'loading') {
      right = `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px">
<div style="display: flex; align-items: center; gap: 8px">${I.spin(15)}<span>正在获取 BTCUSDT 1h</span></div>
<div class="bar" style="width: 260px"><i style="width: 58%"></i></div>
<span class="t3 num" style="font-size: 12px">已接收 12,000 根，共约 20,500 根</span>
</div>`;
      primary = `<button class="ghost">${I.stop(10)}取消获取</button>`;
    } else if (state === 'feedErr') {
      right = `<div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px">
<div class="note dn">${I.err(14)}<div style="display: flex; flex-direction: column; gap: 4px"><span style="color: #f5c8c2; font-weight: 600">Binance 拒绝当前地区访问（HTTP 451）</span><span>数据未加载。Binance 在部分地区不可用，可更换数据源或上传 CSV。</span></div></div>
<div style="display: flex; gap: 8px"><button class="ghost">改用 Yahoo Finance</button><button class="ghost">上传 CSV</button><button class="ghost">${I.reset()}重试</button></div>
<span class="t3" style="font-size: 12px; line-height: 1.5">不同数据源的行情不会自动拼接。</span>
</div>`;
      primary = '<button class="primary off" aria-disabled="true">使用此数据</button>';
    } else {
      right = `${previewHead('BTCUSDT，1h', '已缓存，5 分钟内有效')}
${miniChart(BTC_DAILY, 14000, 110000)}
${kv3([
  ['K 线', '20,488 根'],
  ['区间 UTC', '2023-01-02 00:00 – 2025-05-04 23:00'],
  ['交易时段', '24 × 7'],
])}
${profile('品种档案', '由数据源提供，可修改', ['0.01', '1', '0.00001', 'UTC'])}`;
    }
  } else if (tab === 1) {
    left = `${ff('品种', inp('<span style="font-weight: 600">AAPL</span>', { icon: I.search(14), sub: 'Apple Inc.，NASDAQ' }))}
${ff('周期', seg(['5m', '15m', '1h', '1D', '1W'], 3, { label: '周期', style: 'align-self: flex-start' }), '日内周期仅支持最近 730 天。')}
${rangeBlock(2, '2023-05-05', '2025-05-02')}
<span class="t3" style="font-size: 12px">价格采用数据源 OHLC，不另行复权。</span>`;
    right = `${previewHead('AAPL，1D', '已获取')}
${miniChart(AAPL, 160, 262)}
${kv3([
  ['K 线', '502 根'],
  ['区间', '2023-05-05 – 2025-05-02，America/New_York'],
  ['交易时段', 'NASDAQ 常规时段，502 个交易日'],
])}
${profile('品种档案', '', ['0.01', '1', '1', 'America/New_York'], 'foc')}
<div class="note am">${I.warn(14)}<span>Yahoo 未提供交易规则：最小变动价位按报价精度估算，合约乘数与最小下单量默认为 1，请在使用前核对。</span></div>`;
  } else {
    const bad = state === 'csvErr';
    left = `<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px dashed ${bad ? '#7a3a33' : '#3a4048'}; border-radius: 6px">
<div style="display: flex; align-items: center; gap: 10px">${I.file(18, bad ? '#f58a7f' : '#aab1b9')}<div style="flex: 1; display: flex; flex-direction: column"><span style="font-weight: 500">BINANCE_BTCUSDT, 60.csv</span><span class="${bad ? 'errt' : 't3'} num" style="font-size: 12px">${bad ? '1.4 MB，有 2 处错误' : '1.4 MB，20,488 行'}</span></div><button class="ghost" style="height: 28px">更换文件</button></div>
<span class="t3" style="font-size: 12px; line-height: 1.45">支持拖放。接受 TradingView「导出图表数据」格式：time、open、high、low、close、Volume，其中 time 为 Unix 秒。</span>
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">${ff('代码', inp('BTCUSDT'))}${ff('周期', select('1 小时'))}</div>
${ff('品种类型', select('加密货币'))}
${ff('交易日历 JSON（可选）', '<div style="display: flex; align-items: center; gap: 10px"><button class="ghost" style="height: 30px">选择文件</button><span class="t3" style="font-size: 12px">24 × 7 品种无需提供</span></div>')}`;
    if (bad) {
      const rows = [
        [1203, '1687388400,26841.2,26903.7,26799.0,26880.4,812.4', 0],
        [1204, '1687392000,26880.4,26951.3,26842.6,26917.9,790.1', 0],
        [1205, '1687392000,26917.9,26990.0,26872.2,26935.5,655.8', 1],
        [1206, '1687399200,26935.5,27012.4,26901.3,26984.0,701.3', 0],
        [1207, '1687402800,26984.0,26771.9,26910.5,26950.6,688.0', 1],
      ];
      right = `<div style="display: flex; align-items: baseline; justify-content: space-between"><span style="font-weight: 600">文件解析失败</span><span class="t3" style="font-size: 12px">修正后请重新选择文件</span></div>
<div class="note dn" style="flex-direction: column; gap: 6px"><span class="num"><b style="color: #f5c8c2; font-weight: 600">第 1,205 行</b>　time 必须严格递增，不能重复</span><span class="num"><b style="color: #f5c8c2; font-weight: 600">第 1,207 行</b>　最高价低于最低价</span></div>
<div class="code" style="border: 1px solid #23272d; border-radius: 4px; padding: 8px 0; font-size: 12px; overflow: hidden">
${rows.map(([n, s, e]) => `<div class="cl${e ? ' er' : ''}"><span class="ln num" style="width: 52px">${fmt(n)}</span><span>${s}</span></div>`).join('\n')}
</div>
<div style="flex: 1"></div>`;
      primary = '<button class="primary off" aria-disabled="true">使用此数据</button>';
    } else {
      right = `${previewHead('BTCUSDT，1h', '来自文件')}
${miniChart(BTC_DAILY, 14000, 110000)}
${kv3([
  ['K 线', '20,488 根'],
  ['区间 UTC', '2023-01-02 00:00 – 2025-05-04 23:00'],
  ['交易日历', '未载入，按 24 × 7 处理'],
])}
${profile('品种档案', '文件未包含，需手动填写', ['0.01', '1', '0.00001', 'UTC'], 'foc')}`;
    }
  }
  return `<div class="dlg" style="width: 880px; height: 620px">
<div style="height: 52px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 12px 0 20px">
<span style="font-size: 15px; font-weight: 600; flex: 1">选择行情</span>
<button class="iconbtn" aria-label="关闭">${I.x(13)}</button>
</div>
<div style="height: 40px; flex: none; display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid #23272d">
${tabs.map(([n, s], k) => `<button class="dtab${k === tab ? ' on' : ''}">${n}${s ? `<span class="t3" style="font-size: 12px; font-weight: 400">${s}</span>` : ''}</button>`).join('')}
</div>
<div style="flex: 1; min-height: 0; display: flex">
<div style="width: 400px; flex: none; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; border-right: 1px solid #23272d">
${left}
</div>
<div style="flex: 1; min-width: 0; padding: 16px 20px; background: #111417; display: flex; flex-direction: column; gap: 12px">
${right}
</div>
</div>
<div style="height: 60px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-top: 1px solid #23272d">
<span class="t3" style="font-size: 12px; flex: 1">${tab === 2 ? '文件仅在浏览器本地读取，不会上传' : '行情由服务端获取；脚本与回测仅在浏览器本地运行'}</span>
<button class="ghost">取消</button>
${primary}
</div>
</div>`;
}

// =====================================================================  menus and popovers
export const scriptMenu = (style) => `<div class="menu" style="${style}; width: 300px">
<div style="padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 3px"><span style="display: flex; align-items: center; gap: 8px; font-weight: 600">trend_breakout.pine${dot('#3fbf8a')}</span><span class="t3 num" style="font-size: 12px">Pine v6，5 个输入，3 条 plot，编译 38 ms</span></div>
<div class="msep"></div>
<button class="mi">${I.file(14, 'currentColor')}<span style="flex: 1">打开 .pine 文件</span><span class="t3" style="font-size: 12px">Ctrl O</span></button>
<button class="mi">${I.paste()}<span style="flex: 1">从剪贴板粘贴并替换</span></button>
<button class="mi">${I.dl(14)}<span style="flex: 1">下载 .pine</span></button>
<div class="msep"></div>
<div class="mh">示例策略</div>
<button class="mi on"><span style="flex: 1; padding-left: 22px">Trend Breakout</span>${I.check(11, '#f5b155')}</button>
<button class="mi"><span style="flex: 1; padding-left: 22px">RSI Reversal</span></button>
<button class="mi"><span style="flex: 1; padding-left: 22px">MA Cross</span></button>
</div>`;

export const rangePopover = (
  style,
) => `<div class="menu" style="${style}; width: 316px; padding: 12px; gap: 12px">
<div style="display: flex; gap: 6px">${['1 个月', '1 年', '2 年', '全部', '自定义'].map((p, k) => `<button class="chip${k === 4 ? ' on' : ''}">${p}</button>`).join('')}</div>
<div class="num" style="display: flex; align-items: center; gap: 8px"><div class="inp foc" style="display: flex; align-items: center">2024-01-01</div><span class="t3">至</span><div class="inp" style="display: flex; align-items: center">2025-05-04</div></div>
<div style="display: flex; align-items: center; gap: 10px"><span class="t3 num" style="font-size: 12px; flex: 1">约 11,760 根 K 线</span><button class="ghost" style="height: 30px">取消</button><button class="primary" style="height: 30px">重新获取</button></div>
</div>`;

export const valuesPopover = (style) => `<div class="menu" style="${style}; width: 220px">
<div class="mh" style="justify-content: space-between"><span>Source 取值</span><span class="num">已选 3 / 8</span></div>
${['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'].map((s) => `<div class="mi" style="gap: 10px">${cb(['close', 'hl2', 'ohlc4'].includes(s), s)}<span>${s}</span></div>`).join('')}
<div class="msep"></div>
<div class="mh" style="height: auto; padding: 4px 10px 6px; line-height: 1.4">仅保留一个取值时，该输入固定为此值。</div>
</div>`;

export const objectiveMenu = (style) => {
  const it = (s, on) =>
    `<button class="mi${on ? ' on' : ''}"><span style="flex: 1">${s}</span>${on ? I.check(11, '#f5b155') : ''}</button>`;
  return `<div class="menu" style="${style}; width: 304px">
<div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 8px"><span class="t2">方向</span>${seg(['最大', '最小'], 0, { cls: 'sm', label: '优化方向' })}</div>
<div class="msep"></div>
<div class="mh">收益</div>
${it('样本内净利润', true)}${it('年化收益率')}${it('盈利因子')}${it('平均盈亏')}
<div class="mh">风险</div>
${it('最大回撤')}${it('夏普比率')}${it('索提诺比率')}
<div class="mh">稳健</div>
${it('邻域均值（相邻 ±1 步的平均净利润）')}
</div>`;
};

export const constraintPopover = (
  style,
  preview = true,
) => `<div class="menu" style="${style}; width: 320px; padding: 14px; gap: 12px">
<div style="display: flex; align-items: center; justify-content: space-between"><span style="font-weight: 600">添加条件</span><span class="t3" style="font-size: 12px">Esc 关闭</span></div>
<div style="display: flex; flex-direction: column; gap: 6px"><span class="lab">指标</span>${select('盈利因子')}</div>
<div style="display: flex; align-items: flex-end; gap: 10px">
<div style="display: flex; flex-direction: column; gap: 6px"><span class="lab">条件</span>${seg(['≥', '≤'], 0, { label: '条件', each: 'width: 40px' })}</div>
<div style="flex: 1; display: flex; flex-direction: column; gap: 6px"><span class="lab">值</span><div class="inp num foc" style="display: flex; align-items: center">1.3</div></div>
</div>
<div style="display: flex; flex-direction: column; gap: 6px"><span class="lab">常用</span><div style="display: flex; flex-wrap: wrap; gap: 6px">${['盈利因子 ≥ 1.2', '胜率 ≥ 45%', '夏普比率 ≥ 1.0', '平均盈亏 ≥ 0', '连续亏损 ≤ 6'].map((c) => `<button class="chip num">${c}</button>`).join('')}</div></div>
${preview ? '<div class="note num"><span>将额外排除 <b style="color: #e8eaed; font-weight: 600">312</b> 组；当前第 2、10、12、13 名将移出排行。</span></div>' : '<div class="note"><span>条件仅筛选排行，无需重新优化。</span></div>'}
<div style="display: flex; justify-content: flex-end; gap: 8px"><button class="ghost" style="height: 30px">取消</button><button class="primary" style="height: 30px">添加</button></div>
</div>`;

export const failedDialog = () => `<div class="dlg" style="width: 800px">
<div style="height: 52px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 12px 0 20px">
<span style="font-size: 15px; font-weight: 600">2 组报错</span><span class="t3 num" style="flex: 1; font-size: 12.5px">其余 2,212 组正常完成，报错组合不计入排行</span>
<button class="iconbtn" aria-label="关闭">${I.x(13)}</button>
</div>
<div style="padding: 0 20px 4px">
<table class="lb num" style="table-layout: fixed">
<colgroup><col style="width: 226px"><col><col style="width: 132px"></colgroup>
<thead><tr><th style="text-align: left; padding-left: 0">参数</th><th style="text-align: left">错误</th><th></th></tr></thead>
<tbody>
<tr><td style="padding-left: 0; height: 58px; color: #e8eaed">Length 10，Mult 1.00，ohlc4，开</td><td style="text-align: left; white-space: normal; height: 58px"><div style="display: flex; flex-direction: column; gap: 2px"><span style="display: flex; align-items: center; gap: 6px">${I.err(13)}运行时错误，第 31 行，第 1,203 根 K 线</span><span class="code t2" style="font-size: 12px">strategy.exit: trail_points must be greater than 0</span></div></td><td style="height: 58px"><button class="ghost" style="height: 28px">以此参数回测</button></td></tr>
<tr><td style="padding-left: 0; height: 58px; color: #e8eaed">Length 10，Mult 1.25，ohlc4，开</td><td style="text-align: left; white-space: normal; height: 58px"><div style="display: flex; flex-direction: column; gap: 2px"><span style="display: flex; align-items: center; gap: 6px">${I.err(13)}运行时错误，第 31 行，第 1,203 根 K 线</span><span class="code t2" style="font-size: 12px">strategy.exit: trail_points must be greater than 0</span></div></td><td style="height: 58px"><button class="ghost" style="height: 28px">以此参数回测</button></td></tr>
</tbody>
</table>
</div>
<div style="height: 60px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 20px">
<span class="t3" style="font-size: 12px; flex: 1">「以此参数回测」将把该组参数填入参数栏并运行，诊断信息列于「问题」页签。</span>
<button class="ghost">${I.dl(14)}导出列表</button><button class="ghost">关闭</button>
</div>
</div>`;

export const toast = (html, style) => `<div class="toast" style="${style}">${html}</div>`;
export const cursor = (x, y) =>
  `<svg width="16" height="20" viewBox="0 0 16 20" style="position: absolute; left: ${x}px; top: ${y}px" aria-hidden="true"><path d="M2 1.5v14l3.8-3.4 2.6 6 2.4-1-2.6-5.9H13z" fill="#e8eaed" stroke="#0e1013" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

// =====================================================================  parameter-map variants
const axisBtn = (k, v) =>
  `<button style="display: inline-flex; align-items: center; gap: 5px"><span class="t3">${k}</span>${v}${I.chev(10)}</button>`;
const ramp = (lo, hi) =>
  `<span class="t3" style="margin-right: 4px">${lo}</span>` +
  X.HEAT_A.map(
    (b, k) =>
      (k === 3 ? '<span style="margin: 0 5px" class="t2">0</span>' : '') +
      `<span style="width: 20px; height: 10px; background: ${b.color}"></span>`,
  ).join('') +
  `<span class="t3" style="margin-left: 4px">${hi}</span>`;
const mapHead = (
  title = '参数图',
  right = `${seg(['样本内', '样本外'], 0, { cls: 'sm', label: '区间' })}<span style="display: flex; align-items: center; gap: 7px; font-size: 12.5px" class="t2">平滑${sw(false, '平滑')}</span>`,
) => `<div style="height: 44px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 16px">
<span style="font-weight: 600; flex: 1">${title}</span>
${right}
</div>`;

// Length 5–200 (196 values): 9 values per square cell, one cell opened at full resolution
export function mapColBinned() {
  const ax = X.squareAxis(X.wide.Lw, 416),
    p = ax.pitch;
  const g = X.binCols(X.wide.full, ax.n),
    [gLo, gHi] = X.gridRange(g);
  const bi = ax.bin(27),
    bj = D.Ms.indexOf(2); // Length 23–31 × Multiplier 2.00
  const inBin = ax.members(bi);
  const mx = 48 + Math.round((416 - ax.nb * p) / 2),
    mh = D.Ms.length * p;
  const h = X.heat2({
    g,
    x: mx,
    y: 6,
    cell: p,
    bins: X.HEAT_A,
    labelSize: 10.5,
    ring: [{ at: [bi, bj], color: '#e8eaed', width: 1.5, dash: '3 2' }],
    xLabels: [5, 50, 104, 149, 194].map((L) => [ax.bin(L), ax.label(ax.bin(L))]),
    yLabels: [
      [0, '1.00'],
      [2, '1.50'],
      [4, '2.00'],
      [6, '2.50'],
      [8, '3.00'],
    ],
  });
  // the window: the cell's own values, then whole neighbouring values until ten across; five rows around it
  const Lw = [...inBin, inBin.at(-1) + 1],
    Mw = [2.5, 2.25, 2, 1.75, 1.5];
  const val = (L, M) => X.wide.full[L - 5][D.Ms.indexOf(M)];
  const binOf = (v) => X.HEAT_A.find((b) => v >= b.min && v < b.max);
  const wx0 = h.cx(bi),
    wx1 = h.cx(bi) + (Lw.length / ax.n) * p - 2;
  const wy0 = h.cy(D.Ms.indexOf(Mw[0])),
    wy1 = h.cy(D.Ms.indexOf(Mw.at(-1))) + p - 2;
  let grid = `<div class="num" style="display: grid; grid-template-columns: 30px repeat(${Lw.length}, 23px); gap: 1px; font-size: 10.5px">`;
  for (const M of Mw) {
    grid += `<span class="t3" style="display: flex; align-items: center; font-size: 11px">${M.toFixed(2)}</span>`;
    for (const L of Lw) {
      const v = val(L, M),
        b = binOf(v),
        inCell = M === 2 && inBin.includes(L);
      const light = ['#56abd3', '#a6ddf2'].includes(b.color);
      grid += `<span style="height: 20px; display: flex; align-items: center; justify-content: center; background: ${b.color}; color: ${light ? '#0e1013' : '#e8eaed'}${inCell ? '; box-shadow: inset 0 0 0 1.5px #e8eaed; font-weight: 600' : ''}">${(v / 1000).toFixed(0)}</span>`;
    }
  }
  grid += `<span></span>${Lw.map((L) => `<span class="t3" style="text-align: center; font-size: 11px; padding-top: 3px">${L}</span>`).join('')}</div>`;
  const vals = inBin.map((L) => [L, val(L, 2)]);
  const mean = vals.reduce((a, [, v]) => a + v, 0) / vals.length;
  const ROW = 19,
    SHOW = 6;
  const row = (a, b, style = '') =>
    `<div style="height: ${ROW}px; display: flex; align-items: center; justify-content: space-between${style}">${a}${b}</div>`;
  const list = `<div class="num" style="display: flex; flex-direction: column; font-size: 12.5px">
${row('<span class="t3">Length</span>', '<span class="t3">净利润</span>', '; padding-right: 10px; border-bottom: 1px solid #23272d')}
<div style="height: ${ROW * SHOW}px; overflow: hidden; position: relative; padding-right: 10px">
${vals.map(([L, v]) => row(`<span class="t2">${L}</span>`, `<span class="up">${sfmt(Math.round(v / 10) * 10)}</span>`)).join('\n')}
<span style="position: absolute; right: 1px; top: 2px; width: 3px; height: ${Math.round(((ROW * SHOW - 4) * SHOW) / vals.length)}px; border-radius: 2px; background: #3a4048"></span>
</div>
${row('<span style="font-weight: 600">均值</span>', `<span style="font-weight: 600">${sfmt(Math.round(mean / 10) * 10)}</span>`, '; height: 22px; padding-right: 10px; border-top: 1px solid #2f353c')}
</div>`;
  return `<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative">
${mapHead()}
<div class="num" style="height: 30px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 16px; font-size: 12.5px; white-space: nowrap">
${axisBtn('X', 'Length')}${axisBtn('Y', 'Multiplier')}
<span style="width: 1px; height: 14px; background: #2f353c"></span>
<span class="t2">Length 共 ${X.wide.Lw.length} 个取值</span>
</div>
<div style="height: ${mh + 46}px; flex: none; position: relative">
<svg width="480" height="${mh + 46}" viewBox="0 0 480 ${mh + 46}" style="display: block" role="img" aria-label="分箱后的 Length × Multiplier 热力图，选中 Length ${ax.label(bi)}、Multiplier 2.00">
${h.svg}
<path d="M${f1(wx0)} ${f1(6 + mh + 2)}H${f1(wx1)}" stroke="#e8eaed" stroke-width="2"/>
<path d="M${f1(mx - 3)} ${f1(wy0)}V${f1(wy1)}" stroke="#e8eaed" stroke-width="2"/>
<text x="256" y="${mh + 40}" fill="#aab1b9" font-size="11.5" text-anchor="middle">Length<tspan fill="#7f8790"> · 每格 ${ax.n} 个值取平均</tspan></text>
</svg>
</div>
<div class="num" style="height: 30px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 16px; font-size: 11.5px"><span class="t3">净利润</span><div style="display: flex; align-items: center; gap: 2px">${ramp(X.kv(gLo), X.kv(gHi))}</div></div>
<div style="flex: 1; min-height: 0; border-top: 1px solid #1f2328; padding: 8px 16px 0; display: flex; flex-direction: column; gap: 8px">
<div style="display: flex; align-items: center; gap: 10px; height: 24px"><span style="font-weight: 600">格内明细</span><span class="t2 num" style="flex: 1">Length ${ax.label(bi)}，Multiplier 2.00</span><button class="iconbtn" style="width: 24px; height: 24px" aria-label="关闭明细">${I.x(11)}</button></div>
<div style="display: flex; gap: 18px">
<div style="flex: none; width: ${30 + Lw.length * 24}px; display: flex; flex-direction: column; gap: 6px">
${grid}
<span class="t3" style="font-size: 12px">原始分辨率，单位：千。白框为构成该格的 ${inBin.length} 个取值。</span>
</div>
<div style="flex: 1; min-width: 0">
${list}
</div>
</div>
</div>
</div>`;
}

// one active parameter: the objective as a curve
export function mapColOne() {
  return `<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative">
${mapHead('目标曲线', `<span style="display: flex; align-items: center; gap: 6px; font-size: 12px"><span style="width: 14px; height: 2px; background: #6cb6dd"></span><span class="t2">样本内</span></span><span style="display: flex; align-items: center; gap: 6px; font-size: 12px"><span style="width: 14px; height: 2px; background: #f2a33a"></span><span class="t2">样本外</span></span><span style="display: flex; align-items: center; gap: 7px; font-size: 12.5px; margin-left: 6px" class="t2">平滑${sw(false, '平滑')}</span>`)}
<div class="num" style="height: 30px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 16px; font-size: 12.5px; white-space: nowrap">
<span><span class="t3">X </span>Length</span>
<span style="width: 1px; height: 14px; background: #2f353c"></span>
<span class="t2">仅一个输入参与优化，以曲线代替热力图</span>
</div>
<div style="height: 266px; flex: none; position: relative">
<svg width="480" height="266" viewBox="0 0 480 266" style="display: block" role="img" aria-label="净利润随 Length 的变化，样本内与样本外各一条，选中 Length 28">
${X.curve1d({ x0: 56, x1: 460, y0: 12, y1: 214 })}
</svg>
</div>
<div style="flex: 1; min-height: 0; border-top: 1px solid #1f2328; padding: 10px 16px 0; display: flex; flex-direction: column">
<div style="display: flex; align-items: baseline; height: 24px"><span style="font-weight: 600">Length 28</span></div>
<div class="kv num"><span>样本内净利润</span><span class="up">+22,200</span></div>
<div class="kv num"><span>样本外净利润</span><span class="up">+12,340</span></div>
<div class="kv num"><span>邻域均值（±1 步）</span><span>+19,090</span></div>
<div class="kv num" style="border-bottom: 1px solid #1f2328"><span>样本内不低于峰值 90% 的区间</span><span>24 – 29</span></div>
</div>
</div>`;
}
