// node build.mjs  ->  ../artboards/*.dc.html + canvas.json
// Every board is written twice: <name>.dc.html in Chinese (the 中文 page) and <name>-en.dc.html through the
// copy table in en.mjs (the English page), at the same place on the canvas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rows } from './boards.mjs';
import { page } from './ui.mjs';
import { toEnglish, enTitle, missing } from './en.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'artboards');
fs.mkdirSync(out, { recursive: true });

// The canvas runtime parses each artboard with the table tags renamed but not <colgroup>/<col>, so the parser
// drops those and every column width is lost. Move the widths onto the cells of the table's first row.
function colsToCells(html) {
  return html.replace(
    /<colgroup>([\s\S]*?)<\/colgroup>([\s\S]*?<tr[^>]*>)([\s\S]*?)<\/tr>/g,
    (all, cols, mid, row) => {
      const widths = [...cols.matchAll(/<col(?: style="width: (\d+)px")?>/g)].map((m) => m[1]);
      let k = 0;
      row = row.replace(/<(th|td)(\s[^>]*)?>/g, (tag, name, attrs = '') => {
        const w = widths[k++];
        if (!w) return tag;
        return /style="/.test(attrs)
          ? `<${name}${attrs.replace('style="', `style="width: ${w}px; `)}>`
          : `<${name}${attrs} style="width: ${w}px">`;
      });
      return mid + row + '</tr>';
    },
  );
}

const boards = {},
  order = [],
  notes = {};
const boardsEn = {},
  orderEn = [],
  notesEn = {};
const enName = (t) =>
  t.replace(/^([A-Z]\d+b? )?(.*)$/, (a, code = '', rest) => code + enTitle(rest));
let y = 0;
rows.forEach((r, k) => {
  let x = 0,
    maxH = 0;
  for (const b of r.boards) {
    const html = page({ title: b.title.replace(/^[A-Z]\d+ /, ''), w: b.w, h: b.h, body: b.html });
    const file = `${b.name}.dc.html`,
      fileEn = `${b.name}-en.dc.html`;
    fs.writeFileSync(path.join(out, file), colsToCells(html));
    fs.writeFileSync(path.join(out, fileEn), colsToCells(toEnglish(html, b.name)));
    boards[file] = { x, y, w: b.w, h: b.h, title: b.title };
    boardsEn[fileEn] = { x, y, w: b.w, h: b.h, title: enName(b.title), page: 'en' };
    order.push(file);
    orderEn.push(fileEn);
    x += b.w + 80;
    maxH = Math.max(maxH, b.h);
  }
  // the canvas editor saves title notes with w 240 and maxW capped at 8000; write them that way
  const note = { x: 0, y: y - 300, kind: 'title1', maxW: Math.min(8000, x - 80), w: 240 };
  notes[`row${k + 1}`] = { ...note, text: r.title };
  notesEn[`en-row${k + 1}`] = { ...note, text: enTitle(r.title), page: 'en' };
  y += maxH + 420;
});
const mainFirst = (main) => (a, b) => (a === main ? -1 : b === main ? 1 : 0);
order.sort(mainFirst('Main.dc.html'));
orderEn.sort(mainFirst('Main-en.dc.html'));

const indexPath = path.join(out, 'canvas.json');
const prev = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : null;
const index = {
  v: 3,
  attachments: prev?.attachments ?? {},
  boards: { ...boards, ...boardsEn },
  createdOnFiles: prev?.createdOnFiles ?? {
    v: 1,
    at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  },
  designSystems: [],
  launch: { view: 'canvas' },
  notes: { ...notes, ...notesEn },
  order: [...order, ...orderEn],
  pages: [
    { id: 'zh', name: '中文' },
    { id: 'en', name: 'English' },
  ],
  title: 'Pine Optimizer · 行情终端全屏设计',
};
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
const kb = Math.round(
  index.order.reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0) / 1024,
);
console.log(order.length, 'boards ×2 languages;', rows.length, 'rows;', kb, 'KB');
if (missing.size) console.log('untranslated', missing.size, JSON.stringify([...missing], null, 0));
