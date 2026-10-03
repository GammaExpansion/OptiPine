# Web mock · 行情终端

Full-screen artboards for the browser app being rebuilt, direction A 行情终端 (market terminal):
dark graphite with an amber accent, chart first. This is the adopted design for the new interface;
the previous app and its design are not part of this repository. Every screen and state is drawn,
59 boards in Chinese and the same 59 in English.

```sh
node docs/web-mock-terminal/gen/build.mjs
```

The command rewrites `artboards/`: `<name>.dc.html` in Chinese, `<name>-en.dc.html` in English and
`canvas.json`, which lays both sets out on the same grid on two canvas pages, 中文 and English.
Every number comes from seeded synthetic data (BTCUSDT 1h, 2023-01-02 → 2025-05-04), so the same
bars, trades, 2,214 optimizer trials and six walk-forward windows appear on every board. Each board
is a fixed-size page (1440 × 900 unless noted) that opens directly in a browser; the
`<script src="./support.js">` tag belongs to the design-canvas runtime and does nothing on its own.
The generated boards are excluded from Prettier; edit the generator and rebuild instead.

## Information architecture

Two pages switched from the header, never mixed on one screen:

- **回测** shows one fixed parameter set. The chart area is always the price chart; the dock under
  it has the tabs 报告 / 权益 / 成交 / Pine 代码 / 问题, with equity, drawdown and a daily P&L
  calendar in 权益. Inputs and strategy properties sit in the right panel.
- **优化** shows only data aggregated over many parameter sets: the data-range bar, a summary
  chart (前 20 组权益 / 样本内 vs 样本外 / 净利润分布), the leaderboard, the parameter map and
  影响度, or the walk-forward windows and parameter stability. Search ranges, validation and
  ranking sit in the right panel with the run block at its foot. Selecting a row opens a bar with
  查看这组参数的回测 (回测 in a preview state) and 应用到参数.

Parameter maps use square cells, 16 px with a 2 px gap; an axis with more than 24 values, or more
than fit, averages adjacent values into one cell (Length 10–50: two values per cell).

## Boards

| Row             | Boards     | Content                                                                         |
| --------------- | ---------- | ------------------------------------------------------------------------------- |
| 开始与行情      | S1–S10     | First launch, script menu, market data dialog (Binance, Yahoo, CSV, errors)     |
| 回测            | B1–B7      | Report, trades, Pine code, code maximized, equity, hover, indicator pane        |
| 回测的状态      | B8–B17     | Running, stale, compile and run failures, no trades, properties, input states…  |
| 优化 · 设置     | O1–O8      | Setup per validation mode, value list, sampling, range errors, objective, run   |
| 优化 · 结果     | R1–R5, R2b | Summary views, no validation, seven parameters, stale settings                  |
| 优化 · 局部状态 | R6–R12     | Cell hover, binned cell detail, one parameter, no match, conditions, drag axis  |
| 优化 · 滚动窗口 | W1–W6      | Walk-forward results, per-window view, window map, running, odd windows, anchor |
| 通用            | G1–G5      | Pane resize, tablet, phone backtest and results, component sheet                |

`Main.dc.html` is B1. Boards narrower than 1440 are crops of a full screen that show only the region
that changes.

## English

`gen/en.mjs` translates each finished Chinese board: whole text runs and attribute values are looked
up first, then patterns cover runs that carry numbers, and a few raw-markup replacements handle
words with two readings or a board that needs more room. Short forms are preferred over faithful
translations (IS / OOS, combos, Max DD, PF), so every label keeps room to spare. The build prints
any Chinese text the table does not cover.

## Checking layout

```sh
node docs/web-mock-terminal/gen/shot.mjs B5 W5-en
node docs/web-mock-terminal/gen/check.mjs
```

`shot.mjs` renders boards (or `--all`, or a crop with `<board> x y w h`) with headless Chrome, Edge
or Chromium into the system temp folder; set `CHROME` to the executable if none is found. `check.mjs` lists elements
whose text overflows its box in an English board but not in the Chinese one; `ABS=1` lists every
overflow in both languages and `STRESS=0.05` widens letter spacing to find labels with no room to
spare.

The design canvas renders boards through its own runtime, which parses them differently from a
plain page: it drops `<colgroup>`, for one, which is why the build moves column widths onto the
first row's cells. To check what canvas viewers see, read `artifact-type/dc-runtime.js` from the
canvas and pass its path as `RUNTIME` to either script.

## Generator layout

| File         | Content                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `data.mjs`   | Seeded bars, trades, trials, equity and walk-forward windows               |
| `charts.mjs` | Base chart primitives: equity, scatter, heatmap, stability strips          |
| `x.mjs`      | Candles, square heatmaps and binning, walk-forward charts, Pine source     |
| `ui.mjs`     | Design tokens, CSS, icons, header, tabs, the page wrapper                  |
| `panels.mjs` | Chart areas, dock panels (report, trades, code), leaderboard, map, asides  |
| `equity.mjs` | The 权益 dock tab                                                          |
| `agg.mjs`    | Aggregate views of the 优化 page: range bar, summary charts, selection bar |
| `over.mjs`   | Dialogs, menus, popovers, toasts, binned cell detail, one-parameter curve  |
| `sheet.mjs`  | G5 component sheet                                                         |
| `boards.mjs` | One entry per artboard, by canvas row                                      |
| `en.mjs`     | English copy table                                                         |
| `build.mjs`  | Writes the boards and `canvas.json`                                        |
| `shot.mjs`   | Renders boards to PNG                                                      |
| `check.mjs`  | Text-overflow check                                                        |

Some panel functions are left from directions the canvas no longer shows (an equity strip under
the chart, a K 线 / 权益 switch) and are not referenced by `boards.mjs`.

## Published canvas

The boards are published as one design canvas with the pages 中文 and English. Edits made in the
canvas editor are saved into the canvas, not into these files: before republishing, read the live
`project/canvas.json` and any changed boards, fold the changes into the generator, rebuild, and
publish only the files that changed. The editor re-saves `canvas.json` with `attachments`, note
`w: 240` and `maxW` capped at 8000; the build writes it that way so a rebuild does not churn it.
