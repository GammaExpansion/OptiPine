# README screenshots

These images are renders of the [design mock](../web-mock-terminal), which the app follows.
The boards use seeded synthetic data: Trend Breakout on BTCUSDT 1h, 2023-01-02 → 2025-05-04.
The Backtest hero uses Length 20; the optimizer shows 2,214 trials and walk-forward has six windows.
The displayed results and durations are part of the mock, not measurements from the app.

From the repository root, with Node.js 24.5 or newer and Chrome, Edge or Chromium installed:

```sh
npm run screenshots
```

The [README renderer](../web-mock-terminal/gen/readme-shots.mjs) invokes
[`shot.mjs`](../web-mock-terminal/gen/shot.mjs) for exactly the six boards below. It uses a temporary
profile and output folder, a free localhost port, and device scale 1, then writes losslessly
optimized PNGs here. Set `CHROME` to the browser executable if it is not found automatically.
In a container that cannot launch Chrome's sandboxed subprocesses, set `CHROME_NO_SANDBOX=1`.
No app server, package build or market data is needed. The boards load their fonts from Google
Fonts, so rendering needs access to that service; browser and font versions can affect pixels.

| Image                 | Board     | View                                                           | Dimensions |
| --------------------- | --------- | -------------------------------------------------------------- | ---------- |
| `backtest.png`        | `Main-en` | English chart, plots, trade markers and Report (B1)            | 1440 × 900 |
| `optimize.png`        | `R1-en`   | Top 20 equity, leaderboard, map, sensitivity, selection        | 1440 × 900 |
| `walk-forward.png`    | `W2-en`   | English per-window IS / OOS equity, window table and stability | 1440 × 900 |
| `backtest-zh.png`     | `Main`    | Chinese chart, plots, trade markers and Report (B1)            | 1440 × 900 |
| `optimize-zh.png`     | `R1`      | Chinese Top 20 equity, leaderboard, map and sensitivity        | 1440 × 900 |
| `walk-forward-zh.png` | `W2`      | Chinese per-window IS / OOS equity, window table and stability | 1440 × 900 |

Compression uses Node's zlib to repack PNG data without changing any pixels or colour metadata.
For Chrome's RGB/RGBA output, it also tries reversing the row filters and keeps the smaller stream.
The command validates PNG checksums and dimensions and enforces less than 400 KB per image and
1.2 MB overall before replacing the images. There is no added image dependency.

If the mock generator changes, rebuild its boards first:

```sh
node docs/web-mock-terminal/gen/build.mjs
npm run screenshots
```

Verification:

```sh
node --test docs/web-mock-terminal/gen/readme-shots.test.mjs
npm run format:check
```

Open all six images after regeneration to review the layout and text.
