# Iteration 331 — current local 1080p H.264 encode sample

Requirement: continue the Stage 10 performance report against
[`PERFORMANCE.md`](../PERFORMANCE.md) with a fresh, repeatable measurement from
the existing test-only encoder benchmark. No code or build profile changed.
The existing `build/bundled/h264-benchmark.exe` was run three times; each run
encodes the same deterministic 40-frame 1920×1080 desktop pattern at 1, 2 and
4 encoder threads. Pixel generation is outside the timed encoding call.

Environment: Windows x64, Intel Core Ultra 7 255H, 16 logical processors.
Benchmark SHA-256 is
`bdb406f48857e8e3f492b80a04a1906d2fe08940ee51e1f5d747c2230fc88070`;
the private `openh264-7.dll` SHA-256 is
`429ecec4d04ae6e2e39a2439a14b944c9e34c6b05a8e98bdc4e0318277562ec7`.
The pinned OpenH264 version remains 2.6.0. These are the existing local
artifacts; they were not rebuilt or modified.

## Measurements

Each cell lists run 1 / run 2 / run 3. Latencies are milliseconds; byte counts
are complete encoded outputs for 40 frames.

| Threads | Total encode p95 | Convert p95 | Compress p95 | Bytes |
|---:|---:|---:|---:|---:|
| 1 | 42.763 / 36.981 / 43.999 | 12.856 / 10.897 / 12.031 | 33.283 / 29.947 / 34.101 | 189,435 / 189,435 / 189,435 |
| 2 | 40.721 / 43.638 / 37.188 | 13.291 / 12.833 / 12.173 | 29.743 / 29.175 / 25.782 | 187,973 / 187,281 / 189,035 |
| 4 | 37.167 / 33.730 / 39.882 | 12.764 / 12.761 / 13.561 | 26.782 / 24.837 / 26.685 | 189,185 / 186,879 / 188,012 |

Four-thread total encode p95 stayed below the 40 ms engineering budget in
these three local runs (median 37.167 ms, range 33.730–39.882 ms). One- and
two-thread results cross the target across runs. The benchmark omits bridge
callback scheduling, media queue delay, IPC/Node forwarding, browser decode and
render, so this does **not** accept the full framebuffer-to-browser latency
budget, sustained FPS, idle CPU, RSS, queue or soak targets. The overall
performance report and Stage 10 gate remain open.

The test-only executable completed all three runs successfully. The benchmark
is not installed in the native package; no worker/session was started. No RDP
lab application was launched.
