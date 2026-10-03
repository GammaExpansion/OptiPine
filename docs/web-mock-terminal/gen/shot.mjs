// node shot.mjs <board> [...]   |   node shot.mjs --all   |   node shot.mjs <board> x y w h [scale]
// Renders artboards from ../artboards with headless Chrome or Edge into <tmp>/pine-mock-terminal-shots (or SHOTS).
// RUNTIME=<path to dc-runtime.js> serves the design canvas runtime as support.js, so boards render as on the canvas.
import { spawn } from 'node:child_process';
import os from 'node:os';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', 'artboards');
const shots = process.env.SHOTS ?? path.join(os.tmpdir(), 'pine-mock-terminal-shots');
fs.mkdirSync(shots, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(root, 'canvas.json'), 'utf8'));
const chrome =
  process.env.CHROME ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(fs.existsSync);

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/support.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(process.env.RUNTIME ? fs.readFileSync(process.env.RUNTIME) : '');
  }
  if (p.startsWith('/_zoom')) {
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(
      `<!doctype html><html><body style="margin:0;overflow:hidden;background:#888"><iframe src="/${q.get('b')}.dc.html" style="position:absolute;left:${-q.get('x')}px;top:${-q.get('y')}px;width:${q.get('bw')}px;height:${q.get('bh')}px;border:0"></iframe></body></html>`,
    );
  }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end('nf');
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(5397, '127.0.0.1', r));

const args = process.argv.slice(2);
const shoot = (url, w, h, out, scale = 1) =>
  new Promise((resolve) => {
    const p = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--force-device-scale-factor=${scale}`,
        `--window-size=${w},${h}`,
        '--virtual-time-budget=8000',
        `--user-data-dir=${path.join(shots, '_profile_' + path.basename(out, '.png'))}`,
        `--screenshot=${out}`,
        url,
      ],
      { stdio: 'ignore' },
    );
    p.on('exit', (c) => {
      fs.rmSync(path.join(shots, '_profile_' + path.basename(out, '.png')), {
        recursive: true,
        force: true,
      });
      resolve(c);
    });
  });
const size = (b) =>
  index.boards[`${b}.dc.html`] ?? index.boards[`${b.replace(/-en$/, '')}.dc.html`];
if (args.length >= 5 && !isNaN(+args[1])) {
  const [b, x, y, w, h, s = 1] = args;
  const out = path.join(shots, `${b}-${x}-${y}.png`);
  await shoot(
    `http://127.0.0.1:5397/_zoom?b=${b}&x=${x}&y=${y}&bw=${size(b).w}&bh=${size(b).h}`,
    +w,
    +h,
    out,
    +s,
  );
  console.log(out);
} else {
  const names =
    args[0] === '--all' ? Object.keys(index.boards).map((f) => f.replace('.dc.html', '')) : args;
  const scale = +process.env.SCALE || 1;
  const queue = [...names];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const b = queue.shift();
        const { w, h } = size(b);
        await shoot(
          `http://127.0.0.1:5397/${b}.dc.html`,
          w,
          h,
          path.join(shots, `${b}.png`),
          scale,
        );
      }
    }),
  );
  console.log('shot', names.length);
}
server.close();
