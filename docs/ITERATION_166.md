# Iteration 166 — complete RDPSND message owner

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §11/12 after
`07521ce`. [Ownership and bounds](AUDIO_SVC_INGRESS.md).

The isolated owner checks complete RDPSND messages before a consumer, retains
one fixed arena through callback borrows and places a nonrenewing deadline over
both fragment assembly and legacy WaveInfo/Wave. Nine portable cases / 8,358
assertions, Windows foundation CTest 9/9 and bundled CTest 21/21 pass with MSVC
/analyze /W4 /WX. Full bundled `pnpm check` passes 498/498 with zero failures or
cancellations; clang-format passes and seed generation succeeds. The fuzzer
and corpus are prepared, not executed locally.
No worker selection, audio device, wire contract or capability changes here.
Production placement, transport/core/pool limits, remote audio, platform,
sanitizer/fuzzer and soak acceptance remain open.
