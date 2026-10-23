# Iteration 167 — static RDPSND production receive admission

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §11/12 after
`3dda6f4`. [Placement and retained gates](RDPSND_RECEIVE_PLACEMENT.md).

The worker selects independent bounded static RDPSND assembly and PDU validation
ahead of its original public receive callback, including automatic audio-off
fake fallback. Eight public/actual-linked-fake-SVC cases / 189 assertions and
the linked DVC suite 135 cases / 7,759 assertions pass. Bundled CTest 21/21,
MSVC /analyze /W4 /WX pass. No audible, physical capture or dynamic RDPSND
resource acceptance is inferred from these fixtures.

Foundation CTest 9/9 and clang-format pass. Actual authorized XRDP H.264 renders
60 1080p frames; JPEG renders 51. Both resize to 1280×720, restore 1920×1080,
reattach/replay display/cursor and clean the runtime. Each sends only one motion
and four input resets; no keys, touch, generated audio or physical capture is
used. These idle lab runs do not prove audible RDPSND or ready AUDIN acceptance.

Full bundled `pnpm check` passes 498/498 with zero failures or cancellations.
The initial fixture used a backward timestamp after completing audio; its
failure correctly exercised the clock guard and was corrected to monotonic
fixture time. Production clock rules remain unchanged.
