# Parse 层测试用例清单 (INDEX)

[← 返回 parse/README.md](./README.md) | [返回测试集导航](../README.md)

本清单收录 Parse 语法编译层共 143 个独立测试目录（v5 72 个，v6 71 个）。新增 `P_syn_int_division` 已在 Pine Editor 独立编译通过；核对状态以各自 `meta.json` 为准，此处不验证运行结果。

---

## 1. 排版与格式兼容 (`P_fmt_*`)

| ID | 版本 | 期望结果 | 已审计 | 测试内容与判定要点 |
|---|---|---|---|---|
| `P_fmt_minimal` | v5 / v6 | `ok` | yes | 最小合法 Pine 脚本骨架编译 |
| `P_fmt_crlf` | v5 / v6 | `ok` | yes | CRLF（`\r\n`）Windows 换行符支持 |
| `P_fmt_tabs_mixed` | v5 / v6 | `ok` | yes | 同一脚本内 Tab 制表符与 4 空格缩进混用兼容 |
| `P_fmt_continuation` | v5 / v6 | `ok` | yes | 续行缩进兼容：全局 2 空格、块内 7 空格、三元运算与参数列表跨行 |
| `P_fmt_comment_before_version` | v5 / v6 | `ok` | yes | 许可证注释头：`//@version` 前存在大段许可注释与空行（开源脚本标准形态） |
| `P_fmt_quotes_escapes` | v5 / v6 | `ok` | yes | 单双引号混合、转义字符、字符串内含 `#` 与 `//` 及 Unicode 非 ASCII 字符 |
| `P_fmt_number_literals` | v5 / v6 | `ok` | yes | 数字字面量（科学计数法 `1e-5`、`.5`、大数）与 `#RRGGBB / #RRGGBBAA` 颜色字面量 |
| `P_fmt_comments` | v5 / v6 | `ok` | yes | 行尾注释、代码块内部注释、块内空行、字符串内部 `//` |
| `P_fmt_annotations` | v5 / v6 | `ok` | yes | 文档注解识别：`//@type`, `//@field`, `//@function`, `//@param`, `//@returns`, `//@variable` |
| `P_fmt_args_named_positional` | v5 / v6 | `ok` | yes | 函数调用参数：位置参数、命名参数、先位置后命名、命名参数乱序与内置函数命名参数 |
| `P_fmt_long_line` | v5 / v6 | `ok` | yes | 超长单行复合表达式解析鲁棒性 |

---

## 2. 核心语法全集 (`P_syn_*`)

| ID | 版本 | 期望结果 | 已审计 | 测试内容与判定要点 |
|---|---|---|---|---|
| `P_syn_functions` | v5 / v6 | `ok` | yes | 单行/多行函数、默认参数、命名参数乱序、参数类型与限定符、函数内 `[]`、函数嵌套调用 |
| `P_syn_tuples` | v5 / v6 | `ok` | yes | 元组（Tuple）多返回值与解构：自定义函数返回、`ta.macd / supertrend / bb / dmi` 解构 |
| `P_syn_types_udt_methods` | v5 / v6 | `ok` | yes | 自定义类型（UDT）：`type` 声明（带默认值）、`Type.new()`、`method` 对象方法、字段赋值、UDT 实例的 `[]` 历史回溯 |
| `P_syn_enum` | v5 / v6 | `ok` | yes | 枚举（Enum）声明（带/不带标题）、`input.enum`、枚举 `switch` 分支匹配、`str.tostring(enum)` |
| `P_syn_switch` | v5 / v6 | `ok` | yes | `switch` 带表达式 / 无表达式（类似 if-else 链） / 默认分支 `=>` / 作为表达式返回值或独立语句 |
| `P_syn_if_else` | v5 / v6 | `ok` | yes | `if / else if / else` 作为表达式与语句、深层嵌套、分支返回不同字符串 |
| `P_syn_loops` | v5 / v6 | `ok` | yes | `for` / `for...by` 负步长 / `for...in` 遍历 / `for [i,v] in` 索引值遍历 / `while` / `break` / `continue` |
| `P_syn_var_varip` | v5 / v6 | `ok` | yes | `var` 与 `varip` 跨 Bar 持久化、显式类型声明、持久化集合、复合赋值（`+=`, `-=` 等） |
| `P_syn_types_explicit` | v5 / v6 | `ok` | yes | 显式类型标注：基础标量、`int[]` / `array<float>` / `matrix` / `map`、绘图引用类型、各类型的 `na` |
| `P_syn_inputs_all` | v5 / v6 | `ok` | yes | 全部 `input.*` 变体及 `minval/maxval/step/options/tooltip/inline/group/confirm/display` 配置项 |
| `P_syn_drawings` | v5 / v6 | `ok` | yes | 全部绘图 API 语法：`table/line/label/box/linefill/polyline/plotshape/plotchar/plotcandle` 等 |
| `P_syn_alerts_log` | v5 / v6 | `ok` | yes | 告警与日志指令：`alert`, `alertcondition`, `log.*`, `runtime.error` |
| `P_syn_arrays` | v5 / v6 | `ok` | yes | `array.*` 常用 API 语法解析 |
| `P_syn_matrix_map` | v5 / v6 | `ok` | yes | `matrix.*` 与 `map.*` 常用 API 语法解析 |
| `P_syn_strings` | v5 / v6 | `ok` | yes | `str.*` 常用 API（含正则提取、`str.format`, `str.format_time`） |
| `P_syn_math_color` | v5 / v6 | `ok` | yes | `math.*` 全集与 `color.*` 颜色构造及分量提取函数 |
| `P_syn_operators` | v5 / v6 | `ok` | yes | 算术、比较、逻辑、三元运算、一元负号、括号优先级及函数返回值的直接 `[]` 索引 |
| `P_syn_history_scopes` | v5 / v6 | `ok` | yes | 作用域与历史：函数内变量的 `[]`、函数内 `var`（按 call site 独立）、`if` 分支同名局部变量、循环体内 `[]` |
| `P_syn_conditional_calls` | v5 / v6 | `ok` | yes | `ta.*` 在 `if / switch` 分支内部调用（官方仅报警告，语法合法且编译通过） |
| `P_syn_library` | v5 / v6 | `ok` | yes | `library` 库声明：`export` 导出函数 / 自定义类型 / 方法 |
| `P_syn_strategy_full` | v5 / v6 | `ok` | yes | `strategy()` 全参数声明、`entry/exit/order/close/close_all/cancel/cancel_all` 全参数调用及 `strategy.*` 状态访问 |
| `P_syn_builtin_vars` | v5 / v6 | `ok` | yes | 内置变量全集：OHLCV、`time`、`barstate.*`、`syminfo.*`、`timeframe.*`、日期序列、`session.*` 等 |
| `P_syn_time_functions` | v5 / v6 | `ok` | yes | `timestamp()` 三种重载、`time(tf, session, tz)`、日期函数形式、`timeframe.in_seconds(tf)` |

---

## 3. 编译错误 (`P_err_*`)

| ID | 版本 | 期望结果 | 已审计 | 说明 |
|---|---|---|---|---|
| `P_err_indent_2spaces` | v5 / v6 | `error@3` | yes | 语法错误：代码块缩进仅 2 空格（被解析器当作续行处理导致语法错） |
| `P_err_continuation_4spaces` | v5<br>v6 | `error@3`<br>`ok` | yes | **版本差异**：续行缩进 4 空格在 v5 报语法错误（指向上行），而在 v6 允许放行 |
| `P_err_unclosed_paren` | v5 / v6 | `error@3` | yes | 语法错误：括号未闭合 |
| `P_err_unterminated_string` | v5 / v6 | `error@3` | yes | 语法错误：字符串字面量未闭合 |
| `P_err_positional_after_named` | v5 / v6 | `error@3` | yes | 语法错误：命名参数后方再次出现位置参数 |
| `P_err_undeclared_identifier` | v5 / v6 | `error@3` | yes | 未声明错误：使用了未声明的变量或标识符 |
| `P_err_reassign_undeclared` | v5 / v6 | `error@3` | yes | 未声明错误：`:=` 赋值给未声明的变量 |
| `P_err_use_before_def` | v5 / v6 | `error@3` | yes | 未声明错误：函数在声明之前被调用 |
| `P_err_recursion` | v5 / v6 | `error@3` | yes | 未声明错误：尝试递归调用（函数体内找不到自身标识符） |
| `P_err_undefined_namespace_function` | v5 / v6 | `error@3` | yes | 未声明错误：命名空间下不存在该函数 |
| `P_err_type_string_to_float` | v5 / v6 | `error@3` | yes | 类型错误：尝试将 `string` 赋值给 `float` 变量 |
| `P_err_wrong_arg_type` | v5 / v6 | `error@3` | yes | 类型错误：实参与形参类型不符（例如传递 `string` 给 `series float`） |
| `P_err_float_as_int_length` | v5 / v6 | `error@3` | yes | 类型错误：传递 `series float` 给要求 `int` 的长度参数 |
| `P_err_input_defval_series` | v5 / v6 | `error@3` | yes | 类型错误：`input` 默认值必须为 `const`，错误传递了 `series` |
| `P_err_wrong_arity` | v5 / v6 | `error@3` | yes | 类型错误：缺少必填参数（重载解析失败归入 `type`） |
| `P_err_tuple_arity` | v5 / v6 | `error@3` | yes | 类型错误：元组解构变量个数与返回值个数不一致 |
| `P_err_assign_type_change` | v5 / v6 | `error@4` | yes | 类型错误：使用 `:=` 试图改变已声明变量的类型 |
| `P_err_redeclare_variable` | v5 / v6 | `error@4` | yes | 语义错误：在同一作用域内重复声明同名变量 |
| `P_err_plot_in_local_scope` | v5 / v6 | `error@4` | yes | 语义错误：在局部作用域（如函数或条件分支内部）调用 `plot` |
| `P_err_input_in_function` | v5 / v6 | `ok` | yes | 实测校准：函数内书写 `input` 在 TradingView 中允许编译通过 |
| `P_err_strategy_in_indicator` | v5 / v6 | `error@2` | yes | 语义错误：在 `indicator()` 脚本中调用 `strategy.entry()` |
| `P_err_no_declaration` | v5 / v6 | `error@1` | yes | 语义错误：缺少 `indicator()` / `strategy()` / `library()` 脚本声明头 |
| `P_err_two_declarations` | v5<br>v6 | `error@1`<br>`error@3` | yes | 语义错误：同时声明了 `indicator()` 和 `strategy()` |
| `P_err_no_version` | v5 | `error@1` | no | 缺少 `//@version`：TradingView 按 v1 处理，`indicator()` 在 v1 中不存在，行号按 v1 语义推断 |
| `P_err_version_4` | v5 | `ok` | no | `//@version=4` 旧版脚本（`study` 声明），TradingView 正常编译；放在 v5 目录只因目录必须二选一 |
| `P_err_request_security` | v5 / v6 | `ok` | yes | v5/v6 原生独立编译通过；仅验证编译，不验证请求数据运行结果 |
| `P_request_result_types` | v6 | `ok` | yes | request 的 bool/tuple 返回类型、用户函数返回 tuple；仅编译验证 |
| `P_syn_int_division` | v6 | `ok` | yes | 非 const 整数除法可初始化显式 int 声明；仅编译验证，不代表 float 可以隐式转成 int |
| `P_err_request_financial` | v5 / v6 | `ok` | yes | v5/v6 原生独立编译通过；仅验证编译，不验证请求数据运行结果 |
| `P_err_strategy_risk` | v5 / v6 | `ok` | yes | v5/v6 原生独立编译通过；此用例仅验证风控调用的编译结果 |
| `P_err_import` | v5 / v6 | `ok` | no | `import TradingView/ta/8` 官方库，TradingView 正常编译通过 |

---

## 4. 版本演进行为探针 (`P_ver_*`)

| ID | 版本 | 期望结果 | 已审计 | v5 与 v6 语言行为演进差异 |
|---|---|---|---|---|
| `P_ver_bool_na` | v5<br>v6 | `ok`<br>`error@3` | yes | 布尔三态：v5 允许 `bool` 赋 `na`；v6 实行严格二态，报错拒绝 |
| `P_ver_int_as_bool` | v5<br>v6 | `ok`<br>`error@4` | yes | 隐式转换：v5 允许 `int` 隐式当作 `bool` 条件；v6 必须显式比较，报错拒绝 |
| `P_ver_duplicate_param` | v5<br>v6 | `ok`<br>`error@3` | yes | 重复参数：同一调用传入重复命名参数，v5 仅报警通过，v6 报编译错误 |
| `P_ver_history_literal` | v5<br>v6 | `ok`<br>`error@3` | yes | 回溯字面量：`10[1]` 对字面量使用 `[]`，v5 允许，v6 判定语义错误 |
| `P_ver_udt_field_history` | v5<br>v6 | `ok`<br>`error@6` | yes | UDT 字段回溯：`obj.field[1]`，v5 允许，v6 判定语义错误（必须对对象整体回溯 `obj[1].field`） |
| `P_ver_plot_offset_series` | v5<br>v6 | `ok`<br>`error@3` | yes | `plot(offset=...)` 传入序列：v5 允许（仅取末值），v6 强制要求 const/simple 报错拒绝 |
| `P_ver_ema_series_length` | v5 / v6 | `error@4` | yes | `ta.ema` 长度传 series：v5 与 v6 均严格拒绝（确认一致性） |
| `P_ver_when_param` | v5<br>v6 | `ok`<br>`error@3` | yes | `when` 参数废弃：`strategy.entry(when=...)` 在 v5 允许（已废弃标记），v6 完全移除 |
| `P_ver_mincontract` | v5 | `error@3` | yes | 当前 v5 不提供 `syminfo.mincontract`；v6 成功执行与全历史数值见 indicator `I_syminfo_mincontract`；错误证据为采集者逐字记录，无截图 |
