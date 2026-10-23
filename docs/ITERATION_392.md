# Iteration 392 — complete actual browser/Notepad Clipboard smoke

2026-10-21. Continues SPECIFICATION §2.7 / P0 MVP browser Clipboard acceptance.
The named actual bidirectional result in [385](ITERATION_385.md) remains valid;
this iteration completes the previously pending combined cleanup sequence.

With separate user approval and a prepared empty maximized Notepad, the current
Release worker [391](ITERATION_391.md) accepts one browser-to-Windows offer.
Real local Clipboard API paste stays local before Send. Twelve key events reach
the adapter, but Ctrl+C produces no fresh remote offer; zero remote reads occur.
The helper exits 1 at `browser-to-notepad-offer`. It accepts no-format revoke and
joins an empty runtime. Own synthetic text may remain in the unsaved window;
no application consumption, roundtrip or document clearing is accepted.
Evidence: `build/iteration-391-browser-clipboard.log`. No failure frame is saved,
so focus/application/root-cause claims would be unsupported.

Review finds that this scenario spends its only authorized editor click as soon
as the first RDP frame arrives. The ordinary viewer smoke already waits fifteen
seconds for the Windows login/desktop transition. The Clipboard helper now
uses the same bounded delay before its one click. This avoids treating the first
frame as a settled application; the delay itself is not readiness proof or a
confirmed correction of the observed roundtrip failure.

The existing single failure-frame request could also race the viewer's sole
native capture request and receive no frame. On the explicitly opted-in failure
path, future viewer pulls now stop, the current request is joined and only then
one full JPEG is requested through the original capture method. No frame history,
repeated capture, OCR, screenshot loop or new diagnostics subsystem is added.
The existing whole-scenario watchdog remains in force.

Syntax, focused ESLint/format and `git diff --check` pass. No production/native,
wire, Release configuration or dependency change occurs. The user separately
authorizes one repeat with the same exact fingerprint, one editor click and one
failure frame. It runs after the full Release regression [391](ITERATION_391.md)
finishes, with no concurrent heavy checks, and exits 0:

- actual headed Edge Clipboard API → separate local Paste / Send → CLIPRDR →
  Notepad paste/copy → fresh offer → public Get matches the fixed text;
- public Unicode input replaces that verified document; Notepad copy → public
  Get → separate local Copy → actual local Clipboard API read matches the
  second fixed text, including Cyrillic/Japanese/emoji and three lines;
- one native write, two reads and 30 physical key events; no native write occurs
  during local Paste. Both directions use the explicit 1,024-byte cap;
- after readback, Ctrl+A / Backspace are sent to the just-verified test document.
  Empty application content is not independently read back or captured;
- the actual browser context's denied read permission reaches the UI refusal,
  with no extra native write;
- viewer detach receives accepted no-format revoke and clears its text fields;
  server/native/browser close joins an empty runtime. Post-run inventory finds
  no worker PID. The report's `nativeState:"connected"` is an unsubscribed
  observer value, not evidence of a retained process;
- no failure frame is requested/saved on the successful path.

Evidence: `build/iteration-392-browser-clipboard.log`, worker hash
`fff1781f42dcf64184a96b0c9655cbcfc3bc57d4661bc478f2f9676340b55056`.
The passing repeat supports this prepared scenario, not a proof that the earlier
failure had a single focus/login cause. The serialized failure-capture branch
is not exercised by this successful invocation.

Existing Edge / actual-WS / fake-RDP direction and retirement focus passes 3/3
in 21.66 s, and actual Edge permission refusal without RDP passes 1/1 in 2.08 s.
Logs: `build/iteration-392-browser-focus.log`, `iteration-392-permission.log`.
Full unchanged production/native Release checks remain [391](ITERATION_391.md):
CTest 34/34, process/TLS/lifecycle 27 / one skip and full Node 890 / 51 skips.
The final source/artifact audit matches all 353 native files, both new Release
outputs and seven protected inputs. No new dependency/Release configuration
or wire change occurs. Actual wider direction/quota/isolation/resource matrices,
other formats and managed drives remain Stage 7 work.
