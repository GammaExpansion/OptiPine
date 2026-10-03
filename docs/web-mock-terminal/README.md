# Web mock · market terminal

Full-screen artboards for OptiPine's browser app, design direction A, "market terminal": dark
graphite with an amber accent, chart first. Every screen and state is drawn as 59 boards, each in
English and in Chinese. The English boards are the reference for the app's layout and copy, and
[WEB.md](../WEB.md) describes the behavior behind them.

```sh
node docs/web-mock-terminal/gen/build.mjs
```

The command rewrites `artboards/`: `<name>-en.dc.html` in English, `<name>.dc.html` in Chinese, and
`canvas.json`, which lays both sets out on the same grid on two canvas pages, English and Chinese.
Every number comes from seeded synthetic data (BTCUSDT 1h, 2023-01-02 → 2025-05-04), so the same
bars, trades, 2,214 optimizer trials and six walk-forward windows appear on every board. Each board
is a fixed-size page (1440 × 900 unless noted) that opens directly in a browser; the
`<script src="./support.js">` tag belongs to the design-canvas runtime and does nothing on its own.
The generated boards are excluded from Prettier; edit the generator and rebuild instead.

## Information architecture

Two pages switched from the header, never mixed on one screen:

- **Backtest** shows one fixed parameter set. The chart area is always the price chart; the dock
  under it has the tabs Report, Equity, Trades, Pine code and Issues, with equity, drawdown and a
  daily P&L calendar under Equity. Inputs and strategy properties sit in the right panel.
- **Optimize** shows only data aggregated over many parameter sets: the data range, a summary chart
  (Top 20 equity, IS vs OOS, Distribution), the leaderboard, the parameter map and sensitivity, or
  the walk-forward windows and parameter stability. Search ranges, validation and ranking sit in the
  right panel with the run block at its foot. Selecting a row opens a bar with **View backtest**,
  which opens Backtest in a preview state, and **Apply to inputs**.

Parameter maps use square cells, 16 px with a 2 px gap; an axis with more than 24 values, or more
than fit, averages adjacent values into one cell (Length 10–50: two values per cell).

## Boards

| Row                             | Boards     | Content                                                                         |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| Getting started and market data | S1–S10     | First launch, script menu, market data dialog (Binance, Yahoo, CSV, errors)     |
| Backtest                        | B1–B7      | Report, trades, Pine code, code maximized, equity, hover, indicator pane        |
| Backtest states                 | B8–B17     | Running, stale, compile and run failures, no trades, properties, input states…  |
| Optimize · Setup                | O1–O8      | Setup per validation mode, value list, sampling, range errors, objective, run   |
| Optimize · Results              | R1–R5, R2b | Summary views, no validation, seven parameters, stale settings                  |
| Optimize · Result states        | R6–R12     | Cell hover, binned cell detail, one parameter, no match, conditions, drag axis  |
| Optimize · Walk-forward         | W1–W6      | Walk-forward results, per-window view, window map, running, odd windows, anchor |
| Common                          | G1–G5      | Pane resize, tablet, phone backtest and results, component sheet                |

`Main.dc.html` and `Main-en.dc.html` are B1. Boards narrower than 1440 are crops of a full screen
that show only the region that changes.

## Languages

The generator draws each board once and `gen/en.mjs` produces the English board from it: whole text
runs and attribute values are looked up first, then patterns cover runs that carry numbers, and a
few raw-markup replacements handle words with two readings or a board that needs more room. Short
forms are preferred where space is tight (IS / OOS, combos, Max DD, PF), so every label keeps room
to spare. The build prints any text the table does not cover, so a change to a board needs its
English entry in the same edit.

## Checking layout

```sh
node docs/web-mock-terminal/gen/shot.mjs B5-en W5-en
node docs/web-mock-terminal/gen/check.mjs
```

`shot.mjs` renders boards (or `--all`, or a crop with `<board> x y w h`) with headless Chrome, Edge
or Chromium into the system temp folder; set `CHROME` to the executable if none is found.
`check.mjs` lists elements whose text overflows its box in an English board but not in the Chinese
one; `ABS=1` lists every overflow in both languages and `STRESS=0.05` widens letter spacing to find
labels with no room to spare.

The design canvas renders boards through its own runtime, which parses them differently from a
plain page: it drops `<colgroup>`, for one, which is why the build moves column widths onto the
first row's cells. To check what canvas viewers see, read `artifact-type/dc-runtime.js` from the
canvas and pass its path as `RUNTIME` to either script.

## Generator layout

| File         | Content                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| `data.mjs`   | Seeded bars, trades, trials, equity and walk-forward windows                   |
| `charts.mjs` | Base chart primitives: equity, scatter, heatmap, stability strips              |
| `x.mjs`      | Candles, square heatmaps and binning, walk-forward charts, Pine source         |
| `ui.mjs`     | Design tokens, CSS, icons, header, tabs, the page wrapper                      |
| `panels.mjs` | Chart areas, dock panels (report, trades, code), leaderboard, map, asides      |
| `equity.mjs` | The Equity dock tab                                                            |
| `agg.mjs`    | Aggregate views of the Optimize page: range bar, summary charts, selection bar |
| `over.mjs`   | Dialogs, menus, popovers, toasts, binned cell detail, one-parameter curve      |
| `sheet.mjs`  | G5 component sheet                                                             |
| `boards.mjs` | One entry per artboard, by canvas row                                          |
| `en.mjs`     | English copy table                                                             |
| `build.mjs`  | Writes the boards and `canvas.json`                                            |
| `shot.mjs`   | Renders boards to PNG                                                          |
| `check.mjs`  | Text-overflow check                                                            |

Some panel functions are left from directions the canvas no longer shows (an equity strip under
the chart, a candles / equity switch) and are not referenced by `boards.mjs`.

## Published canvas

The boards are published as one design canvas with an English and a Chinese page. Edits made in
the canvas editor are saved into the canvas, not into these files: before republishing, read the
live `project/canvas.json` and any changed boards, fold the changes into the generator, rebuild,
and publish only the files that changed. The editor re-saves `canvas.json` with `attachments`, note
`w: 240` and `maxW` capped at 8000; the build writes it that way so a rebuild does not churn it.
