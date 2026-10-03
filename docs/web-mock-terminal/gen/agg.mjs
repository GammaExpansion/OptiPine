// 优化 page building blocks: everything here describes many parameter sets at once.
import * as D from './data.mjs';
import * as C from './charts.mjs';
import * as X from './x.mjs';
import { I, dot, seg } from './ui.mjs';
const { fmt } = X;
const f1 = D.f1;

export const PG = ['回测', '优化'];
export const PG_DONE = ['回测', '优化' + dot('#f2a33a', 6)];

const sw8 = (c) =>
  `<span style="width: 8px; height: 8px; border-radius: 2px; background: ${c}"></span>`;
export function rangeBar(mode = 'split') {
  let body;
  if (mode === 'none')
    body = `<span style="display: flex; align-items: center; gap: 6px">${sw8('#6cb6dd')}全部用于优化<span class="t2">2023-01-02 – 2025-05-04</span></span><div style="flex: 1; height: 8px; border-radius: 4px; background: #3b6f8c"></div><span class="t3">不留样本外区间</span>`;
  else if (mode === 'wf')
    body = `<span>6 个窗口</span><span style="display: flex; align-items: center; gap: 6px">${sw8('#3b6f8c')}样本内 12 个月</span><span style="display: flex; align-items: center; gap: 6px">${sw8('#f2a33a')}样本外 3 个月</span><span class="t2">步长 3 个月，样本内随窗口滚动</span>`;
  else
    body = `<span style="display: flex; align-items: center; gap: 6px">${sw8('#6cb6dd')}样本内<span class="t2">2023-01-02 – 2024-08-20</span></span>
<div style="flex: 1; height: 8px; border-radius: 4px; overflow: hidden; display: flex"><div style="width: 70%; background: #3b6f8c"></div><div style="width: 30%; background: #f2a33a"></div></div>
<span style="display: flex; align-items: center; gap: 6px">${sw8('#f2a33a')}样本外<span class="t2">2024-08-21 – 2025-05-04</span></span>`;
  return `<div class="num" style="height: 44px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 12px; border-bottom: 1px solid #23272d; font-size: 12px; white-space: nowrap">
<span class="t2">数据区间</span>
${body}
</div>`;
}

// ---------- aggregate charts
export const CH = 200;
const VIEWS = ['前 20 组权益', '样本内 vs 样本外', '净利润分布'];
export function fanSvg({
  split = true,
  sel = D.equityTop,
  selEnd = 134540,
  w = 1104,
  h = CH,
  x0 = 8,
  x1 = 1036,
  axisX = 1046,
  labels = true,
} = {}) {
  const top = [...D.trials].sort((a, c) => c.is - a.is).slice(0, 20);
  const paths = top.map((t, k) => {
    if (t.L === 28 && t.M === 2 && t.src === 'close' && t.tr === '关') return sel;
    const r = D.rng(900 + k);
    const isEnd = 100000 + t.is,
      end = isEnd + t.oos;
    return D.bridge(
      [
        [0, 100000],
        [150, 100000 + t.is * (0.25 + r() * 0.1)],
        [380, 100000 + t.is * (0.6 + r() * 0.12)],
        [D.IS_END, isEnd],
        [720, isEnd + t.oos * (0.3 + r() * 0.3)],
        [D.LAST, end],
      ],
      230,
      r,
    );
  });
  const median = paths[0].map((_, i) => {
    const v = paths.map((p) => p[i]).sort((a, c) => a - c);
    return (v[9] + v[10]) / 2;
  });
  const X0 = D.scale(0, D.LAST, x0, x1),
    Y = D.scale(97000, 137000, h - 22, 14);
  const sx = X0(D.IS_END);
  const out = [];
  if (split)
    out.push(
      `<rect x="${x0}" y="14" width="${f1(sx - x0)}" height="${h - 36}" fill="rgba(108,182,221,0.06)"/><rect x="${f1(sx)}" y="14" width="${f1(x1 - sx)}" height="${h - 36}" fill="rgba(242,163,58,0.07)"/><line x1="${f1(sx)}" x2="${f1(sx)}" y1="14" y2="${h - 22}" stroke="#f2a33a"/>`,
    );
  for (const v of [100000, 120000])
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="#1a1d22"/><text x="${axisX}" y="${f1(Y(v) + 4)}" fill="#7f8790" font-size="11">${w > 600 ? fmt(v) : v / 1000 + 'k'}</text>`,
    );
  for (const p of paths)
    if (p !== sel)
      out.push(
        `<path d="${D.linePath(p, X0, Y, 160)}" fill="none" stroke="#5b7f99" stroke-opacity="0.5" stroke-width="1"/>`,
      );
  out.push(
    `<path d="${D.linePath(median, X0, Y, 200)}" fill="none" stroke="#cfd6dd" stroke-width="1.6" stroke-dasharray="5 3"/>`,
  );
  out.push(
    `<path d="${D.linePath(sel, X0, Y, 220)}" fill="none" stroke="#f2a33a" stroke-width="2"/>`,
  );
  if (w > 600)
    out.push(
      `<rect x="${axisX - 4}" y="${f1(Y(selEnd) - 9)}" width="60" height="18" rx="2" fill="#f2a33a"/><text x="${axisX}" y="${f1(Y(selEnd) + 4)}" fill="#1a1206" font-size="11" font-weight="600">${fmt(selEnd)}</text>`,
    );
  if (labels)
    for (const [d, s] of [
      [D.dayOf(2023, 7, 1), '2023-07'],
      [D.dayOf(2024, 1, 1), '2024-01'],
      [D.dayOf(2024, 7, 1), '2024-07'],
      [D.dayOf(2025, 1, 1), '2025-01'],
    ])
      out.push(
        `<text x="${f1(X0(d))}" y="${h - 6}" fill="#7f8790" font-size="11" text-anchor="middle">${s}</text>`,
      );
  if (split)
    out.push(
      `<text x="${f1(sx - 8)}" y="28" fill="#6cb6dd" font-size="11.5" text-anchor="end">样本内</text><text x="${f1(sx + 8)}" y="28" fill="#f5b155" font-size="11.5">样本外</text>`,
    );
  return out.join('');
}
export const scatterSvg = (n = 820, highlight = true) =>
  C.scatter(
    {
      grid: '#1a1d22',
      zero: '#3a4048',
      dotNeg: 'rgba(240,106,93,0.5)',
      dotPos: 'rgba(63,191,138,0.5)',
      dotLead: '#e8eaed',
      axis: '#7f8790',
    },
    {
      x0: 70,
      x1: 1036,
      y0: 12,
      y1: CH - 30,
      n,
      dotR: 2,
      gridX: [-10000, 10000, 20000],
      gridY: [10000],
      highlight: highlight
        ? [{ L: 28, M: 2, color: '#f2a33a', r: 7, label: '#1', dx: -12, dy: -10 }]
        : [],
      xTicks: [
        [-10000, '−10k'],
        [0, '0'],
        [10000, '+10k'],
        [20000, '+20k'],
      ],
      yTicks: [
        [0, '0'],
        [10000, '+10k'],
      ],
    },
  ) +
  `<text x="1036" y="${CH - 34}" fill="#aab1b9" font-size="11.5" text-anchor="end">样本内净利润 →</text><text x="76" y="24" fill="#aab1b9" font-size="11.5">样本外净利润 ↑</text>`;

const swLine = (c, dash, label, w = 2) =>
  `<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 0; border-top: ${w}px ${dash ? 'dashed' : 'solid'} ${c}"></span><span class="t2">${label}</span></span>`;
const swDot = (c, label) =>
  `<span style="display: flex; align-items: center; gap: 6px"><span style="width: 8px; height: 8px; border-radius: 4px; background: ${c}"></span><span class="t2">${label}</span></span>`;
export function chartArea(view, svg, legend, { dim = false } = {}) {
  return `<div style="height: 32px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 12px; font-size: 12px; white-space: nowrap">
<span style="font-weight: 600; font-size: 13px">汇总</span>
<div class="num" style="display: flex; align-items: center; gap: 14px">${legend}</div>
<div style="flex: 1"></div>
${seg(VIEWS, view, { cls: 'sm', label: '汇总图' })}
</div>
<div style="height: ${CH}px; flex: none; border-bottom: 1px solid #23272d${dim ? '; opacity: 0.4' : ''}"><svg width="1104" height="${CH}" viewBox="0 0 1104 ${CH}" style="display: block" role="img" aria-label="${VIEWS[view]}">${svg}</svg></div>`;
}
export const FAN = ({
  split = true,
  sel,
  selEnd,
  dim = false,
  label = '排行前 20 组（按当前排序与条件）',
} = {}) =>
  chartArea(
    0,
    fanSvg({ split, sel, selEnd }),
    swLine('#5b7f99', false, label, 1) +
      swLine('#cfd6dd', true, '中位数') +
      swLine('#f2a33a', false, '#1'),
    { dim },
  );
export const SCATTER = (n = 820, hl = true, note = '共 2,214 组') =>
  chartArea(
    1,
    scatterSvg(n, hl),
    `<span class="t2">每个点是一组参数，${note}</span>` +
      swDot('#3fbf8a', '样本外盈利') +
      swDot('#f06a5d', '样本外亏损') +
      swDot('#e8eaed', '排行前 13') +
      (hl ? swDot('#f2a33a', '#1') : ''),
  );

export const section = (inner, dim = false) =>
  `<section style="flex: 1; min-height: 0; background: #14171b; display: flex${dim ? '; opacity: 0.4' : ''}">${inner}</section>`;
export const selBar = (
  id,
  items,
  nets,
  { apply = true, dim = false } = {},
) => `<div class="num" style="height: 60px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 12px 0 16px; background: #1b1f24; border-top: 1px solid #2f353c; white-space: nowrap${dim ? '; opacity: 0.5' : ''}">
<span class="am" style="font-size: 18px; font-weight: 700">${id}</span>
<span style="display: flex; gap: 14px">${items.map(([k, v]) => `<span><span class="t3">${k} </span><b style="font-weight: 600">${v}</b></span>`).join('')}</span>
<span style="width: 1px; height: 20px; background: #2f353c"></span>
<span style="display: flex; gap: 14px">${nets.map(([k, v, c]) => `<span><span class="t3">${k} </span><span class="${c}">${v}</span></span>`).join('')}</span>
<span style="flex: 1"></span>
<button class="ghost">查看这组参数的回测</button>
${apply ? '<button class="primary">应用到参数</button>' : ''}
</div>`;
export const runFooter = (
  big,
  unit,
  sub,
  label,
) => `<div style="flex: none; border-top: 1px solid #23272d; padding: 14px 16px 16px; display: flex; align-items: center; gap: 12px">
<div class="num" style="flex: 1; display: flex; flex-direction: column; gap: 2px"><div style="display: flex; align-items: baseline; gap: 6px"><span style="font-size: 20px; font-weight: 600">${big}</span><span class="t2">${unit}</span></div><span class="t3" style="font-size: 12px">${sub}</span></div>
<button class="primary" style="height: 36px; padding: 0 16px">${I.play()}${label}</button>
</div>`;
export const emptyOpt = `<section style="flex: 1; min-height: 0; background: #14171b; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px">
<span style="font-size: 15px; font-weight: 600">尚未运行优化</span>
<span class="t2">在右侧设置搜索范围与验证方式。运行后，此处显示汇总图、排行、参数图与影响度。</span>
<span class="t3" style="font-size: 12.5px; margin-top: 6px">单组参数的 K 线、权益曲线、报告与成交在「回测」页查看。</span>
</section>`;
// window plan for walk-forward before a run: lanes only, no equity
export const wfPlan =
  () => `<div style="height: 32px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 12px; font-size: 12px"><span style="font-weight: 600; font-size: 13px">窗口计划</span><span class="t2">每个窗口在样本内重新优化，再用选出的参数跑紧随其后的样本外区间</span></div>
<div style="height: 196px; flex: none; border-bottom: 1px solid #23272d"><svg width="1104" height="196" viewBox="0 0 1104 196" style="display: block" role="img" aria-label="6 个滚动窗口的样本内与样本外区间">${X.wf2({ w: 1104, x0: 40, x1: 1036, y0: 6, y1: 8, laneY: 34, laneH: 14, laneGap: 9, axisX: null, timeY: 188, done: 0, sel: null, axisVals: [], gridVals: [] })}</svg></div>`;

// net profit of every combination: in-sample as bars, out-of-sample as a step outline
export function histSvg() {
  const lo = -11000,
    hi = 23000,
    bw = 1000,
    n = (hi - lo) / bw;
  const count = (key) => {
    const c = new Array(n).fill(0);
    for (const t of D.trials) c[Math.min(n - 1, Math.max(0, Math.floor((t[key] - lo) / bw)))]++;
    return c;
  };
  const isC = count('is'),
    oosC = count('oos');
  const top = Math.ceil(Math.max(...isC, ...oosC) / 100) * 100;
  const x0 = 70,
    x1 = 1036,
    y0 = 14,
    y1 = CH - 30;
  const X = D.scale(lo, hi, x0, x1),
    Y = D.scale(0, top, y1, y0);
  const med = (key) => {
    const s = D.trials.map((t) => t[key]).sort((a, c) => a - c);
    return s[Math.floor(s.length / 2)];
  };
  const out = [];
  for (let v = 100; v <= top; v += 100)
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="#1a1d22"/><text x="${x0 - 8}" y="${f1(Y(v) + 4)}" fill="#7f8790" font-size="11" text-anchor="end">${v}</text>`,
    );
  isC.forEach((c, k) => {
    if (!c) return;
    const a = lo + k * bw;
    out.push(
      `<rect x="${f1(X(a) + 1)}" y="${f1(Y(c))}" width="${f1(X(a + bw) - X(a) - 2)}" height="${f1(y1 - Y(c))}" fill="${a < 0 ? '#66342c' : '#2f7ea6'}"/>`,
    );
  });
  out.push(
    `<path d="M${f1(X(lo))} ${y1}${oosC.map((c, k) => `V${f1(Y(c))}H${f1(X(lo + (k + 1) * bw))}`).join('')}V${y1}" fill="none" stroke="#f2a33a" stroke-width="1.6" stroke-linejoin="round"/>`,
  );
  out.push(
    `<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="#3a4048"/><line x1="${f1(X(0))}" x2="${f1(X(0))}" y1="${y0}" y2="${y1}" stroke="#3a4048"/>`,
  );
  const mIs = med('is');
  out.push(
    `<line x1="${f1(X(mIs))}" x2="${f1(X(mIs))}" y1="${y0}" y2="${y1}" stroke="#cfd6dd" stroke-width="1.4" stroke-dasharray="4 3"/><text x="${f1(X(mIs) - 6)}" y="${y0 + 10}" fill="#cfd6dd" font-size="11" text-anchor="end">样本内中位数 ${(mIs > 0 ? '+' : '−') + fmt(Math.abs(mIs))}</text>`,
  );
  const p1 = 22200;
  out.push(
    `<line x1="${f1(X(p1))}" x2="${f1(X(p1))}" y1="${y0}" y2="${y1}" stroke="#f2a33a" stroke-width="1.6"/><text x="${f1(X(p1) - 6)}" y="${y0 + 10}" fill="#f5b155" font-size="11" text-anchor="end" font-weight="600">#1 +22,200</text>`,
  );
  for (const [v, s] of [
    [-10000, '−10k'],
    [-5000, '−5k'],
    [0, '0'],
    [5000, '+5k'],
    [10000, '+10k'],
    [15000, '+15k'],
    [20000, '+20k'],
  ])
    out.push(
      `<text x="${f1(X(v))}" y="${y1 + 16}" fill="#7f8790" font-size="11" text-anchor="middle">${s}</text>`,
    );
  out.push(
    `<text x="${x1}" y="${y1 + 16}" fill="#aab1b9" font-size="11.5" text-anchor="end">净利润 →</text><text x="${x0 - 8}" y="${y1 + 16}" fill="#aab1b9" font-size="11.5" text-anchor="end">组数</text>`,
  );
  const posIs = D.trials.filter((t) => t.is > 0).length,
    posOos = D.trials.filter((t) => t.oos > 0).length;
  return { svg: out.join(''), posIs, posOos };
}
export const HIST = () => {
  const h = histSvg();
  const box = (c, label, outline = false) =>
    `<span style="display: flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; ${outline ? `border: 1.6px solid ${c}` : `background: ${c}`}"></span><span class="t2">${label}</span></span>`;
  return chartArea(
    2,
    h.svg,
    `<span class="t2">2,214 组，每格 1,000</span>` +
      box('#2f7ea6', `样本内（盈利 ${fmt(h.posIs)} 组）`) +
      box('#f2a33a', `样本外（盈利 ${fmt(h.posOos)} 组）`, true) +
      `<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 0; border-top: 1.6px dashed #cfd6dd"></span><span class="t2">中位数</span></span>`,
  );
};
