# Iteration 147 — bounded outer SVC assembly ownership

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after declared
allocation bounds `6744bff`. One native staged message checks its outer total
before allocation and inner DVC/ZGFX claims before synchronous forwarding. Whole
packets borrow without copying. Partial deadline never extends; abandonment,
clock/framing failure and close release storage without retry. Reentrant
retirement preserves a dispatcher-borrowed span until return. Policy validation
is shared with the header inspector. This foundation is not in the production
worker receive path; actual upstream resource acceptance remains open.

Seven new portable cases cover every split, zero terminal completion, total/
claim limits, malformed progression, exact/late deadlines and active-span cleanup.
Combined portable suite passes **14 cases / 2,986 assertions**; bundled with
actual public ZGFX regression passes **16 cases / 3,018 assertions**. CTest
bundled **18/18**, foundation **7/7** pass with MSVC /analyze and /W4 /WX. The ZIP
is rebuilt without installing test executables. Six stateful seeds are generated;
the bounded-heap libFuzzer/CI target is prepared, not executed on this toolchain.

Full bundled `pnpm check` passes **498/498** Node cases, including strict native
TLS refusal, linked codec, actual WebSocket and synthetic Edge regressions.

No FreeRDP source/pin/public ABI/wire/feature selection changes. Public callback
placement/raw flags, cumulative DVC/concurrency, nested GFX/control/codec
allocations, actual malicious/lost transport, platform/sanitizer/fuzz/soak remain
open. [Contract](DVC_SVC_INGRESS.md).
