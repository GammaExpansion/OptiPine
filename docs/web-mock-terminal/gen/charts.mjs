// SVG chart markup built from data.mjs. Every builder takes a theme so the three
// directions draw the same data in their own palette.
import * as D from './data.mjs';
const { f1, scale, linePath, areaPath, rectsPath } = D;

export const fmt = (n, d = 0) => {
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return n < 0 ? '−' + s : s;
};
export const sfmt = (n, d = 0) => (n > 0 ? '+' : '') + fmt(n, d);
export const kfmt = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + (Math.abs(n) / 1000).toFixed(1) + 'k';

const txt = (x, y, s, { fill, size = 11, anchor = 'start', weight, family, extra = '' } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" fill="${fill}" font-size="${size}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}${family ? ` font-family="${family}"` : ''}${extra}>${s}</text>`;
const path = (d, attrs) => `<path d="${d}" ${attrs}/>`;

// ---------- candles with the script's Bollinger plots and trade markers
export function candleChart(t, { w, h, x0, x1, y0, y1, axisX, grid = true }) {
  const { bars, sig } = D.candles;
  const lo = 93900,
    hi = 97900;
  const n = bars.length;
  const step = (x1 - x0) / n;
  const bw = Math.max(2, step * 0.62);
  const X = (i) => x0 + step * (i + 0.5);
  const Y = scale(lo, hi, y1, y0);
  const out = [];
  if (grid) {
    for (const p of [94000, 95000, 96000, 97000])
      out.push(
        `<line x1="${x0}" x2="${x1}" y1="${f1(Y(p))}" y2="${f1(Y(p))}" stroke="${t.grid}" stroke-width="1"/>`,
      );
    for (const k of [8, 32, 56, 80, 104, 128])
      out.push(
        `<line x1="${f1(X(k) - step / 2)}" x2="${f1(X(k) - step / 2)}" y1="${y0}" y2="${y1}" stroke="${t.grid}" stroke-width="1"/>`,
      );
  }
  const line = (key) => bars.map((b, i) => `${i ? 'L' : 'M'}${f1(X(i))} ${f1(Y(b[key]))}`).join('');
  out.push(path(line('upper'), `fill="none" stroke="${t.band}" stroke-width="1"`));
  out.push(path(line('lower'), `fill="none" stroke="${t.band}" stroke-width="1"`));
  out.push(path(line('basis'), `fill="none" stroke="${t.basis}" stroke-width="1.6"`));
  // trade segments between flips
  const segs = [];
  for (let k = 0; k < sig.length; k++) {
    const a = sig[k],
      b = sig[k + 1] || { i: n - 1, px: bars[n - 1].c, open: true };
    const pnl = a.side === 'long' ? b.px - a.px : a.px - b.px;
    segs.push({ a, b, pnl });
    out.push(
      `<line x1="${f1(X(a.i))}" y1="${f1(Y(a.px))}" x2="${f1(X(b.i))}" y2="${f1(Y(b.px))}" stroke="${pnl >= 0 ? t.win : t.loss}" stroke-width="1.2" stroke-dasharray="3 3"/>`,
    );
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
  if (t.hollowUp)
    out.push(
      path(
        rectsPath(ub.map(([x, y, w2, h2]) => [x + 0.5, y + 0.5, w2 - 1, h2 - 1])),
        `fill="${t.bg}" stroke="${t.up}" stroke-width="1"`,
      ),
    );
  else out.push(path(rectsPath(ub), `fill="${t.up}"`));
  out.push(path(rectsPath(db), `fill="${t.down}"`));
  // markers
  for (const s of sig) {
    const b = bars[s.i];
    const x = X(s.i);
    if (s.side === 'long') {
      const y = Y(b.l) + 8;
      out.push(`<path d="M${f1(x)} ${f1(y)}l5 8h-10z" fill="${t.up}"/>`);
      out.push(
        txt(x, y + 21, t.longLabel, { fill: t.up, size: 11, anchor: 'middle', weight: 600 }),
      );
    } else {
      const y = Y(b.h) - 8;
      out.push(`<path d="M${f1(x)} ${f1(y)}l5 -8h-10z" fill="${t.down}"/>`);
      out.push(
        txt(x, y - 13, t.shortLabel, { fill: t.down, size: 11, anchor: 'middle', weight: 600 }),
      );
    }
  }
  // P&L labels at the end of closed segments
  for (const { a, b, pnl } of segs) {
    if (b.open) continue;
    const pct = (pnl / a.px) * 100;
    const x = (X(a.i) + X(b.i)) / 2,
      y = (Y(a.px) + Y(b.px)) / 2 - 7;
    out.push(
      txt(x, y, (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%', {
        fill: pnl >= 0 ? t.win : t.loss,
        size: 10.5,
        anchor: 'middle',
        weight: 600,
      }),
    );
  }
  // axis
  for (const p of [94000, 95000, 96000, 97000])
    out.push(txt(axisX, Y(p) + 4, fmt(p), { fill: t.axis, size: 11 }));
  const last = bars[n - 1].c;
  out.push(
    `<rect x="${axisX - 4}" y="${f1(Y(last) - 9)}" width="${w - axisX + 2}" height="18" rx="2" fill="${t.up}"/>`,
  );
  out.push(txt(axisX, Y(last) + 4, fmt(last), { fill: t.onUp, size: 11, weight: 600 }));
  out.push(
    `<line x1="${x0}" x2="${x1}" y1="${f1(Y(last))}" y2="${f1(Y(last))}" stroke="${t.up}" stroke-width="1" stroke-dasharray="1 3"/>`,
  );
  const days = ['4月29日', '4月30日', '5月1日', '5月2日', '5月3日', '5月4日'];
  [8, 32, 56, 80, 104, 128].forEach((k, j) =>
    out.push(txt(X(k) - step / 2 + 4, h - 6, days[j], { fill: t.axis, size: 11 })),
  );
  return out.join('\n');
}

// ---------- equity over the full period
export function equityChart(t, o) {
  const {
    w,
    h,
    x0,
    x1,
    y0,
    y1,
    series,
    lo,
    hi,
    split,
    buckets = 300,
    axisX,
    fillFirst = true,
    yearLabels = true,
    labelsAt,
  } = o;
  const X = scale(0, D.LAST, x0, x1);
  const Y = scale(lo, hi, y1, y0);
  const out = [];
  if (o.gridVals)
    for (const v of o.gridVals)
      out.push(
        `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="${t.grid}" stroke-width="1"/>`,
      );
  if (split != null) {
    const sx = X(split);
    if (t.isFill)
      out.push(
        `<rect x="${x0}" y="${y0 - (o.bandPad ?? 0)}" width="${f1(sx - x0)}" height="${y1 - y0 + (o.bandPad ?? 0)}" fill="${t.isFill}"/>`,
      );
    if (t.oosFill)
      out.push(
        `<rect x="${f1(sx)}" y="${y0 - (o.bandPad ?? 0)}" width="${f1(x1 - sx)}" height="${y1 - y0 + (o.bandPad ?? 0)}" fill="${t.oosFill}"/>`,
      );
  }
  if (o.baseline != null)
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(o.baseline))}" y2="${f1(Y(o.baseline))}" stroke="${t.baseline || t.grid}" stroke-width="1" stroke-dasharray="${t.baselineDash || '2 3'}"/>`,
    );
  series.forEach((s, k) => {
    if (s.area)
      out.push(
        path(
          areaPath(s.vals, X, Y, s.areaBase != null ? Y(s.areaBase) : y1, buckets),
          `fill="${s.area}"`,
        ),
      );
    out.push(
      path(
        linePath(s.vals, X, Y, buckets),
        `fill="none" stroke="${s.color}" stroke-width="${s.width || 1.5}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"`,
      ),
    );
    if (s.dot)
      out.push(
        `<circle cx="${f1(X(D.LAST))}" cy="${f1(Y(s.vals[D.LAST]))}" r="3" fill="${s.color}"/>`,
      );
  });
  if (split != null)
    out.push(
      `<line x1="${f1(X(split))}" x2="${f1(X(split))}" y1="${y0 - (o.bandPad ?? 0)}" y2="${y1}" stroke="${t.split}" stroke-width="1" stroke-dasharray="${t.splitDash || '3 3'}"/>`,
    );
  if (yearLabels) {
    const ys = o.timeLabels || [
      [D.dayOf(2023, 7, 1), '2023-07'],
      [D.dayOf(2024, 1, 1), '2024-01'],
      [D.dayOf(2024, 7, 1), '2024-07'],
      [D.dayOf(2025, 1, 1), '2025-01'],
    ];
    for (const [d, s] of ys) {
      if (o.timeTicks)
        out.push(
          `<line x1="${f1(X(d))}" x2="${f1(X(d))}" y1="${y0}" y2="${y1}" stroke="${t.grid}" stroke-width="1"/>`,
        );
      out.push(
        txt(X(d) + (o.timeAnchor === 'middle' ? 0 : 4), h - (o.timeBottom ?? 6), s, {
          fill: t.axis,
          size: o.axisSize || 11,
          anchor: o.timeAnchor || 'start',
        }),
      );
    }
  }
  if (axisX != null && o.axisVals)
    for (const v of o.axisVals)
      out.push(txt(axisX, Y(v) + 4, fmt(v), { fill: t.axis, size: o.axisSize || 11 }));
  if (labelsAt)
    for (const l of labelsAt) {
      const y = Y(l.v);
      if (l.tag) {
        out.push(
          `<rect x="${axisX - 4}" y="${f1(y - 9)}" width="${w - axisX + 2}" height="18" rx="${t.tagRadius ?? 2}" fill="${l.tag}"/>`,
        );
        out.push(txt(axisX, y + 4, fmt(l.v), { fill: l.on, size: o.axisSize || 11, weight: 600 }));
      }
    }
  return out.join('\n');
}

// ---------- heatmap (diverging bins) with axes
export function heatmap(t, o) {
  const { g, x, y, w, h, bins, gap = 1, ring, xLabels, yLabels, labelColor } = o;
  const nx = g.length,
    ny = g[0].length;
  const cw = w / nx,
    ch = h / ny;
  const out = D.heatPaths(g, { x, y, w, h, gap, bins })
    .map((p) => (p.d ? path(p.d, `fill="${p.color}"`) : ''))
    .filter(Boolean);
  const cx = (i) => x + i * cw,
    cy = (j) => y + (ny - 1 - j) * ch;
  if (ring)
    for (const r of [].concat(ring)) {
      const [i, j] = r.at;
      out.push(
        `<rect x="${f1(cx(i) - 1.5)}" y="${f1(cy(j) - 1.5)}" width="${f1(cw + 2)}" height="${f1(ch + 2)}" fill="none" stroke="${r.color}" stroke-width="${r.width || 2}"${r.rx ? ` rx="${r.rx}"` : ''}/>`,
      );
      if (r.dot)
        out.push(
          `<circle cx="${f1(cx(i) + (cw - gap) / 2)}" cy="${f1(cy(j) + (ch - gap) / 2)}" r="${r.dot}" fill="${r.color}"/>`,
        );
    }
  if (xLabels)
    for (const [i, s] of xLabels)
      out.push(
        txt(cx(i) + (cw - gap) / 2, y + h + (o.xLabelDy ?? 14), s, {
          fill: labelColor,
          size: o.labelSize || 11,
          anchor: 'middle',
        }),
      );
  if (yLabels)
    for (const [j, s] of yLabels)
      out.push(
        txt(x - 6, cy(j) + (ch - gap) / 2 + 4, s, {
          fill: labelColor,
          size: o.labelSize || 11,
          anchor: 'end',
        }),
      );
  return out.join('\n');
}

export function bins(stops, colors) {
  // stops ascending, colors length = stops.length + 1
  const b = [];
  for (let k = 0; k <= stops.length; k++)
    b.push({
      min: k === 0 ? -Infinity : stops[k - 1],
      max: k === stops.length ? Infinity : stops[k],
      color: colors[k],
    });
  return b;
}

// ---------- sensitivity marginal (line + IQR band)
export function marginalSpark(
  t,
  key,
  values,
  { w, h, lo = -7000, hi = 16000, color, band, pad = 2, dots = false },
) {
  const m = D.marginal(key, values);
  const X = (k) =>
    pad + (m.length === 1 ? (w - 2 * pad) / 2 : (k / (m.length - 1)) * (w - 2 * pad));
  const Y = scale(lo, hi, h - pad, pad);
  const top = m.map((p, k) => `${f1(X(k))} ${f1(Y(p.q3))}`);
  const bot = m.map((p, k) => `${f1(X(k))} ${f1(Y(p.q1))}`).reverse();
  const out = [path(`M${top.join('L')}L${bot.join('L')}Z`, `fill="${band}"`)];
  out.push(
    path(
      m.map((p, k) => `${k ? 'L' : 'M'}${f1(X(k))} ${f1(Y(p.mean))}`).join(''),
      `fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"`,
    ),
  );
  if (dots)
    m.forEach((p, k) =>
      out.push(`<circle cx="${f1(X(k))}" cy="${f1(Y(p.mean))}" r="2.2" fill="${color}"/>`),
    );
  return out.join('');
}

// ---------- IS vs OOS scatter
export function scatter(t, o) {
  const { x0, x1, y0, y1, n = 820, dotR = 2.2 } = o;
  const X = scale(-11000, 23000, x0, x1),
    Y = scale(-6000, 13500, y1, y0);
  const r = D.rng(99);
  const pts = D.trials.filter((tr) => !tr.lead && r() < n / D.trials.length);
  const out = [];
  for (const v of o.gridX || [])
    out.push(
      `<line x1="${f1(X(v))}" x2="${f1(X(v))}" y1="${y0}" y2="${y1}" stroke="${t.grid}" stroke-width="1"/>`,
    );
  for (const v of o.gridY || [])
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="${t.grid}" stroke-width="1"/>`,
    );
  out.push(
    `<line x1="${x0}" x2="${x1}" y1="${f1(Y(0))}" y2="${f1(Y(0))}" stroke="${t.zero}" stroke-width="1"/>`,
  );
  out.push(
    `<line x1="${f1(X(0))}" x2="${f1(X(0))}" y1="${y0}" y2="${y1}" stroke="${t.zero}" stroke-width="1"/>`,
  );
  const neg = pts.filter((p) => p.oos < 0),
    pos = pts.filter((p) => p.oos >= 0);
  const dotsD = (ps) => ps.map((p) => `M${f1(X(p.is))} ${f1(Y(p.oos))}h0.01`).join('');
  out.push(
    path(
      dotsD(neg),
      `stroke="${t.dotNeg}" stroke-width="${dotR * 2}" stroke-linecap="round" fill="none"`,
    ),
  );
  out.push(
    path(
      dotsD(pos),
      `stroke="${t.dotPos}" stroke-width="${dotR * 2}" stroke-linecap="round" fill="none"`,
    ),
  );
  const lead = D.trials.filter((p) => p.lead);
  out.push(
    path(
      dotsD(lead),
      `stroke="${t.dotLead}" stroke-width="${dotR * 2 + 1}" stroke-linecap="round" fill="none"`,
    ),
  );
  for (const h of o.highlight || []) {
    const p = D.cell(h.L, h.M, h.src || 'close', '关');
    out.push(
      `<circle cx="${f1(X(p.is))}" cy="${f1(Y(p.oos))}" r="${h.r || 6}" fill="${h.fill || 'none'}" stroke="${h.color}" stroke-width="2"/>`,
    );
    if (h.label)
      out.push(
        txt(X(p.is) + (h.dx ?? -10), Y(p.oos) + (h.dy ?? -10), h.label, {
          fill: h.labelColor || h.color,
          size: 11.5,
          anchor: h.anchor || 'end',
          weight: 600,
        }),
      );
  }
  for (const [v, s] of o.xTicks || [])
    out.push(txt(X(v), y1 + 16, s, { fill: t.axis, size: 11, anchor: 'middle' }));
  for (const [v, s] of o.yTicks || [])
    out.push(txt(x0 - 6, Y(v) + 4, s, { fill: t.axis, size: 11, anchor: 'end' }));
  return out.join('\n');
}

// ---------- walk-forward: stitched OOS equity and lanes
export function wfChart(t, o) {
  const {
    x0,
    x1,
    y0,
    y1,
    laneY,
    laneH,
    laneGap,
    sel = 2,
    lo = 98600,
    hi = 108600,
    axisX,
    shadow,
  } = o;
  const X = scale(0, D.LAST, x0, x1),
    Y = scale(lo, hi, y1, y0);
  const out = [];
  const w3 = D.WF[sel];
  const lanesBottom = laneY + D.WF.length * (laneH + laneGap);
  // selected window projection bands
  if (t.projIs)
    out.push(
      `<rect x="${f1(X(w3.isFrom))}" y="${y0}" width="${f1(X(w3.isTo + 1) - X(w3.isFrom))}" height="${f1(lanesBottom - y0)}" fill="${t.projIs}"/>`,
    );
  if (t.projOos)
    out.push(
      `<rect x="${f1(X(w3.oosFrom))}" y="${y0}" width="${f1(X(w3.oosTo + 1) - X(w3.oosFrom))}" height="${f1(lanesBottom - y0)}" fill="${t.projOos}"/>`,
    );
  for (const v of o.gridVals || [])
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="${t.grid}" stroke-width="1"/>`,
    );
  out.push(
    `<line x1="${x0}" x2="${x1}" y1="${f1(Y(100000))}" y2="${f1(Y(100000))}" stroke="${t.baseline}" stroke-width="1" stroke-dasharray="2 3"/>`,
  );
  // window boundaries + net labels
  D.WF.forEach((w, k) => {
    const xa = X(w.oosFrom);
    out.push(
      `<line x1="${f1(xa)}" x2="${f1(xa)}" y1="${y0}" y2="${y1}" stroke="${t.grid2 || t.grid}" stroke-width="1"/>`,
    );
    const xm = (X(w.oosFrom) + X(w.oosTo + 1)) / 2;
    out.push(
      txt(xm, y0 + 12, (o.idLabels ? w.id + ' ' : '') + kfmt(w.oos), {
        fill: w.oos < 0 ? t.loss : t.segLabel,
        size: 11,
        anchor: 'middle',
        weight: k === sel ? 700 : 500,
      }),
    );
  });
  if (shadow) {
    // in-sample shadow of W3's pick, ending where its OOS segment starts
    const r = D.rng(61);
    const len = w3.isTo - w3.isFrom + 1;
    const endV = D.equityWF[w3.oosFrom];
    const sh = D.bridge(
      [
        [0, endV - w3.is],
        [Math.round(len * 0.3), endV - w3.is * 0.72],
        [Math.round(len * 0.65), endV - w3.is * 0.35],
        [len - 1, endV],
      ],
      140,
      r,
    );
    const full = new Array(D.LAST + 1).fill(null);
    sh.forEach((v, i) => (full[w3.isFrom + i] = v));
    out.push(
      path(
        linePath(full, X, Y, 160, w3.isFrom, w3.isTo),
        `fill="none" stroke="${t.shadow}" stroke-width="1.5" stroke-dasharray="4 3"`,
      ),
    );
  }
  if (t.eqArea)
    out.push(path(areaPath(D.equityWF, X, Y, Y(lo), 260, 364, D.LAST), `fill="${t.eqArea}"`));
  out.push(
    path(
      linePath(D.equityWF, X, Y, 260, 364, D.LAST),
      `fill="none" stroke="${t.eq}" stroke-width="1.7" stroke-linejoin="round"`,
    ),
  );
  out.push(
    `<circle cx="${f1(X(D.LAST))}" cy="${f1(Y(D.equityWF[D.LAST]))}" r="3" fill="${t.eq}"/>`,
  );
  // lanes
  D.WF.forEach((w, k) => {
    const y = laneY + k * (laneH + laneGap);
    out.push(
      `<rect x="${f1(X(w.isFrom))}" y="${f1(y)}" width="${f1(X(w.isTo + 1) - X(w.isFrom))}" height="${laneH}" rx="${t.laneR ?? 1}" fill="${k === sel ? t.laneIsSel : t.laneIs}"/>`,
    );
    out.push(
      `<rect x="${f1(X(w.oosFrom))}" y="${f1(y)}" width="${f1(X(w.oosTo + 1) - X(w.oosFrom))}" height="${laneH}" rx="${t.laneR ?? 1}" fill="${k === sel ? t.laneOosSel : t.laneOos}"/>`,
    );
    if (k === sel && t.selStroke)
      out.push(
        `<rect x="${f1(X(w.isFrom) - 2)}" y="${f1(y - 2)}" width="${f1(X(w.oosTo + 1) - X(w.isFrom) + 4)}" height="${laneH + 4}" rx="${(t.laneR ?? 1) + 1}" fill="none" stroke="${t.selStroke}" stroke-width="1.5"/>`,
      );
    out.push(
      txt(x0 - 8, y + laneH / 2 + 4, w.id, {
        fill: k === sel ? t.laneLabelSel : t.axis,
        size: 11,
        anchor: 'end',
        weight: k === sel ? 700 : 500,
      }),
    );
  });
  const ticks = o.timeLabels || [
    [D.dayOf(2023, 7, 1), '2023-07'],
    [D.dayOf(2024, 1, 1), '2024-01'],
    [D.dayOf(2024, 7, 1), '2024-07'],
    [D.dayOf(2025, 1, 1), '2025-01'],
  ];
  for (const [d, s] of ticks)
    out.push(txt(X(d), o.timeY, s, { fill: t.axis, size: 11, anchor: 'middle' }));
  if (axisX != null)
    for (const v of o.axisVals || [])
      out.push(txt(axisX, Y(v) + 4, fmt(v), { fill: t.axis, size: 11 }));
  if (o.endTag) {
    const v = D.equityWF[D.LAST];
    out.push(
      `<rect x="${axisX - 4}" y="${f1(Y(v) - 9)}" width="${o.w - axisX + 2}" height="18" rx="${t.tagRadius ?? 2}" fill="${t.eq}"/>`,
    );
    out.push(txt(axisX, Y(v) + 4, fmt(v), { fill: t.onEq, size: 11, weight: 600 }));
  }
  return out.join('\n');
}

// stability strip for one parameter: per window band + pick dot, common range highlight
export function stabilityStrip(t, o) {
  const { w, h, lo, hi, bands, picks, common, pad = 4, colW } = o;
  const n = bands.length;
  const Y = scale(lo, hi, h - pad, pad);
  const out = [];
  if (common)
    out.push(
      `<rect x="0" y="${f1(Y(common[1]) - 3)}" width="${w}" height="${f1(Y(common[0]) - Y(common[1]) + 6)}" fill="${t.common}"/>`,
    );
  bands.forEach((b, k) => {
    const cx = (k + 0.5) * (w / n);
    out.push(
      `<rect x="${f1(cx - colW / 2)}" y="${f1(Y(b[1]) - 3)}" width="${colW}" height="${f1(Y(b[0]) - Y(b[1]) + 6)}" rx="${t.bandR ?? 2}" fill="${t.band}"/>`,
    );
    out.push(
      `<circle cx="${f1(cx)}" cy="${f1(Y(picks[k]))}" r="3.2" fill="${t.pick}" stroke="${t.pickStroke}" stroke-width="1.5"/>`,
    );
  });
  return out.join('');
}
