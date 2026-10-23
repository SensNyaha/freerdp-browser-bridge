# Windows Notepad input and Unicode clipboard smoke

This private lab check exercises SPECIFICATION §2.5/§2.7 through an actual
native worker and the Windows application. It uses the existing linked worker,
not a simulated RDP backend or GUI capture. The endpoint is the user-confirmed
`192.168.21.149:3389`; other targets and non-Windows hosts are refused.

Prepare one fresh, empty, unsaved Notepad on that desktop, with its editor
covering desktop coordinate (1000, 300). The reference profile is 1920×1080.
Do not use a document whose contents must be preserved. Keep other input owners
idle during the check. This is an operator-assisted fixture, not unattended CI.

After the ordinary Node build, start with the previously approved fingerprint:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/test-windows-application.mjs $fingerprint
```

Inspect `.local-tests/windows-app-desktop.jpg`; use `snapshot` on stdin if the
initial frame is a Windows transition screen. Confirm the empty Notepad before
entering `unicode`. Inspect each completed phase frame before the next command.
Commands are fixed ASCII lines, at most 32 bytes each / 512 total, with a
five-minute session deadline. No shell command or arbitrary key/text/path is
accepted from stdin. `abort` fails the check and joins native cleanup.

| Command | Named observation |
| --- | --- |
| `unicode` | Fixed Latin/Cyrillic/Japanese/supplementary text through committed Unicode; select/copy and exact CLIPRDR readback. |
| `paste` | Fixed UTF8 offer → actual Windows paste → select/copy → exact readback. |
| `keyboard` | Physical Shift+Digit1, Digit2, held-left-Ctrl reset and Digit3; select/copy with extended right Ctrl and exact readback. |
| `mouse` | Start-key transition, fixed left click in the prepared editor and known text/readback. |
| `close` | Clear test document; empty Unicode offer ACK, no-format revoke ACK; Alt+F4 without saving. |
| `snapshot` | Fresh encoded JPEG only; does not advance the action sequence. |
| `finish` | Operator confirms the window is closed; heartbeat and joined empty-runtime shutdown. |

If a phase fails, only cleanup/finish remain; uncertain content operations are
never retried. If a save prompt appears, do not confirm `finish` until the
temporary document has been closed without saving. The helper never selects
backup/account settings or launches a remote application/command.

Clipboard selection is explicit bidirectional Unicode with a 1,024-byte cap.
Each read follows the test's own Ctrl+C and requires a newer offered revision.
Only equality is reported; returned result bytes and comparison buffers are
wiped even on mismatch. There is no host Clipboard API. Credentials stay in
ignored local files/private IPC, never argv/env/output. Images and scalar
reports remain ignored; they are not release artifacts.

Phase frames are observations, not a server-paint fence: the 350 ms wait does
not guarantee the latest image. Take another snapshot before a visual decision.
The exact clipboard readback is the application text assertion. No latency or
smoothness acceptance is inferred from these short captures.

The named small-text Windows smoke does not accept all keyboard layouts/IME,
line endings, buttons/wheel/touch, physical hardware, disconnect-held input,
browser/host clipboard, full quotas, drives or broader platform/soak gates.
[Actual evidence](ITERATION_303.md).
