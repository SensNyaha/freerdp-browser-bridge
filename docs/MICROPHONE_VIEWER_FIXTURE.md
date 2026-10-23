# Reference microphone viewer fixture diagnostics

Date: 2026-10-12. During iteration 158, the initial bundled full Node run finished
**497/498**, one failure, zero cancellations. The unchanged Opus stop/restart/detach
fixture timed out clicking Stop after its button became hidden. The exact cause
was not captured and is not claimed fixed. A separate exact-case rerun passed
**1/1**, and the whole microphone-viewer file passed **12/12**.

The test now reports only codec/mode, packet/reset counts, viewer error/closed
state, owner active/failed, context/encoder states, permission count and button
state if it fails again. Diagnostic evaluation has a two-second bound; original
test actions, assertions, 45-second test and five-second Playwright deadlines
are unchanged. No retry, force-click, synthetic gesture substitution, product
deadline change, physical microphone capture or credential logging is introduced.
The existing fixture uses fake RDP and synthetic getUserMedia, actual Edge
WebCodecs/AudioWorklet and actual local WebSockets. It is not audible or physical
microphone acceptance. Full-suite retry is recorded in the iteration report.
