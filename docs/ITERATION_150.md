# Iteration 150 — cumulative declaration budget and pool evidence

Date: 2026-10-12. Implements SPECIFICATION §3.3 / ARCHITECTURE §11 after worker
DVC admission `1e16dd6`. A fixed allocation-free declaration table enforces trusted
aggregate/per-message/slot policy, original deadlines, replacement deltas and
observed release. This foundation is not connected to the worker. Clearing its
table is not release of actual host resources.

Five new portable cases and two public linked WinPR pool cases pass. Portable
suite **19 cases / 5,384 assertions**, linked **36 / 5,807**, bundled CTest
**18/18**, foundation **7/7** pass with /analyze /W4 /WX. Actual pool tests show
released 12 MiB and multiple 1 MiB buffers retained for tiny requests. The local
cache/source threshold is per-stream 16 MiB; no aggregate pool cap is inferred.
No FreeRDP source/pin/build option/ABI/wire/capability changes.

Public completion/lifetime placement, active host admission, logical abandonment,
channel/count/cached-memory/nested codec limits, actual remote/malicious transport,
Linux/sanitizer/fuzz and soak remain open.
[Contract and integration conditions](DVC_MESSAGE_BUDGET.md).

Full bundled `pnpm check` passes **498/498** Node cases, including native lifecycle,
strict TLS refusal, WebSocket and synthetic Edge microphone regressions.
