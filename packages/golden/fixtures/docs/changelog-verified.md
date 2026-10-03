# Golden 数据修订记录

[返回测试集说明](../README.md)。当前为 246 个用例：240 verified、6 unverified。
原始采集记录保存在仓库之外；当前来源见各 fixture 的 `meta.capture` 和 `meta.notes`。

## 2026-09-21

- 新增独立 v6 parse 用例 `P_syn_int_division`：原生 Pine Editor 接受将
  `timeframe.in_seconds(timeframe.period) / 61` 赋给显式 `int`。
  图表显示小数，显式 `int(...)` 才截断；未将读数伪造成 CSV golden。
- 不迁入启用了 Bar Magnifier 的社区策略：Bar Magnifier 需要引擎未获得的低周期数据。
- 独立补采确认 na trailing offset 与未平仓展示手续费口径；正式用例数不变。
  loader 支持原生 Volume 列位置，交易比较改用按 mark 计算的展示手续费和真实
  realized balance。显式迁移比较实现 fingerprint；240 个 verified 的源码、
  输入、预期观测、精度和所有原有匹配断言均保持不变。

## 2026-09-19

- 新增四个独立 v6 语言指标用例：`I_generic_values`、`I_leading_continuations`、
  `I_drawing_presence`、`I_plot_linestyles`。每例保留 27,046 根 BINANCE:BTCUSDT
  60 分钟原生数据，索引从 0 开始且连续，所有输出序列匹配。
- 向左加载确认账户可用最早历史为 2022-01-01，暂停 Replay 的实际末根为
  2025-01-31 23:00 UTC。首次 300 行的部分导出被拒绝；drawing 的列序问题通过
  TradingView 显示顺序调整后重新导出解决。原生文件没有裁剪、重排或补值。
- `P_request_result_types` 原样源码在 Pine Editor 独立编译通过，纳入 verified parse。
  只验证 request 的 bool/tuple 返回类型，不增加次级数据或 request 运行能力。
- `S_timestamp_trade_types` 完成 CSV → XLSX → CSV 原生配对，前后 CSV 逐字节相同，
  XLSX 的 Backtesting range 与 27,046 根图表行情首尾一致。11 条输出、3,758 笔
  已平仓交易及报告指标全部匹配。末根 Replay bar 的空脚本输出原样保留，执行上下文
  显式记录在 `meta.execution`；市场数量步长来自独立 metadata 探针。
- 统一文件结构不变：来源摘要写入 `meta.capture`；详细记录和被拒绝的采集
  保存在仓库之外的采集归档。

## 2026-09-16

- 独立复核 v5/v6 的 `P_err_request_financial`、`P_err_request_security`
  和 `P_err_strategy_risk`，6 份原源码均在 TradingView 编译通过，
  提升为 verified。ID、源码和编译预期不变，
  来源保存在 `meta.capture`，完整记录留在归档。这仅验证编译，不扩展
  `request.*` 的数据输入或运行能力。

- 修复周线 `max_cons_loss_days`：完整周期的净值下降计入连续亏损；已提交的全量
  平仓单与触发时确定数量的风险订单依次成交，复现原生反向持仓及后续停机。
- 修复该报告暴露的负净值下 run-up 百分比和无盈利交易时平均盈亏比边界。
- `S_risk_max_cons_loss_days__2_weekly` 的原生源码、CSV、XLSX、采集记录和比较规则
  均未改动；217 项独立严格检查及 218 项套件检查通过，提升为 verified。
  此次修复使用既有原生采集。
- 随后补采四组独立周线 CSV → XLSX → CSV：全量、部分计划平仓均通过全部
  215 项严格检查，分别留下 -2、-1 仓位。无计划平仓的 count 1 / count 2
  分别在 2024-01-15 / 01-22 风控平仓，全部序列与交易通过；但原生 Sharpe、
  Sortino 为空、引擎为数值，各通过 213/215 项，保留为 unverified。
  成交回调及多风险优先级仍无独立原生验证。
- 用例恢复统一文件结构：来源摘要、哈希与配对事实合并进 `meta.capture`，
  Replay 选择时间及暂停状态直接存入 `meta.execution`；不补造旧记录未知的
  stepping 状态。额外 notes、manifest、audit 和 diff 移入仓库之外的采集归档。
  原生源码、CSV、XLSX、日历及比较规则不变；
  原 225 个 verified 检查保留，基线仅显式迁移 metadata 指纹并纳入新用例。

## 2026-09-13

- 现有 harness、fixtures 和维护脚本归入 `@pine/golden` workspace；原 `tests/`
  目录整体迁至 `packages/golden/fixtures/`。引擎与 CLI 分别归入 `@pine/engine`
  和 `@pine/cli`，通过公开包入口调用。原生源码、行情、报告、metadata 和来源记录
  保持原始字节；目录与构建迁移不改变比较断言或容差。
- 比较规则指纹随 golden 构建产物携带，支持运行编译后的 CLI。基线的指纹迁移
  在完整回归确认后显式接受，保留原有每条断言。

## 2026-09-12

- 交易日历改为用例内显式输入：v5/v6 的 `I_volume`、`M_time__aapl_60`、
  `M_time__aapl_D` 和 `S_risk_max_intraday_filled_orders` 共 8 个用例在 metadata
  声明本地 `calendar.json`，内容与原独立采集逐字节一致。原先自动注入日历的另外
  56 个用例经完整引擎输出对照确认不需要日历；移除全局目录与按品种匹配逻辑。
  此次仅迁移输入及来源指纹，原生预期和每条比较断言保持不变；见[日历输入](calendar-inputs.md)。
- AAPL 日线 v5/v6 以各自原样源码、休市刷新上下文重采，各保留 11,523 行和 63 列。
- Crypto v5/v6 采用同一计算区间的 CSV → XLSX → CSV 稳定配对；v5 新修订只移除
  无法编译的 mincontract plot，其余 12 列及交易逻辑不变。
- 新增 v5 mincontract 编译错误与独立 v6 数值用例；原 v5 成功输出的来源归属仍有争议。
- 基线迁移明确映射了 plot 位置和原生 Expectancy 名称；比较精度和 verified 未放宽。
  调整范围现见各 fixture 的 metadata。
- 两版偏移标准差由引擎计算修复，原始 numeric fixture 未改，202 个 verified 全部通过。

## 初始源码校准

- I_collections 使用两行的 array.sum 汇总矩阵；matrix.sum 本身是逐元素矩阵加法。
- I_lang_series 将动态历史偏移限制在 10,000，避免原生 RE10007；列名为 dynamic_offset_capped。
- syminfo.session 表示 regular/extended 模式，时段字符串单独保存在 session_hours。
- P_err_input_in_function 的实际编译结果为成功，保留原 ID。
- P_err_continuation_4spaces 在 v5 报错、v6 成功；EMA 的 series length 两版均报类型错误。

采集、入库和回归规则见[采集规范](collecting-golden-sop.md)。
