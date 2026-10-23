# Iteration 182 — completed single-viewer Windows/XRDP stability observation

2026-10-13. Verifies the named Stage 4 / PERFORMANCE observation, following the
failed first run preserved in [iteration 180](ITERATION_180.md). Actual authorized
XRDP / native worker / API / WebSocket / Edge H.264 stayed connected at 1920×1080
for 1,800,228 ms, with 61 samples. The helper exits 0 and leaves the runtime empty.

| Observation | Result |
| --- | --- |
| Frames / compressed bytes at final soak sample | 4,871 / 66,343,282 |
| Maximum queued frames / bytes | 1 / 1,918 |
| Maximum decoder / socket backlog | 0 / 0 |
| Maximum sampled worker working set | 229,535,744 bytes (218.9 MiB), below 256 MiB |
| Maximum sampled Node working set | 129,798,144 bytes (123.8 MiB) |
| Maximum sampled browser decode p95 | 4.9 ms |
| Native encode mean / p95 / maximum | 31.165 / 33.540 / 126.386 ms |

Post-soak resize to 1280×720 then restoration to 1920×1080 produce observed
generations 3/4, fresh configurations and IDRs, and nonblank decoded images.
Same-size/invalid-size checks, motion, input release, cursor replay and browser
reattachment pass. Audio is off; no microphone or remote application input is
generated. Source activity is the observed desktop, not a prescribed interactive
scene sequence or throughput/FPS benchmark. Thirty-second working-set samples
do not measure an absolute peak, per-session Node increment, browser residency,
total dirty-to-speaker latency, CPU or codec/pool allocations.

The repeat is accepted for this named 30-minute XRDP observation. The earlier
`RDP_PROTOCOL_ERROR` was not reproduced or explained; its investigation remains
open. One successful repeat does not establish freedom from intermittent faults,
Windows-server/Linux coverage, loss/concurrency/resource/failure-injection or
all Stage 4 requirements. The full stage therefore remains IN PROGRESS.

Current Windows native archive is 6,266,183 bytes (about 6.0 MiB); installed
native files total 15,621,256 bytes (about 14.9 MiB, 47 files). It includes Opus,
private dependencies/CRT/licenses, and excludes Node.js and future installers.
Earlier footprint reports are preserved as historical observations.

Evidence commit: `547b126`.
