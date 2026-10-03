# Parse 用例指南

[← 返回测试集导航](../README.md)

Parse 用例记录一段 Pine 源码在 **TradingView Pine Editor** 中的编译结果：通过，或在哪一行报错。用例只包含源码与元数据，不需要图表数据。

完整清单见 [`INDEX.md`](./INDEX.md)。

---

## 规模与组成

- 共 143 个目录（`v5/` 72 个，`v6/` 71 个），139 个 verified、4 个 unverified。无版本与 v4 探针只放在 v5；新增 `P_ver_mincontract` 的 v6 成功运行证据位于 indicator 用例。
- 每个目录仅包含源码与元数据；来源摘要和编译记录放在 `meta.capture`，完整采集材料留在独立归档：
  - `source.pine`：正向脚本或故意包含错误的片段；
  - `meta.json`：`expect.compile` 为 `"ok"` 或 `"error"`，报错时附 `expect.error.line`。

---

## 四类前缀

| 前缀 | 内容 | 编译预期 |
|---|---|---|
| `P_fmt_*` | 排版与格式：CRLF / LF、Tab 与空格混用、续行缩进、许可证注释头、引号转义、Unicode、数字与颜色字面量、文档注解 | `ok` |
| `P_syn_*` | 语法全集：函数、元组、UDT 与方法、枚举、控制流、`var`/`varip`、显式类型、`input.*`、绘图、集合、`library`、`strategy` 全参数 | `ok` |
| `P_err_*` | 编译错误：语法错误、未声明标识符、类型不匹配、参数个数错误、重复声明、指令位置非法等 | 多为 `error` |
| `P_ver_*` | v5 与 v6 差异探针：多为 v5 通过、v6 报错 | 依版本 |

`P_err_*` 中有几个用例经 TradingView 实测编译通过（如 `P_err_input_in_function`、`P_err_request_security`），ID 保持不变，以 `meta.expect` 为准。

---

## 记录规则

1. `source.pine` 的第一个非空非注释行必须是 `//@version=N`，且与目录版本一致（允许前置许可证注释）。
2. `expect.error.line` 为 TradingView 报错指向的行号（从 1 起算）。
3. 用例 ID 一经收录保持稳定；若实测结果与最初预期不符，修改 `meta.expect` 并在 `notes` 中说明，不改 ID。
4. `verified: false` 的用例表示 `expect` 尚未在 Pine Editor 重新确认。

编译通过不等同于引擎已支持运行。`P_err_request_security`、`P_err_request_financial`
的 v5/v6 原生复核仅确认编译结果，没有提供请求的次级数据或对比运行输出。
`P_err_strategy_risk` 的 v5/v6 均完成原生编译复核，此用例同样只验证编译结果。
