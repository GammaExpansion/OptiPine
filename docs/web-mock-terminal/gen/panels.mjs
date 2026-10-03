// Chart areas, bottom-dock panels and right-panel views.
import * as D from './data.mjs';
import * as C from './charts.mjs';
import * as X from './x.mjs';
import {
  I,
  dot,
  cb,
  sw,
  seg,
  select,
  numField,
  rmChip,
  addChip,
  rtabs,
  aside,
  exportBtn,
} from './ui.mjs';
const { TA, fmt, sfmt } = X;
const f1 = D.f1;
const AX = (d, x0 = 8, x1 = 1036) => x0 + (d / D.LAST) * (x1 - x0);

// =====================================================================  chart area
export const viewSeg = (on) => seg(['K 线', '权益'], on, { cls: 'sm', label: '图表' });
const chartTools = `<button class="iconbtn on" aria-label="显示成交标记" aria-pressed="true">${I.marks()}</button><button class="iconbtn" aria-label="重置缩放">${I.fit()}</button>`;

export function legendPrice({
  hover = null,
  plots = true,
  view = 0,
  tools = true,
  sym = 'BTCUSDT',
  tf = '1h',
  viewSwitch = false,
} = {}) {
  const bars = D.candles.bars;
  const i = hover ?? bars.length - 1;
  const b = bars[i],
    p = bars[i - 1];
  const chg = ((b.c - p.c) / p.c) * 100;
  const c = b.c >= b.o ? 'up' : 'dn';
  const plot = (color, h, name, v) =>
    `<span style="display: flex; align-items: center; gap: 6px"><span style="width: 12px; height: ${h}px; background: ${color}"></span><span class="t2">${name}</span><span>${v}</span></span>`;
  return `<div style="height: 32px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 12px; font-size: 12px; white-space: nowrap">
<div style="display: flex; align-items: center; gap: 6px"><span style="font-weight: 600; font-size: 13px">${sym}</span><span class="t2">${tf}</span></div>
<div class="num" style="display: flex; align-items: center; gap: 10px">
<span><span class="t3">开 </span><span class="${c}">${fmt(b.o)}</span></span>
<span><span class="t3">高 </span><span class="${c}">${fmt(b.h)}</span></span>
<span><span class="t3">低 </span><span class="${c}">${fmt(b.l)}</span></span>
<span><span class="t3">收 </span><span class="${c}">${fmt(b.c)}</span></span>
<span class="${chg >= 0 ? 'up' : 'dn'}">${(chg >= 0 ? '+' : '−') + Math.abs(chg).toFixed(2)}%</span>
</div>
${plots ? `<div class="num" style="display: flex; align-items: center; gap: 12px">${plot('#2bb3a3', 2, 'Basis', fmt(b.basis))}${plot('#6f7782', 1, 'Upper', fmt(b.upper))}${plot('#6f7782', 1, 'Lower', fmt(b.lower))}</div>` : ''}
<div style="flex: 1"></div>
${viewSwitch ? viewSeg(view) : ''}
${tools ? `<div style="display: flex; gap: 2px">${chartTools}</div>` : ''}
</div>`;
}

export function navStrip(
  kind = 'eq',
  {
    dim = false,
    vals = D.equityDefault,
    end = 118420,
    hi = 126000,
    label = ['118,420.35', '+18.42%'],
  } = {},
) {
  const split = kind === 'split' ? D.IS_END : undefined;
  const t = {
    ...TA,
    isFill: split ? 'rgba(108,182,221,0.10)' : null,
    oosFill: split ? 'rgba(242,163,58,0.13)' : null,
  };
  let svg = '',
    over = '';
  if (kind === 'empty') {
    over =
      '<span class="t3" style="position: absolute; left: 12px; top: 6px; font-size: 12px">权益</span><span class="t3" style="position: absolute; left: 0; right: 68px; top: 34px; text-align: center; font-size: 12.5px">运行回测后显示全区间权益</span>';
  } else if (kind === 'wf') {
    const lanes = D.WF.map((w, k) => {
      const y = 24 + k * 9;
      return `<rect x="${f1(AX(w.isFrom))}" y="${y}" width="${f1(AX(w.isTo + 1) - AX(w.isFrom))}" height="6" rx="1" fill="#3b6f8c"/><rect x="${f1(AX(w.oosFrom))}" y="${y}" width="${f1(AX(w.oosTo + 1) - AX(w.oosFrom))}" height="6" rx="1" fill="#f2a33a"/>${k === 0 || k === 5 ? `<text x="1046" y="${y + 7}" fill="#7f8790" font-size="10.5">${w.id}</text>` : ''}`;
    }).join('');
    svg =
      lanes +
      [
        [D.dayOf(2023, 7, 1), '2023-07'],
        [D.dayOf(2024, 1, 1), '2024-01'],
        [D.dayOf(2024, 7, 1), '2024-07'],
        [D.dayOf(2025, 1, 1), '2025-01'],
      ]
        .map(
          ([d, s]) =>
            `<line x1="${f1(AX(d))}" x2="${f1(AX(d))}" y1="20" y2="78" stroke="#1f2328" stroke-width="1"/>`,
        )
        .join('');
    over = `<div class="num" style="position: absolute; left: 12px; top: 4px; display: flex; align-items: center; gap: 14px; font-size: 12px"><span>6 个窗口</span><span style="display: flex; align-items: center; gap: 6px"><span style="width: 8px; height: 8px; border-radius: 2px; background: #3b6f8c"></span><span class="t2">样本内 12 个月</span></span><span style="display: flex; align-items: center; gap: 6px"><span style="width: 8px; height: 8px; border-radius: 2px; background: #f2a33a"></span><span class="t2">样本外 3 个月</span></span></div>`;
  } else {
    svg = C.equityChart(t, {
      w: 1104,
      h: 84,
      x0: 8,
      x1: 1036,
      y0: 24,
      y1: 64,
      lo: 99000,
      hi,
      split,
      bandPad: 22,
      series: [
        {
          vals: kind === 'flat' ? vals.map(() => 100000) : vals,
          color: '#9fb3c8',
          width: 1.3,
          area: kind === 'flat' ? null : 'rgba(159,179,200,0.10)',
        },
      ],
      baseline: 100000,
      timeBottom: 4,
      axisSize: 10.5,
      axisX: 1046,
      labelsAt: [{ v: kind === 'flat' ? 100000 : end, tag: '#2f353c', on: '#e8eaed' }],
    });
    if (kind === 'eq')
      svg +=
        '<rect x="1021.5" y="2.5" width="14" height="67" rx="2" fill="rgba(242,163,58,0.14)" stroke="#f2a33a" stroke-width="1"/><rect x="1019.5" y="28" width="4" height="16" rx="1.5" fill="#f2a33a"/><rect x="1033.5" y="28" width="4" height="16" rx="1.5" fill="#f2a33a"/>';
    if (kind === 'eq')
      over =
        '<div class="num" style="position: absolute; left: 12px; top: 6px; display: flex; align-items: baseline; gap: 8px; font-size: 12px; pointer-events: none"><span class="t2">权益</span><span style="font-weight: 600">' +
        label[0] +
        '</span><span class="up">' +
        label[1] +
        '</span></div>';
    if (kind === 'flat')
      over =
        '<div class="num" style="position: absolute; left: 12px; top: 6px; display: flex; align-items: baseline; gap: 8px; font-size: 12px"><span class="t2">权益</span><span style="font-weight: 600">100,000.00</span><span class="t2">0.00%</span></div>';
    if (kind === 'plain')
      over =
        '<div class="num" style="position: absolute; left: 12px; top: 5px; display: flex; align-items: center; gap: 8px; font-size: 12px; pointer-events: none"><span style="width: 8px; height: 8px; border-radius: 2px; background: #6cb6dd"></span><span>全部用于优化</span><span class="t2">2023-01-02 – 2025-05-04</span></div>';
    if (kind === 'split')
      over = `<div class="num" style="position: absolute; left: 12px; top: 5px; display: flex; align-items: center; gap: 8px; font-size: 12px; pointer-events: none"><span style="width: 8px; height: 8px; border-radius: 2px; background: #6cb6dd"></span><span>样本内</span><span class="t2">2023-01-02 – 2024-08-20</span></div>
<div class="num" style="position: absolute; left: 738px; top: 5px; display: flex; align-items: center; gap: 8px; font-size: 12px; pointer-events: none"><span style="width: 8px; height: 8px; border-radius: 2px; background: #f2a33a"></span><span>样本外</span><span class="t2">2024-08-21 – 2025-05-04</span></div>
<button class="num" aria-label="拖动调整样本内外分界" style="position: absolute; left: ${f1(AX(D.IS_END))}px; top: 30px; transform: translateX(-50%); height: 22px; padding: 0 8px; border-radius: 11px; background: #f2a33a; color: #1a1206; font-size: 11.5px; font-weight: 600; display: flex; align-items: center; gap: 5px; white-space: nowrap"><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M3.5 1.5L0.5 5l3 3.5zM6.5 1.5l3 3.5-3 3.5z"/></svg>70 / 30</button>`;
  }
  return `<div style="height: 84px; flex: none; position: relative; border-top: 1px solid #23272d${dim ? '; opacity: 0.4' : ''}">
<svg width="1104" height="84" viewBox="0 0 1104 84" style="display: block" role="img" aria-label="全区间权益">
${svg}
</svg>
${over}
</div>`;
}

export function topPrice({
  nav = null,
  chartH = 398,
  chart = {},
  legend = {},
  navOpts = {},
  over = '',
} = {}) {
  const c = X.candles2(TA, {
    w: 1104,
    h: chartH,
    x0: 8,
    x1: 1036,
    y0: 10,
    y1: chartH - 24,
    axisX: 1046,
    ...chart,
  });
  return `${legendPrice(legend)}
<div style="height: ${chartH}px; flex: none; position: relative">
<svg width="1104" height="${chartH}" viewBox="0 0 1104 ${chartH}" style="display: block" role="img" aria-label="BTCUSDT 1 小时 K 线">
${c.svg}
</svg>
${over}
</div>
${nav ? navStrip(nav, navOpts) : ''}`;
}

// selected trial's equity over the whole range (optimizer results)
export function topEquity({
  mode = 'split',
  label = '#1',
  pick = 'Length 28，Multiplier 2.00，close，关',
  vals = D.equityTop,
  end = 134540,
  dim = false,
  nets = ['+22,200', '+12,340'],
  viewSwitch = true,
} = {}) {
  const split = mode === 'split';
  const t = {
    ...TA,
    isFill: split ? 'rgba(108,182,221,0.07)' : null,
    oosFill: split ? 'rgba(242,163,58,0.09)' : null,
    split: '#f2a33a',
    splitDash: '0',
  };
  const sx = AX(D.IS_END);
  let svg = C.equityChart(t, {
    w: 1104,
    h: 236,
    x0: 8,
    x1: 1036,
    y0: 28,
    y1: 212,
    lo: 97000,
    hi: 137000,
    split: split ? D.IS_END : undefined,
    bandPad: 28,
    gridVals: [100000, 110000, 120000, 130000],
    axisVals: [100000, 110000, 130000],
    axisX: 1046,
    timeTicks: false,
    series: [
      { vals: D.equityDefault, color: '#7f8790', width: 1.2, dash: '4 3' },
      { vals, color: '#f2a33a', width: 1.8, dot: true, area: 'rgba(242,163,58,0.06)' },
    ],
    labelsAt: [
      { v: 118420, tag: '#2f353c', on: '#e8eaed' },
      { v: end, tag: '#f2a33a', on: '#1a1206' },
    ],
  });
  if (split)
    svg += `<text x="${f1(sx - 8)}" y="17" fill="#6cb6dd" font-size="11.5" text-anchor="end">样本内 ${nets[0]}</text><text x="${f1(sx + 8)}" y="17" fill="#f5b155" font-size="11.5">样本外 ${nets[1]}</text>`;
  return `<div style="height: 32px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 12px; font-size: 12px; white-space: nowrap">
<span style="font-weight: 600; font-size: 13px">权益</span>
<div class="num" style="display: flex; align-items: center; gap: 12px">
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 2px; background: #f2a33a"></span><span>${label}</span><span class="t2">${pick}</span></span>
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 0; border-top: 1.5px dashed #7f8790"></span><span class="t2">当前参数</span></span>
</div>
<div style="flex: 1"></div>
${viewSwitch ? viewSeg(1) : ''}
</div>
<div style="height: 236px; flex: none; position: relative${dim ? '; opacity: 0.4' : ''}">
<svg width="1104" height="236" viewBox="0 0 1104 236" style="display: block" role="img" aria-label="选中组合与当前参数的全区间权益">
${svg}
</svg>
</div>`;
}

// backtest equity view: equity, drawdown, hover readout
export function topEquityBT({ viewSwitch = true } = {}) {
  const X0 = 8,
    X1 = 1036;
  const hd = 437; // hovered day: the equity peak
  const hx = AX(hd);
  const Y = D.scale(97000, 127000, 290, 14);
  const eq = C.equityChart(TA, {
    w: 1104,
    h: 314,
    x0: X0,
    x1: X1,
    y0: 14,
    y1: 290,
    lo: 97000,
    hi: 127000,
    gridVals: [100000, 110000, 120000],
    axisVals: [100000, 110000, 125000],
    axisX: 1046,
    baseline: 100000,
    timeBottom: 6,
    series: [
      { vals: D.equityDefault, color: '#f2a33a', width: 1.7, area: 'rgba(242,163,58,0.07)' },
    ],
    labelsAt: [{ v: 118420, tag: '#f2a33a', on: '#1a1206' }],
  });
  const v = D.equityDefault[hd];
  const cross = `<line x1="${f1(hx)}" x2="${f1(hx)}" y1="14" y2="290" stroke="#aab1b9" stroke-width="1" stroke-dasharray="3 3"/><circle cx="${f1(hx)}" cy="${f1(Y(v))}" r="4" fill="#f2a33a" stroke="#0e1013" stroke-width="2"/>`;
  const dd = D.drawdown(D.equityDefault);
  const ddSvg =
    C.equityChart(TA, {
      w: 1104,
      h: 84,
      x0: X0,
      x1: X1,
      y0: 22,
      y1: 70,
      lo: -8500,
      hi: 0,
      gridVals: [0],
      yearLabels: false,
      series: [
        { vals: dd, color: '#f06a5d', width: 1, area: 'rgba(240,106,93,0.20)', areaBase: 0 },
      ],
    }) +
    `<line x1="${f1(hx)}" x2="${f1(hx)}" y1="0" y2="84" stroke="#aab1b9" stroke-width="1" stroke-dasharray="3 3"/><text x="1046" y="26" fill="#7f8790" font-size="11">0</text><text x="1046" y="72" fill="#7f8790" font-size="11">−7.81%</text>`;
  return `<div style="height: 32px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 12px; font-size: 12px; white-space: nowrap">
<span style="font-weight: 600; font-size: 13px">权益</span>
<div class="num" style="display: flex; align-items: center; gap: 12px">
<span class="t2">2024-03-14</span>
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 2px; background: #f2a33a"></span><span>${fmt(v, 2)}</span><span class="up">${sfmt(((v - 100000) / 100000) * 100, 2)}%</span></span>
<span><span class="t3">回撤 </span>${fmt(dd[hd], 2)}</span>
<span><span class="t3">第 </span>10,488<span class="t3"> 根</span></span>
</div>
<div style="flex: 1"></div>
<span class="t2" style="display: flex; align-items: center; gap: 7px">买入持有${sw(false, '叠加买入持有')}</span>
${viewSwitch ? viewSeg(1) : ''}
<button class="iconbtn" aria-label="重置缩放">${I.fit()}</button>
</div>
<div style="height: 314px; flex: none; position: relative">
<svg width="1104" height="314" viewBox="0 0 1104 314" style="display: block" role="img" aria-label="全区间权益，光标在 2024-03-14">
${eq}
${cross}
</svg>
</div>
<div style="height: 84px; flex: none; position: relative; border-top: 1px solid #23272d">
<svg width="1104" height="84" viewBox="0 0 1104 84" style="display: block" role="img" aria-label="回撤">
${ddSvg}
</svg>
<span class="t2" style="position: absolute; left: 12px; top: 5px; font-size: 12px">回撤</span>
</div>`;
}

// walk-forward top: fused chart or lane view
export function topWF({
  view = 'fused',
  shadow = true,
  done = 6,
  running = null,
  windows = D.WF,
  sel = 2,
  anchored = false,
  viewSwitch = true,
} = {}) {
  const partial = done < 6;
  const head = partial
    ? `<span class="num" style="display: flex; align-items: baseline; gap: 12px"><span class="up" style="font-weight: 600">${sfmt(windows.slice(0, done).reduce((a, w) => a + w.oos, 0))}</span><span class="t3">已完成 ${done} / 6 窗</span></span>`
    : view === 'lanes'
      ? '<span class="num up" style="font-weight: 600">+7,600</span>'
      : '<span class="num" style="display: flex; align-items: baseline; gap: 12px"><span class="up" style="font-weight: 600">+7,600</span><span><span class="t3">WFE </span>0.54</span><span><span class="t3">盈利窗口 </span>5 / 6</span></span>';
  const svg =
    view === 'lanes'
      ? X.wfLanes({ x0: 40, x1: 1010, y0: 16, laneH: 40, laneGap: 8, sel, timeY: 322 })
      : X.wf2({
          w: 1104,
          x0: 40,
          x1: 1036,
          y0: 26,
          y1: 176,
          laneY: 192,
          laneH: 14,
          laneGap: 6,
          axisX: 1046,
          timeY: 324,
          shadow: shadow && !partial,
          done,
          running,
          windows,
          sel: partial ? null : sel,
        });
  return `<div style="height: 32px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 12px; font-size: 12px; white-space: nowrap">
<span style="font-weight: 600; font-size: 13px">${view === 'lanes' ? '窗口与权益' : '样本外拼接权益'}</span>
${head}
<div style="display: flex; align-items: center; gap: 12px; margin-left: 8px">
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 2px; background: #3b6f8c"></span><span class="t2">样本内${anchored ? '（固定起点）' : ''}</span></span>
<span style="display: flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 2px; background: #f2a33a"></span><span class="t2">样本外</span></span>
${view === 'fused' && shadow && !partial ? '<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 0; border-top: 1.5px dashed #6cb6dd"></span><span class="t2">W3 样本内曲线</span></span>' : ''}
${view === 'lanes' ? '<span class="t3">条内虚线为选中参数的样本内权益，实线为样本外权益；右侧为样本外净利润与累计权益</span>' : ''}
</div>
<div style="flex: 1"></div>
${seg(['拼接', '逐窗'], view === 'lanes' ? 1 : 0, { cls: 'sm', label: '窗口视图' })}
${viewSwitch ? viewSeg(1) : ''}
</div>
<div style="height: 330px; flex: none; position: relative">
<svg width="1104" height="330" viewBox="0 0 1104 330" style="display: block" role="img" aria-label="6 个滚动窗口与样本外拼接权益">
${svg}
</svg>
</div>`;
}

// =====================================================================  dock: report
const REP = {
  def: {
    tiles: [
      ['净利润', '+18,420.35', '+18.42%', 'up'],
      ['最大回撤', '−7,812.10', '−7.81%'],
      ['盈利因子', '1.62', '多 1.67  空 1.57'],
      ['胜率', '47.55%', '68 胜  75 负'],
      ['交易', '143', '多 78  空 65'],
      ['夏普比率', '1.21', '索提诺 1.87'],
    ],
    a: [
      ['净利润', '+18,420.35', '+11,230.10', '+7,190.25'],
      ['毛利润', '47,930.60', '28,110.40', '19,820.20'],
      ['毛亏损', '−29,510.25', '−16,880.30', '−12,629.95'],
      ['手续费', '2,164.80', '1,180.60', '984.20'],
      ['买入持有', '+471.20%', '—', '—'],
      ['最大增长', '+24,910.00', '—', '—'],
      ['最大回撤', '−7,812.10', '—', '—'],
      ['未平仓', '−352.60', '−352.60', '—'],
    ],
    b: [
      ['总交易数', '143', '78', '65'],
      ['盈利交易', '68', '38', '30'],
      ['亏损交易', '75', '40', '35'],
      ['胜率', '47.55%', '48.72%', '46.15%'],
      ['平均盈亏', '+128.81', '+143.98', '+110.62'],
      ['平均盈利', '+704.86', '+739.75', '+660.67'],
      ['平均亏损', '−393.47', '−422.01', '−360.86'],
      ['盈亏比', '1.79', '1.75', '1.83'],
    ],
    c: [
      ['夏普比率', '1.21', '—', '—'],
      ['索提诺比率', '1.87', '—', '—'],
      ['盈利因子', '1.62', '1.67', '1.57'],
      ['最大盈利', '+7,607.77', '+7,607.77', '+4,318.40'],
      ['最大亏损', '−2,940.10', '−2,940.10', '−2,115.60'],
      ['平均持仓', '27 根', '30 根', '23 根'],
      ['最大持仓', '1.6', '1.6', '1.6'],
      ['追加保证金', '0', '0', '0'],
    ],
  },
  top: {
    tiles: [
      ['净利润', '+34,540.00', '+34.54%', 'up'],
      ['最大回撤', '−7,950.40', '−7.50%'],
      ['盈利因子', '1.34', '多 1.39  空 1.28'],
      ['胜率', '48.35%', '44 胜  47 负'],
      ['交易', '91', '多 49  空 42'],
      ['夏普比率', '1.58', '索提诺 2.41'],
    ],
    a: [
      ['净利润', '+34,540.00', '+20,410.30', '+14,129.70'],
      ['毛利润', '136,120.40', '77,340.10', '58,780.30'],
      ['毛亏损', '−101,580.40', '−56,929.80', '−44,650.60'],
      ['手续费', '2,480.15', '1,335.40', '1,144.75'],
      ['买入持有', '+471.20%', '—', '—'],
      ['最大增长', '+36,880.00', '—', '—'],
      ['最大回撤', '−7,950.40', '—', '—'],
      ['未平仓', '−352.60', '−352.60', '—'],
    ],
    b: [
      ['总交易数', '91', '49', '42'],
      ['盈利交易', '44', '24', '20'],
      ['亏损交易', '47', '25', '22'],
      ['胜率', '48.35%', '48.98%', '47.62%'],
      ['平均盈亏', '+379.56', '+416.54', '+336.42'],
      ['平均盈利', '+3,093.65', '+3,222.50', '+2,939.02'],
      ['平均亏损', '−2,161.29', '−2,277.19', '−2,029.57'],
      ['盈亏比', '1.43', '1.42', '1.45'],
    ],
    c: [
      ['夏普比率', '1.58', '—', '—'],
      ['索提诺比率', '2.41', '—', '—'],
      ['盈利因子', '1.34', '1.39', '1.28'],
      ['最大盈利', '+9,214.30', '+9,214.30', '+6,402.75'],
      ['最大亏损', '−4,105.60', '−4,105.60', '−3,220.10'],
      ['平均持仓', '41 根', '44 根', '37 根'],
      ['最大持仓', '1.6', '1.6', '1.6'],
      ['追加保证金', '0', '0', '0'],
    ],
  },
};
const repCell = (label, v) => {
  if (v === '—') return '<td class="t3">—</td>';
  if (label === '净利润') return `<td class="up">${v}</td>`;
  if (label === '未平仓') return `<td class="dn">${v}</td>`;
  return `<td>${v}</td>`;
};
const repTable = (title, rows) => `<div>
<table>
<thead><tr><th style="color: #e8eaed; font-weight: 600; font-size: 12.5px">${title}</th><th>全部</th><th>多头</th><th>空头</th></tr></thead>
<tbody>
${rows.map(([l, ...v]) => `<tr><td>${l}</td>${v.map((x) => repCell(l, x)).join('')}</tr>`).join('\n')}
</tbody>
</table>
</div>`;
export function dockReport({ set = 'def', dim = false, banner = '' } = {}) {
  const R = REP[set];
  return `<section style="flex: 1; min-height: 0; background: #14171b; display: flex; flex-direction: column">
${banner}
<div style="flex: 1; min-height: 0; display: flex; flex-direction: column${dim ? '; opacity: 0.4' : ''}">
<div class="num" style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-bottom: 1px solid #23272d">
${R.tiles
  .map(
    (
      [l, v, s, c],
      k,
    ) => `<div style="padding: 14px 16px;${k < 5 ? ' border-right: 1px solid #1f2328;' : ''} display: flex; flex-direction: column; gap: 3px">
<span class="t2" style="font-size: 12px">${l}</span>
<span${c ? ` class="${c}"` : ''} style="font-size: 22px; font-weight: 600; line-height: 1.15">${v}</span>
<span class="t3" style="font-size: 12px">${s}</span>
</div>`,
  )
  .join('\n')}
</div>
<div style="flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; padding: 14px 16px 0">
${repTable('收益', R.a)}
${repTable('交易', R.b)}
${repTable('风险', R.c)}
</div>
</div>
</section>`;
}
export const dockEmpty = (
  title,
  sub,
  action = '',
) => `<section style="flex: 1; min-height: 0; background: #14171b; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px">
<span style="font-size: 15px; font-weight: 600">${title}</span>
<span class="t2">${sub}</span>
${action ? `<div style="display: flex; gap: 8px; margin-top: 8px">${action}</div>` : ''}
</section>`;

// =====================================================================  dock: trades
export function dockTrades({ sel = null, filter = 0 } = {}) {
  const rows = X.trades
    .slice(0, 13)
    .map((t) => {
      const c = t.pnl >= 0 ? 'up' : 'dn';
      const cur = sel === t.id;
      return `<tr${cur ? ' class="cur"' : ''}><td>${t.id}</td><td style="text-align: left"><span class="${t.side === 'long' ? 'up' : 'dn'}" style="font-weight: 600">${t.side === 'long' ? '多' : '空'}</span></td><td style="text-align: left">${X.fmtDT(t.in)}</td><td>${fmt(t.inPx, 2)}</td><td style="text-align: left">${t.open ? '<span class="tag am">未平仓</span>' : X.fmtDT(t.out)}</td><td${t.open ? ' class="t3"' : ''}>${fmt(t.outPx, 2)}</td><td>${X.QTY.toFixed(4)}</td><td class="${c}">${sfmt(t.pnl, 2)}</td><td class="${c}">${sfmt(t.pct, 2)}%</td><td>${t.open ? '<span class="t3">—</span>' : sfmt(t.cum, 2)}</td><td>${t.bars}</td><td style="padding-right: 12px"><button class="iconbtn${cur ? ' on' : ''}" style="width: 24px; height: 24px" aria-label="在图表中定位交易 #${t.id}">${I.locate(13)}</button></td></tr>`;
    })
    .join('\n');
  return `<section style="flex: 1; min-height: 0; background: #14171b; display: flex; flex-direction: column; overflow: hidden">
<div style="height: 44px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px">
${seg(['全部', '多', '空'], filter, { cls: 'sm', label: '方向' })}
<button class="chip"><span class="t3">盈亏</span>全部${I.chev(10)}</button>
<span class="t3 num" style="font-size: 12px; margin-left: 4px">143 笔已平仓，1 笔未平仓，最新在前</span>
</div>
<table class="lb sm num" style="table-layout: fixed">
<colgroup><col style="width: 52px"><col style="width: 52px"><col style="width: 148px"><col style="width: 98px"><col style="width: 148px"><col style="width: 98px"><col style="width: 84px"><col style="width: 112px"><col style="width: 84px"><col style="width: 112px"><col style="width: 68px"><col style="width: 48px"></colgroup>
<thead><tr><th style="text-align: left">#</th><th style="text-align: left">方向</th><th style="text-align: left">入场 UTC</th><th>入场价</th><th style="text-align: left">出场 UTC</th><th>出场价</th><th>数量</th><th>盈亏</th><th>盈亏 %</th><th>累计</th><th>持仓</th><th style="padding-right: 12px"></th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
}

// =====================================================================  dock: code
const RANGE_AN = {
  9: '<span class="am">10 – 50，步长 1</span><span class="t3">41 个值</span>',
  10: '<span class="am">1.00 – 3.00，步长 0.25</span><span class="t3">9 个值</span>',
  11: '<span class="am">close、hl2、ohlc4</span><span class="t3">3 个值</span>',
  12: '<span class="am">关、开</span><span class="t3">2 个值</span>',
  13: '<span class="t2">固定 3.0</span>',
};
const VALUE_AN = {
  9: '<span class="t2">当前 20</span>',
  10: '<span class="t2">当前 2.00</span>',
  11: '<span class="t2">当前 close</span>',
  12: '<span class="t2">当前 关</span>',
  13: '<span class="t2">当前 3.0</span>',
};
export function codeLines({
  from = 1,
  to = 999,
  annot = null,
  errs = [],
  cursor = null,
  src = X.PINE,
} = {}) {
  const an = annot === 'range' ? RANGE_AN : annot === 'value' ? VALUE_AN : {};
  const out = [];
  for (let n = from; n <= Math.min(to, src.length); n++) {
    let cls = '';
    const err = errs.find((e) => e.line === n);
    if (err) cls = err.soft ? ' fx' : ' er';
    else if (annot === 'range' && n >= 9 && n <= 12) cls = ' in';
    else if (annot === 'range' && n === 13) cls = ' fx';
    else if (cursor === n) cls = ' cu';
    let code = X.hl(src[n - 1]);
    if (err && err.word) code = code.replace(err.word, `<span class="sq">${err.word}</span>`);
    out.push(
      `<div class="cl${cls}"><span class="ln num">${n}</span><span style="width: 556px; flex: none">${code || ' '}${cursor === n ? '<span style="display: inline-block; width: 1.5px; height: 15px; background: #e8eaed; vertical-align: -3px"></span>' : ''}</span>${an[n] ? `<span class="num" style="font-family: Barlow, 'Noto Sans SC', sans-serif; font-size: 12px; display: flex; align-items: center; gap: 8px">${an[n]}</span>` : ''}</div>`,
    );
  }
  return out.join('\n');
}
export const dockCode = (
  o = {},
) => `<section style="flex: 1; min-height: 0; background: #111417; padding-top: 10px; overflow: hidden">
<div class="code">
${codeLines(o)}
</div>
</section>`;

// =====================================================================  dock: optimizer results
const NM = {};
export const nmOf = (L, M, src = 'close', tr = '关') => {
  const k = src + tr;
  NM[k] ??= D.neighbourMean(D.grid('is', src, tr));
  return NM[k][D.Ls.indexOf(L)][D.Ms.indexOf(M)];
};
const r10 = (v) => Math.round(v / 10) * 10;
const cls = (v) => (v >= 0 ? 'up' : 'dn');
const sortIcon =
  '<svg width="9" height="9" viewBox="0 0 10 10" fill="#f2a33a" aria-label="降序"><path d="M1 3h8L5 8z"/></svg>';
const sorted = (s) =>
  `<th style="color: #e8eaed"><span style="display: inline-flex; align-items: center; gap: 3px">${s}${sortIcon}</span></th>`;

// full-range ranking for the no-validation mode
const EXTRA = (() => {
  const r = D.rng(404);
  return D.trials
    .filter((t) => !t.lead && t.is < 19250)
    .sort((a, b) => b.is - a.is)
    .slice(0, 12)
    .map((t) => [
      t.L,
      t.M,
      t.src,
      t.tr,
      t.is,
      t.oos,
      (1.1 + (t.is / 22200) * 0.45 + r() * 0.2).toFixed(2),
      '−' + (6 + r() * 6).toFixed(1) + '%',
      Math.round(60 + r() * 90),
    ]);
})();
export const FULL_ROWS = (() => {
  const full = X.fullGrid(),
    nm = D.neighbourMean(full);
  const r = D.rng(505);
  const rows = [];
  D.Ls.forEach((L, i) =>
    D.Ms.forEach((M, j) => rows.push({ L, M, net: full[i][j], nm: nm[i][j] })),
  );
  rows.sort((a, b) => b.net - a.net);
  return rows.slice(0, 13).map((x) => {
    const lead = D.LEADER.find((l) => l[0] === x.L && l[1] === x.M && l[2] === 'close');
    return {
      ...x,
      pf: lead ? lead[6] : (1.15 + r() * 0.4).toFixed(2),
      dd: lead ? lead[7] : '−' + (7 + r() * 5).toFixed(1) + '%',
      n: lead ? lead[8] : Math.round(70 + r() * 70),
    };
  });
})();

export function lbCol({
  mode = 'split',
  sel = 0,
  chips = null,
  count = '2,096 / 2,214 符合',
  empty = false,
  live = false,
  pop = '',
  more = 0,
} = {}) {
  const chipHtml = chips ?? rmChip('交易数 ≥ 30') + rmChip('最大回撤 ≤ 15%') + addChip();
  let cols, head, rows;
  if (mode === 'none') {
    cols = [40, 62, 50, 62, 44, 88, 84, 50, 76, 68];
    head = `<th style="text-align: left">#</th><th>Length</th><th>Mult</th><th style="text-align: left">Source</th><th style="text-align: left">止损</th>${sorted('净利润')}<th>邻域均值</th><th>PF</th><th>回撤</th><th style="padding-right: 12px">交易</th>`;
    rows = FULL_ROWS.map(
      (x, k) =>
        `<tr${k === sel ? ' class="cur"' : ''}><td>${k + 1}</td><td>${x.L}</td><td>${x.M.toFixed(2)}</td><td style="text-align: left">close</td><td style="text-align: left">关</td><td class="up">${sfmt(x.net)}</td><td>${sfmt(r10(x.nm))}</td><td>${x.pf}</td><td>${x.dd}</td><td style="padding-right: 12px">${x.n}</td></tr>`,
    );
  } else if (mode === 'many') {
    cols = [40, 66, 56, 96, 92, 92, 52, 68, 62];
    head = `<th style="text-align: left">#</th><th>Length</th><th>Mult</th><th style="text-align: left">其余</th>${sorted('样本内')}<th>样本外</th><th>PF</th><th>回撤</th><th style="padding-right: 12px">交易</th>`;
    const r = D.rng(707);
    const mr = D.LEADER.map(([L, M, , , is, oos, pf, dd, n]) => ({
      L,
      M,
      is: r10(is * 0.93 - r() * 300),
      oos: r10(oos * 0.9 - r() * 500),
      pf,
      dd,
      n,
    })).sort((a, b) => b.is - a.is);
    Object.assign(mr[0], { L: 28, M: 2, is: 20410, oos: 10940 });
    rows = mr.map(
      (x, k) =>
        `<tr${k === sel ? ' class="cur"' : ''}><td>${k + 1}</td><td>${x.L}</td><td>${x.M.toFixed(2)}</td><td style="text-align: left"><button class="tag${k === 3 ? ' am' : ''}" aria-label="展开其余 5 个参数">+5</button></td><td class="${cls(x.is)}">${sfmt(x.is)}</td><td class="${cls(x.oos)}">${sfmt(x.oos)}</td><td>${x.pf}</td><td>${x.dd}</td><td style="padding-right: 12px">${x.n}</td></tr>`,
    );
  } else {
    cols = [40, 62, 50, 62, 44, 84, 84, 50, 80, 68];
    head = `<th style="text-align: left">#</th><th>Length</th><th>Mult</th><th style="text-align: left">Source</th><th style="text-align: left">止损</th>${sorted('样本内')}<th>样本外</th><th>PF</th><th>回撤</th><th style="padding-right: 12px">交易</th>`;
    rows = [...D.LEADER, ...EXTRA.slice(0, more)].map(
      ([L, M, src, tr, is, oos, pf, dd, n], k) =>
        `<tr${k === sel ? ' class="cur"' : ''}><td>${k + 1}</td><td>${L}</td><td>${M.toFixed(2)}</td><td style="text-align: left">${src}</td><td style="text-align: left">${tr}</td><td class="${cls(is)}">${sfmt(is)}</td><td class="${cls(oos)}">${sfmt(oos)}</td><td>${pf}</td><td>${dd}</td><td style="padding-right: 12px">${n}</td></tr>`,
    );
  }
  const body = empty
    ? `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 0 60px">
<span style="font-size: 15px; font-weight: 600">无组合同时满足全部 3 项条件</span>
<div style="width: 100%; display: flex; flex-direction: column">
<div class="kv num"><span>交易数 ≥ 30</span><span>2,180 组通过</span></div>
<div class="kv num"><span>最大回撤 ≤ 15%</span><span>2,131 组通过</span></div>
<div class="kv num" style="border-bottom: 1px solid #1f2328"><span class="dn" style="color: #f58a7f">盈利因子 ≥ 2.5</span><span style="display: flex; align-items: center; gap: 12px"><span class="dn">0 组通过，最高值 1.94</span><a href="#">移除</a></span></div>
</div>
</div>`
    : `<table class="lb num" style="table-layout: fixed">
<colgroup>${cols.map((c) => `<col style="width: ${c}px">`).join('')}</colgroup>
<thead><tr>
${head}
</tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
<div style="flex: 1"></div>
<div style="height: 44px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; border-top: 1px solid #1f2328">
<span class="t3 num" style="font-size: 12px">${live ? '基于已完成组合排名，随进度更新' : `第 1–${13 + more} 名`}</span>
<div class="num" style="display: flex; align-items: center; gap: 4px">
<button class="iconbtn" aria-label="上一页" style="color: #4f565f">${I.chevL()}</button>
<span style="font-size: 12.5px">1 <span class="t3">/ ${live ? '106' : mode === 'many' ? '144' : mode === 'none' ? '28' : Math.ceil(2096 / (13 + more))}</span></span>
<button class="iconbtn" aria-label="下一页">${I.chevR()}</button>
</div>
</div>`;
  return `<div style="width: 624px; flex: none; display: flex; flex-direction: column; border-right: 1px solid #23272d; position: relative">
<div style="height: 44px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 12px">
<span style="font-weight: 600">排行</span>
<span class="t3 num" style="font-size: 12px; margin-right: 6px">${count}</span>
${chipHtml}
</div>
${body}
${pop}
</div>`;
}

const axisBtn = (k, v) =>
  `<button style="display: inline-flex; align-items: center; gap: 5px"><span class="t3">${k}</span>${v}${I.chev(10)}</button>`;
const legendRamp = (lo, hi, bins = X.HEAT_A, zeroAt = 3) =>
  `<span class="t3" style="margin-right: 4px">${lo}</span>` +
  bins
    .map(
      (b, k) =>
        (k === zeroAt ? '<span style="margin: 0 5px" class="t2">0</span>' : '') +
        `<span style="width: 20px; height: 10px; background: ${b.color}"></span>`,
    )
    .join('') +
  `<span class="t3" style="margin-left: 4px">${hi}</span>`;

const sensRange = (() => {
  const all = [
    ...D.marginal('L', D.Ls),
    ...D.marginal('M', D.Ms),
    ...D.marginal('src', D.SRC),
    ...D.marginal('tr', D.TRAIL),
  ];
  return {
    lo: Math.min(...all.map((m) => m.q1)) - 500,
    hi: Math.max(...all.map((m) => m.q3)) + 500,
  };
})();
const pct = (k) => Math.round(D.eta2(k) * 100);
const fake = (seed, n, amp, base = 6000) => {
  const r = D.rng(seed);
  return Array.from({ length: n }, (_, k) => {
    const m = base + Math.sin((k / Math.max(1, n - 1)) * 3 + seed) * amp + D.gauss(r) * amp * 0.15;
    return { mean: m, q1: m - 5200, q3: m + 4800 };
  });
};
const SENS4 = [
  { name: 'Length', pct: pct('L'), pts: D.marginal('L', D.Ls), axis: 'X' },
  { name: 'Multiplier', pct: pct('M'), pts: D.marginal('M', D.Ms), axis: 'Y' },
  { name: 'Source', pct: pct('src'), pts: D.marginal('src', D.SRC), dots: true },
  { name: 'Use trailing stop', pct: pct('tr'), pts: D.marginal('tr', D.TRAIL), dots: true },
];
const SENS7 = [
  { ...SENS4[0], pct: 41 },
  { ...SENS4[1], pct: 33 },
  { name: 'Trail %', pct: 9, pts: fake(3, 9, 2600) },
  { name: 'Exit after bars', pct: 6, pts: fake(5, 5, 2000), dots: true },
  { name: 'ATR length', pct: 4, pts: fake(8, 4, 1500), dots: true },
  { ...SENS4[2], pct: 1 },
  { ...SENS4[3], pct: 1 },
];
function spark(pts, { w, h, color, band, dots }) {
  const pad = 2;
  const Xs = (k) =>
    pad + (pts.length === 1 ? (w - 2 * pad) / 2 : (k / (pts.length - 1)) * (w - 2 * pad));
  const Y = D.scale(sensRange.lo, sensRange.hi, h - pad, pad);
  const top = pts.map((p, k) => `${f1(Xs(k))} ${f1(Y(p.q3))}`),
    bot = pts.map((p, k) => `${f1(Xs(k))} ${f1(Y(p.q1))}`).reverse();
  return (
    `<path d="M${top.join('L')}L${bot.join('L')}Z" fill="${band}"/><path d="${pts.map((p, k) => `${k ? 'L' : 'M'}${f1(Xs(k))} ${f1(Y(p.mean))}`).join('')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>` +
    (dots
      ? pts
          .map(
            (p, k) => `<circle cx="${f1(Xs(k))}" cy="${f1(Y(p.mean))}" r="2.2" fill="${color}"/>`,
          )
          .join('')
      : '')
  );
}
const axisTag = (a, drag = false) =>
  `<button aria-label="拖动设置 ${a} 轴" style="height: 17px; padding: 0 5px; border-radius: 3px; background: ${drag ? '#f2a33a' : '#3a2c16'}; color: ${drag ? '#1a1206' : '#f5b155'}; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center">${a}</button>`;
export function sensRows({ many = false, rowH = 38, drop = null, noX = false } = {}) {
  const list = many ? SENS7 : SENS4;
  const sh = rowH >= 34 ? 26 : 18;
  return list
    .map(
      (
        p,
        k,
      ) => `<div style="display: flex; align-items: center; gap: 10px; height: ${rowH}px; border-top: 1px solid #1f2328${drop === k ? '; background: #221b11; box-shadow: inset 0 0 0 1px #6b5227' : ''}">
<span style="width: 124px; display: flex; align-items: center; gap: 6px; white-space: nowrap">${p.name}${p.axis && !(noX && p.axis === 'X') ? axisTag(p.axis) : ''}</span>
<div style="width: 70px; height: 4px; border-radius: 2px; background: #23272d; position: relative"><div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${Math.max(2, p.pct)}%; border-radius: 2px; background: ${p.axis ? '#f2a33a' : '#7f8790'}"></div></div>
<span class="num" style="width: 32px; text-align: right; font-size: 12px">${p.pct}%</span>
<svg width="150" height="${sh}" viewBox="0 0 150 ${sh}" style="margin-left: auto" aria-hidden="true">${spark(p.pts, { w: 150, h: sh, color: p.axis ? '#f2a33a' : '#9aa3ad', band: p.axis ? 'rgba(242,163,58,0.18)' : 'rgba(154,163,173,0.16)', dots: p.dots })}</svg>
</div>`,
    )
    .join('\n');
}

// Length has 41 values: two per square cell, 21 columns
const LAX = X.squareAxis(D.Ls, 416);
export function mapCol({
  mode = 'split',
  sel = [28, 2],
  live = false,
  sensOpts = {},
  over = '',
  smooth = false,
  hover = null,
} = {}) {
  const many = mode === 'many',
    none = mode === 'none';
  let g = D.grid('is'),
    bins = X.HEAT_A;
  if (none) {
    g = X.fullGrid();
    bins = X.HEAT_FULL;
    if (smooth) g = D.neighbourMean(g);
  }
  if (many) g = X.meanGrid();
  if (live) g = X.partialGrid(0.62);
  g = X.binCols(g, LAX.n);
  const [gLo, gHi] = X.gridRange(g),
    lo = X.kv(gLo),
    hi = X.kv(gHi);
  const pitch = many ? 16 : LAX.pitch,
    gh = D.Ms.length * pitch,
    heatH = gh + (many ? 42 : 48);
  const mx = 48 + Math.round((416 - LAX.nb * pitch) / 2);
  const at = (L, M) => [LAX.bin(L), D.Ms.indexOf(M)];
  const rings = live ? [] : [{ at: at(sel[0], sel[1]), color: '#f2a33a', width: 2 }];
  if (hover) rings.push({ at: at(hover[0], hover[1]), color: '#e8eaed', width: 1.5 });
  const hm = X.heat2({
    g,
    x: mx,
    y: 6,
    cell: pitch,
    bins,
    ring: rings,
    labelSize: 10.5,
    xLabels: [10, 20, 30, 40, 50].map((L) => [LAX.bin(L), LAX.label(LAX.bin(L))]),
    yLabels: [
      [0, '1.00'],
      [2, '1.50'],
      [4, '2.00'],
      [6, '2.50'],
      [8, '3.00'],
    ],
  });
  if (hover) {
    const b = LAX.bin(hover[0]),
      Lm = LAX.members(b);
    const cs = Lm.map((L) => D.cell(L, hover[1]));
    const mIs = cs.reduce((a, c) => a + c.is, 0) / cs.length,
      mOos = cs.reduce((a, c) => a + c.oos, 0) / cs.length;
    const hx = hm.cx(b) - 236 - 10,
      hy = hm.cy(D.Ms.indexOf(hover[1])) + 74 + 2;
    over += `<div class="menu num" style="left: ${f1(hx)}px; top: ${f1(hy)}px; padding: 10px 12px; gap: 6px; width: 236px">
<span style="font-weight: 600">Length ${LAX.label(b)}，Multiplier ${hover[1].toFixed(2)}</span>
<div style="display: grid; grid-template-columns: 1fr auto auto; column-gap: 14px; row-gap: 4px; font-size: 12.5px; text-align: right">
<span class="t3" style="text-align: left">Length</span><span class="t3">样本内</span><span class="t3">样本外</span>
${cs.map((c, k) => `<span class="t2" style="text-align: left">${Lm[k]}</span><span class="t2">${sfmt(c.is)}</span><span class="t2">${sfmt(c.oos)}</span>`).join('\n')}
<span style="text-align: left; padding-top: 4px; border-top: 1px solid #2f353c">均值</span><span class="${mIs >= 0 ? 'up' : 'dn'}" style="padding-top: 4px; border-top: 1px solid #2f353c; font-weight: 600">${sfmt(Math.round(mIs / 10) * 10)}</span><span class="${mOos >= 0 ? 'up' : 'dn'}" style="padding-top: 4px; border-top: 1px solid #2f353c; font-weight: 600">${sfmt(Math.round(mOos / 10) * 10)}</span>
</div>
<span class="t3" style="font-size: 12px">点击查看格内明细</span>
</div>`;
  }
  const heat =
    hm.svg +
    `<text x="256" y="${gh + 40}" fill="#aab1b9" font-size="11.5" text-anchor="middle">Length<tspan fill="#7f8790"> · 每格 ${LAX.n} 个值取平均</tspan></text><text x="${mx - 40}" y="${gh / 2 + 6}" fill="#aab1b9" font-size="11.5" text-anchor="middle" transform="rotate(-90 ${mx - 40} ${gh / 2 + 6})">Multiplier</text>`;
  const axisRow = many
    ? `<div class="num" style="flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 2px 16px 8px; font-size: 12.5px; white-space: nowrap">
${axisBtn('X', 'Length')}${axisBtn('Y', 'Multiplier')}${axisBtn('Z', '无')}
<span style="width: 1px; height: 14px; background: #2f353c"></span>
${axisBtn('Trail %', '取平均')}${axisBtn('Exit', '取平均')}
${axisBtn('ATR', '取平均')}${axisBtn('Source', 'close')}${axisBtn('止损', '取最大')}
</div>`
    : `<div class="num" style="height: 30px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 16px; font-size: 12.5px; white-space: nowrap">
${axisBtn('X', 'Length')}${axisBtn('Y', 'Multiplier')}
<span style="width: 1px; height: 14px; background: #2f353c"></span>
${axisBtn('Source', 'close')}${axisBtn('止损', '关')}
</div>`;
  return `<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative">
<div style="height: 44px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 16px">
<span style="font-weight: 600; flex: 1">参数图</span>
${none ? '' : seg(['样本内', '样本外'], 0, { cls: 'sm', label: '区间' })}
<span style="display: flex; align-items: center; gap: 7px; font-size: 12.5px" class="t2">平滑${sw(smooth, '平滑：每格取相邻 ±1 步的平均')}</span>
</div>
${axisRow}
<div style="height: ${heatH}px; flex: none; position: relative">
<svg width="480" height="${heatH}" viewBox="0 0 480 ${heatH}" style="display: block" role="img" aria-label="Length × Multiplier 净利润热力图">
${heat}
</svg>
</div>
<div class="num" style="height: 30px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 16px; font-size: 11.5px">
<span class="t3">${none ? (smooth ? '邻域均值' : '净利润') : many ? '样本内均值' : '净利润'}</span>
<div style="display: flex; align-items: center; gap: 2px">
${legendRamp(lo, hi, bins)}
</div>
${many ? '<span class="t3" style="margin-left: auto; display: flex; align-items: center; gap: 5px"><span style="width: 10px; height: 10px; background: #181b20; border: 1px solid #2f353c"></span>未采样</span>' : ''}
${live ? '<span class="t3" style="margin-left: auto; display: flex; align-items: center; gap: 5px"><span style="width: 10px; height: 10px; background: #181b20; border: 1px solid #2f353c"></span>未完成</span>' : ''}
</div>
<div style="flex: 1; min-height: 0; border-top: 1px solid #1f2328; padding: ${many ? 6 : 10}px 16px 0; display: flex; flex-direction: column">
<div style="display: flex; align-items: baseline; height: 24px; flex: none"><span style="font-weight: 600">影响度</span></div>
${live ? '<div class="t3" style="border-top: 1px solid #1f2328; padding-top: 14px">全部完成后显示</div>' : sensRows({ many, rowH: many ? 24 : 38, ...sensOpts })}
</div>
${over}
</div>`;
}
export const dockOpt = ({
  lb = {},
  map = {},
  mode = 'split',
  dim = false,
} = {}) => `<section style="flex: 1; min-height: 0; background: #14171b; display: flex${dim ? '; opacity: 0.4' : ''}">
${lbCol({ mode, ...lb })}
${mapCol({ mode, ...map })}
</section>`;

// =====================================================================  dock: walk-forward results
export const STAB = [
  {
    name: 'Length',
    lo: 18,
    hi: 36,
    labels: ['36', '18'],
    bands: [
      [22, 30],
      [24, 29],
      [25, 30],
      [26, 33],
      [23, 28],
      [26, 31],
    ],
    picks: [24, 26, 26, 30, 26, 28],
    common: [26, 28],
    a: '共同 26–28',
    b: '固定 27，平均损失 1.6%',
  },
  {
    name: 'Multiplier',
    lo: 1.5,
    hi: 2.75,
    labels: ['2.75', '1.50'],
    bands: [
      [1.75, 2.25],
      [1.75, 2.25],
      [2, 2.5],
      [2, 2.5],
      [1.75, 2.25],
      [1.75, 2.25],
    ],
    picks: [2, 2, 2.25, 2.25, 2, 2],
    common: [2, 2.25],
    a: '共同 2.00–2.25',
    b: '固定 2.00，平均损失 2.5%',
  },
  {
    name: 'Source',
    lo: -0.5,
    hi: 2.5,
    bands: [
      [0, 2],
      [0, 1],
      [0, 2],
      [0, 2],
      [0, 1],
      [0, 2],
    ],
    picks: [0, 0, 0, 1, 0, 0],
    common: [0, 1],
    a: 'close 各窗口均近优',
    b: '固定 close，平均损失 0.9%',
  },
  {
    name: 'Use trailing stop',
    lo: -0.5,
    hi: 1.5,
    bands: [
      [0, 0],
      [0, 1],
      [0, 0],
      [0, 0],
      [0, 1],
      [0, 0],
    ],
    picks: [0, 0, 0, 0, 0, 0],
    common: [0, 0],
    a: '关 各窗口均近优',
    b: '固定 关，平均损失 0.0%',
  },
];
const stabTheme = {
  common: 'rgba(242,163,58,0.16)',
  band: '#2c4a5c',
  pick: '#e8eaed',
  pickStroke: '#14171b',
  bandR: 2,
};
export function wfTable({ sel = 2, done = 6, running = null, odd = false } = {}) {
  const b = ' border-top: 1px solid #2f353c';
  const rows = D.WF.map((w, k) => {
    if (k >= done) {
      const run = running && running.k === k;
      return `<tr><td style="text-align: left${run ? '; color: #f5b155' : ''}">${w.id}</td><td style="text-align: left" class="t2">${w.oosRange}</td><td style="text-align: left" class="${run ? 'am' : 't3'}">${run ? `<span style="display: inline-flex; align-items: center; gap: 6px">${I.spin(12)}优化中 ${Math.round(running.frac * 100)}%</span>` : '等待'}</td><td class="t3">—</td><td class="t3">—</td><td class="t3">—</td><td class="t3" style="padding-right: 12px">—</td></tr>`;
    }
    if (odd && k === 3)
      return `<tr><td style="text-align: left">${w.id}</td><td style="text-align: left" class="t2">${w.oosRange}</td><td style="text-align: left" colspan="4"><span style="display: inline-flex; align-items: center; gap: 6px; color: #f58a7f">${I.warn(13, '#f06a5d')}无组合满足条件，本窗口不交易</span></td><td style="padding-right: 12px"><a href="#">调整</a></td></tr>`;
    const part = odd && k === 5 ? ' <span class="tag" style="margin-left: 4px">部分</span>' : '';
    return `<tr${k === sel ? ' class="cur"' : ''}><td style="text-align: left">${w.id}</td><td style="text-align: left" class="t2">${w.oosRange}${part}</td><td style="text-align: left">${w.pick.join('，')}</td><td>${sfmt(w.is)}</td><td class="${w.oos >= 0 ? 'up' : 'dn'}">${sfmt(w.oos)}</td><td${w.oos < 0 ? ' class="dn"' : ''}>${w.wfe}</td><td style="padding-right: 12px">${w.trades}</td></tr>`;
  }).join('\n');
  const total =
    done < 6
      ? `<tr><td style="font-weight: 600; color: #e8eaed;${b}">合计</td><td style="text-align: left;${b}" class="t2">已完成 ${done} / 6 窗</td><td style="text-align: left;${b}">${done} / ${done} 盈利</td><td style="${b}">${sfmt(D.WF.slice(0, done).reduce((a, w) => a + w.is, 0))}</td><td class="up" style="font-weight: 600;${b}">${sfmt(D.WF.slice(0, done).reduce((a, w) => a + w.oos, 0))}</td><td class="t3" style="${b}">—</td><td style="padding-right: 12px;${b}">${D.WF.slice(0, done).reduce((a, w) => a + w.trades, 0)}</td></tr>`
      : odd
        ? `<tr><td style="font-weight: 600; color: #e8eaed;${b}">合计</td><td style="text-align: left;${b}" class="t2">24-01-01 → 25-05-04</td><td style="text-align: left;${b}">4 / 5 盈利，1 窗空仓</td><td style="${b}">+53,890</td><td class="up" style="font-weight: 600;${b}">+4,620</td><td style="font-weight: 600;${b}">0.41</td><td style="padding-right: 12px;${b}">165</td></tr>`
        : `<tr><td style="font-weight: 600; color: #e8eaed;${b}">合计</td><td style="text-align: left;${b}" class="t2">24-01-01 → 25-05-04</td><td style="text-align: left;${b}">5 / 6 盈利</td><td style="${b}">+62,790</td><td class="up" style="font-weight: 600;${b}">+7,600</td><td style="font-weight: 600;${b}">0.54</td><td style="padding-right: 12px;${b}">209</td></tr>`;
  return `<table class="lb num" style="table-layout: fixed">
<colgroup><col style="width: 58px"><col style="width: 146px"><col style="width: 170px"><col style="width: 78px"><col style="width: 70px"><col style="width: 58px"><col style="width: 60px"></colgroup>
<thead><tr><th style="text-align: left">窗口</th><th style="text-align: left">样本外区间</th><th style="text-align: left">选中参数</th><th>样本内</th><th style="color: #e8eaed">样本外</th><th>WFE</th><th style="padding-right: 12px">交易</th></tr></thead>
<tbody>
${rows}
${total}
</tbody>
</table>`;
}
export function dockWF({
  sel = 2,
  done = 6,
  running = null,
  odd = false,
  rightView = 'stab',
} = {}) {
  const partial = done < 6;
  const stab = partial
    ? '<div class="t3" style="border-top: 1px solid #1f2328; padding-top: 14px">全部窗口完成后显示</div>'
    : STAB.map(
        (
          p,
        ) => `<div style="display: flex; align-items: center; gap: 12px; flex: 1; min-height: 0; border-top: 1px solid #1f2328">
<div style="width: 160px; flex: none; display: flex; flex-direction: column; gap: 3px"><span>${p.name}</span><span class="num" style="font-size: 12px">${p.a}</span><span class="t3 num" style="font-size: 12px">${p.b}</span></div>
<div style="position: relative; flex: 1; min-width: 0">
<svg width="260" height="64" viewBox="0 0 260 64" style="display: block" aria-hidden="true">${C.stabilityStrip(stabTheme, { w: 260, h: 64, lo: p.lo, hi: p.hi, bands: p.bands, picks: p.picks, common: p.common, colW: 12 })}</svg>
${p.labels ? `<span class="t3 num" style="position: absolute; left: -2px; top: -2px; font-size: 10.5px">${p.labels[0]}</span><span class="t3 num" style="position: absolute; left: -2px; bottom: -2px; font-size: 10.5px">${p.labels[1]}</span>` : ''}
</div>
</div>`,
      ).join('\n');
  return `<section style="flex: 1; min-height: 0; background: #14171b; display: flex">
<div style="width: 640px; flex: none; display: flex; flex-direction: column; border-right: 1px solid #23272d">
<div style="height: 44px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 12px; white-space: nowrap">
<span style="font-weight: 600; margin-right: 4px">逐窗口</span>
<button class="chip"><span class="t3">选参</span>样本内净利润${I.chev(10)}</button>
${rmChip('交易数 ≥ 30')}${rmChip('最大回撤 ≤ 15%')}${addChip()}
</div>
${wfTable({ sel: partial ? null : sel, done, running, odd })}
<div style="flex: 1"></div>
${
  partial
    ? ''
    : `<div style="flex: none; margin: 0 12px 14px; padding: 12px 14px; border: 1px solid #2f353c; border-radius: 5px; display: flex; align-items: center; gap: 16px">
<div style="flex: 1; display: flex; flex-direction: column; gap: 5px">
<span class="t2" style="font-size: 12px">各窗口通用固定参数</span>
<span class="num" style="display: flex; gap: 14px; white-space: nowrap"><span><span class="t3">Length </span><b style="font-weight: 600">27</b></span><span><span class="t3">Multiplier </span><b style="font-weight: 600">2.00</b></span><span><span class="t3">Source </span><b style="font-weight: 600">close</b></span><span><span class="t3">止损 </span><b style="font-weight: 600">关</b></span></span>
</div>
<button class="primary">应用到参数</button>
</div>`
}
</div>
<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 0 16px">
<div style="height: 44px; flex: none; display: flex; align-items: center; gap: 10px">
${seg(['参数稳定性', '窗口参数图'], rightView === 'map' ? 1 : 0, { cls: 'sm', label: '右侧视图' })}
<span style="flex: 1"></span>
${rightView === 'map' ? seg(['W3', '六窗平均'], 1, { cls: 'sm', label: '参数图范围' }) : `<button class="chip num"><span class="t3">容差</span>10%${I.chev(10)}</button>`}
</div>
${rightView === 'map' ? wfMap() : ''}
${
  partial || rightView === 'map'
    ? ''
    : `<div class="num t3" style="height: 18px; flex: none; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-left: 172px; font-size: 11.5px; text-align: center">
<span>W1</span><span>W2</span><span style="color: #f5b155; font-weight: 600">W3</span><span>W4</span><span>W5</span><span>W6</span>
</div>`
}
${rightView === 'map' ? '' : stab}
</div>
</section>`;
}
const wfRings = (ax, r) =>
  D.WF.map((w, k) => ({
    at: [ax.bin(w.pick[0]), D.Ms.indexOf(+w.pick[1])],
    color: k === 2 ? '#f2a33a' : '#e8eaed',
    circle: r,
  }));
function wfMap() {
  const ax = X.squareAxis(D.Ls, 384),
    mw = ax.nb * ax.pitch,
    mh = D.Ms.length * ax.pitch,
    mx = 432 - mw - 2;
  const g = X.binCols(X.surfaceMean, ax.n),
    [gLo, gHi] = X.gridRange(g);
  const h = X.heat2({
    g,
    x: mx,
    y: 6,
    cell: ax.pitch,
    bins: X.W3_BINS,
    ring: wfRings(ax, 6.5),
    labelSize: 10.5,
    xLabels: [10, 20, 30, 40, 50].map((L) => [ax.bin(L), ax.label(ax.bin(L))]),
    yLabels: [
      [0, '1.00'],
      [2, '1.50'],
      [4, '2.00'],
      [6, '2.50'],
      [8, '3.00'],
    ],
  }).svg;
  const H = mh + 46;
  return `<svg width="432" height="${H}" viewBox="0 0 432 ${H}" style="display: block; flex: none" role="img" aria-label="六个窗口样本内参数图的平均，圆圈为各窗口选中的参数">${h}<text x="${mx + mw / 2}" y="${mh + 40}" fill="#aab1b9" font-size="11.5" text-anchor="middle">Length<tspan fill="#7f8790"> · 每格 ${ax.n} 个值取平均</tspan></text><text x="10" y="${mh / 2 + 6}" fill="#aab1b9" font-size="11.5" text-anchor="middle" transform="rotate(-90 10 ${mh / 2 + 6})">Multiplier</text></svg>
<div class="num" style="flex: none; display: flex; align-items: center; gap: 2px; margin-top: 10px; font-size: 11.5px"><span class="t3" style="margin-right: 8px">六窗样本内均值</span>${legendRamp(X.kv(gLo), X.kv(gHi), X.W3_BINS)}</div>
<span class="t3" style="font-size: 12px; margin-top: 10px; display: flex; align-items: center; gap: 6px"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="#e8eaed" stroke-width="1.5"/></svg>圆圈为各窗口选中的参数，橙色为 W3</span>`;
}

// =====================================================================  right panel: 参数
const inputRow = (
  label,
  hint,
  field,
) => `<div style="display: flex; flex-direction: column; gap: 6px">
<div style="display: flex; justify-content: space-between; align-items: baseline">${label}<span class="t3 num" style="font-size: 12px">${hint}</span></div>
${field}
</div>`;
const lbl = (id, name, changed) =>
  `<label for="${id}" style="display: flex; align-items: center; gap: 6px">${name}${changed ? dot('#f2a33a', 6) : ''}</label>`;
export const propsSummary = (
  link = '全部设置',
) => `<div style="display: flex; flex-direction: column">
<div class="sec" style="margin-bottom: 4px"><span>策略属性</span><a href="#" style="font-size: 12.5px; font-weight: 400">${link}</a></div>
<div class="kv"><span>初始资金</span><span class="num">100,000 USD</span></div>
<div class="kv"><span>下单量</span><span class="num">100% 权益</span></div>
<div class="kv"><span>金字塔加仓</span><span class="num">0</span></div>
<div class="kv"><span>手续费</span><span class="num">0.1%</span></div>
<div class="kv"><span>滑点</span><span class="num" style="display: flex; align-items: center; gap: 8px"><span class="t3" style="font-size: 12px">脚本 0</span>${dot('#f2a33a', 6)}<span>1 tick</span></span></div>
<div class="kv"><span>脚本执行</span><span>K 线收盘时</span></div>
<div class="kv" style="border-bottom: 1px solid #1f2328"><span>限价单</span><span>触及即成交</span></div>
</div>`;
export function asideParams({
  len = '20',
  changed = [],
  from = null,
  dim = false,
  sel = null,
  pre = '',
  head = null,
} = {}) {
  const ch = (n) => changed.includes(n);
  return aside(`${head ?? rtabs(0, sel)}
<div style="flex: 1; min-height: 0; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 20px">
${pre}
<div style="display: flex; flex-direction: column; gap: 14px${dim ? '; opacity: 0.45' : ''}">
<div class="sec">
<span>输入</span>
<button class="t3" style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 400">${I.reset()}恢复默认</button>
</div>
${inputRow(lbl('p-len', 'Length', ch('Length')), ch('Length') ? `${from ? `来自 ${from}，` : ''}默认 20` : '5 – 200', numField('p-len', len, { foc: ch('Length') && !from }))}
${inputRow(lbl('p-mult', 'Multiplier', ch('Multiplier')), '步长 0.25', numField('p-mult', '2.00'))}
<div style="display: flex; flex-direction: column; gap: 6px"><span>Source</span>${select('close')}</div>
<div style="display: flex; justify-content: space-between; align-items: center; height: 28px"><span>Use trailing stop</span>${sw(false, 'Use trailing stop')}</div>
<div style="display: flex; align-items: center; gap: 10px; margin-top: 2px"><span class="t3" style="font-size: 12px">Risk</span><div style="flex: 1; height: 1px; background: #23272d"></div></div>
${inputRow(lbl('p-trail', 'Trail %', false), '步长 0.1', numField('p-trail', '3.0'))}
</div>
<div${dim ? ' style="opacity: 0.45"' : ''}>${propsSummary()}</div>
</div>`);
}
export const asideNoScript = ({ head = null } = {}) =>
  aside(`${head ?? rtabs(0)}
<div style="flex: 1; display: flex; flex-direction: column; gap: 20px; padding: 12px 16px">
<div style="display: flex; flex-direction: column; gap: 8px"><div class="sec"><span>输入</span></div><span class="t3">脚本编译后，此处按 input 声明列出可调参数。</span></div>
<div style="display: flex; flex-direction: column; gap: 8px"><div class="sec"><span>策略属性</span></div><span class="t3">默认值取自 strategy() 调用。</span></div>
</div>`);

// rich input states: groups, dropdown, invalid value, expression-fixed
export const asideInputs = () =>
  aside(`
<div style="flex: 1; min-height: 0; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 14px; position: relative">
<div class="sec"><span>输入</span><span style="display: flex; align-items: center; gap: 12px"><span class="t3 num" style="font-size: 12px; font-weight: 400">9 项，已修改 2 项</span><button class="t3" style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 400">${I.reset()}恢复默认</button></span></div>
${inputRow(lbl('i-len', 'Length', true), '默认 20', numField('i-len', '28'))}
<div style="display: flex; flex-direction: column; gap: 6px">
<div style="display: flex; justify-content: space-between; align-items: baseline">${lbl('i-mult', 'Multiplier', true)}<span class="t3 num" style="font-size: 12px">默认 2.00</span></div>
${numField('i-mult', '0', { err: true })}
<span class="errt">Multiplier 不得小于 0.25</span>
</div>
<div style="display: flex; flex-direction: column; gap: 6px"><span>Source</span>${select('close', { cls: 'foc' })}</div>
<div style="display: flex; justify-content: space-between; align-items: center; height: 28px"><span>Use trailing stop</span>${sw(true, 'Use trailing stop')}</div>
<div style="display: flex; align-items: center; gap: 10px; margin-top: 2px"><span class="t3" style="font-size: 12px">Risk</span><div style="flex: 1; height: 1px; background: #23272d"></div></div>
${inputRow(lbl('i-trail', 'Trail %', false), '步长 0.1', numField('i-trail', '3.0'))}
<div style="display: flex; flex-direction: column; gap: 6px">
<div style="display: flex; justify-content: space-between; align-items: baseline"><span>ATR length</span><span class="t3" style="font-size: 12px; display: flex; align-items: center; gap: 5px">${I.lock(11)}由脚本表达式决定</span></div>
<div class="field" style="opacity: 0.55"><span class="v">14</span></div>
</div>
<div style="display: flex; align-items: center; gap: 10px; margin-top: 2px"><span class="t3" style="font-size: 12px">Session</span><div style="flex: 1; height: 1px; background: #23272d"></div></div>
<div style="display: flex; flex-direction: column; gap: 6px"><span>Trade window</span><div class="field"><span class="v">0000-2400</span></div></div>
<div style="display: flex; flex-direction: column; gap: 6px"><span>Direction</span>${select('Both')}</div>
<div style="display: flex; flex-direction: column; gap: 6px"><span>Start date</span><div class="field"><span class="v">2023-01-01 00:00</span></div></div>
<div class="menu" style="left: 16px; right: 16px; top: 276px">
${['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'].map((s) => `<button class="mi${s === 'close' ? ' on' : ''}"><span style="flex: 1">${s}</span>${s === 'close' ? I.check(11, '#f5b155') : ''}</button>`).join('')}
</div>
<div style="position: absolute; right: 4px; top: 60px; width: 4px; height: 520px; border-radius: 2px; background: #2f353c"></div>
</div>`);

// strategy properties, drilled in from 参数
const pRow = (
  label,
  control,
  note = '',
) => `<div style="display: flex; flex-direction: column; gap: 4px; padding: 5px 0">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px"><span class="t2" style="white-space: nowrap">${label}</span><div style="display: flex; align-items: center; gap: 6px">${control}</div></div>
${note ? `<span class="t3" style="font-size: 12px">${note}</span>` : ''}
</div>`;
const pIn = (v, w = 92, suffix = '') =>
  `<div class="field" style="width: ${w}px; height: 30px"><span class="v" style="text-align: right; padding: 0 9px">${v}</span></div>${suffix ? `<span class="t3" style="width: 28px">${suffix}</span>` : ''}`;
const pSel = (v, w = 126) =>
  `<button class="sel" style="width: ${w}px; height: 30px"><span>${v}</span>${I.chev()}</button>`;
const pGroup = (name) =>
  `<div style="display: flex; align-items: center; gap: 10px; margin-top: 12px; height: 22px"><span style="font-weight: 600">${name}</span><div style="flex: 1; height: 1px; background: #23272d"></div></div>`;
export const asideProps = () =>
  aside(`
<div style="height: 44px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 12px 0 8px; border-bottom: 1px solid #1f2328">
<button class="iconbtn" aria-label="返回参数">${I.chevL()}</button>
<span style="font-weight: 600; flex: 1">策略属性</span>
<span class="t3" style="font-size: 12px">回测与优化共用</span>
</div>
<div style="flex: 1; min-height: 0; padding: 0 16px 12px; display: flex; flex-direction: column; overflow: hidden">
${pGroup('常规')}
${pRow('初始资金', pIn('100,000', 104, 'USD'))}
${pRow('货币', '<span class="t2">与图表相同</span>')}
${pRow('下单量', pIn('100', 64) + pSel('% 权益', 98))}
${pRow('金字塔加仓', pIn('0', 64, '次'))}
${pGroup('细分与执行')}
${pRow('Bar 细分', '<span class="t2">每根 4 tick</span>', '目前仅支持默认细分。')}
${pRow('脚本执行', pSel('K 线收盘时', 150))}
${pGroup('经纪商模拟')}
${pRow('手续费', pIn('0.1', 64) + pSel('%', 98))}
${pRow('多头杠杆', pIn('1', 64, 'x'))}
${pRow('空头杠杆', pIn('1', 64, 'x'))}
${pRow(`<span style="display: flex; align-items: center; gap: 6px">滑点${dot('#f2a33a', 6)}</span>`, pIn('1', 64, 'tick'), '已覆盖，脚本值为 0。<a href="#">恢复</a>')}
${pRow('限价单', pSel('触及即成交', 150))}
${pRow('下单延迟', pSel('无（当根成交）', 150))}
<div style="flex: 1"></div>
<div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid #1f2328">
<span class="t3" style="font-size: 12px">已覆盖 1 项</span>
<button class="ghost" style="height: 30px">${I.reset()}全部恢复为脚本值</button>
</div>
</div>`);

// =====================================================================  right panel: 优化
const P5 = [
  { name: 'Length', n: 41, range: ['10', '50', '1'] },
  { name: 'Multiplier', n: 9, range: ['1.00', '3.00', '0.25'] },
  { name: 'Source', n: 3, chips: ['close', 'hl2', 'ohlc4'], more: '其余 5 个' },
  { name: 'Use trailing stop', n: 2, chips: ['关', '开'] },
  { name: 'Trail %', fixed: '3.0' },
];
const P7 = [
  P5[0],
  P5[1],
  P5[2],
  P5[3],
  { name: 'Trail %', n: 9, range: ['1.0', '5.0', '0.5'] },
  { name: 'ATR length', n: 4, range: ['7', '28', '7'] },
  { name: 'Exit after bars', n: 5, range: ['0', '40', '10'] },
];
function paramRow(p, { moreOn = false } = {}) {
  if (p.fixed != null)
    return `<div style="display: flex; align-items: center; gap: 10px; height: 28px">${cb(false, `优化 ${p.name}`)}<span style="flex: 1" class="t2">${p.name}</span><span class="t3" style="font-size: 12px">固定</span><input class="mini" value="${p.fixed}" aria-label="${p.name} 固定值" style="width: 60px"></div>`;
  const e = p.err ? ' err' : '';
  const second = p.range
    ? `<div class="num" style="display: flex; align-items: center; gap: 6px; padding-left: 25px">
<input class="mini${e}" value="${p.range[0]}" aria-label="${p.name} 从" style="width: 60px"><span class="t3">至</span><input class="mini${e}" value="${p.range[1]}" aria-label="${p.name} 到" style="width: 60px"><span class="t3" style="margin-left: 6px">步长</span><input class="mini" value="${p.range[2]}" aria-label="${p.name} 步长" style="width: 52px">
</div>`
    : `<div style="display: flex; align-items: center; gap: 6px; padding-left: 25px; flex-wrap: wrap">${p.chips.map((c) => `<button class="chip${p.off && p.off.includes(c) ? '' : ' on'}">${c}</button>`).join('')}${p.more ? `<button class="chip t2${moreOn ? ' on' : ''}">${p.more}</button>` : ''}</div>`;
  return `<div style="display: flex; flex-direction: column; gap: 7px">
<div style="display: flex; align-items: center; gap: 10px">${cb(true, `优化 ${p.name}`)}<span style="flex: 1">${p.name}</span><span class="${p.err ? 'dn' : 't2'} num">${p.err ? '—' : p.n}</span></div>
${second}
${p.err ? `<span class="errt" style="padding-left: 25px">${p.err}</span>` : ''}
</div>`;
}
const slider = `<div style="display: flex; align-items: center; gap: 12px">
<span class="t2" style="white-space: nowrap">样本外占比</span>
<div style="flex: 1; height: 4px; border-radius: 2px; background: #2f353c; position: relative">
<div style="position: absolute; right: 0; top: 0; bottom: 0; width: 30%; border-radius: 2px; background: #f2a33a"></div>
<div style="position: absolute; left: 70%; top: -6px; width: 16px; height: 16px; margin-left: -8px; border-radius: 8px; background: #e8eaed; border: 3px solid #f2a33a"></div>
</div>
<span class="num" style="width: 32px; text-align: right">30%</span>
</div>`;
const wfFields = (
  anch = 0,
) => `<div class="num" style="display: flex; align-items: center; gap: 6px; white-space: nowrap">
<span class="t2">样本内</span><input class="mini" value="12" aria-label="样本内月数" style="width: 42px">
<span class="t2" style="margin-left: 6px">样本外</span><input class="mini" value="3" aria-label="样本外月数" style="width: 36px">
<span class="t2" style="margin-left: 6px">步长</span><input class="mini" value="3" aria-label="步长月数" style="width: 36px">
<span class="t3">个月</span>
</div>
<div style="display: flex; align-items: center; justify-content: space-between"><span class="t2">样本内起点</span>${seg(['随窗口滚动', '固定于起点'], anch, { cls: 'sm', label: '窗口方式' })}</div>`;
export const progressBlock = ({
  done = '1,373',
  total = '2,214',
  pct: p = 62,
  used = '6:18',
  left = '3:51',
  label = '优化中',
  extra = '',
} = {}) => `<div style="flex: none; border-top: 1px solid #23272d; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px">
<div class="num" style="display: flex; align-items: center; gap: 8px">${I.spin(14)}<span style="font-weight: 600">${label}</span><span class="t2">${done} / ${total} 组</span><span style="flex: 1"></span><span style="font-weight: 600">${p}%</span></div>
<div class="bar"><i style="width: ${p}%"></i></div>
<div class="num" style="display: flex; align-items: center; gap: 12px; font-size: 12px"><span class="t2">已用 ${used}</span><span class="t2">预计剩余 ${left}</span><span class="t3">${extra || '7 个线程'}</span><span style="flex: 1"></span><button class="ghost" style="height: 28px">${I.stop(10)}取消</button></div>
</div>`;
export function asideOpt({
  mode = 'split',
  method = 0,
  many = false,
  errs = false,
  state = 'idle',
  sel = null,
  moreOn = false,
  addOn = false,
  objOn = false,
  anch = 0,
  over = '',
  footer = null,
  head = null,
} = {}) {
  let list = many ? P7 : P5;
  if (errs)
    list = [
      { ...P5[0], range: ['50', '10', '1'], err: '结束值不得小于起始值' },
      P5[1],
      { ...P5[2], off: ['close', 'hl2', 'ohlc4'], err: '至少选择一个取值' },
      P5[3],
      P5[4],
    ];
  const vIdx = { none: 0, split: 1, wf: 2 }[mode];
  const vBody =
    mode === 'split'
      ? slider
      : mode === 'wf'
        ? wfFields(anch)
        : '<span class="t3" style="font-size: 12.5px; line-height: 1.45">全部行情用于优化，排行仅反映拟合程度；稳健性请参考邻域均值与影响度。</span>';
  const obj = mode === 'none' ? '净利润' : '样本内净利润';
  let foot = footer;
  if (foot == null) {
    if (state === 'running')
      foot =
        mode === 'wf'
          ? progressBlock({
              label: '第 3 / 6 窗',
              done: '908',
              total: '2,214',
              pct: 41,
              used: '11:52',
              left: '17:10',
            })
          : progressBlock();
    else {
      const big = errs ? '—' : many ? '2,000' : mode === 'wf' ? '13,284' : '2,214';
      const unit = mode === 'wf' && !errs ? '次回测' : '组';
      const sub = errs
        ? '<span class="errt">请先修正上方 2 处错误</span>'
        : many
          ? '随机采样，约 9 分钟，7 个线程'
          : mode === 'wf'
            ? '6 窗 × 2,214 组，约 29 分钟'
            : '约 10 分钟，7 个线程';
      foot = `<div style="flex: none; border-top: 1px solid #23272d; padding: 14px 16px 16px; display: flex; align-items: center; gap: 12px">
<div class="num" style="flex: 1; display: flex; flex-direction: column; gap: 2px">
<div style="display: flex; align-items: baseline; gap: 6px"><span style="font-size: 20px; font-weight: 600">${big}</span><span class="t2">${unit}</span></div>
<span class="t3" style="font-size: 12px">${sub}</span>
</div>
<button class="primary${errs ? ' off' : ''}" style="height: 36px; padding: 0 16px">${I.play()}开始优化</button>
</div>`;
    }
  }
  const dim = state === 'running' ? '; opacity: 0.5' : '';
  return aside(`${head ?? rtabs(1, sel)}
<div style="flex: 1; min-height: 0; padding: 12px 16px 0; display: flex; flex-direction: column; gap: ${many ? 16 : 22}px; overflow: hidden; position: relative${dim}">
<div style="display: flex; flex-direction: column; gap: 12px">
<div class="sec"><span>搜索范围</span>${seg(['网格', '随机'], method, { cls: 'sm', label: '搜索方式' })}</div>
${list.map((p) => paramRow(p, { moreOn })).join('\n')}
${
  many
    ? `<div class="note am num"><span>网格共 398,520 组，超出 20,000 组上限，已切换为随机采样。</span></div>
<div class="num" style="display: flex; align-items: center; gap: 8px"><span class="t2">采样</span><input class="mini" value="2000" aria-label="随机采样数量" style="width: 68px"><span class="t3">组</span><span class="t2" style="margin-left: 10px">种子</span><input class="mini" value="42" aria-label="随机种子" style="width: 56px"></div>`
    : ''
}
</div>
<div style="display: flex; flex-direction: column; gap: 12px">
<div class="sec"><span>验证</span></div>
${seg(['不验证', '样本内 / 外', '滚动窗口'], vIdx, { style: 'width: 100%; height: 32px', label: '验证方式', each: 'flex: 1' })}
${vBody}
</div>
<div style="display: flex; flex-direction: column; gap: 10px">
<div class="sec"><span>${mode === 'wf' ? '逐窗选参与筛选' : '排序与筛选'}</span></div>
${select(`<span class="t3">按 </span>${obj}<span class="t3">，最大</span>`, { cls: objOn ? 'foc' : '' })}
<div style="display: flex; flex-wrap: wrap; gap: 6px">${rmChip('交易数 ≥ 30')}${rmChip('最大回撤 ≤ 15%')}${addChip(addOn)}</div>
</div>
<div style="display: flex; flex-direction: column; gap: 6px">
<div class="sec"><span>策略属性</span><a href="#" style="font-size: 12.5px; font-weight: 400">修改</a></div>
<div class="num t2" style="display: flex; gap: 14px; font-size: 12.5px"><span>手续费 0.1%</span><span>滑点 1 tick</span><span>100% 权益</span></div>
</div>
${many ? '<div style="position: absolute; right: 4px; top: 8px; width: 4px; height: 520px; border-radius: 2px; background: #2f353c"></div>' : ''}
${over}
</div>
${foot}`);
}

// =====================================================================  right panel: 选中
const runFacts = (rows) => `<div style="display: flex; flex-direction: column">
<div class="sec" style="margin-bottom: 2px"><span>本次优化</span></div>
${rows.map(([k, v], i) => `<div class="kv num"${i === rows.length - 1 ? ' style="border-bottom: 1px solid #1f2328"' : ''}><span>${k}</span>${v}</div>`).join('\n')}
</div>`;
const selHead = (
  big,
  sub,
  a = '上一个',
  b = '下一个',
) => `<div style="height: 52px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 16px; border-bottom: 1px solid #23272d">
<span class="am num" style="font-size: 20px; font-weight: 700">${big}</span>
<span class="t2 num" style="flex: 1; font-size: 12.5px">${sub}</span>
<button class="iconbtn" aria-label="${a}">${I.chevUp()}</button>
<button class="iconbtn" aria-label="${b}">${I.chev(14, 'currentColor')}</button>
</div>`;
export function asideTrial({ mode = 'split', viewing = false, head = null } = {}) {
  const many = mode === 'many',
    none = mode === 'none';
  const params = many
    ? [
        ['Length', '20', '28', 1],
        ['Multiplier', '2.00', '2.00'],
        ['Source', 'close', 'close'],
        ['Use trailing stop', '关', '开', 1],
        ['Trail %', '3.0', '2.5', 1],
        ['ATR length', '14', '14'],
        ['Exit after bars', '0', '20', 1],
      ]
    : [
        ['Length', '20', '28', 1],
        ['Multiplier', '2.00', '2.00'],
        ['Source', 'close', 'close'],
        ['Use trailing stop', '关', '关'],
        ['Trail %', '3.0', '3.0', 0, 1],
      ];
  const metrics = none
    ? `<table class="num">
<thead><tr><th></th><th style="color: #6cb6dd">全区间</th></tr></thead>
<tbody>
<tr><td>净利润</td><td class="up">+34,540</td></tr><tr><td>收益率</td><td>+34.54%</td></tr><tr><td>最大回撤</td><td>−7.50%</td></tr><tr><td>盈利因子</td><td>1.34</td></tr><tr><td>胜率</td><td>48.4%</td></tr><tr><td>交易</td><td>91</td></tr><tr><td>邻域均值</td><td>${sfmt(r10(FULL_ROWS[0].nm))}</td></tr>
</tbody>
</table>`
    : `<table class="num">
<thead><tr><th></th><th style="color: #6cb6dd">样本内</th><th style="color: #f5b155">样本外</th></tr></thead>
<tbody>
<tr><td>净利润</td><td class="up">${many ? '+20,410' : '+22,200'}</td><td class="up">${many ? '+10,940' : '+12,340'}</td></tr><tr><td>收益率</td><td>${many ? '+20.41%' : '+22.20%'}</td><td>${many ? '+9.09%' : '+10.10%'}</td></tr><tr><td>最大回撤</td><td>−7.50%</td><td>−4.90%</td></tr><tr><td>盈利因子</td><td>1.32</td><td>1.41</td></tr><tr><td>胜率</td><td>48.1%</td><td>46.4%</td></tr><tr><td>交易</td><td>63</td><td>28</td></tr><tr><td>邻域均值</td><td>+19,090</td><td class="t3">—</td></tr>
</tbody>
</table>`;
  const facts = many
    ? [
        ['组合', '<span>随机 2,000 / 398,520</span>'],
        ['线程', '<span>7 / 8</span>'],
        ['用时', '<span>9 分 12 秒</span>'],
        ['报错', '<span class="t2">0 组</span>'],
      ]
    : [
        ['组合', none ? '<span>41 × 9 = 369</span>' : '<span>41 × 9 × 3 × 2 = 2,214</span>'],
        ['线程', '<span>7 / 8</span>'],
        ['用时', none ? '<span>2 分 31 秒</span>' : '<span>10 分 09 秒</span>'],
        ['报错', none ? '<span class="t2">0 组</span>' : '<a href="#" class="dn">2 组，查看</a>'],
      ];
  return aside(`${head ?? rtabs(2, '#1')}
${selHead('#1', none ? '净利润第 1' : '样本内净利润第 1')}
<div style="flex: 1; min-height: 0; padding: 14px 16px; display: flex; flex-direction: column; gap: ${many ? 14 : 18}px">
<table class="num">
<thead><tr><th>参数</th><th>当前</th><th style="width: 26px"></th><th style="color: #e8eaed">选中</th></tr></thead>
<tbody>
${params.map(([n, a, b, diff, fixed]) => `<tr><td>${n}</td><td class="${fixed ? 't3' : 't2'}">${a}</td><td class="t3" style="text-align: center">${diff ? '→' : ''}</td><td${diff ? ' class="am" style="font-weight: 600"' : fixed ? ' class="t3"' : ''}>${b}</td></tr>`).join('\n')}
</tbody>
</table>
<div style="display: flex; flex-direction: column; gap: 8px">
<button class="primary" style="width: 100%; height: 36px">应用到参数</button>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<button class="ghost"${viewing ? ' style="border-color: #6b5227; background: #241c10; color: #f5c27a"' : ''}>${viewing ? '正在查看完整回测' : '完整回测'}</button>
<button class="ghost">复制参数</button>
</div>
</div>
${metrics}
<div style="flex: 1"></div>
${many ? '' : runFacts(facts)}
</div>`);
}
export function asideWindow({ heat = 'own', shadow = true, head = null } = {}) {
  const own = heat === 'own';
  const ax = X.squareAxis(D.Ls, 266),
    mx = 34 + Math.round((266 - ax.nb * ax.pitch) / 2),
    mH = D.Ms.length * ax.pitch;
  const g = X.binCols(own ? D.surfaceW3 : X.surfaceMean, ax.n);
  const ring = own
    ? [{ at: [ax.bin(26), D.Ms.indexOf(2.25)], color: '#f2a33a', width: 2 }]
    : wfRings(ax, 6);
  const mh =
    X.heat2({
      g,
      x: mx,
      y: 4,
      cell: ax.pitch,
      bins: X.W3_BINS,
      ring,
      labelSize: 10.5,
      xLabels: [10, 28, 49].map((L) => [ax.bin(L), ax.label(ax.bin(L))]),
      yLabels: [
        [0, '1.00'],
        [4, '2.00'],
        [8, '3.00'],
      ],
    }).svg +
    `<text x="${mx + (ax.nb * ax.pitch) / 2}" y="${mH + 34}" fill="#7f8790" font-size="11" text-anchor="middle">Length · 每格 ${ax.n} 个值取平均</text>`;
  return aside(`${head ?? rtabs(2, 'W3')}
${selHead('W3', '样本外 2024-07-01 – 09-30', '上一个窗口', '下一个窗口')}
<div style="flex: 1; min-height: 0; padding: 14px 16px; display: flex; flex-direction: column; gap: 18px">
<div class="num" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">
<div style="display: flex; flex-direction: column; gap: 3px"><span class="t2" style="font-size: 12px">样本内</span><span class="up" style="font-size: 18px; font-weight: 600">+10,450</span></div>
<div style="display: flex; flex-direction: column; gap: 3px"><span class="t2" style="font-size: 12px">样本外</span><span class="dn" style="font-size: 18px; font-weight: 600">−860</span></div>
<div style="display: flex; flex-direction: column; gap: 3px"><span class="t2" style="font-size: 12px">WFE</span><span class="dn" style="font-size: 18px; font-weight: 600">−0.33</span></div>
</div>
<div style="display: flex; flex-direction: column">
<div class="kv num"><span>样本内区间</span><span>2023-07-01 – 2024-06-30</span></div>
<div class="kv num"><span>选中参数</span><span>26，2.25，close，关</span></div>
<div class="kv num" style="border-bottom: 1px solid #1f2328"><span>交易</span><span>35</span></div>
</div>
<div style="display: flex; flex-direction: column; gap: 8px">
<div style="display: flex; align-items: center; justify-content: space-between">
<span style="font-weight: 600">${own ? 'W3 样本内参数图' : '六窗平均参数图'}</span>
${seg(['本窗', '六窗平均'], own ? 0 : 1, { cls: 'sm', label: '参数图范围', style: 'height: 24px' })}
</div>
<svg width="304" height="${mH + 40}" viewBox="0 0 304 ${mH + 40}" style="display: block" role="img" aria-label="Length × Multiplier 热力图">
${mh}
</svg>
${own ? '' : '<span class="t3" style="font-size: 12px; display: flex; align-items: center; gap: 6px"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="#e8eaed" stroke-width="1.5"/></svg>圆圈为各窗口选中的参数，橙色为 W3</span>'}
</div>
<div style="display: flex; align-items: center; justify-content: space-between; height: 32px; border-top: 1px solid #1f2328; padding-top: 6px">
<span>在图表中显示样本内曲线</span>
${sw(shadow, '在图上显示 W3 样本内曲线')}
</div>
<button class="ghost" style="width: 100%">以 W3 参数完整回测</button>
</div>`);
}
