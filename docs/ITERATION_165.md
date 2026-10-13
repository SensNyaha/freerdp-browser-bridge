# Iteration 165 — production decoded graphics callback placement

2026-10-13. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §4/11/12 after
`34fc976`. [Placement, lifecycle, zero-output correction and open gates](GFX_MESSAGE_PLACEMENT.md).

Public Graphics completion now selects the bounded decoded-message owner before
actual metadata parsing. Actual public command counters prove that refused
metadata does not enter rdpgfx_recv_pdu. Empty decoded messages cannot reach the
pinned null-buffer static-stream assertion. Linked DVC suite passes 127 cases /
7,569 assertions. Bundled CTest 21/21, foundation 9/9, MSVC /analyze /W4 /WX,
clang-format and full bundled `pnpm check` 498/498 pass with zero Node failures /
cancellations. After zero-output correction actual XRDP H.264 passes 49 1080p
frames and JPEG passes 59; both resize to 1280×720, restore 1920×1080, reattach /
replay display/cursor and clean the runtime. Each sends only one authorized
motion/four resets. No physical capture, keys/buttons/text/touch/audio generation
or broader negotiated GFX acceptance is inferred. Other codecs/working arrays, multiple-channel
compatibility, memory/CPU/remote/platform/fuzzer/soak gates remain open; no release
checkbox is completed from compilation or synthetic transport alone.
