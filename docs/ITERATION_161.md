# Iteration 161 — incoming H.264 coded-dimension admission

2026-10-13. Implements SPECIFICATION §2.3/3.1/3.3 and ARCHITECTURE §4/11 after
`70ca333`. Allocation-free complete-unit SPS/subset-SPS prefix inspection now
precedes public GFX AVC420 renderer/decoder dispatch. Surface-coded dimensions,
bounded syntax loops, immutable prediction after refusal and actual private SDK
IDR/predictive recovery are covered. [Contract and source audit](AVC_DECODE_ADMISSION.md).

Six portable cases / 124 assertions and combined public GDI/GFX 13 cases /
36,398 assertions pass. Final Windows bundled CTest 19/19, foundation 8/8,
MSVC /analyze /W4 /WX, clang-format and full bundled `pnpm check` 498/498 pass
with zero Node failures/cancellations. The fuzz seed helper runs; Clang/fuzzer/
sanitizer execution remains unavailable locally, not claimed as passing.

Initial Node gates stopped before tests because ESLint/Prettier's root-directory
walk encountered EPERM on `.local-tests`. Tooling now excludes local/runtime data
and passes explicit maintained source roots to Prettier. No ACL relaxation or
private-file read/write was used to repair the check. [Development workflow](DEVELOPMENT.md).

Total decoder working
memory, retained pools/RSS, actual negotiated remote GFX, hostile/lost transport,
platform/sanitizer/fuzzer and soak gates remain open. No public wire/capability,
dependency/source/pin/ABI change. Actual lab regression is not inferred from
these native fixtures.
