// Seeded synthetic data shared by every overhaul board: one strategy, one data set,
// one optimization, one walk-forward. Geometry helpers turn it into SVG path strings.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(r) {
  let u = 0,
    v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function bridge(anchors, sigma, r) {
  const n = anchors[anchors.length - 1][0] + 1;
  const out = new Array(n);
  for (let k = 0; k < anchors.length - 1; k++) {
    const [i0, v0] = anchors[k],
      [i1, v1] = anchors[k + 1];
    const len = i1 - i0;
    const w = [0];
    for (let j = 1; j <= len; j++) w.push(w[j - 1] + gauss(r) * sigma);
    for (let j = 0; j <= len; j++) {
      const t = j / len;
      out[i0 + j] = v0 + (v1 - v0) * t + (w[j] - t * w[len]);
    }
  }
  return out;
}

// ---- calendar: day 0 = 2023-01-02, last day 853 = 2025-05-04
export const DAY0 = Date.UTC(2023, 0, 2);
export const LAST = 853;
export const dayOf = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - DAY0) / 86400000);
export const IS_END = dayOf(2024, 8, 20); // 596

// ---- default-parameter equity (Length 20, Mult 2.0)
export const equityDefault = (() => {
  const r = rng(11);
  const e = bridge(
    [
      [0, 100000],
      [45, 101800],
      [80, 106900],
      [130, 105200],
      [170, 109600],
      [230, 107400],
      [300, 113900],
      [360, 118600],
      [410, 124910],
      [470, 119200],
      [505, 117098],
      [560, 120900],
      [620, 118700],
      [690, 122300],
      [745, 119600],
      [800, 121900],
      [853, 118420],
    ],
    260,
    r,
  );
  return e.map((v, i) => {
    if (i < 410) return Math.max(99900, Math.min(124600, v));
    if (i === 410) return 124910;
    return Math.max(117098, Math.min(124600, v));
  });
})();

export const equityTop = (() => {
  const r = rng(23);
  return bridge(
    [
      [0, 100000],
      [60, 102400],
      [120, 106800],
      [180, 105900],
      [260, 111200],
      [330, 114600],
      [400, 119800],
      [450, 118300],
      [520, 121100],
      [596, 122200],
      [650, 124900],
      [700, 123600],
      [760, 129400],
      [800, 131200],
      [830, 130100],
      [853, 134540],
    ],
    240,
    r,
  );
})();

export const equityPick = (() => {
  const r = rng(37);
  return bridge(
    [
      [0, 100000],
      [55, 102100],
      [120, 106300],
      [185, 104800],
      [260, 110900],
      [330, 114600],
      [400, 121900],
      [470, 111650],
      [520, 116800],
      [596, 120560],
      [650, 123200],
      [700, 122100],
      [760, 127300],
      [800, 129100],
      [830, 128600],
      [853, 131580],
    ],
    220,
    r,
  );
})();

export const drawdown = (eq) => {
  let peak = -Infinity;
  return eq.map((v) => ((peak = Math.max(peak, v)), v - peak));
};

// ---- walk-forward
export const WF = [
  {
    id: 'W1',
    isFrom: 0,
    isTo: 363,
    oosFrom: 364,
    oosTo: 454,
    oosRange: '24-01-01 → 03-31',
    pick: [24, '2.00', 'close', '关'],
    is: 9840,
    oos: 2310,
    wfe: '0.94',
    trades: 41,
  },
  {
    id: 'W2',
    isFrom: 89,
    isTo: 454,
    oosFrom: 455,
    oosTo: 545,
    oosRange: '24-04-01 → 06-30',
    pick: [26, '2.00', 'close', '关'],
    is: 11200,
    oos: 1120,
    wfe: '0.40',
    trades: 38,
  },
  {
    id: 'W3',
    isFrom: 180,
    isTo: 545,
    oosFrom: 546,
    oosTo: 637,
    oosRange: '24-07-01 → 09-30',
    pick: [26, '2.25', 'close', '关'],
    is: 10450,
    oos: -860,
    wfe: '−0.33',
    trades: 35,
  },
  {
    id: 'W4',
    isFrom: 272,
    isTo: 637,
    oosFrom: 638,
    oosTo: 729,
    oosRange: '24-10-01 → 12-31',
    pick: [30, '2.25', 'hl2', '关'],
    is: 8900,
    oos: 2980,
    wfe: '1.34',
    trades: 44,
  },
  {
    id: 'W5',
    isFrom: 364,
    isTo: 729,
    oosFrom: 730,
    oosTo: 819,
    oosRange: '25-01-01 → 03-31',
    pick: [26, '2.00', 'close', '关'],
    is: 12300,
    oos: 1640,
    wfe: '0.53',
    trades: 39,
  },
  {
    id: 'W6',
    isFrom: 455,
    isTo: 819,
    oosFrom: 820,
    oosTo: 853,
    oosRange: '25-04-01 → 05-04',
    pick: [28, '2.00', 'close', '关'],
    is: 10100,
    oos: 410,
    wfe: '0.44',
    trades: 12,
  },
];
export const equityWF = (() => {
  const r = rng(51);
  const anchors = [[364, 100000]];
  let v = 100000;
  for (const w of WF) {
    v += w.oos;
    anchors.push([w.oosTo, v]);
  }
  // add interior anchors for shape
  const full = [];
  for (let k = 0; k < anchors.length; k++) full.push(anchors[k]);
  const shifted = full.map(([i, x]) => [i - 364, x]);
  const e = bridge(shifted, 150, r);
  const out = new Array(LAST + 1).fill(null);
  e.forEach((x, i) => (out[i + 364] = x));
  return out;
})();

// ---- optimizer surface
export const Ls = Array.from({ length: 41 }, (_, i) => 10 + i);
export const Ms = Array.from({ length: 9 }, (_, i) => 1 + i * 0.25);
export const SRC = ['close', 'hl2', 'ohlc4'];
export const TRAIL = ['关', '开'];

export const LEADER = [
  [28, 2.0, 'close', '关', 22200, 12340, '1.32', '−7.5%', 91],
  [24, 2.0, 'close', '关', 20970, 9670, '1.20', '−11.4%', 136],
  [27, 2.25, 'close', '关', 20910, 10340, '1.21', '−11.5%', 69],
  [25, 1.75, 'close', '关', 20820, 9330, '1.30', '−12.1%', 84],
  [25, 2.0, 'close', '关', 20700, 10930, '1.40', '−8.2%', 106],
  [27, 2.0, 'close', '关', 20560, 11020, '1.60', '−8.5%', 103],
  [26, 2.0, 'close', '关', 20460, 8880, '1.62', '−8.6%', 71],
  [27, 1.75, 'close', '关', 20270, 7990, '1.66', '−12.0%', 63],
  [28, 2.25, 'close', '关', 19970, 11690, '1.36', '−6.1%', 111],
  [29, 2.0, 'close', '关', 19540, 9740, '1.19', '−8.3%', 143],
  [28, 1.75, 'close', '关', 19460, 8390, '1.71', '−11.6%', 147],
  [29, 2.0, 'hl2', '关', 19320, 10690, '1.18', '−8.3%', 129],
  [31, 2.0, 'close', '关', 19250, 9800, '1.17', '−6.9%', 137],
];

function surface(seed, peakL, peakM, top, bottom, wL, wM, noise) {
  const r = rng(seed);
  const s = Ls.map((L) =>
    Ms.map((M) => {
      const g = Math.exp(-(((L - peakL) / wL) ** 2) - ((M - peakM) / wM) ** 2);
      return bottom + (top - bottom) * g + gauss(r) * noise * (0.35 + g);
    }),
  );
  return s;
}

export const trials = (() => {
  const r = rng(77);
  const base = surface(5, 27.3, 2.0, 18900, -6600, 12.5, 0.72, 700);
  // clamp base, then pin the minimum and the leaderboard cells
  let minV = Infinity,
    minAt = null;
  base.forEach((row, i) =>
    row.forEach((v, j) => {
      if (v < minV) {
        minV = v;
        minAt = [i, j];
      }
    }),
  );
  base.forEach((row, i) => row.forEach((v, j) => (base[i][j] = Math.min(v, 19050))));
  base[minAt[0]][minAt[1]] = -6850;
  const out = [];
  for (const [si, src] of SRC.entries())
    for (const [ti, tr] of TRAIL.entries())
      Ls.forEach((L, i) =>
        Ms.forEach((M, j) => {
          let is =
            base[i][j] +
            (si === 0 ? 0 : si === 1 ? -650 + gauss(r) * 500 : -1050 + gauss(r) * 500) +
            (ti === 0 ? 0 : -420 + gauss(r) * 700);
          if (si > 0 || ti > 0) is = Math.min(is, 18800);
          let oos = 0.52 * is - 1500 + gauss(r) * 2100;
          if (oos < -2600) oos = -2600 - 2900 * (1 - Math.exp((oos + 2600) / 2900));
          if (oos > 9000) oos = 9000 + 2800 * (1 - Math.exp(-(oos - 9000) / 2800));
          out.push({
            L,
            M,
            src,
            tr,
            is: Math.round(is / 10) * 10,
            oos: Math.round(oos / 10) * 10,
            i,
            j,
            si,
            ti,
          });
        }),
      );
  for (const [L, M, src, tr, is, oos] of LEADER) {
    const t = out.find((x) => x.L === L && x.M === M && x.src === src && x.tr === tr);
    t.is = is;
    t.oos = oos;
    t.lead = true;
  }
  return out;
})();

export const cell = (L, M, src = 'close', tr = '关') =>
  trials.find((x) => x.L === L && x.M === M && x.src === src && x.tr === tr);

// The leaderboard's filters (Trades ≥ 5, Max DD ≤ 35%) exclude 51 of the 2,214 sets, so 2,163
// pass: the longest lengths with the widest bands trade too rarely, and the deepest losses draw
// down too far.
const fewTrades = (t) => t.L >= 48 && t.M >= 2.75;
const deepLoss = new Set(
  trials
    .filter((t) => !fewTrades(t))
    .sort((a, b) => a.is - b.is)
    .slice(0, 51 - trials.filter(fewTrades).length),
);
export const excluded = (t) => fewTrades(t) || deepLoss.has(t);

export function grid(key = 'is', src = 'close', tr = '关') {
  return Ls.map((L) => Ms.map((M) => cell(L, M, src, tr)[key]));
}

export function neighbourMean(g) {
  return g.map((row, i) =>
    row.map((_, j) => {
      let s = 0,
        n = 0;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const a = g[i + di],
            v = a && a[j + dj];
          if (v !== undefined) {
            s += v;
            n++;
          }
        }
      return s / n;
    }),
  );
}

export function eta2(key) {
  const all = trials.map((t) => t.is);
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const sst = all.reduce((a, b) => a + (b - mean) ** 2, 0);
  const groups = new Map();
  for (const t of trials) {
    const k = t[key];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t.is);
  }
  let ssb = 0;
  for (const g of groups.values()) {
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    ssb += g.length * (m - mean) ** 2;
  }
  return ssb / sst;
}

export function marginal(key, values) {
  return values.map((v) => {
    const xs = trials
      .filter((t) => t[key] === v)
      .map((t) => t.is)
      .sort((a, b) => a - b);
    const q = (p) => xs[Math.floor(p * (xs.length - 1))];
    return { v, mean: xs.reduce((a, b) => a + b, 0) / xs.length, q1: q(0.25), q3: q(0.75) };
  });
}

// W3 in-sample surface
export const surfaceW3 = (() => {
  const s = surface(9, 26.2, 2.2, 9800, -5110, 11, 0.7, 520);
  s.forEach((row, i) => row.forEach((v, j) => (s[i][j] = Math.max(-5110, Math.min(v, 9900)))));
  s[Ls.indexOf(26)][Ms.indexOf(2.25)] = 10450;
  return s;
})();

// ---- hourly candles for the last ~150 bars (plus 20 warmup for the bands)
export const candles = (() => {
  const r = rng(7);
  const n = 170;
  const path = bridge(
    [
      [0, 94800],
      [20, 94350],
      [48, 94600],
      [62, 94250],
      [68, 95350],
      [100, 96900],
      [120, 97450],
      [131, 97250],
      [137, 96150],
      [152, 95500],
      [158, 96350],
      [169, 96050],
    ],
    120,
    r,
  );
  const bars = [];
  let prev = path[0] - 60;
  for (let i = 0; i < n; i++) {
    const o = prev,
      c = path[i];
    const h = Math.max(o, c) + Math.abs(gauss(r)) * 95 + 15;
    const l = Math.min(o, c) - Math.abs(gauss(r)) * 95 - 15;
    bars.push({ o, h, l, c });
    prev = c;
  }
  // Bollinger 20 / 2.0 on close
  for (let i = 19; i < n; i++) {
    const win = bars.slice(i - 19, i + 1).map((b) => b.c);
    const m = win.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
    bars[i].basis = m;
    bars[i].upper = m + 2 * sd;
    bars[i].lower = m - 2 * sd;
  }
  const vis = bars.slice(20);
  // signals: crossover(close, upper) long, crossunder(close, lower) short; fill next open
  const sig = [];
  let pos = 0;
  for (let i = 1; i < vis.length - 1; i++) {
    const a = vis[i - 1],
      b = vis[i];
    if (a.c <= a.upper && b.c > b.upper && pos !== 1) {
      pos = 1;
      sig.push({ i: i + 1, side: 'long', px: vis[i + 1].o });
    }
    if (a.c >= a.lower && b.c < b.lower && pos !== -1) {
      pos = -1;
      sig.push({ i: i + 1, side: 'short', px: vis[i + 1].o });
    }
  }
  return { bars: vis, sig };
})();

// ---------------- geometry
export const f1 = (x) => (Math.round(x * 10) / 10).toString();
export function scale(d0, d1, r0, r1) {
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}
// downsample keeping per-bucket min and max in order
export function downsample(vals, buckets) {
  const idx = [];
  const n = vals.length;
  const step = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * step),
      e = Math.min(n, Math.floor((b + 1) * step));
    if (e <= s) continue;
    let mi = s,
      ma = s;
    for (let k = s; k < e; k++) {
      if (vals[k] == null) continue;
      if (vals[mi] == null || vals[k] < vals[mi]) mi = k;
      if (vals[ma] == null || vals[k] > vals[ma]) ma = k;
    }
    if (vals[mi] == null) continue;
    if (mi === ma) idx.push(mi);
    else idx.push(Math.min(mi, ma), Math.max(mi, ma));
  }
  if (idx[idx.length - 1] !== n - 1 && vals[n - 1] != null) idx.push(n - 1);
  return idx;
}
export function linePath(vals, x, y, buckets, from = 0, to = vals.length - 1) {
  const sub = vals.slice(from, to + 1);
  const idx = downsample(sub, buckets);
  return idx.map((k, n) => `${n ? 'L' : 'M'}${f1(x(k + from))} ${f1(y(sub[k]))}`).join('');
}
export function areaPath(vals, x, y, y0, buckets, from = 0, to = vals.length - 1) {
  const sub = vals.slice(from, to + 1);
  const idx = downsample(sub, buckets);
  const pts = idx.map((k) => `${f1(x(k + from))} ${f1(y(sub[k]))}`);
  return `M${f1(x(idx[0] + from))} ${f1(y0)}L${pts.join('L')}L${f1(x(idx[idx.length - 1] + from))} ${f1(y0)}Z`;
}
export function rectsPath(rects) {
  return rects.map(([x, y, w, h]) => `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}z`).join('');
}
// heat: g[i][j] with i along X (columns), j along Y (rows, bottom = j 0)
export function heatPaths(g, { x, y, w, h, gap = 1, bins, flipY = true }) {
  const nx = g.length,
    ny = g[0].length;
  const cw = w / nx,
    ch = h / ny;
  const byBin = bins.map(() => []);
  g.forEach((col, i) =>
    col.forEach((v, j) => {
      const b = bins.findIndex((bn) => v >= bn.min && v < bn.max);
      const row = flipY ? ny - 1 - j : j;
      byBin[b].push([x + i * cw, y + row * ch, cw - gap, ch - gap]);
    }),
  );
  return bins.map((bn, k) => ({ color: bn.color, d: rectsPath(byBin[k]) }));
}
