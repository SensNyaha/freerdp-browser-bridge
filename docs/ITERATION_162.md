# Iteration 162 — decoded GFX PDU count/framing foundation

2026-10-13. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §4/11 after
`2d69844`. [Source audit and prepared contract](GFX_PDU_ADMISSION.md).

Five portable cases / 53 assertions and the additional actual public ZGFX-output
case pass; linked DVC suite is 121 cases / 7,275 assertions. Windows bundled
CTest 20/20, foundation 9/9 and MSVC /analyze /W4 /WX pass. Production placement
ahead of pinned metadata allocations is not enabled yet. Full bundled `pnpm check`
passes 498/498 with zero failures/cancellations; clang-format and seed generation
pass. The Clang/fuzzer/sanitizer target is prepared, not run locally.
No wire/capability/source/pin/ABI change.
Actual remote graphics, decoded-owner/lifetime, codec/pool/RSS and resource /
platform/sanitizer/fuzzer/soak gates remain open.
