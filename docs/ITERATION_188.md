# Iteration 188 — bounded browser fixture ports

2026-10-14. Implements the retained Stage 0 test reproducibility follow-up from
iteration 186. This changes synthetic test servers, not the public API or media
protocol.

The two HTTP/WebSocket listeners in the microphone Edge/socket fixture now select
loopback ports from 49152..65535. Each listener has at most eight attempts and
retries only EADDRINUSE; invalid ports and other failures remain observable.
The helper removes its event listeners after completion. No browser port-policy
exception is used. Chromium's standard restricted-port list contains the failed
port 2049; see its [port implementation](https://raw.githubusercontent.com/chromium/chromium/main/net/base/port_util.cc).

Two actual loopback unit cases cover an occupied first candidate, preservation of
the existing server, listener cleanup, finite collision exhaustion, non-collision
failure identity and invalid low-port refusal. Both pass. All six actual Edge /
loopback WebSocket microphone fixtures pass with synthetic permission/samples and
fake RDP admission. There is no new physical microphone or remote audio evidence.

The first full Windows check passes 523/524: one separate microphone media fixture
gets WORKER_START_FAILED during an overlapping native rebuild. That file passes
17/17 when repeated separately. The overlap is a possible cause, not an established
diagnosis. After the native build finishes, the complete bundled Windows
`pnpm check` passes **524/524**, including build, lint and formatting. Latest
changed-file lint/format checks also pass. Native foundation CTest is 10/10,
bundled CTest 22/22, and Windows relocation 1/1. Linux build and runtime closure
are separate acceptance work.

Local logs: `build/iteration-188-edge.log`, `iteration-188-pnpm-check.log`,
`iteration-188-microphone-media-repeat.log`, `iteration-188-pnpm-final.log`.
