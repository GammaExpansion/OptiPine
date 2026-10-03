# Indicator 层测试用例清单 (INDEX)

[← 返回 indicator/README.md](./README.md) | [返回测试集导航](../README.md)

本清单收录 Indicator 指标层共 39 个独立测试目录（v5 16 个，v6 23 个），均已完成原生核对。新增的四个语言回归用例各保留 27,046 根完整历史，所有输出序列与引擎匹配。

---

## 1. 经典技术指标算法族 (Technical Analysis Builtins)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `I_ma` | v5 / v6 | BATS:AAPL 60 | 34 | • 移动平均全族：`sma`, `ema`, `rma`, `wma`, `vwma`, `swma`, `hma`, `alma`, `linreg`<br>• 首个有效非 na 行号对齐（First valid bar）<br>• 长度为 1 与 200 极值边界、嵌套调用及以 `source[1]` 历史序列作为输入 |
| `I_osc` | v5 / v6 | BATS:AAPL 60 | 28 | • 振荡器族：`rsi`, `macd`, `stoch`, `cci`, `mfi`, `tsi`, `wpr`, `mom`, `roc`, `change`, `cog`, `cmo`, `dmi`<br>• 多输出元组对齐与指标深层嵌套计算 |
| `I_vol` | v5 / v6 | BATS:AAPL 60 | 27 | • 波动率族：`tr`, `atr`, `stdev`, `variance`, `dev`, `bb`, `bbw`, `kc`, `kcw`, `supertrend`, `sar`<br>• 真实波幅与均方差动态递推精度 |
| `I_extremes` | v5 / v6 | BATS:AAPL 60 | 36 | • 极值与事件族：`highest`, `lowest`, `highestbars`, `lowestbars`, `pivot*`, `valuewhen`, `barssince`, `cross*`, `rising`, `falling`, `percentrank`, `percentile`, `median`, `mode`<br>• 事件未发生时的 na 传播与同值并列选择倾向 |
| `I_volume` | v5 / v6 | BATS:AAPL 60 | 21 | • 成交量族：`vwap`（变量、source、anchor 三输出重载）、`obv`, `accdist`, `pvt`, `nvi`, `pvi`, `wad`, `wvad`, `iii`<br>• 跨 Bar 累加型指标浮点累计精度 |

---

## 2. 语言序列语义与集合容器 (Language & Collections)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `I_lang_series` | v5 / v6 | BATS:AAPL 60 | 35 | • **求值机制差异**：v5 严格全量求值 vs v6 短路求值（Short-circuit）<br>• 条件分支（`if / switch`）内调用 `ta.*` 的内部序列历史断裂<br>• 函数内 `var` 独立绑定 call site；动态回溯 `series[dynamic_offset]` 截断至 10,000 上限 |
| `I_collections` | v5 / v6 | BATS:AAPL 60 | 47 | • 集合容器：`array` 统计/排序/二分查找/切片、`matrix` 行列式/乘法/转置、`map` 键值读写 |
| `I_language_support` | v5 / v6 | BINANCE:BTCUSDT 60 | 15 | enum 默认输入、显示标题、函数/数组/历史中的成员身份；`m.eigenvalues().get()` 链式调用，对称、对角与非对称矩阵的特征值及其顺序 |
| `I_language_support__enum_override` | v5 / v6 | BINANCE:BTCUSDT 60 | 15 | 同一源码在 TradingView UI 将 Average 改为 Exponential average 后独立导出；`meta.inputs` 显式覆盖，完整 27,704 根原生历史 |
| `I_eigen_boundaries` | v6 | BINANCE:BTCUSDT 60 | 7 | 单元素、零矩阵与整数矩阵特征值，整数矩阵原生小数输出；`probe_index` 连续为 0..27703；`meta.capture` 保存空矩阵原生运行错误 |
| `I_eigen_complex` | v6 | BINANCE:BTCUSDT 60 | 2 | 旋转矩阵复根的两个实部输出均为 0；没有索引列，以 OHLCV 原文逐行等于 boundaries 确認相同完整历史 |
| `I_generic_values` | v6 | BINANCE:BTCUSDT 60 | 9 | 未声明参数类型的字符串拼接、嵌套函数与数组方法的独立类型推导、显式 qualifier 与 const 引用 |
| `I_leading_continuations` | v6 | BINANCE:BTCUSDT 60 | 4 | 行首 `or` 与三元表达式 `:` 续行，局部块结果 |
| `I_drawing_presence` | v6 | BINANCE:BTCUSDT 60 | 5 | `na` 检查 drawing ID，删除后赋回 `na`，自定义与内置 delete 方法的接收者分派 |
| `I_plot_linestyles` | v6 | BINANCE:BTCUSDT 60 | 4 | 实线、虚线、点线常量与逐 bar 数值输出 |

---

## 3. 常量、语法与基础数值语义 (Constants & Math)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `I_strings_ops` | v5 / v6 | BATS:AAPL 60 | 55 | • 字符串与运算符：`str.*` Unicode 字符长度、`tonumber` 边界与正则匹配<br>• 运算符优先级与结合性<br>• 常量整数除法在复合表达式中的传播语义 |
| `I_math_colors` | v5 / v6 | BATS:AAPL 60 | 63 | • 数学与颜色：`math.*` 全集（含 na/inf 边界输出）<br>• 种子随机数（Seeded random）跨 Bar 可复现性<br>• 17 个内置命名颜色在 v5 与 v6 下的 RGB 编码差异 |
| `A_numeric_semantics` | v5 / v6 | BATS:AAPL 60 | v5: 63<br>v6: 59 | • Probe A 基线：常量除法、取模、取整、除零保护与 na 传播<br>• `ta.ema / rma / sma` 在遭遇 na 空洞时的种子重置逻辑 |

---

## 4. 时间系统与跨周期对齐 (Time & Multi-Timeframe)

| ID | 版本 | 标的 / 周期 | Plot 列数 | 核心测试点与关键验证 |
|---|---|---|---|---|
| `M_time__aapl_60` | v5 / v6 | BATS:AAPL 60 | 63 | • 美股常规时区（America/New_York）日期时间分量分解、夏令时（DST）偏移转换、`session.ismarket` 状态判定 |
| `M_time__aapl_D` | v5 / v6 | BATS:AAPL D | 63 | • 美股日线跨日时间戳与分红复权关闭环境下的时间一致性 |
| `M_time__btcusdt_60` | v5 / v6 | BINANCE:BTCUSDT 60 | 63 | • 加密货币 7×24 小时全天候时钟、时段标志、缺 Bar 间隔处理 |
| `M_time__btcusdt_D` | v5 / v6 | BINANCE:BTCUSDT D | 63 | • 加密货币日线跨周期对齐（`time("D")` / `time("W")`）行为 |
| `I_syminfo_mincontract` | v6 | BINANCE:BTCUSDT 60 | 1 | 独立完整历史 metadata 探针；v5 不可用，见 parse `P_ver_mincontract` |
