# Iteration 168 — dynamic RDPSND production admission

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §11/12 after
`b63b906`. [Placement, ownership and retained gates](RDPSND_DYNAMIC_ADMISSION.md).

The exact public audio DVC name selects bounded header admission before host
assembly/decompression and complete PDU validation before RDPSND pool copying.
Eight public/actual-linked-fake-SVC cases / 120 assertions and the linked DVC
suite 143 cases / 7,879 assertions pass. Bundled CTest 21/21 and MSVC /analyze
/W4 /WX pass. An initial test counted the SDK's refused-channel CLOSE as an
audio reply; separate fixed counters now distinguish control from audio data.
No audible audio, physical capture or broader resource acceptance is claimed.

Foundation CTest 9/9, clang-format and git diff checks pass. Actual authorized
XRDP H.264 renders 50 1080p frames; JPEG renders 54. Both resize to 1280×720,
restore 1920×1080, reattach/replay cursor/display and clean the runtime. Each
sends one authorized motion and four resets, without keys/touch/audio generation
or physical capture. The lab remains an idle audio-source check.

The initial full Node run passes 497/498 with one Edge page.goto/load timeout
before the PCM permission-denied scenario starts. Three isolated repetitions
of that exact scenario pass with unchanged product and test deadlines. A clean
full repeat was required before claiming the bundled Node gate passes.
That unchanged full repeat passes 498/498 with zero failures or cancellations.
