# Iteration 164 — isolated decoded graphics owner and measured forwarding cost

2026-10-13. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §4/11/12 after
`a6c60e2`. [Public API, lifetime, storage and measurements](GFX_MESSAGE_GATE.md).

Nine actual public-codec/native fixture cases / 904 assertions pass. Windows
bundled CTest 21/21, MSVC /analyze /W4 /WX and clang-format pass. The production
worker does not select this owner yet; existing XRDP regression belongs to the
separately committed backend ABI correction. Foundation CTest 9/9 and full bundled
`pnpm check` 498/498 pass with zero failures/cancellations. Native allocator/resource/CPU, actual
negotiated GFX/Windows server, platform/sanitizer/fuzzer/soak gates remain open.
No wire/capability/dependency source/pin/private SDK ABI change.
