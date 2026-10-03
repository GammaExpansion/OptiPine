// Extra data and charts for the full A-direction screen set. Builds on data.mjs / charts.mjs.
import * as D from './data.mjs';
import * as C from './charts.mjs';
const { f1, scale, linePath, areaPath, rectsPath } = D;
export const { fmt, sfmt, kfmt } = C;

export const TA = {
  grid: '#1a1d22',
  grid2: '#23272d',
  band: '#5d6570',
  basis: '#2bb3a3',
  up: '#3fbf8a',
  down: '#f06a5d',
  hollowUp: true,
  bg: '#0e1013',
  win: '#3fbf8a',
  loss: '#f06a5d',
  longLabel: '多',
  shortLabel: '空',
  axis: '#7f8790',
  onUp: '#08170f',
  baseline: '#3a4048',
  split: '#f2a33a',
  splitDash: '0',
};
export const HEAT_COLORS = [
  '#9a4535',
  '#66342c',
  '#3a2724',
  '#1b3441',
  '#1f5572',
  '#2f7ea6',
  '#56abd3',
  '#a6ddf2',
];
export const HEAT_A = C.bins([-4000, -1500, 0, 5000, 10000, 15000, 19000], HEAT_COLORS);
export const HEAT_FULL = C.bins([-6000, -2500, 0, 8000, 16000, 24000, 30000], HEAT_COLORS);
export const W3_BINS = C.bins([-3000, -1000, 0, 3000, 6000, 8500, 9800], HEAT_COLORS);

const txt = (x, y, s, { fill, size = 11, anchor = 'start', weight } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" fill="${fill}" font-size="${size}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}>${s}</text>`;
const path = (d, attrs) => `<path d="${d}" ${attrs}/>`;

// ---------- time of the visible hourly bars (150 bars ending 2025-05-04 23:00 UTC)
const END = Date.UTC(2025, 4, 4, 23);
const N = D.candles.bars.length;
export const barTime = (i) => new Date(END - (N - 1 - i) * 3600e3);
const p2 = (n) => String(n).padStart(2, '0');
export const fmtDT = (d) =>
  `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:00`;
export const fmtMD = (d) =>
  `${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:00`;

// ---------- trade list: the four positions on the chart plus seeded older ones
export const QTY = 352.6 / (D.candles.sig.at(-1).px - D.candles.bars.at(-1).c); // open P&L −352.60, as in the report
export const equityMany = (() => {
  const r = D.rng(91);
  return D.bridge(
    [
      [0, 100000],
      [60, 101900],
      [120, 105800],
      [180, 105100],
      [260, 110100],
      [330, 113200],
      [400, 118300],
      [450, 117000],
      [520, 119400],
      [596, 120410],
      [650, 122700],
      [700, 121600],
      [760, 126900],
      [800, 128500],
      [830, 127600],
      [853, 131350],
    ],
    230,
    r,
  );
})();
export const trades = (() => {
  const { bars, sig } = D.candles;
  const fee = (px) => px * QTY * 0.001;
  const out = [];
  for (let k = sig.length - 1; k >= 0; k--) {
    const a = sig[k],
      b = sig[k + 1];
    const outPx = b ? b.px : bars[N - 1].c;
    const gross = (a.side === 'long' ? outPx - a.px : a.px - outPx) * QTY;
    const pnl = b ? gross - fee(a.px) - fee(outPx) : gross;
    out.push({
      side: a.side,
      in: barTime(a.i),
      inPx: a.px,
      out: b ? barTime(b.i) : null,
      outPx,
      pnl,
      bars: (b ? b.i : N - 1) - a.i,
      open: !b,
      ai: a.i,
      bi: b ? b.i : N - 1,
    });
  }
  const r = D.rng(2025);
  let t = barTime(sig[0].i).getTime(),
    px = sig[0].px,
    side = sig[0].side === 'long' ? 'short' : 'long';
  for (let k = 0; k < 24; k++) {
    const hold = Math.round(9 + r() * 58);
    const move = D.gauss(r) * 0.016 + 0.002;
    const inPx = side === 'long' ? px / (1 + move) : px * (1 + move);
    const tin = t - hold * 3600e3;
    const gross = (side === 'long' ? px - inPx : inPx - px) * QTY;
    out.push({
      side,
      in: new Date(tin),
      inPx,
      out: new Date(t),
      outPx: px,
      pnl: gross - fee(inPx) - fee(px),
      bars: hold,
    });
    t = tin - Math.round(4 + r() * 70) * 3600e3;
    px = inPx * (1 + D.gauss(r) * 0.006);
    side = r() < 0.55 ? (side === 'long' ? 'short' : 'long') : side;
  }
  let cum = 18420.35,
    id = 144;
  for (const tr of out) {
    tr.id = id--;
    tr.pct = (tr.pnl / (tr.inPx * QTY)) * 100;
    if (!tr.open) {
      tr.cum = cum;
      cum -= tr.pnl;
    }
  }
  return out;
})();

// ---------- candles with options: plots, markers, crosshair, selected trade, RSI
export function candles2(t, o) {
  const {
    w,
    h,
    x0,
    x1,
    y0,
    y1,
    axisX,
    plots = true,
    marks = true,
    markOpacity = 1,
    cross,
    sel,
    lo = 93900,
    hi = 97900,
  } = o;
  const { bars, sig } = D.candles;
  const step = (x1 - x0) / N;
  const bw = Math.max(2, step * 0.62);
  const X = (i) => x0 + step * (i + 0.5);
  const Y = scale(lo, hi, y1, y0);
  const out = [];
  const gridP = [94000, 95000, 96000, 97000];
  const gridK = [8, 32, 56, 80, 104, 128];
  for (const p of gridP)
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(p))}" y2="${f1(Y(p))}" stroke="${t.grid}" stroke-width="1"/>`,
    );
  for (const k of gridK)
    out.push(
      `<line x1="${f1(X(k) - step / 2)}" x2="${f1(X(k) - step / 2)}" y1="${y0}" y2="${y1}" stroke="${t.grid}" stroke-width="1"/>`,
    );
  if (plots) {
    const line = (key) =>
      bars.map((b, i) => `${i ? 'L' : 'M'}${f1(X(i))} ${f1(Y(b[key]))}`).join('');
    out.push(path(line('upper'), `fill="none" stroke="${t.band}" stroke-width="1"`));
    out.push(path(line('lower'), `fill="none" stroke="${t.band}" stroke-width="1"`));
    out.push(path(line('basis'), `fill="none" stroke="${t.basis}" stroke-width="1.6"`));
  }
  const tw = trades.filter((tr) => tr.ai != null);
  if (marks) {
    out.push(`<g opacity="${markOpacity}">`);
    for (const tr of tw) {
      const isSel = sel === tr.id;
      out.push(
        `<line x1="${f1(X(tr.ai))}" y1="${f1(Y(tr.inPx))}" x2="${f1(X(tr.bi))}" y2="${f1(Y(tr.outPx))}" stroke="${tr.pnl >= 0 ? t.win : t.loss}" stroke-width="${isSel ? 2 : 1.2}" stroke-dasharray="${isSel ? '0' : '3 3'}"/>`,
      );
    }
    out.push('</g>');
  }
  const ub = [],
    uw = [],
    db = [],
    dw = [];
  bars.forEach((b, i) => {
    const up = b.c >= b.o;
    const top = Y(Math.max(b.o, b.c)),
      bot = Y(Math.min(b.o, b.c));
    (up ? ub : db).push([X(i) - bw / 2, top, bw, Math.max(1, bot - top)]);
    (up ? uw : dw).push(
      `M${f1(X(i))} ${f1(Y(b.h))}V${f1(top)}M${f1(X(i))} ${f1(bot)}V${f1(Y(b.l))}`,
    );
  });
  out.push(path(uw.join(''), `stroke="${t.up}" stroke-width="1" fill="none"`));
  out.push(path(dw.join(''), `stroke="${t.down}" stroke-width="1" fill="none"`));
  out.push(
    path(
      rectsPath(ub.map(([x, y, w2, h2]) => [x + 0.5, y + 0.5, w2 - 1, h2 - 1])),
      `fill="${t.bg}" stroke="${t.up}" stroke-width="1"`,
    ),
  );
  out.push(path(rectsPath(db), `fill="${t.down}"`));
  if (marks) {
    out.push(`<g opacity="${markOpacity}">`);
    for (const s of sig) {
      const b = bars[s.i],
        x = X(s.i);
      if (s.side === 'long') {
        const y = Y(b.l) + 8;
        out.push(`<path d="M${f1(x)} ${f1(y)}l5 8h-10z" fill="${t.up}"/>`);
        out.push(txt(x, y + 21, '多', { fill: t.up, size: 11, anchor: 'middle', weight: 600 }));
      } else {
        const y = Y(b.h) - 8;
        out.push(`<path d="M${f1(x)} ${f1(y)}l5 -8h-10z" fill="${t.down}"/>`);
        out.push(txt(x, y - 13, '空', { fill: t.down, size: 11, anchor: 'middle', weight: 600 }));
      }
    }
    for (const tr of tw) {
      if (tr.open) continue;
      const x = (X(tr.ai) + X(tr.bi)) / 2,
        y = (Y(tr.inPx) + Y(tr.outPx)) / 2 - 7;
      out.push(
        txt(x, y, (tr.pct >= 0 ? '+' : '−') + Math.abs(tr.pct).toFixed(2) + '%', {
          fill: tr.pnl >= 0 ? t.win : t.loss,
          size: 10.5,
          anchor: 'middle',
          weight: 600,
        }),
      );
    }
    out.push('</g>');
  }
  for (const p of gridP) out.push(txt(axisX, Y(p) + 4, fmt(p), { fill: t.axis, size: 11 }));
  const last = bars[N - 1].c;
  out.push(
    `<line x1="${x0}" x2="${x1}" y1="${f1(Y(last))}" y2="${f1(Y(last))}" stroke="${t.up}" stroke-width="1" stroke-dasharray="1 3"/>`,
  );
  out.push(
    `<rect x="${axisX - 4}" y="${f1(Y(last) - 9)}" width="${w - axisX + 2}" height="18" rx="2" fill="${t.up}"/>`,
  );
  out.push(txt(axisX, Y(last) + 4, fmt(last), { fill: t.onUp, size: 11, weight: 600 }));
  const days = ['4月29日', '4月30日', '5月1日', '5月2日', '5月3日', '5月4日'];
  gridK.forEach((k, j) =>
    out.push(txt(X(k) - step / 2 + 4, h - 6, days[j], { fill: t.axis, size: 11 })),
  );
  if (cross) {
    const cx = X(cross.i),
      cy = Y(cross.price);
    out.push(
      `<line x1="${f1(cx)}" x2="${f1(cx)}" y1="${y0}" y2="${h - 20}" stroke="#aab1b9" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(cy)}" y2="${f1(cy)}" stroke="#aab1b9" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    out.push(
      `<rect x="${axisX - 4}" y="${f1(cy - 9)}" width="${w - axisX + 2}" height="18" rx="2" fill="#e8eaed"/>`,
    );
    out.push(txt(axisX, cy + 4, fmt(cross.price), { fill: '#0e1013', size: 11, weight: 600 }));
    out.push(
      `<rect x="${f1(cx - 44)}" y="${h - 20}" width="88" height="18" rx="2" fill="#e8eaed"/>`,
    );
    out.push(
      txt(cx, h - 7, fmtMD(barTime(cross.i)), {
        fill: '#0e1013',
        size: 11,
        anchor: 'middle',
        weight: 600,
      }),
    );
  }
  return { svg: out.join('\n'), X, Y };
}

// RSI 14 on the visible closes, drawn in its own pane
export function rsiPane(t, { w, h, x0, x1, y0, y1, axisX }) {
  const { bars } = D.candles;
  const step = (x1 - x0) / N;
  const X = (i) => x0 + step * (i + 0.5);
  const Y = scale(0, 100, y1, y0);
  const r = [];
  let ag = 0,
    al = 0;
  for (let i = 1; i < N; i++) {
    const d = bars[i].c - bars[i - 1].c,
      g = Math.max(d, 0),
      l = Math.max(-d, 0);
    if (i <= 14) {
      ag += g / 14;
      al += l / 14;
    } else {
      ag = (ag * 13 + g) / 14;
      al = (al * 13 + l) / 14;
    }
    r[i] = i < 14 ? null : 100 - 100 / (1 + ag / (al || 1e-9));
  }
  const out = [];
  out.push(
    `<rect x="${x0}" y="${f1(Y(70))}" width="${x1 - x0}" height="${f1(Y(30) - Y(70))}" fill="rgba(143,184,222,0.06)"/>`,
  );
  for (const v of [30, 70])
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="#3a4048" stroke-width="1" stroke-dasharray="2 3"/>`,
    );
  out.push(
    path(
      r
        .map((v, i) => (v == null ? '' : `${r[i - 1] == null ? 'M' : 'L'}${f1(X(i))} ${f1(Y(v))}`))
        .join(''),
      'fill="none" stroke="#8fb8de" stroke-width="1.4" stroke-linejoin="round"',
    ),
  );
  for (const v of [30, 70]) out.push(txt(axisX, Y(v) + 4, String(v), { fill: t.axis, size: 11 }));
  const last = r[N - 1];
  out.push(
    `<rect x="${axisX - 4}" y="${f1(Y(last) - 9)}" width="${w - axisX + 2}" height="18" rx="2" fill="#8fb8de"/>`,
  );
  out.push(txt(axisX, Y(last) + 4, last.toFixed(1), { fill: '#0e1013', size: 11, weight: 600 }));
  return { svg: out.join('\n'), last };
}

// ---------- heatmap that tolerates missing cells
// `cell` draws square cells of that pitch; otherwise the cells stretch to w × h
export function heat2(o) {
  const {
    g,
    x,
    y,
    bins,
    gap = o.cell ? 2 : 1,
    ring,
    xLabels,
    yLabels,
    labelColor = '#7f8790',
    empty = '#181b20',
    labelSize = 11,
    marks,
  } = o;
  const nx = g.length,
    ny = g[0].length;
  const cw = o.cell ?? o.w / nx,
    ch = o.cell ?? o.h / ny;
  const w = nx * cw,
    h = ny * ch;
  const byBin = bins.map(() => []),
    none = [];
  g.forEach((col, i) =>
    col.forEach((v, j) => {
      const rect = [x + i * cw, y + (ny - 1 - j) * ch, cw - gap, ch - gap];
      if (v == null) none.push(rect);
      else byBin[bins.findIndex((b) => v >= b.min && v < b.max)].push(rect);
    }),
  );
  const out = [];
  if (none.length) out.push(path(rectsPath(none), `fill="${empty}"`));
  bins.forEach(
    (b, k) => byBin[k].length && out.push(path(rectsPath(byBin[k]), `fill="${b.color}"`)),
  );
  const cx = (i) => x + i * cw,
    cy = (j) => y + (ny - 1 - j) * ch;
  for (const r of [].concat(ring || [])) {
    const [i, j] = r.at;
    if (r.circle)
      out.push(
        `<circle cx="${f1(cx(i) + (cw - gap) / 2)}" cy="${f1(cy(j) + (ch - gap) / 2)}" r="${r.circle}" fill="none" stroke="${r.color}" stroke-width="${r.width || 1.5}"/>`,
      );
    else
      out.push(
        `<rect x="${f1(cx(i) - 1.5)}" y="${f1(cy(j) - 1.5)}" width="${f1(cw - gap + 3)}" height="${f1(ch - gap + 3)}" fill="none" stroke="${r.color}" stroke-width="${r.width || 2}"${r.dash ? ` stroke-dasharray="${r.dash}"` : ''}/>`,
      );
    if (r.label)
      out.push(
        txt(cx(i) + (cw - gap) / 2, cy(j) - 5, r.label, {
          fill: r.color,
          size: 10.5,
          anchor: 'middle',
          weight: 600,
        }),
      );
  }
  for (const [i, s] of xLabels || [])
    out.push(
      txt(cx(i) + (cw - gap) / 2, y + h + 14, s, {
        fill: labelColor,
        size: labelSize,
        anchor: 'middle',
      }),
    );
  for (const [j, s] of yLabels || [])
    out.push(
      txt(x - 6, cy(j) + (ch - gap) / 2 + 4, s, {
        fill: labelColor,
        size: labelSize,
        anchor: 'end',
      }),
    );
  return { svg: out.join('\n'), cx, cy, cw, ch, w, h };
}

// Square cells: when an axis has more than 24 values, or more than fit at 16px, adjacent values
// share one cell that shows their mean. Cells are 16px with a 2px gap where the width allows.
export function squareAxis(values, availW, { maxCells = 24, minPitch = 16, maxPitch = 18 } = {}) {
  let n = 1;
  while (
    Math.ceil(values.length / n) > maxCells ||
    Math.ceil(values.length / n) * minPitch > availW
  )
    n++;
  const nb = Math.ceil(values.length / n);
  const lo = (b) => values[b * n],
    hi = (b) => values[Math.min(values.length - 1, b * n + n - 1)];
  return {
    n,
    nb,
    pitch: Math.min(maxPitch, Math.floor(availW / nb)),
    lo,
    hi,
    bin: (v) => Math.floor(values.indexOf(v) / n),
    members: (b) => values.slice(b * n, b * n + n),
    label: (b) => (lo(b) === hi(b) ? String(lo(b)) : `${lo(b)}–${hi(b)}`),
  };
}
export const binCols = (g, n) => {
  if (n === 1) return g;
  const out = [];
  for (let b = 0; b * n < g.length; b++)
    out.push(
      g[0].map((_, j) => {
        const vs = g
          .slice(b * n, b * n + n)
          .map((c) => c[j])
          .filter((v) => v != null);
        return vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : null;
      }),
    );
  return out;
};
export const kv = (v) => (v < 0 ? '−' : '+') + (Math.abs(v) / 1000).toFixed(1) + 'k';
export const gridRange = (g) => {
  const vs = g.flat().filter((v) => v != null);
  return [Math.min(...vs), Math.max(...vs)];
};

export const fullGrid = () =>
  D.Ls.map((L) =>
    D.Ms.map((M) => {
      const c = D.cell(L, M);
      return c.is + c.oos;
    }),
  );
// average over Source and trailing-stop, with a few unsampled cells (random search)
export const meanGrid = () => {
  const r = D.rng(31);
  return D.Ls.map((L) =>
    D.Ms.map((M) => {
      if (r() < 0.07) return null;
      let s = 0,
        n = 0;
      for (const src of D.SRC)
        for (const tr of D.TRAIL) {
          s += D.cell(L, M, src, tr).is;
          n++;
        }
      return s / n - 900;
    }),
  );
};
// grid order progress: columns up to `done` are finished
export const partialGrid = (frac) => {
  const g = D.grid('is');
  const total = g.length * g[0].length,
    upto = Math.floor(total * frac);
  return g.map((col, i) => col.map((v, j) => (i * col.length + j < upto ? v : null)));
};

// Length 5–200 (196 values), binned on the map by squareAxis
export const wide = (() => {
  const r = D.rng(88);
  const Lw = Array.from({ length: 196 }, (_, i) => 5 + i);
  const full = Lw.map((L) =>
    D.Ms.map((M) => {
      const g = Math.exp(-(((L - 27.3) / 14) ** 2) - ((M - 2.0) / 0.72) ** 2);
      const tail = 5200 * Math.exp(-(((L - 120) / 45) ** 2)) * Math.exp(-(((M - 2.5) / 0.9) ** 2));
      return -5200 + 24600 * g + tail + D.gauss(r) * 620;
    }),
  );
  return { Lw, full };
})();

// ---------- one active parameter: the objective against Length
export function curve1d({ w, h, x0, x1, y0, y1, sel = 28 }) {
  const isV = D.Ls.map((L) => D.cell(L, 2).is),
    oosV = D.Ls.map((L) => D.cell(L, 2).oos);
  const X = scale(10, 50, x0, x1),
    Y = scale(-6000, 24000, y1, y0);
  const out = [];
  for (const v of [0, 10000, 20000]) {
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="${v === 0 ? '#3a4048' : '#1f2328'}" stroke-width="1"/>`,
    );
    out.push(
      txt(x0 - 6, Y(v) + 4, v === 0 ? '0' : '+' + v / 1000 + 'k', {
        fill: '#7f8790',
        anchor: 'end',
      }),
    );
  }
  for (const L of [10, 20, 30, 40, 50])
    out.push(txt(X(L), y1 + 16, String(L), { fill: '#7f8790', anchor: 'middle' }));
  const ln = (vals) => vals.map((v, k) => `${k ? 'L' : 'M'}${f1(X(D.Ls[k]))} ${f1(Y(v))}`).join('');
  out.push(
    path(ln(oosV), 'fill="none" stroke="#f2a33a" stroke-width="1.5" stroke-linejoin="round"'),
  );
  out.push(
    path(ln(isV), 'fill="none" stroke="#6cb6dd" stroke-width="1.7" stroke-linejoin="round"'),
  );
  const k = D.Ls.indexOf(sel);
  out.push(
    `<line x1="${f1(X(sel))}" x2="${f1(X(sel))}" y1="${y0}" y2="${y1}" stroke="#e8eaed" stroke-width="1" stroke-dasharray="3 3"/>`,
  );
  out.push(
    `<circle cx="${f1(X(sel))}" cy="${f1(Y(isV[k]))}" r="4" fill="#6cb6dd" stroke="#14171b" stroke-width="2"/>`,
  );
  out.push(
    `<circle cx="${f1(X(sel))}" cy="${f1(Y(oosV[k]))}" r="4" fill="#f2a33a" stroke="#14171b" stroke-width="2"/>`,
  );
  out.push(
    txt((x0 + x1) / 2, y1 + 34, 'Length', { fill: '#aab1b9', size: 11.5, anchor: 'middle' }),
  );
  return out.join('\n');
}

// ---------- walk-forward chart with progress, anchored windows and a lane view
export const WF_A = D.WF.map((w) => ({ ...w, isFrom: 0 }));
const IS_COL = { on: '#3b6f8c', off: '#223140' },
  OOS_COL = { on: '#f2a33a', off: '#5c4622' };

export function wf2(o) {
  const {
    w,
    x0,
    x1,
    y0,
    y1,
    laneY,
    laneH,
    laneGap,
    sel = 2,
    lo = 92000,
    hi = 109000,
    axisX,
    shadow,
    windows = D.WF,
    done = windows.length,
    running,
    timeY,
    axisVals = [95000, 100000, 105000],
    gridVals = [95000, 105000],
  } = o;
  const X = scale(0, D.LAST, x0, x1),
    Y = scale(lo, hi, y1, y0);
  const out = [];
  const lanesBottom = laneY + windows.length * (laneH + laneGap);
  const s = sel != null ? windows[sel] : null;
  if (s) {
    out.push(
      `<rect x="${f1(X(s.isFrom))}" y="${y0}" width="${f1(X(s.isTo + 1) - X(s.isFrom))}" height="${f1(lanesBottom - y0)}" fill="rgba(108,182,221,0.08)"/>`,
    );
    out.push(
      `<rect x="${f1(X(s.oosFrom))}" y="${y0}" width="${f1(X(s.oosTo + 1) - X(s.oosFrom))}" height="${f1(lanesBottom - y0)}" fill="rgba(242,163,58,0.10)"/>`,
    );
  }
  for (const v of gridVals)
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="#1a1d22" stroke-width="1"/>`,
    );
  out.push(
    `<line x1="${x0}" x2="${x1}" y1="${f1(Y(100000))}" y2="${f1(Y(100000))}" stroke="#3a4048" stroke-width="1" stroke-dasharray="2 3"/>`,
  );
  windows.forEach((wd, k) => {
    out.push(
      `<line x1="${f1(X(wd.oosFrom))}" x2="${f1(X(wd.oosFrom))}" y1="${y0}" y2="${y1}" stroke="#23272d" stroke-width="1"/>`,
    );
    const xm = (X(wd.oosFrom) + X(wd.oosTo + 1)) / 2;
    const narrow = X(wd.oosTo + 1) - X(wd.oosFrom) < 60;
    if (k < done)
      out.push(
        txt(narrow ? X(wd.oosTo + 1) : xm, y0 + 12, wd.id + ' ' + kfmt(wd.oos), {
          fill: wd.oos < 0 ? '#f06a5d' : '#aab1b9',
          anchor: narrow ? 'end' : 'middle',
          weight: k === sel ? 700 : 500,
        }),
      );
    else out.push(txt(xm, y0 + 12, wd.id, { fill: '#5d6570', anchor: 'middle' }));
  });
  if (shadow && s) {
    const r = D.rng(61);
    const len = s.isTo - s.isFrom + 1,
      endV = D.equityWF[s.oosFrom];
    const sh = D.bridge(
      [
        [0, endV - s.is],
        [Math.round(len * 0.3), endV - s.is * 0.72],
        [Math.round(len * 0.65), endV - s.is * 0.35],
        [len - 1, endV],
      ],
      140,
      r,
    );
    const full = new Array(D.LAST + 1).fill(null);
    sh.forEach((v, i) => (full[s.isFrom + i] = v));
    out.push(
      path(
        linePath(full, X, Y, 160, s.isFrom, s.isTo),
        'fill="none" stroke="#6cb6dd" stroke-width="1.5" stroke-dasharray="4 3"',
      ),
    );
  }
  if (done > 0) {
    const to = windows[done - 1].oosTo;
    out.push(path(areaPath(D.equityWF, X, Y, Y(lo), 260, 364, to), 'fill="rgba(242,163,58,0.07)"'));
    out.push(
      path(
        linePath(D.equityWF, X, Y, 260, 364, to),
        'fill="none" stroke="#f2a33a" stroke-width="1.7" stroke-linejoin="round"',
      ),
    );
    out.push(`<circle cx="${f1(X(to))}" cy="${f1(Y(D.equityWF[to]))}" r="3" fill="#f2a33a"/>`);
    if (axisX != null) {
      const v = D.equityWF[to];
      out.push(
        `<rect x="${axisX - 4}" y="${f1(Y(v) - 9)}" width="${w - axisX + 2}" height="18" rx="2" fill="#f2a33a"/>`,
      );
      out.push(txt(axisX, Y(v) + 4, fmt(v), { fill: '#1a1206', weight: 600 }));
    }
  }
  windows.forEach((wd, k) => {
    const y = laneY + k * (laneH + laneGap);
    const isW = X(wd.isTo + 1) - X(wd.isFrom),
      oosW = X(wd.oosTo + 1) - X(wd.oosFrom);
    if (k < done) {
      out.push(
        `<rect x="${f1(X(wd.isFrom))}" y="${f1(y)}" width="${f1(isW)}" height="${laneH}" rx="1" fill="${k === sel ? IS_COL.on : IS_COL.off}"/>`,
      );
      out.push(
        `<rect x="${f1(X(wd.oosFrom))}" y="${f1(y)}" width="${f1(oosW)}" height="${laneH}" rx="1" fill="${k === sel ? OOS_COL.on : OOS_COL.off}"/>`,
      );
      if (k === sel)
        out.push(
          `<rect x="${f1(X(wd.isFrom) - 2)}" y="${f1(y - 2)}" width="${f1(X(wd.oosTo + 1) - X(wd.isFrom) + 4)}" height="${laneH + 4}" rx="2" fill="none" stroke="#e8eaed" stroke-width="1.5"/>`,
        );
    } else {
      out.push(
        `<rect x="${f1(X(wd.isFrom) + 0.5)}" y="${f1(y + 0.5)}" width="${f1(isW - 1)}" height="${laneH - 1}" rx="1" fill="none" stroke="#2c3742" stroke-width="1"/>`,
      );
      out.push(
        `<rect x="${f1(X(wd.oosFrom) + 0.5)}" y="${f1(y + 0.5)}" width="${f1(oosW - 1)}" height="${laneH - 1}" rx="1" fill="none" stroke="#4a3a20" stroke-width="1"/>`,
      );
      if (running && running.k === k)
        out.push(
          `<rect x="${f1(X(wd.isFrom))}" y="${f1(y)}" width="${f1(isW * running.frac)}" height="${laneH}" rx="1" fill="${IS_COL.on}"/>`,
        );
    }
    const cur = k === sel || (running && running.k === k);
    out.push(
      txt(x0 - 8, y + laneH / 2 + 4, wd.id, {
        fill: cur ? '#f5b155' : '#7f8790',
        anchor: 'end',
        weight: cur ? 700 : 500,
      }),
    );
  });
  for (const [d, s2] of [
    [D.dayOf(2023, 7, 1), '2023-07'],
    [D.dayOf(2024, 1, 1), '2024-01'],
    [D.dayOf(2024, 7, 1), '2024-07'],
    [D.dayOf(2025, 1, 1), '2025-01'],
  ])
    out.push(txt(X(d), timeY, s2, { fill: '#7f8790', anchor: 'middle' }));
  if (axisX != null)
    for (const v of axisVals) out.push(txt(axisX, Y(v) + 4, fmt(v), { fill: '#7f8790' }));
  return out.join('\n');
}

// lane view: one tall lane per window, mini equity curves inside the bars
export function wfLanes({ x0, x1, y0, laneH, laneGap, sel = 2, timeY }) {
  const X = scale(0, D.LAST, x0, x1);
  const out = [];
  let run = 100000;
  for (const [d] of [
    [D.dayOf(2023, 7, 1)],
    [D.dayOf(2024, 1, 1)],
    [D.dayOf(2024, 7, 1)],
    [D.dayOf(2025, 1, 1)],
  ])
    out.push(
      `<line x1="${f1(X(d))}" x2="${f1(X(d))}" y1="${y0 - 4}" y2="${timeY - 14}" stroke="#1a1d22" stroke-width="1"/>`,
    );
  D.WF.forEach((wd, k) => {
    const y = y0 + k * (laneH + laneGap);
    const on = k === sel;
    const xa = X(wd.isFrom),
      xb = X(wd.isTo + 1),
      xc = X(wd.oosFrom),
      xd = X(wd.oosTo + 1);
    out.push(
      `<rect x="${f1(xa)}" y="${y}" width="${f1(xb - xa)}" height="${laneH}" rx="2" fill="${on ? '#24465a' : '#182630'}"/>`,
    );
    out.push(
      `<rect x="${f1(xc)}" y="${y}" width="${f1(xd - xc)}" height="${laneH}" rx="2" fill="${on ? '#6b4d1c' : '#3a2c16'}"/>`,
    );
    if (on)
      out.push(
        `<rect x="${f1(xa - 2)}" y="${y - 2}" width="${f1(xd - xa + 4)}" height="${laneH + 4}" rx="3" fill="none" stroke="#e8eaed" stroke-width="1.5"/>`,
      );
    // in-sample mini curve of the chosen parameters
    const r = D.rng(300 + k);
    const len = wd.isTo - wd.isFrom + 1;
    const isE = D.bridge(
      [
        [0, 0],
        [Math.round(len * 0.35), wd.is * 0.3],
        [Math.round(len * 0.7), wd.is * 0.74],
        [len - 1, wd.is],
      ],
      wd.is * 0.022,
      r,
    );
    const Yi = scale(Math.min(...isE), Math.max(...isE), y + laneH - 5, y + 5);
    const Xi = scale(0, len - 1, xa + 3, xb - 3);
    out.push(
      path(
        linePath(isE, Xi, Yi, 70),
        `fill="none" stroke="${on ? '#8fd0f0' : '#5b8fab'}" stroke-width="1.3" stroke-dasharray="3 2" stroke-linejoin="round"`,
      ),
    );
    const seg = D.equityWF.slice(wd.oosFrom, wd.oosTo + 1);
    const Yo = scale(Math.min(...seg), Math.max(...seg), y + laneH - 5, y + 5);
    const Xo = scale(0, seg.length - 1, xc + 3, xd - 3);
    out.push(
      path(
        linePath(seg, Xo, Yo, 30),
        `fill="none" stroke="${on ? '#ffd08a' : '#d9973f'}" stroke-width="1.5" stroke-linejoin="round"`,
      ),
    );
    run += wd.oos;
    out.push(
      txt(x0 - 8, y + laneH / 2 + 4, wd.id, {
        fill: on ? '#f5b155' : '#7f8790',
        anchor: 'end',
        weight: on ? 700 : 500,
      }),
    );
    out.push(txt(xa + 6, y + 13, sfmt(wd.is), { fill: on ? '#cfe9f7' : '#8fa9b8', size: 10.5 }));
    out.push(
      txt(x1 + 62, y + laneH / 2 - 2, sfmt(wd.oos), {
        fill: wd.oos < 0 ? '#f06a5d' : '#3fbf8a',
        anchor: 'end',
        weight: 600,
        size: 12,
      }),
    );
    out.push(
      txt(x1 + 62, y + laneH / 2 + 12, fmt(run), { fill: '#7f8790', anchor: 'end', size: 10.5 }),
    );
  });
  for (const [d, s2] of [
    [D.dayOf(2023, 7, 1), '2023-07'],
    [D.dayOf(2024, 1, 1), '2024-01'],
    [D.dayOf(2024, 7, 1), '2024-07'],
    [D.dayOf(2025, 1, 1), '2025-01'],
  ])
    out.push(txt(X(d), timeY, s2, { fill: '#7f8790', anchor: 'middle' }));
  return out.join('\n');
}

// six-window mean surface: the W3 surface flattened, every window's pick circled
export const surfaceMean = D.surfaceW3.map((col, i) =>
  col.map((v, j) => v * 0.82 + 600 * Math.exp(-(((D.Ls[i] - 27) / 9) ** 2))),
);

// ---------- Pine source and a small highlighter
export const PINE = `//@version=6
strategy("Trend Breakout", overlay = true,
     initial_capital = 100000,
     default_qty_type = strategy.percent_of_equity,
     default_qty_value = 100,
     commission_type = strategy.commission.percent,
     commission_value = 0.1)

length   = input.int(20, "Length", minval = 5, maxval = 200)
mult     = input.float(2.0, "Multiplier", step = 0.25)
src      = input.source(close, "Source")
trailing = input.bool(false, "Use trailing stop")
trail    = input.float(3.0, "Trail %", group = "Risk")

basis = ta.sma(src, length)
dev   = mult * ta.stdev(src, length)
upper = basis + dev
lower = basis - dev

longSignal  = ta.crossover(close, upper)
shortSignal = ta.crossunder(close, lower)

if longSignal
    strategy.entry("L", strategy.long)
if shortSignal
    strategy.entry("S", strategy.short)

if trailing
    points = close * trail / 100 / syminfo.mintick
    strategy.exit("L trail", "L", trail_points = points, trail_offset = 0)
    strategy.exit("S trail", "S", trail_points = points, trail_offset = 0)

plot(basis, "Basis", color = color.teal, linewidth = 2)
plot(upper, "Upper", color = color.gray)
plot(lower, "Lower", color = color.gray)`.split('\n');

const KW = new Set([
  'true',
  'false',
  'if',
  'else',
  'for',
  'to',
  'while',
  'var',
  'varip',
  'and',
  'or',
  'not',
  'na',
]);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function hl(line) {
  if (line.trimStart().startsWith('//')) return `<span class="cm">${esc(line)}</span>`;
  let out = '';
  const re = /("[^"]*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w.]*)(\s*\()?|([^"\w]+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1]) out += `<span class="st">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="nu">${m[2]}</span>`;
    else if (m[3]) {
      const id = m[3];
      if (m[4]) out += `<span class="fn">${id}</span>${m[4]}`;
      else if (KW.has(id) || /^(strategy|color)\.[a-z_.]+$/.test(id))
        out += `<span class="kw">${id}</span>`;
      else out += id;
    } else out += esc(m[5]);
  }
  return out;
}
