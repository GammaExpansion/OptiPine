// Shell, atoms and icons of the A 行情终端 direction.
export const CSS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&amp;family=Noto+Sans+SC:wght@400;500;700&amp;family=Source+Code+Pro:wght@400;500&amp;display=swap">
<style>
body{margin:0;background:#0e1013;color:#e8eaed;font-family:"Barlow","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.35;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
a{color:#f5b155;text-decoration:none}a:hover{color:#ffc877}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;text-align:inherit}
input{font:inherit;color:inherit;min-width:0}
.num{font-variant-numeric:tabular-nums}
.t2{color:#aab1b9}.t3{color:#7f8790}.up{color:#3fbf8a}.dn{color:#f06a5d}.am{color:#f5b155}
.tb{height:30px;display:inline-flex;align-items:center;gap:8px;padding:0 10px;border-radius:4px;font-size:13px;white-space:nowrap}
.tb:hover,.tb.on{background:#1b1f24}
.seg{display:inline-flex;height:30px;padding:2px;gap:2px;background:#14171b;border:1px solid #23272d;border-radius:5px;flex:none}
.seg>button{padding:0 10px;border-radius:3px;font-size:12.5px;color:#aab1b9;white-space:nowrap;text-align:center}
.seg>button.on{background:#282d34;color:#e8eaed}
.seg.sm{height:26px}.seg.sm>button{font-size:12px;padding:0 9px}
.primary{height:32px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 12px;border-radius:4px;background:#f2a33a;color:#1a1206;font-weight:600;font-size:13px;white-space:nowrap}
.primary:hover{background:#f6b04d}
.primary.off{background:#3a3327;color:#8d8370;cursor:default}
.ghost{height:32px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 12px;border-radius:4px;border:1px solid #2f353c;color:#e8eaed;font-weight:500;font-size:13px;white-space:nowrap}
.ghost:hover{background:#1b1f24}
kbd{font:inherit;font-size:11px;font-weight:500;padding:1px 5px;border-radius:3px;background:rgba(26,18,6,.16)}
.iconbtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;color:#aab1b9;flex:none}
.iconbtn:hover{background:#1b1f24;color:#e8eaed}
.iconbtn.on{color:#f5b155}
.dtab{position:relative;display:inline-flex;align-items:center;gap:6px;padding:0 12px;font-size:13px;color:#aab1b9;white-space:nowrap}
.dtab.on{color:#e8eaed;font-weight:500}
.dtab.on::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;background:#f2a33a}
.rtab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:40px;position:relative;font-size:13px;color:#aab1b9;white-space:nowrap}
.rtab.on{color:#e8eaed;font-weight:500}
.rtab.on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#f2a33a}
.mtab{height:48px;display:inline-flex;align-items:center;gap:6px;padding:0 2px;font-size:14px;color:#aab1b9;position:relative;white-space:nowrap}
.mtab:hover{color:#e8eaed}
.mtab.on{color:#e8eaed;font-weight:600}
.mtab.on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:#f2a33a}
.cnt{font-size:11.5px;color:#7f8790;font-variant-numeric:tabular-nums}
.cnt.bad{color:#1a0b09;background:#f06a5d;border-radius:8px;padding:0 5px;font-weight:600}
.sec{display:flex;align-items:center;justify-content:space-between;height:28px;font-size:13px;font-weight:600}
.field{height:32px;display:flex;align-items:center;border:1px solid #2f353c;border-radius:4px;background:#0f1215;font-size:13px;font-variant-numeric:tabular-nums}
.field .k{width:30px;height:100%;display:flex;align-items:center;justify-content:center;color:#7f8790}
.field .v{flex:1;text-align:center;background:none;border:0;width:100%;outline:none}
.sel{height:32px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px;border:1px solid #2f353c;border-radius:4px;background:#0f1215;font-size:13px;width:100%}
.inp{height:32px;border:1px solid #2f353c;border-radius:4px;background:#0f1215;padding:0 10px;font-size:13px;outline:none;width:100%;font-variant-numeric:tabular-nums}
.mini{height:28px;display:flex;align-items:center;padding:0 8px;border:1px solid #2f353c;border-radius:4px;background:#0f1215;font-size:12.5px;font-variant-numeric:tabular-nums;outline:none}
.field.err,.inp.err,.mini.err,.sel.err{border-color:#f06a5d}
.field.foc,.inp.foc,.mini.foc,.sel.foc{border-color:#f2a33a}
.errt{font-size:12px;color:#f58a7f}
.lab{font-size:12.5px;color:#aab1b9}
.sw{width:34px;height:20px;border-radius:10px;background:#2f353c;position:relative;flex:none}
.sw::after{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:7px;background:#aab1b9}
.sw.on{background:#f2a33a}.sw.on::after{left:17px;background:#1a1206}
.kv{display:flex;align-items:center;justify-content:space-between;gap:12px;height:31px;border-top:1px solid #1f2328;font-size:13px;white-space:nowrap}
.kv>span:first-child{color:#aab1b9}
.chip{height:26px;display:inline-flex;align-items:center;gap:6px;padding:0 9px;border-radius:13px;border:1px solid #2f353c;font-size:12.5px;white-space:nowrap}
.chip.on{border-color:#6b5227;background:#241c10;color:#f5c27a}
.chip.bad{border-color:#7a3a33;color:#f58a7f}
.cb{width:15px;height:15px;border-radius:3px;border:1px solid #4a525c;display:inline-flex;align-items:center;justify-content:center;flex:none}
.cb.on{background:#f2a33a;border-color:#f2a33a}
.tag{height:18px;padding:0 6px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;white-space:nowrap;background:#282d34;color:#aab1b9}
.tag.am{background:#3a2c16;color:#f5b155}.tag.dn{background:#3b1f1c;color:#f58a7f}.tag.bl{background:#1c3340;color:#8fd0f0}
table{border-collapse:collapse;width:100%}
th{font-weight:500;font-size:12px;color:#7f8790;text-align:right;padding:0 0 6px 8px;white-space:nowrap}
th:first-child{text-align:left;padding-left:0}
td{font-size:12.5px;text-align:right;padding:0 0 0 8px;height:25px;border-top:1px solid #1f2328;white-space:nowrap;font-variant-numeric:tabular-nums}
td:first-child{text-align:left;padding-left:0;color:#aab1b9}
.lb th{font-size:12px;padding:0 8px;height:30px;border-bottom:1px solid #23272d}
.lb td{height:30px;padding:0 8px;border-top:0;border-bottom:1px solid #1b1f24}
.lb td:first-child{padding-left:12px}.lb th:first-child{padding-left:12px}
.lb tr.cur td{background:#221b11}
.lb tr.cur td:first-child{color:#f5b155}
.lb.sm td{height:26px}
.code{font-family:"Source Code Pro",Consolas,monospace;font-size:12.5px;line-height:19px}
.cl{display:flex;height:19px;border-left:2px solid transparent;white-space:pre}
.cl .ln{width:46px;flex:none;text-align:right;padding-right:14px;color:#4f565f}
.cl.in{background:rgba(242,163,58,0.06);border-left-color:#f2a33a}.cl.in .ln{color:#aab1b9}
.cl.fx{background:rgba(255,255,255,0.025);border-left-color:#3a4048}.cl.fx .ln{color:#aab1b9}
.cl.er{background:rgba(240,106,93,0.10);border-left-color:#f06a5d}.cl.er .ln{color:#f58a7f}
.cl.cu{background:rgba(255,255,255,0.035)}
.kw{color:#8fb8de}.fn{color:#d9c38c}.st{color:#a9c98f}.nu{color:#e0a577}.cm{color:#6b727b}
.sq{text-decoration:underline wavy #f06a5d;text-underline-offset:3px}
.menu{position:absolute;background:#1b1f24;border:1px solid #2f353c;border-radius:6px;box-shadow:0 14px 36px rgba(0,0,0,.55);padding:4px;font-size:13px;display:flex;flex-direction:column}
.mi{height:30px;display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:4px;white-space:nowrap;width:100%}
.mi:hover,.mi.on{background:#2a3038}
.mh{height:26px;display:flex;align-items:center;padding:0 10px;font-size:11.5px;color:#7f8790}
.msep{height:1px;background:#2f353c;margin:4px 0;flex:none}
.dlg{background:#14171b;border:1px solid #2f353c;border-radius:8px;box-shadow:0 24px 64px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden}
.toast{position:absolute;display:flex;align-items:center;gap:12px;height:40px;padding:0 8px 0 14px;border-radius:6px;background:#282d34;border:1px solid #3a4048;box-shadow:0 12px 28px rgba(0,0,0,.5);font-size:13px;white-space:nowrap}
.bar{height:4px;border-radius:2px;background:#2f353c;position:relative;overflow:hidden}
.bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:#f2a33a}
.note{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:4px;font-size:12.5px;line-height:1.45;background:#1b1f24;color:#aab1b9}
.note.am{background:#241c10;color:#f5c27a}.note.dn{background:#2a1715;color:#f5a59c}
</style>`;

const sv = (size, inner, sw = 1.5, color = 'currentColor') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
export const I = {
  chev: (s = 12, c = '#7f8790') => sv(s, '<path d="M4 6l4 4 4-4"/>', 1.6, c),
  chevUp: (s = 14) => sv(s, '<path d="M4 10l4-4 4 4"/>', 1.6),
  chevL: (s = 14) => sv(s, '<path d="M10 4l-4 4 4 4"/>', 1.6),
  chevR: (s = 14) => sv(s, '<path d="M6 4l4 4-4 4"/>', 1.6),
  x: (s = 12) => sv(s, '<path d="M4 4l8 8M12 4l-8 8"/>', 1.6),
  play: (s = 11) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>`,
  stop: (s = 11) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>`,
  file: (s = 14, c = '#aab1b9') =>
    sv(s, '<path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13"/>', 1.4, c),
  cal: (s = 14, c = '#aab1b9') =>
    sv(
      s,
      '<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
      1.4,
      c,
    ),
  dl: (s = 15) => sv(s, '<path d="M8 2v8M4.5 7L8 10.5 11.5 7M2.5 13.5h11"/>'),
  ul: (s = 15) => sv(s, '<path d="M8 10.5v-8M4.5 5.5L8 2l3.5 3.5M2.5 13.5h11"/>'),
  search: (s = 14) => sv(s, '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>'),
  check: (s = 10, c = '#1a1206') =>
    `<svg width="${s}" height="${s}" viewBox="0 0 12 12" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.2l2.4 2.3 4.6-5"/></svg>`,
  reset: (s = 13) => sv(s, '<path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 2.5V6h3.5"/>'),
  marks: (s = 16) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 3l3 4.5H1z"/><path d="M12 13l-3-4.5h6z"/></svg>`,
  fit: (s = 16) => sv(s, '<path d="M2.5 6V2.5H6M13.5 10v3.5H10M10 2.5h3.5V6M6 13.5H2.5V10"/>', 1.4),
  max: (s = 15) => sv(s, '<path d="M4 10l4-4 4 4"/><path d="M3 3.5h10"/>', 1.6),
  err: (s = 14, c = '#f06a5d') =>
    `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="${c}"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#14171b" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  warn: (s = 14, c = '#f2a33a') =>
    `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.6 11.8H1.4z" fill="${c}"/><path d="M8 6.2v3.6" stroke="#14171b" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.9" fill="#14171b"/></svg>`,
  block: (s = 14, c = '#8fb8de') =>
    `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="${c}" stroke-width="1.6"/><path d="M3.9 12.1l8.2-8.2" stroke="${c}" stroke-width="1.6"/></svg>`,
  lock: (s = 12) =>
    sv(
      s,
      '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
      1.4,
    ),
  locate: (s = 14) =>
    sv(s, '<circle cx="8" cy="8" r="4"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/>', 1.4),
  copy: (s = 13) =>
    sv(
      s,
      '<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 5.5v-3h-8v8h3"/>',
      1.4,
    ),
  plus: (s = 12) => sv(s, '<path d="M8 3v10M3 8h10"/>', 1.6),
  spin: (s = 14) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="#4a3a20" stroke-width="2"/><path d="M8 2.5A5.5 5.5 0 0 1 13.5 8" stroke="#f2a33a" stroke-width="2" stroke-linecap="round"/></svg>`,
  grip: () =>
    '<svg width="4" height="16" viewBox="0 0 4 16" aria-hidden="true"><circle cx="2" cy="3" r="1" fill="currentColor"/><circle cx="2" cy="8" r="1" fill="currentColor"/><circle cx="2" cy="13" r="1" fill="currentColor"/></svg>',
  paste: (s = 14) =>
    sv(
      s,
      '<rect x="3.5" y="3" width="9" height="11" rx="1.2"/><path d="M6 3V1.8h4V3M6 7h4M6 10h4"/>',
      1.4,
    ),
  globe: (s = 14) =>
    sv(
      s,
      '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/>',
      1.3,
    ),
  panel: (s = 15) =>
    sv(s, '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M10 2.5v11"/>', 1.4),
  info: (s = 15) => sv(s, '<circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v4M8 4.75v.01"/>', 1.5),
  logo: () =>
    '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="1.5" y="7" width="3.5" height="9" rx="1" fill="#f2a33a"/><rect x="7.25" y="2" width="3.5" height="14" rx="1" fill="#f2a33a"/><rect x="13" y="9.5" width="3.5" height="6.5" rx="1" fill="#7a5a26"/></svg>',
};

export const dot = (c, s = 7) =>
  `<span style="width: ${s}px; height: ${s}px; border-radius: ${s}px; background: ${c}; flex: none"></span>`;
export const cb = (on, label) =>
  `<button class="cb${on ? ' on' : ''}" role="checkbox" aria-checked="${on}" aria-label="${label}">${on ? I.check() : ''}</button>`;
export const sw = (on, label) =>
  `<button class="sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}"></button>`;
export const seg = (items, on, { cls = '', style = '', label = '', each = '' } = {}) =>
  `<div class="seg${cls ? ' ' + cls : ''}"${style ? ` style="${style}"` : ''} role="group"${label ? ` aria-label="${label}"` : ''}>${items.map((s, k) => `<button${k === on ? ' class="on"' : ''}${each ? ` style="${each}"` : ''}>${s}</button>`).join('')}</div>`;
export const select = (html, { cls = '', style = '' } = {}) =>
  `<button class="sel${cls ? ' ' + cls : ''}"${style ? ` style="${style}"` : ''}><span>${html}</span>${I.chev()}</button>`;
export const numField = (id, value, { err = false, foc = false, dis = false } = {}) =>
  `<div class="field${err ? ' err' : ''}${foc ? ' foc' : ''}"${dis ? ' style="opacity: 0.5"' : ''}><button class="k" aria-label="减少">−</button><input id="${id}" class="v" value="${value}"><button class="k" aria-label="增加">+</button></div>`;
export const rmChip = (text, cls = '') =>
  `<span class="chip num${cls ? ' ' + cls : ''}">${text}<button aria-label="移除条件" class="t3" style="display: inline-flex">${I.x(10)}</button></span>`;
export const addChip = (on = false) =>
  `<button class="chip t2${on ? ' on' : ''}" style="border-style: dashed">+ 条件</button>`;

// ---------- header
const DATA = { sym: 'BTCUSDT', feed: 'Binance', tf: 1, range: '2023-01-02 – 2025-05-04' };
export function header({
  script = { name: 'trend_breakout.pine', state: 'ok' },
  data = DATA,
  right = '',
  open = null,
  lang = 0,
  mode = null,
  optDot = false,
  optOff = false,
  pages = null,
  page = 0,
  pageOff = null,
} = {}) {
  const modeNav = pages
    ? `<nav style="display: flex; gap: 18px; align-self: stretch; padding: 0 6px" aria-label="页面">${pages.map((p, k) => `<button class="mtab${k === page ? ' on' : ''}"${k === page ? ' aria-current="page"' : ''}${k === pageOff ? ' aria-disabled="true" style="opacity: 0.4"' : ''}>${p}</button>`).join('')}</nav>
<div style="width: 1px; height: 22px; background: #23272d"></div>`
    : mode == null
      ? ''
      : `<nav style="display: flex; gap: 18px; align-self: stretch; padding: 0 6px" aria-label="工作模式"><button class="mtab${mode === 0 ? ' on' : ''}"${mode === 0 ? ' aria-current="page"' : ''}>回测</button><button class="mtab${mode === 1 ? ' on' : ''}"${mode === 1 ? ' aria-current="page"' : ''}${optOff ? ' aria-disabled="true" style="opacity: 0.4"' : ''}>优化${optDot ? dot('#f2a33a', 6) : ''}</button></nav>
<div style="width: 1px; height: 22px; background: #23272d"></div>`;
  const dotC = { ok: '#3fbf8a', err: '#f06a5d', busy: '#f2a33a' }[script.state];
  const scriptBtn =
    script.state === 'none'
      ? `<button class="tb${open === 'script' ? ' on' : ''}">${I.file()}<span class="t2">打开脚本</span>${I.chev()}</button>`
      : `<button class="tb${open === 'script' ? ' on' : ''}" aria-label="脚本 ${script.name}">${I.file()}<span>${script.name}</span>${dot(dotC)}${I.chev()}</button>`;
  const dataBtn = data
    ? `<button class="tb${open === 'data' ? ' on' : ''}"><span style="font-weight: 600">${data.sym}</span><span class="t3">${data.feed}</span>${I.chev()}</button>`
    : `<button class="tb${open === 'data' ? ' on' : ''}"><span class="t2">选择行情</span>${I.chev()}</button>`;
  const tfs = data && data.tfs ? data.tfs : ['15m', '1h', '4h', '1D'];
  const tfSeg = `<div class="seg" role="group" aria-label="周期"${data && !data.fixed ? '' : ' style="opacity: 0.45"'}>${tfs.map((s, k) => `<button${data && k === data.tf ? ' class="on"' : ''}>${s}</button>`).join('')}</div>`;
  const range = `<button class="tb num"${data ? '' : ' style="opacity: 0.45"'}>${I.cal()}<span>${data ? data.range : '日期范围'}</span></button>`;
  return `<header style="height: 48px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 12px 0 16px; border-bottom: 1px solid #23272d; background: #0e1013">
<div style="display: flex; align-items: center; gap: 9px; font-weight: 600; font-size: 15px; white-space: nowrap; padding-right: 6px">${I.logo()}<span>OptiPine</span></div>
<div style="width: 1px; height: 22px; background: #23272d"></div>
${modeNav}
${scriptBtn}
${dataBtn}
${tfSeg}
${range}
<div style="flex: 1"></div>
${right}
<div class="seg" role="group" aria-label="语言"><button${lang === 0 ? ' class="on"' : ''}>中</button><button${lang === 1 ? ' class="on"' : ''}>EN</button></div>
<button class="iconbtn" aria-label="关于与许可证" title="关于与许可证">${I.info()}</button>
</header>`;
}
export const status = (html) =>
  `<span class="num" style="font-size: 12px; white-space: nowrap; display: flex; align-items: center; gap: 10px">${html}</span>`;
export const runBtn = ({ kbd = true, off = false } = {}) =>
  `<button class="primary${off ? ' off' : ''}"${off ? ' aria-disabled="true"' : ''}>${I.play()}<span>运行回测</span>${kbd ? '<kbd>Ctrl ↵</kbd>' : ''}</button>`;
export const cancelBtn = (label = '取消') =>
  `<button class="ghost">${I.stop()}<span>${label}</span></button>`;
export const R_IDLE = status('<span class="t3">20,488 根 K 线，用时 1.9 秒</span>') + runBtn();
export const R_OPT =
  status('<span class="t3">优化 2,214 组，用时 10:09</span><a href="#" class="dn">2 组报错</a>') +
  '<button class="ghost">重新优化</button>' +
  runBtn({ kbd: false });
export const R_WF =
  status('<span class="t3">滚动 6 窗，用时 29:06</span><a href="#" class="dn">2 组报错</a>') +
  '<button class="ghost">重新优化</button>' +
  runBtn({ kbd: false });

// ---------- dock tabs
export function dockTabs({
  first = null,
  active = '报告',
  trades = 143,
  issues = 0,
  bad = false,
  right = '',
  collapsed = false,
  maxed = false,
  list = null,
} = {}) {
  const tabs = [];
  if (first) tabs.push([first, '']);
  tabs.push(
    ['报告', ''],
    ['权益', ''],
    ['成交', trades == null ? '' : ` <span class="cnt">${trades}</span>`],
    ['Pine 代码', ''],
    ['问题', ` <span class="cnt${bad ? ' bad' : ''}">${issues}</span>`],
  );
  const toggle = maxed
    ? `<button class="iconbtn" aria-label="还原面板">${I.chev(15, 'currentColor')}</button>`
    : collapsed
      ? `<button class="iconbtn" aria-label="展开面板">${I.chevUp(15)}</button>`
      : `<button class="iconbtn" aria-label="最大化面板">${I.max()}</button><button class="iconbtn" aria-label="收起面板">${I.chev(15, 'currentColor')}</button>`;
  return `<div style="height: 36px; flex: none; display: flex; align-items: stretch; gap: 2px; padding: 0 8px; background: #14171b; border-top: 1px solid #23272d; border-bottom: 1px solid #23272d">
${(list ?? tabs).map(([n, c]) => `<button class="dtab${n === active ? ' on' : ''}">${n}${c}</button>`).join('\n')}
<div style="flex: 1"></div>
<div style="display: flex; align-items: center; gap: 2px">${right}${toggle}</div>
</div>`;
}
export const exportBtn = (label = '导出 CSV') =>
  `<button class="iconbtn" aria-label="${label}">${I.dl()}</button>`;
export const compiled =
  '<span class="t3" style="font-size: 12px; display: flex; align-items: center; gap: 6px; margin-right: 8px"><span style="width: 6px; height: 6px; border-radius: 3px; background: #3fbf8a"></span>v6 已编译</span>';

// ---------- right panel tabs
export const rtabsOpt = (
  active,
  selLabel,
) => `<div style="display: flex; border-bottom: 1px solid #23272d; flex: none">
<button class="rtab${active === 0 ? ' on' : ''}">设置</button>
<button class="rtab${active === 1 ? ' on' : ''}">选中 <span class="${active === 1 ? 'am' : 't3'} num">${selLabel}</span></button>
</div>`;
export const rtabs = (
  active,
  selLabel = null,
) => `<div style="display: flex; border-bottom: 1px solid #23272d; flex: none">
<button class="rtab${active === 0 ? ' on' : ''}">参数</button>
<button class="rtab${active === 1 ? ' on' : ''}">优化</button>
${selLabel ? `<button class="rtab${active === 2 ? ' on' : ''}">选中 <span class="${active === 2 ? 'am' : 't3'} num">${selLabel}</span></button>` : ''}
</div>`;
export const aside = (
  inner,
  { w = 336, style = '' } = {},
) => `<aside style="width: ${w}px; flex: none; display: flex; flex-direction: column; background: #14171b; border-left: 1px solid #23272d; position: relative; ${style}">
${inner}
</aside>`;
export const main = (
  inner,
  { w = 1104 } = {},
) => `<main style="width: ${w}px; flex: none; display: flex; flex-direction: column; min-width: 0; position: relative">
${inner}
</main>`;

// ---------- screen, crop, page
export const screen = ({
  head,
  body,
  overlay = '',
  w = 1440,
  h = 900,
}) => `<div style="width: ${w}px; height: ${h}px; display: flex; flex-direction: column; background: #0e1013; color: #e8eaed; overflow: hidden; position: relative">
${head}
<div style="flex: 1; display: flex; min-height: 0">
${body}
</div>
${overlay}
</div>`;
export const crop = (
  inner,
  { x, y, w, h },
) => `<div style="width: ${w}px; height: ${h}px; position: relative; overflow: hidden; background: #0e1013">
<div style="position: absolute; left: ${-x}px; top: ${-y}px">
${inner}
</div>
</div>`;
export const backdrop = (
  inner,
) => `<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(6,7,9,0.62); display: flex; align-items: center; justify-content: center">
${inner}
</div>`;
export function page({ title, w, h, body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${CSS}
</helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}
