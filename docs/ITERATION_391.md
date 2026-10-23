# Iteration 391 — current Release consumer for the remaining audio stalls

2026-10-21. Continues the P0 MVP audio requirement after the user's positive
three-minute listening assessment in [390](ITERATION_390.md). Its measured
64 late publication intervals / 40 browser configurations remain open; no
reset-free or complete Stage 6 acceptance is claimed.

The existing RDP owner encodes video synchronously after publishing audio.
The actual Debug run reports encode mean/p95/max 144,778 / 226,940 / 234,881 us.
That work can exceed the 20 ms publication interval, but the aggregate counters
do not prove that it caused each particular audio skip. One SDK event-check
call can also exceed the ready-event pump's eight-millisecond budget; the
budget is checked between calls and cannot preempt an SDK call.

Before changing scheduling, the existing deterministic 1080p H.264 benchmark
runs sequentially against prepared Debug and Release consumers. The benchmark,
encoder and public encoder header are byte-identical in both source copies
and the current checkout. Each thread count uses 40 frames:

| Threads | Debug total mean / p95 us | Release total mean / p95 us | Debug / Release conversion mean us |
| ------- | ------------------------- | --------------------------- | ---------------------------------- |
| 1       | 64,734 / 86,312           | 22,035 / 30,406             | 47,784 / 5,885                     |
| 2       | 120,990 / 205,395         | 24,284 / 39,257             | 99,821 / 6,472                     |
| 4       | 91,877 / 126,245          | 32,551 / 47,032             | 73,642 / 9,999                     |

Evidence: `build/iteration-391-debug-encoder.log`,
`build/iteration-391-release-encoder.log`. This is a local compiler-profile
comparison, with ordinary host scheduling variability, not a controlled actual
RDP/audio comparison or proof of all source/runtime performance. Debug's
unoptimized conversion cost is substantial. No new telemetry, codec algorithm,
threads, queue, buffer or deadline policy is added to compensate for it.

A new isolated current-source Release consumer is prepared with the
existing `clean-bundled` profile and bound pinned Release SDK receipt
`build/freerdp-source-clean-pf2yqW/receipt.json`. Original Release artifacts,
configuration and dependency pins are retained. MSVC 19.44 / CMake 3.31.6-msvc6 /
Ninja native CTest passes 34/34 in 25.39 s; process/TLS/lifecycle checks pass
27 / one profile/platform skip in 34.01 s. This is native lifecycle/synthetic
TLS evidence, not actual desktop/audio acceptance.

`build/native-clean-n4yhyC/receipt.json` binds 353 native inputs / 1,938,082 bytes,
source SHA-256 `767b9ddd7bd3089e3c6ec04543267b6210077e4b29f90feef8ea829a16cf0897`.
Worker SHA-256 is
`fff1781f42dcf64184a96b0c9655cbcfc3bc57d4661bc478f2f9676340b55056`;
the query-helper SHA-256 is
`70ef3c20f4ae6a39a8d65401c527d9e96a3c5a8594fbf0641fa658aba0cc5c68`.
The unchanged SDK receipt hash is
`d9ceba7800de96001fe93ae7b431db635c35198b12d6ed28e182f701cf0190cd`.
The existing artifact/source audit matches all native inputs, both new outputs
and all seven protected inputs (`build/iteration-391-audit.cjs`). Evidence:
`build/iteration-391-release-build.log`. Full `pnpm check` on the new Release
consumer passes build/lint/format and Node 890 / 51 skips / 941 total, zero
failures, in 549.56 s (`build/iteration-391-release-check.log`). The temporary
native workspace alias is removed. No actual new-Release audio comparison is
claimed.
