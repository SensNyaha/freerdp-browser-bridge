# Iteration 146 — DVC/ZGFX allocation-header foundation

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after microphone
telemetry `1ceb333`. An allocation-free native inspector bounds DATA_FIRST and
independent ZGFX size/count claims before a future caller enters the host. It
preserves pinned little-endian selector aliases and distinguishes logical size
from codec scratch/padding. No dependency source, pin, ABI, wire or worker receive
callback changes in this block. Upstream preallocation acceptance is still open.

Portable cases cover invalid/reduced policies, truncated/huge claims, raw and
compressed sizes, contradictory ranges, empty multipart padding and partition
invariance. Linked cases call actual public pinned zgfx_decompress for raw,
compressed literal and empty output, and a 12 MiB multipart roundtrip. Large raw
DVC data is also inspected. This is synthetic SDK evidence, not actual drdynvc
host callback placement or negotiated GFX/RDP/device acceptance.

The initial bundled fixture compile collided with the Windows small macro;
the variable was renamed without suppressing warnings or changing SDK headers.
Both native builds retain /analyze, /W4 /WX. A libFuzzer target, thirteen mixed
header seeds and Linux CI step are prepared. The seed script runs locally;
Clang/libFuzzer/sanitizer and CI execution are not claimed on this MSVC toolchain.

Outer SVC/cumulative DVC admission, public callback/lifetime placement, nested
GFX/codec/control allocations, concurrent budgets, abandonment and actual hostile /
lost transport remain open. [Contract](DVC_ALLOCATION_BOUNDS.md).

Focused native foundation passes **7 cases / 2,815 assertions**; bundled metadata
plus public SDK passes **9 cases / 2,847 assertions**, including the 12 MiB ZGFX
roundtrip. CTest bundled **18/18** and foundation **7/7** pass after both native
builds. The ZIP is rebuilt; test executables remain outside the installed runtime.
Full pinned-Node-24 `pnpm check` passes **498/498**; native formatting and diff
checks pass. Fuzz/sanitizer/actual-host placement gates remain unrun/open as above.
