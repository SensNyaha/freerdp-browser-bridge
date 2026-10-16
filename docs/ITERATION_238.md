# Iteration 238 — explicit reference browser clipboard

2026-10-16. Implements the browser client portion of SPECIFICATION §2.7 over
server control transfer `418c92a` and reserved native selection `d1735ef`.
[Current behavior and evidence boundaries](CLIPBOARD_BROWSER.md).

The reference connection form selects off/default or three explicit text
directions with a finite item maximum, requiring both native clipboard
capabilities. The viewer shares its existing control sequence/socket with input.
One client item owns exact-size bytes and at most eight bounded records, checks
whole/window/native monotonic deadlines and credit, paces uploads, limits local
backlog and wipes records after ACK. Reads expose only whole strict text after
terminal completion; a leading U+FEFF remains content. UTF-8/normalized UTF-16
quotas are measured before local encoding, including surrogate/CRLF boundaries.

Separate user actions fill/send a local draft, get a remote item and copy an
already received item (including empty text). Offers/focus never request content
or OS access. Mocked API denial/expiry and late results after clear/detach do not
dispatch or update fields. A five-second cancellable permission race bounds UI
continuations; native/control disposal clears timers, listeners and byte owners.
Immutable JS strings, browser/OS retained copies and physical permission remain
separate resource/acceptance limits.

Five pure cases include byte-exact 16 MiB both-way composition with the actual
Node owner and virtual time, malformed protocol/source, nonrenewing deadlines,
backlog, withheld text and wipes. Three actual Edge/reference-viewer/HTTP/WS
fixtures use fake RDP and mocked Clipboard API for each direction, multi-window
Unicode, input, explicit actions, denial/expiry/late delivery, empty copy and
controller retirement/revoke. The first browser fixture run reached its final
check but used a nonexistent test-only server property; it now checks the public
GET API. No production behavior or assertion was relaxed. A separate form test
covers capability/quota refusal; the Edge form/HTTP fixture also submits explicit
clipboard policy. Its first selection attempt forgot to open the collapsed
settings section; the corrected test uses the visible summary before selection.
Focused combined checks pass 14/14; final viewer/form repeats also pass. The panel
screenshot `build/iteration-238-clipboard-panel.png` was visually inspected.

Full bundled Windows `pnpm check` passes 643 with 49 platform skips / 692 cases;
Linux passes 638 with 57 skips / 695 cases. Native CTest baseline passes Windows
29/29 and Linux 30/30. The initial full checks stopped before tests on one new
fixture's formatting; the corrected full repeats pass. Evidence remains in
`build/iteration-238-*`. This Windows pass includes the previously failed
microphone/TLS case from Iteration 237; its earlier failure's cause remains
unverified. No C++ parser/channel changes or relabeled sanitizer/fuzzer run.

No real OS clipboard or XRDP clipboard mutation/read was performed. The consumed
single-test permission from Iteration 232 is not reused. Remote data consumption /
readback/revoke, physical/browser permission, measured latency/network, total
RSS/CPU, remaining formats and full Stage 7/managed-drive acceptance stay open.
