// node check.mjs [boards…]  -> elements whose content overflows their box in the English boards but not in the
// Chinese ones (same DOM path), found with headless Chrome or Edge. No args: every board.
// ABS=1 lists every overflow in both languages instead; STRESS=0.05 widens letter spacing by that many em to find
// labels with no room to spare; RUNTIME=<path to dc-runtime.js> renders through the design canvas runtime, which
// parses boards differently from a plain page (it drops <colgroup>, for one) and is what viewers of the canvas see.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.join(import.meta.dirname, '..', 'artboards');
const chrome =
  process.env.CHROME ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(fs.existsSync);
const index = JSON.parse(fs.readFileSync(path.join(root, 'canvas.json'), 'utf8'));
const PROBE = `<script>
addEventListener('load', () => setTimeout(() => {
  const pathOf = (el) => { const p = []; for (let e = el; e && e !== document.body; e = e.parentElement) p.push([...e.parentElement.children].indexOf(e)); return p.reverse().join('.'); };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    if (el.scrollWidth >= 1380 || el.clientWidth >= innerWidth - 40) continue; // page roots and crop frames
    const over = el.scrollWidth - el.clientWidth;
    if (el.clientWidth > 0 && over > 1) out.push({ p: pathOf(el), over, w: el.clientWidth, t: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 70) });
    const down = el.scrollHeight - el.clientHeight;
    if (el.clientHeight > 0 && down > 1) out.push({ p: pathOf(el) + 'v', over: down, w: 'h' + el.clientHeight, t: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 70) });
  }
  const pre = document.createElement('pre'); pre.id = '__ov'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
}, 1000));
</script>`;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/support.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(process.env.RUNTIME ? fs.readFileSync(process.env.RUNTIME) : '');
  }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) {
    res.writeHead(404);
    return res.end('nf');
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    fs
      .readFileSync(f, 'utf8')
      .replace(
        '</body>',
        (process.env.STRESS
          ? '<style>*{letter-spacing:' + process.env.STRESS + 'em !important}</style>'
          : '') +
          PROBE +
          '</body>',
      ),
  );
});
await new Promise((r) => server.listen(5398, '127.0.0.1', r));
const dump = (file, w, h) =>
  new Promise((resolve) => {
    const prof = path.join(os.tmpdir(), 'pine-mock-terminal-check-' + file);
    const p = spawn(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${w},${h}`,
      '--virtual-time-budget=6000',
      `--user-data-dir=${prof}`,
      '--dump-dom',
      `http://127.0.0.1:5398/${file}`,
    ]);
    let s = '';
    p.stdout.on('data', (d) => (s += d));
    p.on('exit', () => {
      fs.rmSync(prof, { recursive: true, force: true });
      const m = s.match(/<pre id="__ov">([\s\S]*?)<\/pre>/);
      resolve(
        m
          ? JSON.parse(
              m[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"'),
            )
          : null,
      );
    });
  });
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(index.boards)
      .map((f) => f.replace('.dc.html', ''))
      .filter((n) => !n.endsWith('-en'));
const queue = [...names],
  report = {};
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const b = queue.shift();
      const { w, h } = index.boards[`${b}.dc.html`];
      const [zh, en] = [await dump(`${b}.dc.html`, w, h), await dump(`${b}-en.dc.html`, w, h)];
      if (!zh || !en) {
        report[b] = 'probe failed';
        continue;
      }
      if (process.env.ABS) {
        const inner = (list) =>
          list.filter(
            (o) =>
              !o.p.endsWith('v') &&
              !list.some((q) => q !== o && !q.p.endsWith('v') && q.p.startsWith(o.p + '.')),
          );
        const r = [
          ...inner(zh).map((o) => `zh +${o.over}px/${o.w} ${o.t}`),
          ...inner(en).map((o) => `en +${o.over}px/${o.w} ${o.t}`),
        ];
        if (r.length) report[b] = r;
        continue;
      }
      const zp = new Map(zh.map((o) => [o.p, o.over]));
      // innermost first: drop an entry when a descendant of it is also listed
      const extra = en.filter((o) => !(zp.get(o.p) >= o.over - 1));
      const inner = extra.filter((o) => !extra.some((q) => q !== o && q.p.startsWith(o.p + '.')));
      if (inner.length) report[b] = inner.map((o) => `+${o.over}px/${o.w} ${o.t}`);
    }
  }),
);
server.close();
for (const [b, r] of Object.entries(report)) console.log(`== ${b}\n  ` + [].concat(r).join('\n  '));
console.log('boards with new overflow:', Object.keys(report).length, '/', names.length);
