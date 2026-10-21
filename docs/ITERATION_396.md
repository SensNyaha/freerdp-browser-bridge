# Iteration 396 — prepared remote pointer/application acceptance

2026-10-21. Continues MVP left/right/middle buttons, drag, both wheel axes and
button release. Notepad alone cannot observably acknowledge every required
button/wheel case; native API success is not application consumption proof.

`tests/fixtures/rdp-pointer-page.html` is a small user-opened local HTML page,
with no network, file operations or Clipboard API. It holds only fixed bounded
numeric button/move/drag/wheel counters. Context menu and middle-button defaults
are prevented inside the test pad. F2 selects a fixed schema-1 JSON snapshot in
its read-only field; ordinary Ctrl+C can copy only that snapshot for CLIPRDR
readback. No event history, source text or arbitrary OS clipboard is collected.

The explicit `--focus-editor --pointer-smoke` mode reuses the existing public
API/viewer/CLIPRDR lab helper with this prepared page instead of Notepad. It
validates the bounded receipt before pointer actions, clicks all three buttons,
performs a short captured drag, sends both wheel directions on both axes,
checks left-button release after blur and middle-button release across viewer
detach/fresh-token reattachment. After each phase it reads fixed counters
through the public Get action, with server-to-browser-only selection and no
local OS Clipboard API invocation. No native offer or application-editing
command is sent in this mode. The existing default Notepad/keyboard modes retain
their behavior. The single failure-frame path remains separately authorized.

Local actual Edge page verification plus bounded receipt parser/refusals and
existing input fixtures pass 13/13 in 15.08 s, with no RDP connection.
The parser refuses unknown fields, malformed input, excess size, invalid types
and numeric bounds with a fixed content-free error. Syntax/ESLint/format/diff
checks pass. Evidence: `build/iteration-396-page-focus.log`,
`iteration-396-focus.log`. These local checks do not establish actual RDP input.

The first separately authorized invocation fails before the pointer sequence:
F2/Ctrl+C produces no remote text offer, zero reads and zero writes. The one
authorized failure frame shows Notepad rather than the prepared page. It exits 1
with empty runtime and no own-document mutation. Evidence:
`build/iteration-396-pointer.log`. The user asks how to transfer the HTML file,
then explicitly confirms opening the required page on the Windows RDP host.

The prepared repeat exits 0 on the current Release worker and confirms through
four actual CLIPRDR/public Get receipts:

- left/right/middle down and up, movement and captured drag 575×324 pixels;
- wheel events received by the application in both directions on both axes;
- held left-button terminal release after canvas blur, with local mouseup
  performed over the separate local field, outside the canvas;
- held middle-button release across viewer detach/fresh-token reattachment.
  The local mouseup occurs after old listeners are disposed and before the new
  viewer attaches, so a forwarded local up cannot mask absent terminal release;
- final down/up counters `[5,2,1]` / `[5,2,1]`, 65 moves, one event in each
  wheel direction and zero held-button bits. Counters include the initial
  prepared-page focus click and any existing page input; assertions compare
  against the initial readback rather than assuming all-zero startup;
- zero native clipboard writes, four reads, 24 physical key events, cleared
  viewer fields and joined empty-runtime close. No failure frame is requested
  in the passing invocation.

Evidence: `build/iteration-396-pointer-repeat.log`. Worker SHA-256 remains
`fff1781f42dcf64184a96b0c9655cbcfc3bc57d4661bc478f2f9676340b55056`.
This accepts the named actual application pointer/wheel-delivery and button
release slice. The page records wheel events while preventing default scroll;
it does not prove content scrolling in ordinary applications, arbitrary drag/drop
targets, physical hardware, hard transport loss or every platform/profile.
The initial full Windows check has zero assertion failures but one cancelled
10-second hung-query fixture test (10.43 s observed); Docker image preparation
overlapped it, without proving causation. The unchanged focused fault suite
then passes 3/3. An isolated full repeat passes 895 / 51 skips / 946 total,
zero failures/cancellations in 545.48 s; the previously cancelled case takes
576.53 ms. This working-tree check also includes two fixed owned-lab selector
unit cases prepared for the following Linux stand block. No timeout or test
is weakened. Logs: `build/iteration-396-full-check.log`,
`iteration-396-fault-repeat.log`, `iteration-396-full-check-repeat.log`.
Native sources/artifacts remain unchanged; the linked Release CTest 34/34
baseline retains its scope. No production/native, wire, Release configuration
or dependency change occurs.
