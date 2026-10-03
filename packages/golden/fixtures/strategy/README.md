# Strategy 用例指南

[← 返回测试集导航](../README.md)

Strategy 用例记录 TradingView 撮合引擎（Broker Emulator）在订单生命周期、撮合优先级、持仓计算与报表指标上的真实表现：每根 Bar 的状态列随图表导出，逐笔成交与汇总指标随策略报告导出。

完整目录清单请参阅：[**`INDEX.md`**](./INDEX.md)。

---

## 📊 测试集规模与覆盖

- **用例总数**：共 64 个独立测试目录（`v5/*` 21 个，`v6/*` 43 个），62 个 verified、2 个 unverified。
- **版本隔离**：v5 与 v6 同源转换版本行，各自独立在 TradingView 原生导出，不进行跨版本复用。
- **文件组成**：已完成采集的测试目录包含以下 4 件套：
  - `source.pine`：测试策略源码（固定周期调度、无指标依赖）
  - `meta.json`：测试元数据（品种、时区、导出信息与核对状态）
  - `data.csv`：TradingView 图表导出的完整历史 Bar 数据（含逐 Bar 状态监控 plot 列）
  - `report.xlsx`：TradingView 策略报告原生 5-sheet 导出（Performance, Trades analysis, Risk-adjusted performance, Trades, Properties）
- **核对状态**：62 组完整通过。周线连续亏损补采确认了全量、部分平仓与固定数量风险订单共同成交的行为；两组仅由风控平仓的用例只有 Sharpe、Sortino 仍不一致，保留为 unverified，详见[已知问题](../docs/known-issues.md)。

> [!NOTE]
> `meta.json` 中的 `verified: true` 表示测试数据已完成与 TradingView 官方输出的完整性比对与交叉审计。

---

## 🧭 模块分类与测试矩阵

为避免单个复杂策略中多特性交织导致难以归因，所有用例均按特性深度隔离为 7 大模块：

### 1. 挂单生命周期与挂单撮合 (Order Lifecycle)
| 用例 Bundle | 核心测试问题 | 关键断言点 |
|---|---|---|
| `S_pending_entries` | 市价上下两侧挂单如何触发；同 ID 改单何时生效；撤单与平仓联动 | • `limit / stop / stop-limit` 触发条件<br>• `stop-limit` 的 `limit > stop`（触发即成交）与 `limit < stop`（触发后等回调）<br>• 平仓后 Exit 单自动作废（防幽灵成交 `GhostExit`） |
| `B_orders_strings__delay`<br>`B_orders_strings__none` | 订单价格取整方向与下单延迟（Probe B 基线） | • `Order execution delay`（One tick vs None）成交时点<br>• `str.tostring / str.format` 在 Trades.Signal 中的原始字符串对齐 |
| `S_limit_verification__2`（v6） | 两 tick 限价验证 | 多空挂单价格验证、开盘跳空价格改善；源常量 2 与报告原始标签分开记录 |
| `S_limit_verification__0`（v6） | 不启用限价验证的对照组 | Properties 显式覆盖为 Requested price；原生报告共同确认 N=0 |
| `S_limit_verification__1`（v6） | 一 tick 限价验证 | 独立源码只改验证常量为 1；N=1 与 N=2 原生报告标签相同，以源码与采集记录区分 |
| `S_limit_verification_marketable__2`（v6） | 可立即成交的两 tick 限价单 | 多空限价单与市场价格的关系、验证条件和开盘成交价格 |
| `S_limit_verification_stop_limit__2`（v6） | stop-limit 激活后的两 tick 验证 | stop 激活前不可成交，激活后需满足限价验证 |
| `S_limit_verification_exit__2`（v6） | 两 tick 限价退出 | 开仓后激活的退出单、已可成交价格改善 |

### 2. 出场单与括号单语义 (Exits & Brackets)
| 用例 Bundle | 核心测试问题 | 关键断言点 |
|---|---|---|
| `S_exit_brackets` | 止损/止盈同时挂出时的撮合竞争；相对参数与绝对参数优先级 | • 0.15% 紧括号单在单 Bar 内同时满足时的 4-tick 路径竞争<br>• **v5 vs v6 关键差异**：`profit/loss` 与 `limit/stop` 并存时，v5 绝对价优先，v6 先触发优先 |
| `S_exit_partial` | 部分出场数量分配与订单关联覆盖 | • 预留股数（如 19+20，第二个仅剩 1 股）<br>• `qty_percent` 按比例分批平仓<br>• 无 `from_entry` 的 Exit 对后续 Entry 的持续绑定 |
| `S_trailing` | 移动止损与跟踪止损点位计算 | • `trail_price` / `trail_points` + `trail_offset` 多空激活与跟随<br>• 按 High/Low 极值追踪与 4-tick 路径假设的耦合 |
| `S_close_variants` | 平仓 API 全家族行为与默认文案 | • `close(id)` 无注释时的默认 Signal 文案<br>• `qty` 与 `qty_percent` 部分平仓<br>• `immediately=true` 强制即时成交时点 |

### 3. 加仓与多笔订单匹配模式 (Pyramiding & Matching Rules)
| 用例 Bundle | 核心测试问题 | 关键断言点 |
|---|---|---|
| `S_pyramiding_fifo` | Pyramiding 上限约束与 FIFO 平仓顺序 | • `pyramiding=3` 时第 4 笔 Entry 被静默忽略<br>• `close("E2")` 在 FIFO 规则下的实际出场匹配序列 |
| `S_pyramiding_any` | ANY 规则下的指定单平仓 | • `close("E2")` 在 ANY 规则下直接精准锁定并平掉指定 Entry 单 |

### 4. 费率、滑点与保证金杠杆 (Economics & Margin)
| 用例 Bundle | 核心测试问题 | 关键断言点 |
|---|---|---|
| `S_commission_slippage__*` | 佣金计费模式与滑点应用范围 | • 4 种模式：Base(0/0)、0.1% 百分比、0.05 USD/股、1 USD/单<br>• Market/Stop 吃滑点，Limit 挂单不吃滑点<br>• 进出场双边佣金计费基数核算 |
| `S_margin` | 4x 杠杆（25% 保证金）与强制平仓 | • 保证金追缴（Margin Call）触发门槛与逐 Bar `margin_liquidation_price`<br>• 强平笔数、强平数量与破产保护机制 |

### 5. 事件驱动与重算触发 (Calculation Triggers)
| 用例 Bundle | 核心测试问题 | 关键断言点 |
|---|---|---|
| `S_calc_on_order_fills` | 订单成交触发的盘中重算机制 | • 盘中单 Bar 执行次数（`calcs_on_bar`）及 4 次上限截断<br>• 重算时看到的 OHLC 切片与仓位瞬时状态<br>• 重算内提交的市价单在哪个 Tick 撮合成交 |

### 6. 风险控制规则 (Risk Management)
| 用例 Bundle | 核心测试问题 | 关键断言点 |
|---|---|---|
| `S_risk` (兼容总包) | 综合风控基线 | 同时激活三种风控规则，保留拆分前的历史基线 |
| `S_risk_allow_entry_in` | 单向开仓风控 | `allow_entry_in(long)` 下持多时做空变平仓；空仓做空被拒绝 |
| `S_risk_max_position_size` | 最大持仓尺寸截断 | 40 股申报被截断至 25 股上限；满仓后后续 Entry 与 Order 处理 |
| `S_risk_max_intraday_filled_orders` | 日内成交笔数风控 | 单日成交达上限（3 笔）后阻断后续申报（含 close_all）；隔夜跨日恢复 |
| `S_risk_max_drawdown__cash`（v6） | 现金回撤 100 | 已实现余额回撤触发永久停机；浮盈浮亏单独观察 |
| `S_risk_max_intraday_loss__cash`（v6） | 日内现金亏损 100 | 相对交易日起始净值的亏损触发强平，下一交易日恢复 |
| `S_risk_max_cons_loss_days__2`（v6） | 连续两个亏损日 | 按完整交易日累计已实现损益，达到阈值后永久停机 |
| `S_risk_max_cons_loss_days__1`（v6） | 一个亏损日 | 显式覆盖阈值为 1，首个完整亏损交易日后永久停机；独立采集，与两日阈值对照 |
| `S_risk_max_drawdown__percent`（v6） | 百分比回撤 1% | 已实现余额相对最高值的回撤触发永久停机；浮盈浮亏不触发 |
| `S_risk_max_intraday_loss__percent`（v6） | 日内百分比亏损 1% | 相对交易日起始净值的亏损触发强平；当日已实现盈利可抵消后续浮亏 |
| `S_risk_limits__control`（v6） | 风控对照组 | 相同市场与调度，风控阈值设为不可触及；与各风控模式独立原生导出比较 |
| `S_risk_max_intraday_loss__cash_march` / `__cash_april`（v6） | 风险报表比率区间边界 | 独立三月、四月终点导出；验证 Sharpe/Sortino 按交易区间选择日度或月度观察 |
| `S_risk_max_intraday_loss__cash_weekly`（v6） | 周线现金亏损风控 | 每根周线作为风险周期；负期初净值暂停现金阈值，恢复正期初净值后重新生效 |
| `S_risk_max_cons_loss_days__2_weekly`（v6） | 周线连续亏损日 | 跨周期浮亏触发停机；计划全量平仓与固定数量风险订单在同一开盘成交并留下反向仓位，完整序列、交易与报表已验证 |
| `S_risk_max_cons_loss_days__full_close_2_weekly` / `__partial_close_2_weekly`（v6） | 同刻全量／部分平仓 | 原持仓 2，计划平仓 2／1 后固定数量风险订单卖出 2，分别留下 -2／-1；全部序列、交易和指标通过 |
| `S_risk_max_cons_loss_days__hold_1_weekly` / `__hold_2_weekly`（v6） | 持仓跨一个／两个亏损周期 | 分别在 2024-01-15／01-22 风控平仓，后续停机；序列与成交通过，Sharpe、Sortino 原生为空而引擎为数值，暂未 verified |

### 7. 标的精度与数量最小步长 (Asset Sizing)
| 用例 Bundle | 核心测试问题 | 关键断言点 |
|---|---|---|
| `S_sizing_crypto` | 加密货币高精度与极小数量步长 | • 小数仓位（0.0123456 BTC）舍入与截断规则<br>• 低于 `syminfo_mincontract`（如 1e-7）极小订单的跳过行为 |

---

## 📐 核心设计约定 (Design Conventions)

为了让每个用例只暴露一种撮合行为，不受技术指标误差或数据波动干扰，Strategy 用例遵循以下约定：

1. **确定性调度**：
   交易信号依赖 bar 索引和显式起点，不依赖 `ta.*` 指标。周期用例重复订单序列，持仓探针则只在指定索引操作。
2. **状态隔离按用例目的决定**：
   基础周期用例在周期末平仓撤单；风险探针保留跨周期持仓或永久停机，以观察其后续影响。
3. **可观测状态**：
   导出索引、持仓、净值、浮盈亏、已实现损益和交易计数等相关列；具体列名和数量以各用例源码及 metadata 为准。
4. **显式配置（Explicit Properties）**：
   代码中的 `strategy()` 参数全部显式书写；TradingView 图表 Properties 必须严格按照配置清单设置，防止默认设置篡改测试语义。

---

## 📋 TradingView 采集配置标准操作 (SOP)

采集测试数据时，请严格遵守以下图表与 Properties 设定：

| 测试用例 Bundle | 目标图表 (Symbol / TF) | TradingView Properties 必调参数 |
|---|---|---|
| 基础多数用例 (`S_pending_entries`, `S_exit_*`, `S_trailing`, `S_pyramiding_*`, `S_close_variants`) | BATS:AAPL 1h | 保持默认（无特殊修改） |
| `S_commission_slippage__base` | BATS:AAPL 1h | Commission = 0, Slippage = 0 |
| `S_commission_slippage__pct` | BATS:AAPL 1h | Commission = `0.1 %` (percent) |
| `S_commission_slippage__per_contract` | BATS:AAPL 1h | Commission = `0.05 USD per contract` |
| `S_commission_slippage__per_order` | BATS:AAPL 1h | Commission = `1 USD per order` |
| `S_commission_slippage__slip3` | BATS:AAPL 1h | Slippage = `3 ticks`, Commission = 0 |
| `S_margin` | BATS:AAPL 1h | Long / Short leverage = `4x`；确认报告中 Margin calls > 0 |
| `S_calc_on_order_fills` | BATS:AAPL 1h | Script execution 勾选 `On bar close, On order fill` |
| 基础 `S_risk`、`S_risk_allow_entry_in`、`S_risk_max_position_size`、`S_risk_max_intraday_filled_orders` | BATS:AAPL 1h | 默认设置 |
| 账户风险及连续亏损隔离探针 | BINANCE:BTCUSDT 1h / 1W | 按各用例 `meta.inputs`、`meta.settings` 和 `meta.execution` 设置 |
| `S_sizing_crypto` | BINANCE:BTCUSDT 1h | 默认设置；`mincontract` 来自独立元数据探针，`mintick` 等由报告 Properties 确认；来源见 `meta.capture` |
| `B_orders_strings__delay` | BATS:AAPL 1h | Order execution delay = `One tick` |
| `B_orders_strings__none` | BATS:AAPL 1h | Order execution delay = `None` |

### 标准导出流程
1. 将图表滚动至最左侧，确保全部历史数据加载完毕（`bar_index = 0`）；
2. 点击 **Export chart data**（选择 UNIX 时间格式），保存为 `data.csv`；
3. 打开策略测试器报告，点击 **Download data as XLSX**，保存为 `report.xlsx`；
4. 再次导出 CSV，核对前后两份逐字节一致，且报告 Backtesting range 与原生 CSV 对应；保持源码、输入、设置、历史和终点不变。改动过 Properties 的变体采集完毕后务必复原。详细规范请参见 [**`collecting-golden-sop.md`**](../docs/collecting-golden-sop.md)。

---

## ⚠️ 关键边界与已知注意事项

> [!WARNING]
> **Margin Call 强平覆盖率**：
> 在 AAPL 1h 周期中，由于杠杆持仓仅持续 18 根 Bar，正常行情下较少触发爆仓。全量 11 年历史中仅在极端行情（如 2020 年 3 月）发生过几次。若换用较短历史区间导致 Margin calls = 0，应把 `default_qty_value` 提升至 400 重新导出，确保触发至少 1 次强平。

> [!NOTE]
> **`calc_on_order_fills` 重算行为**：
> TradingView 限制每根 Bar 内部最多重算 4 次。重算中发出的平仓单可能在同一 Bar 的下一个 Tick 撮合，也可能顺延至下一根 Bar 的 Open 撮合，两者在不同极端行情下均属于合法表现。

> [!NOTE]
> **`S_sizing_crypto` 极小单判定规则**：
> 若订单数量小于最小允许步长（`syminfo_mincontract`），TradingView 会直接跳过该笔订单。此时在 Trades 记录中该周期只会出现两笔成交。
