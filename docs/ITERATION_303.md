# Iteration 303 — actual Windows Notepad input/clipboard roundtrip

2026-10-18. Revisits pending Stage 5/7 application acceptance after restored
Windows lab access and the user's empty Notepad preparation. Implements a
private bounded operator-assisted helper and exact readback assertion for
SPECIFICATION §2.5/§2.7. Production/native/Release code and pins are unchanged.

## Actual application observations

One linked worker at 1920×1080 connects using the same approved session-only
fingerprint. The operator confirms the empty Notepad via its native JPEG.
Four distinct explicit Ctrl+C/new-offer reads match fixed expected UTF8:

- committed Latin/Cyrillic/Japanese/emoji text is delivered to Notepad;
- a Node Unicode offer is consumed by actual application paste, then copied back;
- physical left Shift/number keys, explicit held-left-Ctrl reset and extended
  right-Ctrl selection/copy produce the exact expected result;
- a fixed left-button click and subsequent text/copy produce the expected result.

The final cleanup clears the temporary document, receives empty-offer and
no-format-revoke ACKs, closes Notepad with Alt+F4 without saving, preserves
heartbeat and leaves an empty native runtime. A later fresh snapshot shows
the desktop with no Notepad/save prompt; only then is `finish` confirmed.
The interactive exec session **91671 exits 0** with every named result true.
No host clipboard, arbitrary remote command, remote file save or physical
device capture is used. Incoming read buffers are wiped; no remote clipboard
contents enter the helper's output, errors or metrics.

This is private Node/native/Windows application integration, not browser
Clipboard API or OS-IME composition. Small text / a 1,024-byte selected quota
does not establish full-item/direction/quota/resource acceptance. Mouse scope
is the fixed left-button/application sequence, not all buttons, physical
hardware or an independently measured focus-transition/latency gate.

## Preparation failures and tooling

The initial automatic-launch attempt captures a Windows transition screen;
no application readback is attempted and cleanup succeeds. A subsequent
operator-checked run is aborted before text because a Run window is not
confirmed. All aborted runs exit 1 with empty runtime; their cause is not
promoted to a production keyboard/graphics diagnosis. The final helper removes
application launching entirely and uses the empty Notepad provided by the user.
Legacy first-frame evidence remains `.local-tests/windows-app-first-launch.jpg`.

Single 350 ms phase images can lag actual input/readback; the mouse/close
decision uses an additional later snapshot. No measured render latency or
smoothness is claimed. [Reproduction and manual gates](WINDOWS_APPLICATION_SMOKE.md).

Three focused readback tests pass **3/3**, including exact Unicode bytes,
refusal/mismatch wiping, bounded expectations and fixed diagnostics. They use
synthetic buffers and are distinct from the actual application run.
The helper has one issued read at a time, fixed action order, finite stdin/body/
session bounds and no automatic retry. Configuration errors omit raw JSON.

## Retained evidence and limits

The original interactive tool output retains phase/result receipts. The exact
scalar result is also explicitly **transcribed**, not claimed as raw stdout,
in `build/iteration-303-observed-result.json`. Phase JPEGs remain ignored at
`.local-tests/windows-app-{desktop,unicode,paste,keyboard,mouse,close,inspect}.jpg`.
Future helper runs additionally save a scalar-only ignored JSON report; that
final persistence addition is not represented as part of the earlier exec run.
Readback-unit evidence is `build/iteration-303-focused.log`; full regression
logs are `iteration-303-windows.log` and `iteration-303-linux.log` with explicit
Linux code overlays in `iteration-303-transfer.cjs` / `iteration-303-run.py`.

Native CTest remains iteration 300's Windows 16/16 and Linux 17/17 baseline;
no native code changes occur here. Full keyboard/layout/IME, multiline,
disconnect-held input, wheel/touch/other buttons, browser/host clipboard,
large quotas/drives, audio and broader platform/resource/soak gates remain open.

Full Linux `pnpm check` passes build/lint/format and **602 passed / 148
platform/profile skips / 750 total / zero failures**, Node duration 108.84
seconds. This restricted no-network fixture runs the new pure matcher tests,
not the Windows application helper or an RDP connection.

Full Windows `pnpm check` also passes build/lint/format and **657 passed / 90
platform/profile skips / 747 total / zero failures**, Node duration 380.64
seconds. Final helper configuration-error/reporting cleanup changes receive
separate ESLint/Prettier checks after the interactive run. Working/staged
diff and local-link checks pass; runtime emptiness is checked independently.
