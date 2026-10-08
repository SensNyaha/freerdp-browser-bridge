# Iteration 11: bounded Node media timing and render-credit metrics

Requirement: SPECIFICATION desktop/media behavior and PERFORMANCE instrumentation
before further optimization. Static Windows initialization was completed first
in `d8b6d35`; [iteration 10](ITERATION_010.md) records its verification.

Protected `/metrics` now distinguishes changed capture duration, unchanged polling,
local WebSocket write completion and valid render-credit round trips. All use
the Node monotonic clock. Fixed histograms retain counts/sums/buckets instead of
individual samples; labels are only codec and stage. Queued frame/byte counters
and current credit occupancy are aggregated without session or lab identities.
See [definitions and limitations](SESSION_API.md).

The existing one-frame credit and all parser/backlog/deadline bounds are retained.
Accepted ACK releases credit once and adds one timing sample; reset, invalid ACK
closure and detach release credit without claiming successful rendering. A capture
completing after detach cannot enqueue a late frame. The automatic local XRDP
helper requests protected metrics internally and saves only fixed media series
to ignored `.local-tests/media-metrics-<mode>.prom`.

Verification on Windows x64, 2026-10-08:

- Narrow fake-backend HTTP/WS suite: 11/11 tests passed. Four new metric scenarios
  cover both codecs with delayed ACK, static suppression, decoder reset/stale ACK,
  close during capture, exact queued bytes and absence of identity/token labels.
- The initial narrow run queried metrics before the server received the client's
  close event. The test now waits within a three-second bound for server-side
  release; it does not extend the media deadline or alter close behavior.
- Final linked `pnpm check`: build/lint/format passed, 67/67 Node tests passed.
  An earlier full parallel run reported a local certificate-dialogue fixture
  failure and did not exit; that owned run was interrupted. The isolated native
  connection suite then passed 8/8, followed by the complete unchanged-deadline
  suite above. The intermittent fixture failure's cause was not isolated.
- Foundation CTest 2/2, bundled CTest 4/4 and ZIP relocation were also verified
  while completing the preceding static-toolchain block; media instrumentation
  changes no native protocol, C++ code or browser wire records.

The first actual XRDP/Edge attempt stopped before the certificate prompt, with
zero frames; a separate three-second TCP probe of the lab's port 3389 timed out.
After the user restored access, the same previously authorized exact certificate
fingerprint and motion/reset-only helper passed real 1920x1080 rendering,
reattachment, one pointer move, release reset and clean worker/runtime shutdown.
No buttons, wheel or keyboard input were sent to the operational lab desktop.

The plain H.264 run rendered 80 frames without decoder resets. Its native encode
p95 was 33.197 ms and Edge decode/draw p95 1.4 ms. The fixed media histogram
artifact reports 80 changed captures, 80 local writes and 80 valid ACK samples:

| Node stage | Mean, ms | Notes |
|---|---:|---|
| Changed capture | 26.612 | includes worker scheduling/encode/IPC/validation |
| Local write | 0.353 | last WS write callback, not peer receipt |
| Render credit | 3.889 | send/receive/browser/ACK round trip |

71/80 changed capture durations were at most 40 ms and 79/80 at most 80 ms;
the histogram does not provide an exact sample p95. 304 unchanged polls are kept
separate from changed captures. Queued RWB1 bytes totaled 770,484, including
configuration records; browser payload bytes totaled 768,174. Credit occupancy
was zero at collection. `.local-tests/media-metrics-h264.prom` stays Git-ignored.

The explicit decoder-error run rendered 45 frames with exactly one reset and
successful reattachment/cleanup. Native encode p95 was 31.097 ms, Edge p95 1.9 ms;
its separate histogram artifact is `.local-tests/media-metrics-h264-reset.prom`.
The reset run counted 46 queued frames and 45 valid render ACK timings, correctly
excluding the failed decode's consumed credit; collection showed zero in flight.
JPEG fallback also passed real 1080p render/reattach/cleanup: 21 rendered images,
native encode p95 7.476 ms, Edge decode/draw p95 13.4 ms. Its independent artifact
is `.local-tests/media-metrics-jpeg.prom`.
These short live observations use different server content and are not a
controlled before/after comparison or a maximum/sustained FPS measurement.

These metrics expose pipeline segments; they do not establish full dirty-to-send
or network queue age. Stages overlap and must not be summed. PERFORMANCE's full
latency, scene replay, CPU/RSS and soak gates remain open; no TODO gate is checked off.
