# 日历输入

`calendar.json` 由项目脚本转换 TradingView 导出的独立日历探针 CSV 生成。
TradingView 导出的是 CSV，JSON 是本项目的市场输入格式。需要它的 golden
在自己的目录保存完整文件，并在 `meta.json` 中声明：

```json
{
  "session_calendar": { "file": "calendar.json" }
}
```

文件路径相对于用例目录。没有声明时不传日历；声明的文件缺失或无效时加载失败。
Loader 不按品种匹配日历，也不访问全局目录。文件和声明参与 fixture 指纹。
单个用例目录包含复现其执行所需的全部市场输入。

日历文件沿用导入器的 `schemaVersion: 1` 格式：`provenance` 记录来源，
`calendar` 包含 Unix 秒表示的覆盖范围 `from` / `to`、交易时段
`sessions`（`open`、`close`、`tradingDay`）和可选的周/月 `periods`。
Harness 只将 `calendar` 传给引擎的 `sessionCalendar` 参数。
引擎每次执行的状态独立，不读取文件或查找内部市场数据。

日历用于时间函数、默认 VWAP 重置和每日成交限额等时段相关规则。
完整覆盖范围内没有 session 表示已知休市；范围外表示没有资料，沿用传入的
固定时段和时区规则。周/月边界有各自的覆盖范围。不能从价格缺行或预期 plot
推导节假日、提前收盘或供应商边界。

## 当前采集来源

用例内的 AAPL 日历来自独立 TradingView metadata 探针，采集于
2026-09-09，图表为 `BATS:AAPL`、regular session、日线。通过
**Go to date → 1980-12-12** 加载完整历史后导出，包含截至 2026-09-08
的 11,520 个 session。仅使用探针的七个命名字段，忽略原始 CSV 中其他 study
的列；没有使用价格、指标预期、交易记录或报告指标生成日历。

当前 8 个用例中的 `calendar.json` 都是这一次采集、转换结果的逐字节相同副本。
它们用于 v5/v6 的 `I_volume`、`M_time__aapl_60`、`M_time__aapl_D` 和
`S_risk_max_intraday_filled_orders`。日历由独立 v6 探针采集，作为两版测试的
市场输入；这不代表做了 8 次采集，也不替代被测 v5/v6 脚本各自的原生结果。

这些数据记录供应商当时的历史元数据。一些较早的提前收盘没有记录，历史上
周线节假日锚点也有差异；引擎不硬编码日期或从 golden 预期值推演修正规则。
独立的周/月时间边界保留这些实测行为。

JSON 的 `provenance` 保留图表、采集时间、探针和原始导出 SHA-256。
历史 manifest 中的 `tests/calendars/tradingview-aapl.json`（曾迁至
`data/calendars/`）现在对应各用例内字节相同的 `calendar.json`。
`provenance.probe: "probe.pine"` 对应
[packages/golden/scripts/probes/calendar.pine](../../scripts/probes/calendar.pine)。
原始 manifest 和来源字段保留，不因目录迁移而改写。

## 生成与重新采集

1. 在独立的 regular-session 日线图表运行 [calendar.pine](../../scripts/probes/calendar.pine)，确认编译并执行，加载完整历史。
2. 使用 TradingView 的 **Export chart data**，选择 Unix 时间戳导出 CSV。保留原始文件、确切探针和环境记录。
3. 从项目根目录运行 [import-calendar.ts](../../scripts/import-calendar.ts)，将原生 CSV 转换为日历 JSON：

```sh
npm run build
node packages/golden/scripts/import-calendar.ts <download.csv> <calendar.json> America/New_York <UTC-export-time> <chart-url>
```

探针和 JSON 字段的对应关系如下：

| CSV 探针列 | Pine 表达式 | JSON 内容 |
|---|---|---|
| `session_open` / `session_close` | `time` / `time_close` | `sessions[].open` / `close` |
| `session_trading_day` | `time_tradingday` | `sessions[].tradingDay`，格式为 `YYYY-MM-DD` |
| `calendar_week_open` / `calendar_week_close` | `time("W")` / `time_close("W")` | `periods["1W"][].open` / `close` |
| `calendar_month_open` / `calendar_month_close` | `time("M")` / `time_close("M")` | `periods["1M"][].open` / `close` |

CSV 的图表时间列可选 Unix 秒，但这七列 Pine 输出仍以毫秒表示；导入器将它们
转换为秒，并合并重复的周/月记录。覆盖范围由首个 session 开盘至最后一个
session 开盘日期的次日零点确定；周/月的 `from` / `to` 查找范围按指定交易所
时区生成，`open` / `close` 保留探针观测的端点。JSON 还记录图表链接、导出时间、
探针名称及原始 CSV 的 SHA-256，便于追溯转换来源。

该导入器适用于 regular-session 日线导出。探针中的提前收盘展示表不影响导出
字段。引擎接口也可接收独立提供的跨日 session；这不表示当前日线导入器已采集
其他市场或交易时段。

确认来源、市场、时区、session 和覆盖范围后，将完整 JSON 放入需要它的用例，
显式声明并执行全量回归。变更日历属于 fixture 输入变更，需要说明并迁移 baseline；
不得修改原生预期数据、容差或计分规则来适配日历。
