# Golden 数据当前边界

更新日期：2026-09-21。240 个 verified 用例全部匹配，6 个 unverified 用例不参与回归门禁。
本页只记录仍影响使用方式的边界，不保留已完成采集的过程日志。

剩余 4 个 parse 用例为 v5 的 `P_err_no_version`、`P_err_version_4`，
以及 v5/v6 的 `P_err_import`，尚未完成原生编译复核。
另 2 个 unverified 是下表的周线比率差异。新确认的 `request.security`、
`request.financial` 用例仅记录编译通过，不验证请求数据的运行结果。

六个语言回归探针均已完成对应的原生核对。
其中 `P_request_result_types` 只验证编译；drawing ID 状态与 plot linestyle
序列不表示引擎支持图形渲染。

| 用例 | 当前状态 |
|---|---|
| `S_sizing_crypto`（[v5](../strategy/v5/S_sizing_crypto)、[v6](../strategy/v6/S_sizing_crypto)） | 当前采集与源码修订全部通过；v5 的 `syminfo.mincontract` 编译错误由独立用例记录 |
| `M_time__aapl_D`（[v5](../indicator/v5/M_time__aapl_D)、[v6](../indicator/v6/M_time__aapl_D)） | 明确版本的原源码在休市、刷新后的完整历史采集全部通过；旧快照的混合尾部状态未被复现 |
| `A_numeric_semantics` | v5/v6 的 shifted standard deviation 已通过固定长度补偿滚动求和实现 |
| `S_risk_max_cons_loss_days__hold_1_weekly` / `__hold_2_weekly`（v6） | 两份原生周线配对采集完整；所有序列、成交及其他指标通过，只有 Sharpe、Sortino 在 TradingView 为空而引擎返回数值。各 213/215 项严格检查通过，保留为 unverified；没有修改原生值或比较规则 |

周线全量和部分平仓补采均完整通过；分别留下 -2、-1 仓位，确认风险订单数量
取自触发时的原持仓。成交回调取消、多个风险规则同时触发的优先级仍缺少独立原生验证。

TradingView 的 v5 `syminfo.mincontract` 编译错误和 v6 数值输出分别由独立
fixture 记录。旧 v5 成功输出的来源归属仍无法追溯；新修订只删除该无效 plot，
保留其余订单逻辑和输出。不要把旧来源中的不一致当作当前 v5 运行能力。

未收盘的最终 bar 可能保留行情而没有脚本输出；Replay 选择的策略用例在
`meta.execution` 中明确记录。没有这类记录时，不能从 OHLCV 推断实时执行状态。

数据采集时在归档保留原始 CSV/XLSX、源码和 notes；修改 fixture 必须更新 baseline
并说明来源变化。不要从 expected plot 值反推引擎输入或设置。

交易日历是需要它的用例自身声明的输入，不能只凭 `tickerid` 假定已经提供。
覆盖范围及供应商历史数据的限制见[日历输入](calendar-inputs.md)。

## 历史证据

正式用例只保留 `source.pine`、`meta.json`、所需原生导出及可选 `calendar.json`。
来源、配对结论和关键异常存入 `meta.capture` / `meta.notes`，Replay 执行输入
直接存入 `meta.execution`；加载器不再依赖额外采集文档。

完整的采集 notes、manifest、audit 和 diff 原件保存在维护者的本地归档中，不随仓库分发。
部分 `meta.capture` 中的 `.golden/captures/...` 路径指向该归档，仅作来源记录。

旧 manifest 中的 `tests/calendars/tradingview-aapl.json` 指向原始独立日历；
同一份原件现保存为需要它的用例内的 `calendar.json`，字节保持不变。
日历来源中的 `probe.pine` 对应当前 `packages/golden/scripts/probes/calendar.pine`。

目录迁移前的 `tests/` 现为 `packages/golden/fixtures/`，`scripts/` 现为
`packages/golden/scripts/`。原始 notes、manifest 和日历来源字段中的旧路径
保留原文，按此映射查找当前文件。

该归档不是普通测试或 CI 的运行依赖。正式 fixture 的源码、行情、报告、
metadata、必要来源记录与回归基线均保留在仓库中。
