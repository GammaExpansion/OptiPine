# Strategy 层测试用例清单 (INDEX)

[← 返回 strategy/README.md](./README.md) | [返回测试集导航](../README.md)

本清单收录 Strategy 撮合层共 64 个独立测试目录（v5 21 个，v6 43 个）。新增日期与交易类型用例已完成原生配对采集并全部匹配；原有 2 个周线持仓探针仅 Sharpe、Sortino 尚未匹配，保留为 unverified。

---

## 1. 挂单与基础撮合 (Order Lifecycle & Probe B)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `S_pending_entries` | v5 / v6 | BATS:AAPL 60 | 18 | • limit / stop / stop-limit 在市价两侧的触发与成交条件<br>• stop-limit 的 limit > stop（触发即成）与 limit < stop（等回调）<br>• 挂单跨 Bar 保持直至成交/撤销；同 ID 改单；平仓后关联 Exit 自动失效（防 GhostExit） |
| `B_orders_strings__delay` | v5 / v6 | BATS:AAPL 60 | 8 | • Probe B 基线：挂单价格取整方向<br>• Order execution delay = One tick 成交时点对齐<br>• `str.tostring / str.format` 经 Trades.Signal 传递的原文一致性 |
| `B_orders_strings__none` | v5 / v6 | BATS:AAPL 60 | 8 | • Probe B 基线：市价挂单取整<br>• Order execution delay = None（即时撮合）时点对齐 |
| `S_limit_verification__2` | v6 | BATS:AAPL 60 | 17 | 两 tick 多空限价验证、开盘跳空价格改善；源常量 2 与报告原始标签分别保留 |
| `S_limit_verification__0` | v6 | BATS:AAPL 60 | 17 | Properties 显式关闭验证，原生报告确认 N=0 |
| `S_limit_verification__1` | v6 | BATS:AAPL 60 | 17 | 独立源码只改常量为 1，区分 N=1 / N=2 同名报告标签 |
| `S_limit_verification_marketable__2` | v6 | BATS:AAPL 60 | 17 | 可立即成交的多空限价单与两 tick 验证条件 |
| `S_limit_verification_stop_limit__2` | v6 | BATS:AAPL 60 | 17 | stop-limit 激活与两 tick 限价验证 |
| `S_limit_verification_exit__2` | v6 | BATS:AAPL 60 | 17 | 限价退出与开仓后已可成交价格改善 |

---

## 2. 出场、止损与括号单 (Exits & Brackets)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `S_exit_brackets` | v5 / v6 | BATS:AAPL 60 | 18 | • 0.15% 紧括号单同 Bar 内同时满足触发时的 4-tick 路径竞争判定<br>• **v5 vs v6 关键分水岭**：相对值（40 tick）与绝对值（0.5%）并存时，v5 绝对优先，v6 先触发优先 |
| `S_exit_partial` | v5 / v6 | BATS:AAPL 60 | 16 | • Exit 数量预留机制（如 19+20，第二笔仅剩 1 股可平）<br>• `qty_percent` 按 50% 分批止盈<br>• 无 `from_entry` 的 Exit 对后续新 Entry 持续生效；非法 `from_entry` 判定无效 |
| `S_trailing` | v5 / v6 | BATS:AAPL 60 | 12 | • 跟踪止损：`trail_price` 激活 + 30 tick 跟随（多空双向）<br>• `trail_points` 30 tick 激活 + 20 tick 跟随；跟随点位与 4-tick 极值假设的耦合 |
| `S_close_variants` | v5 / v6 | BATS:AAPL 60 | 10 | • 平仓 API 族：`close(id)` 无 comment 时的默认 Signal 文案<br>• `qty` 固定股数与 `qty_percent` 比例减仓<br>• `close_all` 默认文案；`immediately=true` 强制即时成交时点 |

---

## 3. 加仓与平仓匹配规则 (Pyramiding & Matching)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `S_pyramiding_fifo` | v5 / v6 | BATS:AAPL 60 | 12 | • `pyramiding=3` + 10% equity 定仓：前三笔成交，第四笔超限被静默忽略<br>• **FIFO 规则**：`close("E2")` 调用下实际平掉最先入场的仓位<br>• `strategy.order` 减仓不反转，且不受 pyramiding 限制 |
| `S_pyramiding_any` | v5 / v6 | BATS:AAPL 60 | 12 | • **ANY 规则**：`close("E2")` 调用精准平掉指定 ID 的开仓单<br>• `strategy.entry` 反转仓位时的 Transaction 净交易量核算 |

---

## 4. 费率、滑点与保证金杠杆 (Economics & Margin)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `S_commission_slippage__base` | v5 / v6 | BATS:AAPL 60 | 15 | 零佣金、零滑点基准对照组 |
| `S_commission_slippage__pct` | v5 / v6 | BATS:AAPL 60 | 15 | 0.1% 百分比佣金核算；双边进出场均计收；Limit 限价单不吃滑点 |
| `S_commission_slippage__per_contract` | v5 / v6 | BATS:AAPL 60 | 15 | 每股固定佣金（0.05 USD / contract）计算 |
| `S_commission_slippage__per_order` | v5 / v6 | BATS:AAPL 60 | 15 | 每笔订单固定佣金（1 USD / order）计算 |
| `S_commission_slippage__slip3` | v5 / v6 | BATS:AAPL 60 | 15 | 滑点 3 ticks：仅作用于 Market 市价单与 Stop 触发单，Limit 订单不吃滑点 |
| `S_margin` | v5 / v6 | BATS:AAPL 60 | 12 | 4x 杠杆（25% 保证金）+ 300% 满仓：Margin Call 强平触发门槛、强平数量核算与逐 Bar `margin_liquidation_price` 比对 |

---

## 5. 盘中重算触发机制 (Intrabar Order Fills)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `S_calc_on_order_fills` | v5 / v6 | BATS:AAPL 60 | 24 | • 单 Bar 执行次数统计（`calcs_on_bar`，上限 4 次）<br>• 区分盘中成交触发重算发生在收盘计算前或后<br>• 重算内部提交的市价单撮合 Tick 定位；`barstate.isnew` 状态回传 |

---

## 6. 策略风险控制规则 (Risk Management)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `S_risk` | v5 / v6 | BATS:AAPL 60 | 10 | 综合风控基线：同时激活 allow_entry_in、max_position_size 与 max_intraday_filled_orders |
| `S_risk_allow_entry_in` | v5 / v6 | BATS:AAPL 60 | 10 | 单向开仓：`allow_entry_in(long)` 下持有长仓时，反向 Short 开仓自动退化为平仓单；空仓状态下的 Short 开仓被直接忽略 |
| `S_risk_max_position_size` | v5 / v6 | BATS:AAPL 60 | 10 | 最大持仓截断：40 股申报被截断至 25 股上限；已满仓后后续 Entry 与 Order(qty=10) 差异处理 |
| `S_risk_max_intraday_filled_orders` | v5 / v6 | BATS:AAPL 60 | 13 | 日内交易次数限制：单日达 3 笔上限后，第 4、5 笔（含 close_all）被拒绝；支持隔夜持仓并在次日恢复 |
| `S_risk_max_drawdown__cash` | v6 | BINANCE:BTCUSDT 60 | 18 | 现金回撤 100，已实现余额回撤永久停止交易 |
| `S_risk_max_intraday_loss__cash` | v6 | BINANCE:BTCUSDT 60 | 18 | 日内现金亏损 100，相对交易日起始净值触发强平并在次日恢复 |
| `S_risk_max_cons_loss_days__2` | v6 | BINANCE:BTCUSDT 60 | 18 | 连续两个已实现亏损交易日后永久停机 |
| `S_risk_max_cons_loss_days__1` | v6 | BINANCE:BTCUSDT 60 | 18 | 显式覆盖阈值为 1，首个完整已实现亏损交易日后永久停机 |
| `S_risk_max_drawdown__percent` | v6 | BINANCE:BTCUSDT 60 | 18 | 最高已实现余额回撤 1% 后永久停机，浮盈浮亏不触发 |
| `S_risk_max_intraday_loss__percent` | v6 | BINANCE:BTCUSDT 60 | 18 | 相对交易日起始净值亏损 1% 后强平，当日盈利可抵消后续浮亏 |
| `S_risk_limits__control` | v6 | BINANCE:BTCUSDT 60 | 18 | 同市场与调度的独立原生对照，风控阈值设为不可触及 |
| `S_risk_max_intraday_loss__cash_march` | v6 | BINANCE:BTCUSDT 60 | 18 | 三月终点的独立原生导出，验证 Sharpe/Sortino 日度观察范围与最后平仓时间 |
| `S_risk_max_intraday_loss__cash_april` | v6 | BINANCE:BTCUSDT 60 | 18 | 四月终点的独立原生导出，验证跨更长交易区间的 Sharpe/Sortino 月度观察 |
| `S_risk_max_intraday_loss__cash_weekly` | v6 | BINANCE:BTCUSDT 1W | 18 | 按周线重置；负期初净值暂停现金阈值，恢复正期初净值后重新生效 |
| `S_risk_max_cons_loss_days__2_weekly` | v6 | BINANCE:BTCUSDT 1W | 18 | 跨周期浮亏计数；同刻全量平仓与固定数量风险订单形成反向仓位，后续脚本订单保持停机 |
| `S_risk_max_cons_loss_days__full_close_2_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | 连亏两期，原持仓 2 全量平仓后风险订单卖出 2，留下 -2；全部通过 |
| `S_risk_max_cons_loss_days__partial_close_2_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | 连亏两期，原持仓 2 先平 1，再由风险订单卖出 2，留下 -1；全部通过 |
| `S_risk_max_cons_loss_days__hold_1_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | 无计划平仓；连亏一期后于 2024-01-15 风控平仓，序列与交易通过；两项比率未通过 |
| `S_risk_max_cons_loss_days__hold_2_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | 无计划平仓；连亏两期后于 2024-01-22 风控平仓，序列与交易通过；两项比率未通过 |

---

## 7. 标的尺寸与合约步长 (Asset Sizing)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `S_sizing_crypto` | v5 / v6 | BINANCE:BTCUSDT 60 | v5: 12 / v6: 13 | • 加密货币高精度仓位（5% equity 产生的小数 Qty 精度）<br>• 显式数量（0.0123456）舍入规则<br>• 极小单（低于 1e-7 或 `syminfo_mincontract`）的静默跳过判定 |

## 8. 日期输入与语言类型

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点 |
|---|---|---|---|---|
| `S_timestamp_trade_types` | v6 | BINANCE:BTCUSDT 60 | 11 | 空格分隔的日期字符串、显式时区、日期输入门控、交易索引/时间/ID 与 `ta.valuewhen` 返回类型；27,046 根原生行情、3,758 笔已平仓交易及报告指标全部匹配 |
