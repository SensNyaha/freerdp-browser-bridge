# Iteration 394 — actual public keyboard and modifier release

2026-10-21. Addresses MVP basic physical keyboard and held-input release after
the actual Clipboard chain [392](ITERATION_392.md). No new input protocol,
native owner, modifier mapping or application automation is introduced.

The existing explicitly prepared Notepad scenario gains opt-in
`--focus-editor --keyboard-smoke`. The default Clipboard scenario is unchanged.
It first verifies its own fixed Unicode document through real CLIPRDR. It then
uses only public reference-viewer physical keyboard events:

- append Shift+Digit1 and Digit1, expecting `!1` for the named current layout;
- hold left Ctrl, right Shift or left Alt, focus the local text field, release
  outside the remote canvas, refocus and append a digit. Exact copied readback
  checks that blur/reset did not leave the remote modifier held;
- hold right Ctrl while detaching the viewer, release locally, issue fresh
  control/media tokens for the same RDP session and append another digit after
  reattachment. Exact application readback checks the release boundary;
- retain the existing document-clear keystrokes, actual browser permission
  refusal, no-format revoke, viewer-field and joined native/runtime cleanup.

No remote keyboard layout changes, files or application launch occur. This
does not test mouse wheel/drag/other buttons, OS IME, abrupt transport failure
while held, physical hardware or all layout profiles. The expected text is
never logged. A one-shot failure frame still requires its separate opt-in scope.

Focused existing public/Edge input checks pass 10/10 in 15.23 s, with syntax,
ESLint/format and diff checks passing (`build/iteration-394-input-focus.log`).
These are existing synthetic/fake-RDP component checks, not acceptance of the
new actual sequence.

The separately authorized real Release invocation passes both Clipboard
directions, the exact `!1` physical-key readback, left-Ctrl blur release and
right-Shift blur release. It fails exact readback after the left-Alt case;
the following digit is missing. It exits 1 with one native write, six reads,
79 key events, accepted revoke and empty runtime. The single authorized failure
frame now succeeds and shows only the retained synthetic document, selected
after copy. It does not prove a stuck Alt or a production defect. Evidence:
`build/iteration-394-keyboard.log`, ignored
`.local-tests/windows-browser-clipboard-failure.jpg`.

A standalone released Alt can enter application menu mode, so the prepared
repeat explicitly sends Escape before the next unmodified digit in that one
case. Expected text remains exact and unchanged. This distinguishes the named
menu-cancellation/next-key scenario; it does not establish the cause of the
first failure or accept direct text entry after standalone Alt without Escape.
Right-Ctrl detach/reattach was not reached and remains unaccepted until a repeat.
No additional RDP connection is made under the consumed one-session approval.

The user separately authorizes the corrected repeat with the same exact
certificate fingerprint and prepares Notepad again. The current Release worker
from [391](ITERATION_391.md) passes the complete scenario and exits 0:

- both actual Clipboard directions and Unicode/multiline readback pass;
- Shift+Digit1 / Digit1 produces the exact expected suffix;
- left Ctrl, right Shift and left Alt followed by blur/reset and local release
  all permit the expected next digit. The Alt case includes Escape for normal
  application menu cancellation; no direct-after-Alt or all-layout claim;
- holding right Ctrl through viewer detach and obtaining fresh control/media
  tokens for the same native RDP session leaves the next digit unmodified;
- one native write, seven remote reads and 110 physical key events, with no
  transfer during local Paste;
- own-document clear keystrokes, actual browser permission refusal, accepted
  no-format revoke, cleared viewer fields and joined empty-runtime close pass.
  No failure frame is requested in this successful invocation.

Evidence: `build/iteration-394-keyboard-repeat.log`. This accepts the named
prepared Notepad public-viewer keyboard/release slice, not every keyboard,
Ctrl/Alt shortcut, button, hard transport failure or ownership-transfer profile.
Worker SHA-256 remains
`fff1781f42dcf64184a96b0c9655cbcfc3bc57d4661bc478f2f9676340b55056`.
Native/production code is unchanged, so native CTest 34/34 and full Node
890 / 51 skips retain the current [391](ITERATION_391.md) scope. The new script
branch is accepted by the actual repeat above, not by relabelling old fixtures.
