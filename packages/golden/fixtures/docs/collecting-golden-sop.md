# TradingView 黄金测试数据采集标准作业程序 (SOP)

[← 返回测试集 README.md](../README.md)

本指南规范了从 TradingView 官方平台采集并导出黄金数据集（`data.csv` 与 `report.xlsx`）的标准作业流程（SOP），以确保入库测试数据的纯净性、零污染与版本可追溯性。

需要日历的用例另行采集独立探针 CSV，再由项目脚本转换为 `calendar.json`；
生成步骤及来源记录见[日历输入](calendar-inputs.md#生成与重新采集)。

---

## 🛠️ 准备条件与环境要求

1. **账号与历史范围**：记录实际账户级别；未核实就记为“未记录”，不要固定填 Premium。核对本次计算的完整历史范围；策略报告的 **Backtesting range** 应与图表的计算历史和终点对应，**Trading range** 是实际交易区间，首笔交易不必发生在首根行情上；
2. **数据零修改原则**：导出的 `data.csv` 与 `report.xlsx` 直接原样放入对应目录，严禁通过 Excel 或文本编辑器手动打开并保存（防止行尾符或科学计数法被污染）；
3. **稳定配对导出**：策略按 CSV → XLSX → CSV 的顺序导出，期间保持源码、输入、设置、历史范围和终点不变。核对前后两份 CSV 逐字节一致，且报告 Backtesting range 与 CSV 对应（换算到同一时区）；文件名或相近的导出时间不能证明快照配对。若不一致，保留原件并记录，不自行拼接或修补。
4. **交付与入库分开**：先将原生文件、实际使用的源码副本和采集记录保存到独立归档或忽略的 `.golden/captures/`，记录 SHA-256。核实后再正式入库；修订已有 fixture 时说明来源、覆盖变化及 baseline 迁移，保留旧证据。正式用例只保存源码、metadata、原生导出和可选日历；来源、配对事实和关键异常写入 `meta.capture` / `meta.notes`，执行上下文写入 `meta.execution`。完整 notes、manifest 和前后配对原件留在归档，不添加为正式用例文件；历史路径按[归档说明](known-issues.md#历史证据)解析。

---

## 📋 标准化采集四步法 (4-Step Pipeline)

```
[步骤 1: 图表就绪] ──> [步骤 2: 全量历史滚动] ──> [步骤 3: 导出 CSV] ──> [步骤 4: 策略配对导出]
   核对品种/时区            向左滚动至无法加载        选择 UNIX 秒格式          下载原生 XLSX，再导出 CSV
```

### 步骤 1：图表环境准备
1. 打开指定的标的与周期（如 `BATS:AAPL` 1h 或 `BINANCE:BTCUSDT` 1h）；
2. **环境核对**：记录图表时区、普通蜡烛图、分红复权和 Regular / ETH 设置；日线若不提供 Session 选项，如实记为不可选。标题与导出对话框的数据源不同时分别记录。策略另记录 Deep Backtesting 与 Bar Magnifier 状态；启用时不能假定普通图表 CSV 已包含全部计算输入；
3. **加载目标脚本**：使用独立图表，仅应用目标脚本；v5/v6 各自粘贴对应 `source.pine` 原文，确认 Pine Editor 编译成功并实际执行。只看脚本标题或图表上已有同名指标不能证明源码归属。保留确切源码副本；编译失败时记录完整错误和行号，不修改源码绕过，也不把仅有空 Plot 的导出当作执行成功。

### 步骤 2：全量加载历史 Bar
1. 持续向左滚动图表或使用快捷键向左加载历史，直至左侧不再出现新的 Bar（确保 `bar_index = 0` 成功加载进内存）；
2. 记录最后一根行情时间、导出时间（含时区），以及刷新和 Replay 的实际操作。普通历史基线优先在收盘后重新加载并导出；若专门核实实时或缓存状态，先保留原状态和导出，再刷新。若使用 Replay，记录选择时间、实际末根、是否推进及暂停状态。不要从输出列反推这些操作或尾部执行状态；
3. 保留全部已加载行，包括首段预热缺失和末根空脚本输出；发现数据从计算中途开始就记录该限制，不能用观察到的仓位、计数器或指标值填充引擎初始状态。

### 步骤 3：导出行情与观测列 (`data.csv`)
1. 点击图表右上方的菜单按钮（汉堡菜单 $\equiv$ 或三个点），选择 **Export chart data...**；
2. **时间格式选项**：**必须选择 UNIX 时间戳（UNIX timestamp, seconds）**，严禁选择 ISO 格式；
3. 点击导出，将原生文件保存到本次 capture 目录。记录实际来源、首末时间、行数和列名；不通过重新保存来重命名文件。
4. 若脚本输出 `bar_index`，直接检查下载文件首行索引为 0、后续索引连续（独立记录的 Replay 末行可为空）。不能只凭图表已滚到左侧就认定导出完整。刷新、切换周期或重新应用脚本后重新核验；发现截断时保留并标记原件，在新目录补采。账户可加载历史上限和原生行情缺口如实记录。

### 步骤 4：导出策略回测报告 (`report.xlsx`) —— *仅 Strategy 用例*
1. 点击图表底部的 **Strategy Tester**（策略测试器）标签页；
2. 切换至 **Overview** 或 **List of Trades**，点击右上角 **Download data as XLSX** 按钮；保留原生工作表和指标名称，即使新版界面与旧 fixture 不同；
3. 将原生工作簿保存到本次 capture 目录，然后再次导出 CSV 完成配对核查。报告 Properties 中的设置和回测范围须与采集记录一致。
4. **属性复原**：若该用例在 Properties 中调整过佣金、滑点或杠杆，导出完成后务必复原。

---

## ⚙️ Properties 参数配置核对表

若测试用例涉及特定撮合环境测试，必须在导出前进入策略设置（Settings $\to$ Properties）进行精确设置：

| 测试用例 Bundle | Properties 必调参数项 | 预期数值 / 选项 |
|---|---|---|
| `S_commission_slippage__pct` | Commission | `0.1 %` (percent) |
| `S_commission_slippage__per_contract` | Commission | `0.05 USD per contract` |
| `S_commission_slippage__per_order` | Commission | `1 USD per order` |
| `S_commission_slippage__slip3` | Slippage | `3 ticks`（Commission 设为 0） |
| `S_margin` | Margin / Leverage | Long/Short leverage 设为 `4x`（保证金 25%） |
| `S_calc_on_order_fills` | Script execution | 勾选 `On bar close, On order fill` |
| `B_orders_strings__delay` | Order execution delay | `One tick` |
| `B_orders_strings__none` | Order execution delay | `None` |

---

## 📝 回填与校准 `meta.json`

采集完成后，须根据实际导出文件更新 `meta.json`：
1. **时间与环境标记**：
   - `data.exported_at`：记录当前导出的 UTC ISO 时间（如 `"2026-09-04T18:00:00Z"`）；
   - `data.plan`：按实际记录填写；未核实时填写 `"unrecorded"` 并说明；
   - `data.tv_release_month`：当前 TradingView 发布月（如 `"2026-09"`）。
2. **标的合约信息的独立来源**：
   - 为 `meta.syminfo` 记录独立来源，例如报告 Properties、交易所规格或单独的 metadata 探针，并保留版本、标的和原生文件。不得只读取被测 fixture 的期望输出列来设定引擎输入；数量步长也不能由价格 tick 推导。
   - 依赖交易时段或周期边界的用例，运行独立日历探针并从 TradingView 导出 CSV，经 `packages/golden/scripts/import-calendar.ts` 转换后在用例内保存 `calendar.json`，设置 `session_calendar: { "file": "calendar.json" }`。保留原始 CSV 及 SHA-256，确认品种、时区、session 和覆盖范围适用；详见[日历采集说明](calendar-inputs.md)。不得从预期指标反推日历，也不依靠其他用例或全局目录提供输入。
3. **已有用例的修订**：
   - 源码、原生数据或 report schema 改变时，列出旧新 hashes、检查项映射和覆盖变化，独立 review 后显式迁移 baseline。不得静默修改 `verified`、删除失败项或放宽比较规则。
