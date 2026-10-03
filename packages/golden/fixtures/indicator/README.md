# Indicator 用例指南

[← 返回测试集导航](../README.md)

Indicator 用例记录技术指标、内置数学函数、语言求值语义与时间系统在 TradingView 上的逐 Bar 输出。每个用例把待观察的值全部 `plot()` 出来，随图表数据一起原样导出。

完整目录清单请参阅：[**`INDEX.md`**](./INDEX.md)。

---

## 📊 测试集规模与覆盖

- **用例总数**：共 39 个独立测试目录（`v5/*` 16 个，`v6/*` 23 个），39 个 verified、0 个 unverified。
- **文件组成**：已完成采集的测试目录包含以下 3 件套：
  - `source.pine`：指标源码（原生核对状态见 metadata）
  - `meta.json`：标的定义、时区、导出信息与核对状态
  - `data.csv`：官方原生导出的完整历史 Bar 数据（含所有 `plot*()` 观测列）

---

## 🧭 模块分类与测试矩阵

所有用例按计算类型与语言特性划分为以下核心模块：

### 1. 技术指标算法族 (Technical Analysis Builtins)
| Bundle | 覆盖 API / 函数 | 核心对齐难点与验证点 |
|---|---|---|
| `I_ma` | `sma`, `ema`, `rma`, `wma`, `vwma`, `swma`, `hma`, `alma`, `linreg` | • 各 MA 在数据首部的种子初始化行号（First valid bar）<br>• 长度为 1 与超长（200）边界<br>• 嵌套调用与以历史序列作为输入（`source[1]`） |
| `I_osc` | `rsi`, `macd`, `stoch`, `cci`, `mfi`, `tsi`, `wpr`, `mom`, `roc`, `change`, `cog`, `cmo`, `dmi` | • 多输出指标与嵌套运算<br>• 振荡器在除零与极小波动下的数值平滑机制 |
| `I_vol` | `tr`, `atr`, `stdev`, `variance`, `dev`, `bb`, `bbw`, `kc`, `kcw`, `supertrend`, `sar` | • 真实波幅（TR）首根 Bar 初始化规则<br>• 动态均方差（`stdev`）递推与高价格量级下的精度发散控制 |
| `I_extremes` | `highest`, `lowest`, `highestbars`, `lowestbars`, `pivot*`, `valuewhen`, `barssince`, `cross*`, `rising`, `falling`, `percentrank`, `median`, `mode` | • 极值与事件检索函数在同值并列时的选择倾向<br>• `valuewhen` 与 `barssince` 在从未发生条件下的 `na` 传播 |
| `I_volume` | `vwap`, `obv`, `accdist`, `pvt`, `nvi`, `pvi`, `wad`, `wvad`, `iii` | • `vwap` 在不同锚定周期（Anchor）下的累计重置逻辑<br>• 累加型（Accumulate）指标随 Bar 数量增加的浮点累计误差 |

### 2. 语言序列语义与编译器状态机 (Language & Series Semantics)
| Bundle | 核心测试点 | 关键验证与版本差异 |
|---|---|---|
| `I_lang_series` | 序列求值次数、条件分支历史断裂、动态回溯 | • **求值机制差异**：v5 严格求值（全部参数求值）vs v6 短路求值（Short-circuit）<br>• 条件分支（`if / switch`）内调用 `ta.*` 造成的内部序列历史断裂<br>• 自定义函数内 `var` 独立绑定 call site<br>• 动态历史回溯 `series[dynamic_offset]` 达到硬上限（RE10007 10,000 限制）时的截断保护 |
| `I_collections` | `array`, `matrix`, `map` 集合操作 | • 数组排序稳定性、二分查找边界行为<br>• 矩阵行列式、转置与乘法精度<br>• 字典键值读写与遍历一致性 |
| `I_language_support` / `I_language_support__enum_override` | `enum`、`input.enum`、矩阵返回值链式调用 | 成员显示标题、函数传参、数组与历史身份；通过 UI 切换输入后独立导出，与 `meta.inputs` 的非空覆盖对照；对称、对角和非对称矩阵的特征值顺序 |
| `I_eigen_boundaries` / `I_eigen_complex` | 特征值边界 | 单元素、零矩阵与整数矩阵的小数输出；旋转矩阵的复根返回零实部；空矩阵原生运行错误作为附属证据保留 |

### 3. 常量、语法与基础数值语义 (Constants & Math)
| Bundle | 核心测试点 | 关键验证点 |
|---|---|---|
| `I_strings_ops` | 字符串操作与运算符行为 | • `str.*` Unicode 字符长度、`tonumber` 边界与正则匹配<br>• 运算符优先级与结合性<br>• `const int / const int` 整数除法在复合表达式中的传播机制（v5 整数截断 vs v6 保持浮点） |
| `I_math_colors` | 数学函数全集与颜色分量 | • `math.*` 的 `na / inf` 边界输出<br>• 种子随机数（Seeded random）的可复现性与序列状态<br>• 17 个内置命名颜色在 v5 与 v6 下的 RGB 编码差异 |
| `A_numeric_semantics` | 常量数值基线 (Probe A) | • 取模、整数转换、除零保护、`na` 传播法则<br>• `ta.ema / rma / sma` 在中间遭遇 `na` 空洞时的重置与跳过规则 |

### 4. 时间系统与跨周期对齐 (Time & Metadata)
| Bundle 变体 | 图表与周期 | 关键测试点 |
|---|---|---|
| `M_time__aapl_60` | BATS:AAPL 1h | 交易所常规时区（America/New_York）下的日期时间分量分解、夏令时（DST）偏移转换、`session.ismarket` 判定 |
| `M_time__aapl_D` | BATS:AAPL 1D | 日线周期下跨日时间戳与分红复权关闭下的时间一致性 |
| `M_time__btcusdt_60` | BINANCE:BTCUSDT 1h | 7×24 小时全天候加密市场的 `time(tf, session)` 行为、时段标志及缺 Bar 处理 |
| `M_time__btcusdt_D` | BINANCE:BTCUSDT 1D | 高时间周期（HTF）时间对齐（`time("D")` / `time("W")`）无需次级图表数据的内置映射 |

---

## 📋 跨版本采集规则

1. **独立导出**：单纯把 `//@version=5` 换成 `//@version=6` 不代表输出一致。每个用例的 v5 与 v6 都在对应版本下用 TradingView Premium 账号各自原生导出一份 `data.csv`，即使内容恰好相同也各存一份。
2. **已知版本差异**：`M_time__*_D` 的 `len_tf_period` 列在 v5 为 `"D"`（长度 1），在 v6 为 `"1D"`（长度 2）。
3. **输入覆盖**：`I_language_support` 的默认输入为 `Simple average`；`__enum_override` 在 TradingView 设置中改为 `Exponential average` 后独立导出，并在 `meta.inputs.Average` 中传入同一显示标题。两版均保留 27,704 根原生账户可加载历史，首根 `probe_index=0`；15 个输出列覆盖暂停 Replay 的末根。市场缺 Bar 原样保留，来源与采集限制见各目录的 `meta.capture` 和 `meta.notes`。
4. **特征值边界**：两个 `I_eigen_*` 用例各保存 27,704 根 v6 原生输出。`I_eigen_complex` 的源码没有索引列，其完整历史由六列原始 OHLCV 与 `I_eigen_boundaries` 逐行完全相同确认；后者的 `probe_index` 连续为 0..27703。两者均使用完整 golden 输出比较，未补列或放宽比较规则。空矩阵探针编译成功后在 bar 0 报 RE10088，原文保留在 `I_eigen_boundaries` 的 `meta.capture.related_runtime_error`，不计作编译失败用例。

---

## ⚠️ 关键边界与已知细节

> [!NOTE]
> **`syminfo.session` 返回值定义**：
> Pine Script 内置变量 `syminfo.session` 返回的是当前图表的会话模式（`"regular"` 或 `"extended"`，即 ETH 盘前盘后开关），而非交易时段字符串。交易所常规交易时段字符串已规范化存放于 `meta.syminfo.session_hours`（如股市 `"0930-1600"`，加密货币 `"0000-0000:1234567"`）。

> [!NOTE]
> **历史回溯硬上限（RE10007 错误）**：
> Pine 运行期对 `series[offset]` 设有 10,000 根 Bar 的硬上限。测试脚本 `I_lang_series` 中已做保护处理，将动态偏移截断为 `math.min(bar_index, 10000)`，列名记为 `dynamic_offset_capped`。
