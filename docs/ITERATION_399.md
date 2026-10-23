# Iteration 399 — clear inherited pointer state on a fresh controller

2026-10-21. Continues SPECIFICATION §2.5 and the user's accepted hard-loss
behavior recorded in [398](ITERATION_398.md). A broken TCP transport cannot
deliver key/button releases. The next usable controller must clear the remote
standard mouse buttons even when its own local pressed-state tracker is empty.

An explicit input reset now releases tracked keys/buttons, then sends standard
left/middle/right button-up events at the current pointer position. A failed
send stops the sequence and fails the operation. The reference viewer sends
one initial reset after connected state and the matching desktop have rendered,
before admitting user input. Sending only at native connection activation was
too early for this XRDP backend; no fixed delay is added to production code.
The control wire remains unchanged. Live blur/detach release remains required.

Actual owned-XRDP/public Edge evidence:

- A controlled relay interruption observes Ctrl and left mouse held before and
  after transport loss. Terminal failure and runtime cleanup pass; immediate
  remote release is not claimed (`iteration-399-owned-held-loss.log`).
- A fresh public viewer with the corrected Release worker observes the inherited
  held state, sends one initial reset and reads Ctrl released / buttons zero
  from the independent fixed X11 observer. The observer injects no input.
  H.264, cursor replay, viewer reattachment and cleanup pass
  (`iteration-399-owned-public-recovery.log`).
- The same new viewer with the previous worker fails that recovery assertion,
  after the controlled old-worker held-loss precondition is re-established.
  Logs: `iteration-399-old-worker-held-loss.log`,
  `iteration-399-old-worker-public-reset.log`. This rules out the viewer alone
  providing the missing native button release.

Earlier direct/startup attempts and failed held-state preconditions remain in
the `iteration-399-owned-*.log` files; they are not acceptance results.

The isolated linked Release build uses the same pinned SDK/dependencies and
configuration. CTest passes 34/34 in 27.88 s; lifecycle focus passes 27 with one
skip. Receipt: `build/native-clean-Jaufw3/receipt.json`; worker SHA-256
`75d5e9cdf5248394743065180a4c45b468b286999cd6beb182e889bb9d4cc497`.
The three touched native files match the receipt's source snapshot byte for
byte. Current full Windows `pnpm check` passes 898 / 51 skips / 949 total,
zero failures/cancellations in 606.04 s (`iteration-399-full-check.log`).
Viewer/input focus passes 13/13 (`iteration-399-viewer-input-focus.log`).

This accepts the named inherited standard-button recovery on owned XRDP,
separate from general RDP reconnect, remote application/layout matrices,
hard-loss delivery guarantees and the still-incomplete active 30-minute gate.
