# Parse tier case list (INDEX)

[← Back to parse/README.md](./README.md) | [Back to the suite overview](../README.md)

This list covers the 143 independent test directories of the parse (syntax and compilation) tier: 72 for v5 and 71 for v6. The new `P_syn_int_division` compiled successfully in an independent Pine Editor check. Each case's `meta.json` is authoritative for its verification status; runtime results are not verified here.

---

## 1. Layout and formatting compatibility (`P_fmt_*`)

| ID | Version | Expected result | Audited | What is tested and key criteria |
|---|---|---|---|---|
| `P_fmt_minimal` | v5 / v6 | `ok` | yes | Compiles the smallest valid Pine script skeleton |
| `P_fmt_crlf` | v5 / v6 | `ok` | yes | Support for CRLF (`\r\n`) Windows line endings |
| `P_fmt_tabs_mixed` | v5 / v6 | `ok` | yes | Mixed tab and 4-space indentation in one script |
| `P_fmt_continuation` | v5 / v6 | `ok` | yes | Continuation indentation: 2 spaces at global scope, 7 spaces inside a block, ternary expressions and argument lists spanning lines |
| `P_fmt_comment_before_version` | v5 / v6 | `ok` | yes | License comment header: a long license comment and blank lines before `//@version` (the standard form of open-source scripts) |
| `P_fmt_quotes_escapes` | v5 / v6 | `ok` | yes | Mixed single and double quotes, escape characters, strings containing `#` and `//`, and non-ASCII Unicode characters |
| `P_fmt_number_literals` | v5 / v6 | `ok` | yes | Number literals (scientific notation `1e-5`, `.5`, large numbers) and `#RRGGBB / #RRGGBBAA` color literals |
| `P_fmt_comments` | v5 / v6 | `ok` | yes | End-of-line comments, comments inside code blocks, blank lines inside blocks, `//` inside strings |
| `P_fmt_annotations` | v5 / v6 | `ok` | yes | Recognition of documentation annotations: `//@type`, `//@field`, `//@function`, `//@param`, `//@returns`, `//@variable` |
| `P_fmt_args_named_positional` | v5 / v6 | `ok` | yes | Function call arguments: positional, named, positional followed by named, named arguments out of order, and named arguments to built-in functions |
| `P_fmt_long_line` | v5 / v6 | `ok` | yes | Parsing robustness for a very long single-line compound expression |

---

## 2. Core syntax coverage (`P_syn_*`)

| ID | Version | Expected result | Audited | What is tested and key criteria |
|---|---|---|---|---|
| `P_syn_functions` | v5 / v6 | `ok` | yes | Single-line/multi-line functions, default parameters, named arguments out of order, parameter types and qualifiers, `[]` inside functions, nested function calls |
| `P_syn_tuples` | v5 / v6 | `ok` | yes | Tuple multiple return values and destructuring: user-defined function returns, destructuring `ta.macd / supertrend / bb / dmi` |
| `P_syn_types_udt_methods` | v5 / v6 | `ok` | yes | User-defined types (UDTs): `type` declarations (with default values), `Type.new()`, `method` object methods, field assignment, `[]` history references on UDT instances |
| `P_syn_enum` | v5 / v6 | `ok` | yes | Enum declarations (with/without titles), `input.enum`, matching enum values in `switch` branches, `str.tostring(enum)` |
| `P_syn_switch` | v5 / v6 | `ok` | yes | `switch` with an expression / without an expression (like an if-else chain) / default branch `=>` / used as an expression value or as a standalone statement |
| `P_syn_if_else` | v5 / v6 | `ok` | yes | `if / else if / else` as expressions and statements, deep nesting, branches returning different strings |
| `P_syn_loops` | v5 / v6 | `ok` | yes | `for` / `for...by` with a negative step / `for...in` iteration / `for [i,v] in` index-value iteration / `while` / `break` / `continue` |
| `P_syn_var_varip` | v5 / v6 | `ok` | yes | `var` and `varip` persistence across bars, explicit type declarations, persistent collections, compound assignment (`+=`, `-=`, etc.) |
| `P_syn_types_explicit` | v5 / v6 | `ok` | yes | Explicit type annotations: basic scalars, `int[]` / `array<float>` / `matrix` / `map`, drawing reference types, `na` of each type |
| `P_syn_inputs_all` | v5 / v6 | `ok` | yes | All `input.*` variants and the `minval/maxval/step/options/tooltip/inline/group/confirm/display` options |
| `P_syn_drawings` | v5 / v6 | `ok` | yes | Syntax of all drawing APIs: `table/line/label/box/linefill/polyline/plotshape/plotchar/plotcandle`, and others |
| `P_syn_alerts_log` | v5 / v6 | `ok` | yes | Alert and logging calls: `alert`, `alertcondition`, `log.*`, `runtime.error` |
| `P_syn_arrays` | v5 / v6 | `ok` | yes | Parsing of common `array.*` APIs |
| `P_syn_matrix_map` | v5 / v6 | `ok` | yes | Parsing of common `matrix.*` and `map.*` APIs |
| `P_syn_strings` | v5 / v6 | `ok` | yes | Common `str.*` APIs (including regex extraction, `str.format`, `str.format_time`) |
| `P_syn_math_color` | v5 / v6 | `ok` | yes | All `math.*` functions, plus the `color.*` constructors and component extraction functions |
| `P_syn_operators` | v5 / v6 | `ok` | yes | Arithmetic, comparison, logical, and ternary operators, unary minus, parenthesized precedence, and direct `[]` indexing of function return values |
| `P_syn_history_scopes` | v5 / v6 | `ok` | yes | Scopes and history: `[]` on variables inside functions, `var` inside functions (independent per call site), same-named local variables in `if` branches, `[]` inside loop bodies |
| `P_syn_conditional_calls` | v5 / v6 | `ok` | yes | `ta.*` called inside `if / switch` branches (TradingView only reports a warning; the syntax is valid and compiles successfully) |
| `P_syn_library` | v5 / v6 | `ok` | yes | `library` declaration: `export` of functions / user-defined types / methods |
| `P_syn_strategy_full` | v5 / v6 | `ok` | yes | `strategy()` declaration with all parameters, `entry/exit/order/close/close_all/cancel/cancel_all` calls with all parameters, and `strategy.*` state access |
| `P_syn_builtin_vars` | v5 / v6 | `ok` | yes | All built-in variables: OHLCV, `time`, `barstate.*`, `syminfo.*`, `timeframe.*`, date series, `session.*`, and others |
| `P_syn_time_functions` | v5 / v6 | `ok` | yes | The three `timestamp()` overloads, `time(tf, session, tz)`, date function forms, `timeframe.in_seconds(tf)` |

---

## 3. Compile errors (`P_err_*`)

| ID | Version | Expected result | Audited | Description |
|---|---|---|---|---|
| `P_err_indent_2spaces` | v5 / v6 | `error@3` | yes | Syntax error: a code block indented by only 2 spaces (the parser treats it as a continuation line, which causes a syntax error) |
| `P_err_continuation_4spaces` | v5<br>v6 | `error@3`<br>`ok` | yes | **Version difference**: a continuation line indented by 4 spaces is a syntax error in v5 (pointing to the line above), while v6 accepts it |
| `P_err_unclosed_paren` | v5 / v6 | `error@3` | yes | Syntax error: unclosed parenthesis |
| `P_err_unterminated_string` | v5 / v6 | `error@3` | yes | Syntax error: unterminated string literal |
| `P_err_positional_after_named` | v5 / v6 | `error@3` | yes | Syntax error: a positional argument appears after a named argument |
| `P_err_undeclared_identifier` | v5 / v6 | `error@3` | yes | Undeclared error: uses an undeclared variable or identifier |
| `P_err_reassign_undeclared` | v5 / v6 | `error@3` | yes | Undeclared error: `:=` assigns to an undeclared variable |
| `P_err_use_before_def` | v5 / v6 | `error@3` | yes | Undeclared error: a function is called before its declaration |
| `P_err_recursion` | v5 / v6 | `error@3` | yes | Undeclared error: attempted recursive call (the function's own identifier is not found inside its body) |
| `P_err_undefined_namespace_function` | v5 / v6 | `error@3` | yes | Undeclared error: the function does not exist in the namespace |
| `P_err_type_string_to_float` | v5 / v6 | `error@3` | yes | Type error: attempts to assign a `string` to a `float` variable |
| `P_err_wrong_arg_type` | v5 / v6 | `error@3` | yes | Type error: the argument type does not match the parameter type (for example, passing a `string` to a `series float`) |
| `P_err_float_as_int_length` | v5 / v6 | `error@3` | yes | Type error: passes a `series float` to a length parameter that requires an `int` |
| `P_err_input_defval_series` | v5 / v6 | `error@3` | yes | Type error: an `input` default value must be `const`, but a `series` is passed |
| `P_err_wrong_arity` | v5 / v6 | `error@3` | yes | Type error: a required argument is missing (overload resolution failures are classified as `type`) |
| `P_err_tuple_arity` | v5 / v6 | `error@3` | yes | Type error: the number of tuple destructuring variables differs from the number of returned values |
| `P_err_assign_type_change` | v5 / v6 | `error@4` | yes | Type error: uses `:=` to try to change the type of a declared variable |
| `P_err_redeclare_variable` | v5 / v6 | `error@4` | yes | Semantic error: a variable with the same name is declared twice in one scope |
| `P_err_plot_in_local_scope` | v5 / v6 | `error@4` | yes | Semantic error: `plot` is called in a local scope (such as inside a function or a conditional branch) |
| `P_err_input_in_function` | v5 / v6 | `ok` | yes | Calibrated by testing: `input` written inside a function compiles successfully in TradingView |
| `P_err_strategy_in_indicator` | v5 / v6 | `error@2` | yes | Semantic error: `strategy.entry()` is called in an `indicator()` script |
| `P_err_no_declaration` | v5 / v6 | `error@1` | yes | Semantic error: the `indicator()` / `strategy()` / `library()` script declaration is missing |
| `P_err_two_declarations` | v5<br>v6 | `error@1`<br>`error@3` | yes | Semantic error: declares both `indicator()` and `strategy()` |
| `P_err_no_version` | v5 | `error@1` | no | Missing `//@version`: TradingView treats the script as v1, where `indicator()` does not exist; the line number is inferred from v1 semantics |
| `P_err_version_4` | v5 | `ok` | no | A legacy `//@version=4` script (`study` declaration) that TradingView compiles normally; it is in the v5 directory only because each case must be in one of the two directories |
| `P_err_request_security` | v5 / v6 | `ok` | yes | Compiles successfully in independent native v5/v6 checks; verifies compilation only, not runtime results for requested data |
| `P_request_result_types` | v6 | `ok` | yes | bool/tuple result types of request calls, and a user function returning a tuple; compile-only verification |
| `P_syn_int_division` | v6 | `ok` | yes | Nonconstant integer division can initialize an explicit int declaration; compile-only verification; does not mean a float can be implicitly converted to int |
| `P_err_request_financial` | v5 / v6 | `ok` | yes | Compiles successfully in independent native v5/v6 checks; verifies compilation only, not runtime results for requested data |
| `P_err_strategy_risk` | v5 / v6 | `ok` | yes | Compiles successfully in independent native v5/v6 checks; this case verifies only the compile result of risk-management calls |
| `P_err_import` | v5 / v6 | `ok` | no | `import TradingView/ta/8` official library; TradingView compiles it successfully |

---

## 4. Version evolution probes (`P_ver_*`)

| ID | Version | Expected result | Audited | v5 vs. v6 language behavior change |
|---|---|---|---|---|
| `P_ver_bool_na` | v5<br>v6 | `ok`<br>`error@3` | yes | Three-state booleans: v5 allows assigning `na` to a `bool`; v6 enforces strict two-state booleans and rejects it with a compile error |
| `P_ver_int_as_bool` | v5<br>v6 | `ok`<br>`error@4` | yes | Implicit conversion: v5 allows an `int` to act implicitly as a `bool` condition; v6 requires an explicit comparison and rejects it with a compile error |
| `P_ver_duplicate_param` | v5<br>v6 | `ok`<br>`error@3` | yes | Duplicate argument: a call passes the same named argument twice; v5 only warns and compiles, v6 reports a compile error |
| `P_ver_history_literal` | v5<br>v6 | `ok`<br>`error@3` | yes | History reference on a literal: `10[1]` applies `[]` to a literal; v5 allows it, v6 rejects it as a semantic error |
| `P_ver_udt_field_history` | v5<br>v6 | `ok`<br>`error@6` | yes | UDT field history reference: `obj.field[1]`; v5 allows it, v6 rejects it as a semantic error (the history reference must apply to the whole object: `obj[1].field`) |
| `P_ver_plot_offset_series` | v5<br>v6 | `ok`<br>`error@3` | yes | `plot(offset=...)` given a series: v5 allows it (using only the last value); v6 requires const/simple and rejects it with a compile error |
| `P_ver_ema_series_length` | v5 / v6 | `error@4` | yes | `ta.ema` with a series length: v5 and v6 both strictly reject it (confirms consistency) |
| `P_ver_when_param` | v5<br>v6 | `ok`<br>`error@3` | yes | Deprecated `when` parameter: `strategy.entry(when=...)` is allowed in v5 (marked as deprecated) and removed entirely in v6 |
| `P_ver_mincontract` | v5 | `error@3` | yes | Current v5 does not provide `syminfo.mincontract`; the successful v6 run and full-history values are in the indicator case `I_syminfo_mincontract`; the error evidence is a verbatim record by the person who captured it, with no screenshot |
