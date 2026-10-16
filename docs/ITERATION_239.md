# Iteration 239 — clipboard-off form and actual viewer regression

2026-10-16. Continues SPECIFICATION §2.7 without reusing the consumed clipboard
mutation permission. The reference form now disables the item quota input while
clipboard is off. A previously emptied quota no longer blocks ordinary HTML
form submission after the user turns clipboard off. Switching on reenables the
same finite validated input. Unit and actual Edge/form/HTTP checks verify both
selected policy and later off/empty-quota cancellation; focused checks pass 6/6.

The Windows XRDP viewer helper has an explicit asset list. It now serves all
four clipboard modules imported by the current viewer, alongside its earlier
modules. Its Clipboard API is mocked with refusal, so this desktop regression
cannot read/write the real host clipboard even if an unintended request occurs.
It checks zero native clipboard source events, zero browser API requests, five
disabled panel buttons and two empty fields, both after rendering and at final
report. Clipboard remains unselected in the native session.

Actual authorized XRDP / Windows producer / headless Edge now passes:

- JPEG: nonblank 1920×1080, 45 frames, 5,024,286 encoded bytes, cursor replay and
  fresh-token viewer reattachment; queued frames/bytes and media buffered bytes
  are zero in the final sample. One motion and one input reset are observed.
- H.264: nonblank 1920×1080, 46 frames, 362,113 encoded bytes, fresh configuration /
  keyframes and cursor/attachment replay; the same final queue values are zero.
  One motion and one input reset are observed.
- Both retain the exact previously approved session-only certificate fingerprint,
  private IPC credentials, zero clipboard events/API requests and joined cleanup
  with an empty `.runtime/viewer-lab`. No remote clipboard data request or offered
  text is sent, and no OS clipboard is accessed.

Logs: `build/iteration-239-xrdp-jpeg.log` and
`build/iteration-239-xrdp-h264.log`. These are bounded desktop/default-off smokes,
not enabled clipboard acceptance, a new performance/soak pass, or diagnosis of
earlier intermittent protocol/TLS-fixture failures. Full bundled Windows
`pnpm check` passes 643 with 49 skips / 692 cases; Linux passes 638 with 57 skips /
695 cases. C++ parser/channel code is unchanged; Iteration 238's Windows 29/29 and
Linux 30/30 native baselines keep their scope. Logs: `build/iteration-239-*`.

Actual activated clipboard data consumption/readback/revoke, physical/browser
permission, total resource/network behavior and remaining Stage 7 gates stay open.
