// 回测 · 权益 dock tab (B5): facts across the top; equity, drawdown and a daily P&L calendar strip
// share one time axis; each month's return sits under its calendar block.
import * as D from './data.mjs';
import * as X from './x.mjs';
import { I, seg } from './ui.mjs';
const { fmt, sfmt } = X;
const f1 = D.f1;
const day = (i) => new Date(D.DAY0 + i * 864e5).toISOString().slice(0, 10);

export function dockEquity() {
  const e = D.equityDefault;
  let pk = 0,
    pi = 0,
    mdd = 0,
    a = 0,
    b = 0;
  e.forEach((v, i) => {
    if (v > pk) {
      pk = v;
      pi = i;
    }
    if (v - pk < mdd) {
      mdd = v - pk;
      a = pi;
      b = i;
    }
  });
  const pnl = e.map((v, i) => (i ? v - e[i - 1] : 0));
  const posDays = pnl.filter((v) => v > 20).length,
    negDays = pnl.filter((v) => v < -20).length;
  const iBest = pnl.indexOf(Math.max(...pnl)),
    iWorst = pnl.indexOf(Math.min(...pnl));

  const W = 1104,
    H = 298,
    x0 = 28,
    x1 = 1036,
    ax = 1046;
  const X0 = D.scale(0, D.LAST + 1, x0, x1);
  const eY0 = 14,
    eY1 = 126,
    dY0 = 136,
    dY1 = 176,
    cY = 188,
    rowH = 9;
  const cell = (x1 - x0) / Math.ceil((D.LAST + 1) / 7);
  const Y = D.scale(98000, 127000, eY1, eY0),
    DY = D.scale(-8500, 0, dY1, dY0);
  const dd = D.drawdown(e);
  const out = [];
  for (let y = 2023; y <= 2025; y++)
    for (let m = 1; m <= 12; m++) {
      const s = D.dayOf(y, m, 1);
      if (s <= 0 || s > D.LAST) continue;
      out.push(
        `<line x1="${f1(X0(s))}" x2="${f1(X0(s))}" y1="${eY0}" y2="${cY + 7 * rowH}" stroke="${m === 1 ? '#2f353c' : '#191c21'}"/>`,
      );
    }
  out.push(
    `<rect x="${f1(X0(a))}" y="${eY0 - 6}" width="${f1(X0(b) - X0(a))}" height="${dY1 - eY0 + 6}" fill="rgba(240,106,93,0.06)"/>`,
  );
  out.push(
    `<text x="${f1((X0(a) + X0(b)) / 2)}" y="${eY1 - 6}" fill="#f58a7f" font-size="11" text-anchor="middle">最大回撤 −7.81%</text>`,
  );
  for (const v of [100000, 110000])
    out.push(
      `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="${v === 100000 ? '#3a4048' : '#1a1d22'}"${v === 100000 ? ' stroke-dasharray="2 3"' : ''}/><text x="${ax}" y="${f1(Y(v) + 4)}" fill="#7f8790" font-size="11">${fmt(v)}</text>`,
    );
  out.push(
    `<path d="${D.areaPath(e, X0, Y, eY1, 320)}" fill="rgba(242,163,58,0.08)"/><path d="${D.linePath(e, X0, Y, 320)}" fill="none" stroke="#f2a33a" stroke-width="1.7" stroke-linejoin="round"/>`,
  );
  out.push(
    `<circle cx="${f1(X0(a))}" cy="${f1(Y(e[a]))}" r="3.5" fill="#0e1013" stroke="#e8eaed" stroke-width="1.5"/><text x="${f1(X0(a) - 8)}" y="${f1(Y(e[a]) + 4)}" fill="#e8eaed" font-size="11" text-anchor="end">最高 ${fmt(e[a])}</text>`,
  );
  out.push(
    `<line x1="${f1(X0(a))}" x2="${x1}" y1="${f1(Y(e[a]))}" y2="${f1(Y(e[a]))}" stroke="#e8eaed" stroke-opacity="0.35" stroke-dasharray="3 3"/>`,
  );
  out.push(
    `<rect x="${ax - 4}" y="${f1(Y(e[D.LAST]) - 9)}" width="${W - ax + 2}" height="18" rx="2" fill="#f2a33a"/><text x="${ax}" y="${f1(Y(e[D.LAST]) + 4)}" fill="#1a1206" font-size="11" font-weight="600">118,420</text>`,
  );
  out.push(
    `<path d="${D.areaPath(dd, X0, DY, dY0, 320)}" fill="rgba(240,106,93,0.22)"/><path d="${D.linePath(dd, X0, DY, 320)}" fill="none" stroke="#f06a5d" stroke-width="1"/>`,
  );
  out.push(
    `<text x="${ax}" y="${dY0 + 6}" fill="#7f8790" font-size="11">0</text><text x="${ax}" y="${dY1 + 2}" fill="#7f8790" font-size="11">−7.8k</text>`,
  );
  out.push(`<text x="${x0 + 4}" y="${dY0 + 12}" fill="#aab1b9" font-size="11">回撤</text>`);
  const colorOf = (v) => {
    if (Math.abs(v) < 20) return '#1b1f24';
    const t = Math.min(1, Math.abs(v) / 900);
    return v > 0
      ? `rgba(63,191,138,${(0.22 + t * 0.73).toFixed(2)})`
      : `rgba(240,106,93,${(0.22 + t * 0.73).toFixed(2)})`;
  };
  const rects = [];
  for (let i = 0; i <= D.LAST; i++) {
    const col = Math.floor(i / 7),
      row = i % 7;
    rects.push(
      `<rect x="${f1(x0 + col * cell + 0.5)}" y="${f1(cY + row * rowH)}" width="${f1(cell - 1.2)}" height="${f1(rowH - 1.2)}" rx="1" fill="${colorOf(pnl[i])}"/>`,
    );
  }
  out.push(rects.join(''));
  for (const [r, s] of [
    [0, '一'],
    [2, '三'],
    [4, '五'],
    [6, '日'],
  ])
    out.push(
      `<text x="${x0 - 6}" y="${f1(cY + r * rowH + 8)}" fill="#7f8790" font-size="9.5" text-anchor="end">${s}</text>`,
    );
  out.push(
    `<text x="${ax}" y="${cY + 10}" fill="#aab1b9" font-size="11">每日</text><text x="${ax}" y="${cY + 24}" fill="#aab1b9" font-size="11">盈亏</text>`,
  );
  const mY = cY + 7 * rowH + 16;
  for (let y = 2023; y <= 2025; y++)
    for (let m = 1; m <= 12; m++) {
      const s = D.dayOf(y, m, 1);
      if (s > D.LAST) continue;
      const t = Math.min(D.LAST, D.dayOf(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1),
        s0 = Math.max(0, s - 1);
      if (t - Math.max(0, s) < 10) continue;
      const r = (e[t] / e[s0] - 1) * 100;
      out.push(
        `<text x="${f1((X0(Math.max(0, s)) + X0(t + 1)) / 2)}" y="${mY}" fill="${r >= 0 ? '#3fbf8a' : '#f06a5d'}" font-size="10" text-anchor="middle">${(r >= 0 ? '' : '−') + Math.abs(r).toFixed(1)}</text>`,
      );
    }
  out.push(`<text x="${ax}" y="${mY}" fill="#7f8790" font-size="10.5">月 %</text>`);
  for (const [y, s, t] of [
    [2023, 0, D.dayOf(2023, 12, 31)],
    [2024, D.dayOf(2024, 1, 1), D.dayOf(2024, 12, 31)],
    [2025, D.dayOf(2025, 1, 1), D.LAST],
  ]) {
    const r = (e[t] / e[Math.max(0, s - 1)] - 1) * 100;
    out.push(
      `<text x="${f1(X0(s) + 4)}" y="${mY + 18}" fill="#aab1b9" font-size="11">${y}<tspan dx="6" fill="${r >= 0 ? '#3fbf8a' : '#f06a5d'}" font-weight="600">${(r >= 0 ? '+' : '−') + Math.abs(r).toFixed(1)}%</tspan></text>`,
    );
  }

  const fact = (k, v, sub, c = '') =>
    `<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; padding: 0 14px; border-left: 1px solid #1f2328"><span class="t3" style="font-size: 11.5px">${k}</span><span style="display: flex; align-items: baseline; gap: 6px; white-space: nowrap"><span class="${c}" style="font-size: 15px; font-weight: 600">${v}</span><span class="t3" style="font-size: 11.5px">${sub}</span></span></div>`;
  const legend = (c, label, kind = 'line') =>
    `<span style="display: flex; align-items: center; gap: 6px">${kind === 'line' ? `<span style="width: 14px; height: 2px; background: ${c}"></span>` : `<span style="width: 10px; height: 10px; border-radius: 2px; background: ${c}"></span>`}<span class="t2">${label}</span></span>`;
  return `<section style="flex: 1; min-height: 0; background: #14171b; display: flex; flex-direction: column">
<div style="height: 36px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px; font-size: 12px; white-space: nowrap">
${legend('#f2a33a', '权益')}${legend('rgba(240,106,93,0.45)', '回撤', 'box')}${legend('rgba(240,106,93,0.16)', '最大回撤区间', 'box')}${legend('#3fbf8a', '盈利日', 'box')}${legend('#f06a5d', '亏损日', 'box')}<span class="t3">颜色越深，当日盈亏越大</span>
<div style="flex: 1"></div>
${seg(['金额', '百分比'], 0, { cls: 'sm', label: '纵轴单位' })}
<button class="iconbtn" aria-label="重置缩放">${I.fit()}</button>
</div>
<div class="num" style="height: 50px; flex: none; display: flex; align-items: center; border-top: 1px solid #1f2328; border-bottom: 1px solid #1f2328">
${fact('期末权益', '118,420', '+18.42%', 'up')}${fact('年化收益', '+7.49%', '2.34 年')}${fact('最大回撤', '−7,812', `${day(a)} 起`, 'dn')}${fact('回撤持续', `${D.LAST - a} 天`, '尚未创新高', 'am')}${fact('收益 / 最大回撤', '2.36', '')}${fact('盈利日 / 亏损日', `${posDays} / ${negDays}`, '')}${fact('最佳 / 最差单日', `<span class="up">${sfmt(Math.round(pnl[iBest]))}</span> / <span class="dn">${sfmt(Math.round(pnl[iWorst]))}</span>`, '')}
</div>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display: block; flex: none" role="img" aria-label="权益、回撤与每日盈亏日历，共用时间轴">${out.join('')}</svg>
</section>`;
}
