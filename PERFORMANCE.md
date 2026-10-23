# Performance and optimization decisions

## 1. Performance budget

The bridge should be interactive at 1920×1080. Targets are engineering budgets, not network guarantees:

- extra bridge latency from FreeRDP framebuffer change to media packet queued for browser: p95 <= 40 ms under normal load;
- browser decode/render adds <= 30 ms p95 on supported hardware;
- cursor transport <= 35 ms perceived on LAN because it is separate from video;
- media queue target <= 150 ms;
- memory target <= 256 MiB per normal 1080p session excluding unusually large redirected file operations;
- idle session CPU near zero except heartbeat/channel maintenance;
- no O(session count × full-frame copies) in Node.

## 2. Highest-value optimizations

### 2.1 Encode in native worker

Never copy BGRA frames into Node just to encode them. FreeRDP framebuffer → encoder stays in one process/address space. Node forwards compressed buffers.

### 2.2 Separate cursor

Cursor position often changes more frequently than desktop content. Keeping it outside H.264 avoids encoder work and gives lower perceived latency.

### 2.3 Latest-state scheduling

Framebuffer is state, not a frame queue. When encoder falls behind, encode the newest state and discard obsolete pending revisions.

### 2.4 Binary transport

No base64. No JSON arrays of pixels/audio samples. Use binary WebSocket/IPC payloads.

### 2.5 Bounded queues

Define hard byte/time limits. Prefer visual frame loss to latency accumulation.

### 2.6 One worker per session

This costs process overhead but improves CPU scheduling, NUMA behavior, fault isolation and observability. Optimize only after profiling proves process count is a bottleneck.

## 3. Codec policy

Desktop workloads contain text and sharp edges. H.264 bitrate needs a reasonable floor; excessive compression creates unreadable UI. Adaptive policy can use dirty-area ratio:

- low dirty ratio/static text: lower FPS, keep quality/QP;
- scrolling/video: raise FPS/bitrate within cap;
- congestion: reduce FPS before aggressively destroying text quality.

Do not re-encode if desktop revision did not change.

## 4. Hardware encoding

Hardware encoding is opportunistic. Detect at worker startup. If provider initialization fails, fall back cleanly to software without dropping the RDP connection.

Do not make `/dev/dri` or GPU device access mandatory. Container documentation should show optional device mappings.

## 5. Node forwarding path

For binary media:

- do not inspect/clone payload unless required;
- use `Buffer` slices carefully and avoid retaining large parent buffers accidentally;
- send with compression disabled (`perMessageDeflate: false`) for H.264/Opus;
- dedicate media WS separately from control so JSON control is not buried behind giant binary messages at application queue level;
- enforce browser `bufferedAmount` thresholds.

## 6. IPC

Encoded H.264 access units are typically small enough that UDS copying is acceptable. Shared memory is intentionally deferred. Add shared-memory ring only if profiling shows IPC copies consume >10% CPU or materially increase latency.

If added, keep control IPC message-based and use shared memory only for media payload blocks with generation counters and bounded ring semantics.

## 7. File transfers

Use stream pipelines with backpressure. Do not buffer complete files in RAM. Redirected drive reads/writes use filesystem streaming and quotas.

## 8. Metrics for regression gates

CI/perf lab should capture:

- time-to-first-frame;
- time-to-first-audio;
- 1080p static idle CPU;
- synthetic scroll FPS and bitrate;
- encode p95;
- memory RSS worker/Node;
- 5-minute congestion test max queue delay;
- reconnect duration;
- file throughput without starving control/audio.

Performance changes are accepted based on these metrics, not intuition.

## 9. Windows scene-latency correction evidence

[Iteration 9](docs/ITERATION_009.md) records before/after native encoder measurements,
live XRDP browser observations, bounded RDP batching and the Windows OpenH264 SIMD
dispatch correction. The controlled synthetic encode p95 improved from 192.802 to
26.326 ms; live initial-update encode p95 from 474.918 to 84.861 ms. These samples
do not satisfy the full latency/queue/CPU/RSS/soak gates above. Queue latency and
controlled interactive scene replay remain open.

## 10. Node media timing instrumentation

Protected `/metrics` now aggregates bounded histograms for changed capture requests,
unchanged polls, local WS writes and valid render-credit round trips. Frame/byte
counters and credit occupancy distinguish producer work from consumer stalls.
See [metric semantics](docs/SESSION_API.md) and [iteration evidence](docs/ITERATION_011.md).
Timing uses one Node monotonic clock; worker media timestamps are preserved.
Local forwarding samples require every configuration/image record to finish
successfully; partial write failures cannot contribute a successful sample.
[Regression evidence](docs/ITERATION_366.md).
The stages overlap and cannot be summed into an end-to-end bridge latency number.
Framebuffer dirty-to-send age, independent queue delays, controlled scene replay,
CPU/RSS and the existing full performance/soak gates remain pending.

## 11. Microphone transport timing instrumentation

Protected `/metrics` aggregates selected PCM/Opus packet admission and explicit
safe-stop round trips, validated input bytes/local decisions and outstanding
private promises. Detached but unfinished operations remain counted until actual
settlement. These Node intervals exclude browser encoding, transport arrival,
native/AUDIN queue consumption and remote recording; they must not be interpreted
as the <150 ms LAN end-to-end target. Fixed label/bucket bounds add no sample
history or queue. [Metric semantics](docs/MICROPHONE_METRICS.md).
Actual ready-source/jitter/underflow/CPU/RSS/LAN/platform/soak gates remain open.

## 12. Current synthetic encoder sample

A fresh Windows x64 run set on the existing 40-frame 1080p H.264 benchmark
records total, conversion and compression p95 at 1/2/4 threads. Four-thread
total encode p95 is 33.730–39.882 ms across three runs, inside this section's
40 ms number for the encoder stage alone. The measurement omits callback,
queue, IPC/Node forwarding and browser decode/render, so it does not satisfy
the framebuffer-to-browser latency target. [Exact runs and artifact hashes](docs/ITERATION_331.md).

## 13. Audio publication scheduling control

A native virtual-minute control uses the existing packetizer, 3 ms of owner
work and waits rounded to a specified 15.625 ms quantum. The former relative
20 ms polling policy skips 1,248 packet intervals; deadline-anchored polling
skips zero in the identical model. This is a deterministic scheduling comparison,
not a measurement of the host OS timer, connected CPU/RSS or end-to-end latency.
The ordinary/compatibility buffers and late-discard policy remain unchanged.
Actual native stalls and uninterrupted audio acceptance remain open.
[Implementation and verification](docs/ITERATION_371.md).

The bounded audio preview now collects one existing native video pipeline
snapshot before joined close. It reports encode mean/recent-128-frame p95 /
lifetime max, read-batch maxima and fixed native counters, with `null` for
unavailable evidence. These independent aggregate observations can reveal
expensive encode/read work; they do not correlate individual audio skips or
measure event waits, audio codec time, total CPU or end-to-end latency.
No new connected measurement is claimed by this local collection change.
[Collector scope](docs/ITERATION_374.md).

## 14. Host query launch and admission observations

The shared helper-query owner separates maximum admission/continuation time,
synchronous task invocation and complete admitted-task time. The invocation
interval includes child launch/setup but excludes the awaited child completion.
The fixed scalar maxima preserve the existing bounds, cancellation, permit
retirement and two-/three-second deadlines. They are not samples from one
query and must not be added or subtracted as a causal decomposition.

One Windows Debug 40-worker/45-start control records 1,625 ms admission,
107 ms invocation, 2,226 ms complete task and 1,549 ms maximum event-loop delay.
All 969 paired samples preserve the active owners; three IPC timeouts occur
during retirement. The preceding active resource-unavailable failures remain
retained. This instrumentation does not establish a throughput correction,
connected performance, OS cause or adequate resource/soak headroom.
[Exact profile](docs/ITERATION_375.md).

A controlled sixteen-task Node regression now proves an observer can run
between successive invocations, while sixteen incomplete tasks can remain
concurrent. The former microtask cohort fails that observer check; staged
invocation across immediate turns passes it without increasing caps or
deadlines. An unchanged Windows capacity control subsequently reports
356 ms maximum event-loop delay and 623 ms complete-task maximum, with no
reported worker failures and joined empty owners. Maximum query time is still
2,949 ms against the existing 3,000 ms bound, so robust headroom is unproven.
The run ends after sample-count conditions rather than fixed duration; its
313 paired queries versus earlier runs are not a throughput comparison.
[Scheduling control and limits](docs/ITERATION_376.md).

The next unchanged scalar-policy full run still has two active deadlines
above three seconds, even though per-invocation yielding improves event-loop
progress. A capability-gated Windows batch owner now amortizes helper startup
across up to sixteen admitted logical requests. In a fixed forty-call actual
owned-process comparison on the new Debug helper, all forty scalar calls
complete in 1,789 ms; all forty batch items complete in 385 ms via three helper
launches (16/16/8). An earlier same-host comparison is 2,693 versus 509 ms.
These are bounded wall-time observations, not a statistical latency guarantee.

The unchanged forty-worker control then gathers 323 dispatched items through
96 helper launches, with maximum batch eight and 317 paired policy samples.
It records no startup/active/retiring worker failures, 550 ms maximum active
query, 228 ms event-loop maximum and empty query/batch owners after close.
The control ends on sample-count conditions, not fixed duration, so its
sample totals must not be compared as throughput with earlier runs. Shared
16/128 admission, one-second polls, two-second helper timeout and three-second
policy deadline remain unchanged. This accepts the named local unconnected
control only; connected/OS-failure/sustained capacity and Release adoption
remain separate. [Ownership and evidence](docs/ITERATION_378.md).
