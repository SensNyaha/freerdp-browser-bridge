# Iteration 48 — composed channel provider ownership

Date: 2026-10-10. Implements SPECIFICATION §2.6 virtual audio without host sound
services, ARCHITECTURE §5/7 channel lifetime and bounded ownership, and preserves
the existing Stage 5 RDPEI provider path. Continues `2713056` (iteration 47).

The previous cached-entry check required each provider to be the current global
loader. Delegating through another bridge provider resolved the entry but refused
its later invocation. A common fixed scope stack now recognizes the complete
owned chain. It requires one context and serialized thread, unique callbacks,
and at most eight records. No allocation, private FreeRDP layout or source patch
is introduced. Unknown replacements disable dispatch and survive cleanup.

Close checks reverse binding order before retiring resources. An inner audio
scope with pending confirmations stays attached until the host completes them;
an outer touch close cannot invalidate its loader chain. Both nesting orders
exercise actual linked RDPEI registration and actual RDPSND PCM/backend dispatch
through simulated public DVC/SVC hosts. Exact PCM and queued-frame preservation
are checked. These tests are not remote input or audible browser acceptance.

Verification:

- Scope tests **4 cases / 70 assertions**, RDPSND **40 cases / 1,504 assertions**.
- Foundation CTest **5/5**, bundled **13/13**, /W4 /WX /analyze.
- pnpm check **141/141**, no skips/cancellations, **130.25 s**.
- Actual authorized XRDP in Edge: H.264 **42 frames**, JPEG **45 frames**,
  1920×1080; touch ready with ten contacts/generation 2, reattachment replay,
  cursor and motion/reset checks pass. Each sends one motion and one reset,
  no keys/buttons/wheel/text/touch. This preserves worker input/media behavior;
  it does not activate audio or prove remote touch consumption.
- clang-format and git diff whitespace checks pass.

Logs: ignored `build/iteration-048-*.log`.

Worker audio remains disabled. Larger PCM bursts, earlier core allocations,
upstream overrun, finite worker audio shutdown deadlines, media/PTS/browser
playback, microphone and actual Stage 5/6 gates remain open.
