# Pine Script Golden Test Suite

TradingView **Pine Script v5 / v6** 的黄金数据集（Golden Datasets）。每个用例由一段 Pine 源码和 TradingView 官方导出的原生结果组成，用作任何 Pine 解析器、指标引擎或回测器的对齐基准。

本套件只收录**数据与事实**：源码、TradingView 的编译结果、图表导出、策略报告导出，以及独立采集的必要市场输入。如何比对、容差如何设定、引擎支持哪些特性，由使用方自行决定。

---

## 1. 设计原则

1. **导出文件原样入库**：`data.csv`（Export chart data）与 `report.xlsx`（Download data as XLSX）均为 TradingView 原生导出文件，不做任何预处理或手动清洗。采集记录注明账户级别；未独立记录时如实标记，不冒充已核验 Premium。完整性核对仍须覆盖同次计算的全部历史与报告区间。
2. **TradingView 行为即真值**：`meta.json` 中记录的编译结果与导出数据以 TradingView 实际表现为准。若怀疑 TradingView 存在 Bug，也只在 `notes` 中说明，绝不修改导出文件。
3. **v5 与 v6 独立采集**：同一用例的 v5 与 v6 版本各自在对应版本下原生导出，即使文件内容恰好相同也各存一份。

日历属于独立市场输入：`calendar.json` 由日历探针的 TradingView CSV 经项目脚本转换生成，
适用的用例可各自保存同一份采集的副本；被测脚本的 v5/v6 结果仍需独立采集。

---

## 2. 目录导航

| 目录 | 内容 | 规模 | 指南 | 清单 |
|---|---|---|---|---|
| [`parse/`](./parse/) | 源码的 TradingView 编译结果：排版兼容、语法全集、编译错误、版本差异 | 143 目录（v5 72，v6 71） | [`parse/README.md`](./parse/README.md) | [`parse/INDEX.md`](./parse/INDEX.md) |
| [`indicator/`](./indicator/) | 指标与语言求值、时间与时区的逐 Bar 导出 | 39 目录（v5 16，v6 23） | [`indicator/README.md`](./indicator/README.md) | [`indicator/INDEX.md`](./indicator/INDEX.md) |
| [`strategy/`](./strategy/) | 策略撮合的逐 Bar 导出与回测报告 | 64 目录（v5 21，v6 43） | [`strategy/README.md`](./strategy/README.md) | [`strategy/INDEX.md`](./strategy/INDEX.md) |

共 246 个用例，240 个 verified、6 个 unverified；其中 parse 为 139/143 个 verified。
Parse 用例仅核对编译结果，不代表 `request.*` 的次级数据执行能力已支持。

```text
packages/golden/fixtures/
├── README.md                  # 本文件：套件说明与文件格式规范
├── docs/
│   ├── collecting-golden-sop.md   # TradingView 数据采集标准作业程序
│   └── changelog-verified.md      # 历史验证记录与用例源码修正记录
├── parse/                     # 编译结果用例（source.pine + meta.json）
│   ├── README.md / INDEX.md
│   ├── v5/                    # 72 个目录
│   └── v6/                    # 71 个目录
├── indicator/                 # 指标用例（+ data.csv）
│   ├── README.md / INDEX.md
│   ├── v5/                    # 16 个目录
│   └── v6/                    # 23 个目录
└── strategy/                  # 策略用例（+ data.csv + report.xlsx）
    ├── README.md / INDEX.md
    ├── v5/                    # 21 个目录
    └── v6/                    # 43 个目录
```

采集流程见 [`./docs/collecting-golden-sop.md`](./docs/collecting-golden-sop.md)，历史验证与源码修正记录见 [`./docs/changelog-verified.md`](./docs/changelog-verified.md)。

已发现的采集疑点及复核要求见 [`docs/known-issues.md`](./docs/known-issues.md)；这些标记不改变用例的核对状态或回归检查。

需要交易日历的用例在自身目录保存 `calendar.json`，并在 `meta.session_calendar` 中显式声明。Harness 只读取该声明，不按品种自动补齐，也不查找全局数据目录；详见[日历输入](docs/calendar-inputs.md)。

### 命名规则
- **目录名即测试 ID**，v5 与 v6 目录下同名目录为同一用例的两个版本。
- 前缀：
  - `P_fmt_*` 排版与格式、`P_syn_*` 语法全集、`P_err_*` 编译错误、`P_ver_*` 版本差异探针；
  - `I_*` 指标与语言求值特性，`M_*` 时间与时区，`A_*` 常量数值语义；
  - `S_*` 策略撮合特性，`B_*` 挂单与字符串基线。
- 同一脚本的多标的或多参数变体用双下划线后缀区分，如 `M_time__btcusdt_60`、`S_commission_slippage__pct`。
- `source.pine` 的第一个有效代码行 `//@version=N` 必须与所在目录版本一致。仅有两个例外：`P_err_no_version`（无版本声明）与 `P_err_version_4`（v4 脚本），它们放在 v5 目录只因目录必须二选一。

---

## 3. 用例文件格式

每个用例目录包含：

1. `source.pine`：被测脚本；
2. `meta.json`：品种、时区、导出信息、编译结果（parse）与核对状态；
3. `data.csv`（indicator / strategy）：TradingView 原生导出的完整历史 Bar 与全部 `plot*()` 列；
4. `report.xlsx`（strategy）：TradingView 策略报告原生 5-sheet 导出；
5. `calendar.json`（按需）：由独立 TradingView 日历探针 CSV 经 `packages/golden/scripts/import-calendar.ts` 转换生成，包含交易时段、周/月边界和来源记录；详见[生成流程](docs/calendar-inputs.md#生成与重新采集)。

采集来源、原件哈希及配对结论放在 `meta.capture`，执行所需的上下文放在
`meta.execution`。完整操作记录和导出前后两份 CSV 留在独立采集归档，
不向正式用例目录添加 notes、manifest、audit 或 diff 文件；归档不参与运行。

### 3.1 `source.pine`
被测 Pine 脚本源码。indicator / strategy 用例中的每个 `plot*()` 调用对应 `data.csv` 中的一列，按出现顺序排列。

### 3.2 `data.csv`（Export chart data，原样）
- 列 0 `time`：Bar 开盘时间，UNIX 秒时间戳（UTC）；
- 列 1~4 `open, high, low, close`：价格；
- `Volume` 列：成交量（首字母大写，TradingView 原样）。loader 按表头定位这一列，它可以是第 5 列，
  也可以出现在之后任意位置，但只能有一列；
- 第 5 列起的其余各列：每个 `plot*()` 一列，列名取自 plot title。布尔参数记录为 `1/0`，`na` 为空单元格。
- 最后一行可能是尚未收盘的实时 Bar，其 plot 列为空。

### 3.3 `report.xlsx`（Download data as XLSX，原样）
5 个工作表：`Performance`、`Trades analysis`、`Risk-adjusted performance`、`Trades`、`Properties`。
- `Trades` 表每笔交易占两行（Exit 行在 Entry 行上方）。`Date and time` 为**图表时区**的 naive datetime（Excel 序列数），需结合 `meta.chart_timezone` 转为 UTC。未平仓笔记录为 `Date and time = "Open"`、`Price = "—"`。
- `Properties` 表为两列键值对，记录导出时的策略属性与 input 设定。

### 3.4 `meta.json`（schema_version 2）

```jsonc
{
  "schema_version": 2,
  "id": "S_margin",                           // = 目录名
  "kind": "strategy",                         // "parse" | "indicator" | "strategy"
  "pine_version": 5,                          // 与目录、source 首行一致
  "description": "……",
  "tags": ["micro", "broker", "margin"],
  "source": { "origin": "micro", "author": "", "license": "", "url": "" },

  // 仅 parse 用例：TradingView Pine Editor 的编译结果
  "expect": { "compile": "error", "error": { "line": 3 } },

  // 仅 indicator / strategy 用例
  "syminfo": {
    "tickerid": "BATS:AAPL", "ticker": "AAPL", "prefix": "BATS",
    "type": "stock", "currency": "USD", "basecurrency": "",
    "timezone": "America/New_York",           // 交易所时区
    "mintick": 0.01, "pricescale": 100, "minmove": 1, "pointvalue": 1,
    "mincontract": 1,                         // 最小合约数量（加密货币可为小数）
    "session": "regular",                     // regular | extended
    "session_hours": "0930-1600",
    "description": "Apple Inc."
  },
  "timeframe": "60",                          // TradingView 周期记法："60", "D"
  "chart_timezone": "America/Los_Angeles",    // 导出时的图表时区（XLSX 时间戳基准）
  "data": {
    "file": "data.csv",
    "time_format": "unix_seconds",
    "exported_at": "2026-09-04T06:57:29Z",
    "plan": "Premium",
    "tv_release_month": "2026-09",
    "columns": ["time", "open", "high", "low", "close", "Volume", "..."]
  },
  "report": { "file": "report.xlsx", "exported_at": "2026-09-04T06:57:36Z" },   // 仅 strategy
  "session_calendar": { "file": "calendar.json" }, // 可选；文件位于本用例目录
  "inputs": {},                               // 导出时覆盖的 input 值，空表示默认

  "verified": true,                           // 是否已与 TradingView 实际输出核对
  "notes": ""
}
```

`verified: false` 表示该用例尚未纳入通过的回归门禁，原因可能是来源待确认，
也可能是已确认的原生结果仍与引擎不一致；具体原因见 `notes` 和[已知问题](docs/known-issues.md)。

未声明 `session_calendar` 就不向引擎传日历；声明后文件缺失或格式无效会导致加载失败。
日历文件和声明均参与 fixture 指纹；来源、格式与采集方法见[日历输入](docs/calendar-inputs.md)。

可选 `execution` 记录经过独立采集确认的 Replay 定位边界：

```json
{
  "mode": "replay-selection",
  "selected_at": "2026-09-04T00:00:00Z",
  "paused": true,
  "stepped": false
}
```

分钟周期要求最后行情 bar 结束时间恰为选择时间。另支持明确 UTC 时区的
`W` / `1W`：所有行情 bar 均在周一 00:00 UTC 开盘，选择时间恰为末根开盘后一周。
两者都只适用于独立记录了选择时间及暂停状态的 strategy 采集。
`stepped` 仅在已确认是否推进时填写；旧记录未说明时可省略，不能补成 `false`。
`stepped: true` 当前不支持。执行上下文直接由 metadata 提供，不读取归档中的 notes。
它表示该定位边界尚未进行末根常规策略收盘计算，不将 Replay 当作 realtime。
全部 OHLCV 保留；未知 barstate、额外 tick/fill/on-close 模式显式报告 unsupported。
输入来自采集上下文和行情时间，不从空 plot 或预期指标反推；详情见
[兼容性说明](../../../docs/COMPATIBILITY_NOTES.md)。

可选 `capture` 保存简短的来源记录，例如 `files` 中原件的 SHA-256、
`paired_exports` 中 CSV → XLSX → CSV 的导出时间与逐字节配对结果、
独立市场输入的出处，以及归档位置。它不替代 `syminfo`、`inputs`、`settings`
或 `execution`，也不从来源文字推导引擎输入。
