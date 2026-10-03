# Parse case guide

[← Back to the suite overview](../README.md)

A parse case records the compile result of a Pine source in the **TradingView Pine Editor**: it compiles successfully, or it reports a compile error on a given line. A case contains only source and metadata and needs no chart data.

The full list is in [`INDEX.md`](./INDEX.md).

---

## Size and composition

- 143 directories in total (72 in `v5/`, 71 in `v6/`): 139 verified and 4 unverified. The no-version and v4 probes exist only under v5. The v6 evidence of a successful run for the new `P_ver_mincontract` is in an indicator case.
- Each directory contains only source and metadata. The provenance summary and compile record go in `meta.capture`; the complete capture material stays in a separate archive:
  - `source.pine`: a valid script, or a snippet that contains a deliberate error;
  - `meta.json`: `expect.compile` is `"ok"` or `"error"`; for a compile error it also has `expect.error.line`.

---

## Four prefixes

| Prefix | Content | Expected compile result |
|---|---|---|
| `P_fmt_*` | Layout and formatting: CRLF / LF, mixed tabs and spaces, continuation indentation, license comment headers, quote escaping, Unicode, number and color literals, documentation annotations | `ok` |
| `P_syn_*` | Full syntax coverage: functions, tuples, UDTs and methods, enums, control flow, `var`/`varip`, explicit types, `input.*`, drawings, collections, `library`, `strategy` with all parameters | `ok` |
| `P_err_*` | Compile errors: syntax errors, undeclared identifiers, type mismatches, wrong argument counts, duplicate declarations, misplaced directives, and others | Mostly `error` |
| `P_ver_*` | v5 vs. v6 difference probes: most compile successfully in v5 and fail in v6 | Depends on version |

Several `P_err_*` cases compile successfully when tested in TradingView (for example `P_err_input_in_function` and `P_err_request_security`). Their IDs are unchanged; `meta.expect` is authoritative.

---

## Recording rules

1. The first non-empty, non-comment line of `source.pine` must be `//@version=N` and must match the directory version (a leading license comment is allowed).
2. `expect.error.line` is the line number that TradingView's compile error points to (1-based).
3. A case ID stays stable once added. If the tested result differs from the original expectation, update `meta.expect` and explain it in `notes`; do not change the ID.
4. A case with `verified: false` means its `expect` has not yet been reconfirmed in Pine Editor.

Compiling successfully does not mean the engine supports running the script. The native v5/v6
rechecks of `P_err_request_security` and `P_err_request_financial` confirm only the compile
result; they provide no requested secondary data and no runtime output to compare.
Native compile rechecks of `P_err_strategy_risk` are complete for both v5 and v6; this case
likewise verifies only the compile result.
