# Protected microphone transport metrics

Iteration 145 implements PERFORMANCE §8 / SPECIFICATION §2.6 observability after
explicit Opus viewer `daf3ba7`. The existing authenticated `/metrics` endpoint
aggregates fixed PCM/Opus series. No session, owner, target, device, credential,
sequence, epoch, PTS or samples become a label or diagnostic.

| Metric suffix (`bridge_microphone_`) | Meaning |
| --- | --- |
| `packets_received_total` | Valid sequenced selected-profile RWB1 packets, before grant/admission checks |
| `bytes_received_total` | Their full RWB1 wire bytes including metadata |
| `decisions_total` | Valid local start/stop/packet decisions before attempting a reply write |
| `packet_operations_in_flight` | Backend packet promises awaiting actual settlement |
| `packet_bytes_in_flight` | Logical RWB1 bytes attached to those promises; not allocated heap |
| `retirements_in_flight` | Explicit stop promises awaiting actual settlement |
| `stage_duration_seconds` | Active validated backend-admission and safe explicit-stop round trips |
| `consumers_failed_total` | Microphone-adapter consumers retired by fixed protocol/progress checks |

Every metric has `codec=pcm|opus`. Decisions additionally use
`operation=start|stop|packet` and fixed result sets: start started/busy, stop
stopped/busy, packet accepted/stale/unavailable/busy/invalid. Failure reasons are
protocol/backlog/transport/admission/retirement/packet_deadline/stop_deadline.
Histogram operations are packet_admission/retirement with fixed buckets
1/5/10/20/40/80/150/300/600/1000/2000/4000 ms plus infinity. PCM/Opus objects and
zero counter/gauge series are created once per registry; attachments add no labels.

Packet and explicit-stop gauges increment before invoking the backend and
decrement exactly once at synchronous failure or actual promise settlement.
Detach/fault/deadline does not manufacture completion while a private operation
still owns its bytes. The gauge includes such detached operations; a conforming
worker/supervisor must settle them within its existing retirement deadline.
Implicit detach barriers are not measured as new explicit stops. No sample,
queue, timer, retry, provider or public protocol change is introduced.

Decision counters describe local decisions, not delivered/received ACKs. Packet
timing includes a validated active backend result (including refusals), not
browser encoding or network arrival time. Stop timing requires a valid active
safe barrier result. Abandoned, malformed, rejected, late or expired operations
do not count as successful observations. Measurements use one Node monotonic
clock; they do not establish microphone-to-remote latency or actual recording.
Shared outer media/socket rate failures remain outside this adapter's counter.

Pure deadline/failure cases and actual loopback-WS/fake-RDP checks cover both
codecs, exact bytes/decisions, held admission plus stop, actual server detach,
malformed records, late completion and label bounds. All samples are synthetic.
Native/browser jitter, underflow, encode and host queue/resource metrics and
actual ready AUDIN/device/recording/LAN/platform/soak acceptance remain open.
[Evidence](history/iterations/101-150.md#iteration-145), [media contract](MICROPHONE_OPUS_MEDIA.md).
