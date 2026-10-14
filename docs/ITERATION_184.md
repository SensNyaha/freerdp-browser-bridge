# Iteration 184 — actual Linux foundation and parser verification

2026-10-14. Implements TODO Stage 0/1 portable build, sanitizer, fuzz and worker
lifecycle verification after `e90f95b`. FreeRDP, audio/channel SDKs and physical
devices are not selected in this Linux foundation.

The installed Docker Desktop Linux engine now provides Debian bookworm amd64,
Node 24.21.0, GCC 12.2 and Clang 14.0.6. Git HEAD was exported without ignored
directories, with the four test corrections below overlaid. Catch2 3.8.1 was
exported from its clean local source at
`2b60af89e23d28eefc081bc930831ee9d45ea58b`. Existing public workspace dependencies
and pnpm 10.11.0 were copied offline, with validated workspace-contained Windows
links recreated as relative Linux links. This is a local offline build, not a
fresh network installation or Linux FreeRDP distribution acceptance.

GCC warnings-as-errors found initializer-list loops copying pairs/vectors in IPC,
microphone, AVC and AUDIN tests. These loops now borrow immutable test records;
test vectors/assertions, parser behavior and production compiler options are
unchanged. No warning was suppressed.

## Sanitizer environment and retained failures

The ordinary GCC PIE sanitizer build compiled, but CTest produced repeated
`AddressSanitizer:DEADLYSIGNAL` without an actionable stack. The first run stalled
at AVC; a bounded verbose repeat failed at IPC. These runs are failures, not passes.
An isolated `int main() { return 0; }` with ASan/UBSan and diagnostic
`ASAN_OPTIONS=handle_segv=0` reproduced SIGSEGV outside bridge code:

| Empty-program build | Successful launches / 100 |
| --- | ---: |
| GCC PIE | 65 |
| GCC non-PIE | 100 |
| Clang PIE | 71 |
| Clang non-PIE | 100 |

An earlier GCC comparison was 71/100 versus 100/100; another 50-launch PIE run
was 41/50. Clang initially lacked its sanitizer runtime; the standard Debian
`libclang-rt-14-dev` package was installed before Clang validation.

Local verification therefore used `-DCMAKE_CXX_FLAGS=-fno-pie` and
`-DCMAKE_EXE_LINKER_FLAGS=-no-pie` when configuring the existing sanitizers/fuzz
presets. ASan and UBSan remain enabled. Successful CTest/fuzzer/worker checks use
their default sanitizer signal handling. This local placement workaround is not
added to production options or CI presets, and does not establish the cause of
the environment's PIE startup instability.

Linux GCC ASan/UBSan CTest passes **8/8**, with a 30-second per-test limit.
Windows MSVC foundation passes **10/10**, bundled pinned-FreeRDP CTest **22/22**.
Windows `pnpm check` passes **522/522**, with no skipped/cancelled/failed tests.
Linux `pnpm check` passes **439**, skips **83**, and has zero failures or
cancellations out of 522 discovered tests. Linux includes actual foundation
HELLO/heartbeat/shutdown, 100 sequential workers with zero leaked resources,
parent-death cleanup and real loopback WebSocket/fake-backend tests. Skipped
Windows/Edge/linked-FreeRDP checks are not Linux integration evidence.

## Bounded libFuzzer smoke

Seven existing seeded Clang targets ran with ASan/UBSan, no network/devices,
one CPU and 2 GiB container memory, `-max_total_time=20 -timeout=5
-rss_limit_mb=1024`. Each completed in 21 seconds with exit zero:

| Target | Executions |
| --- | ---: |
| IPC | 2,074,807 |
| AUDIN ingress | 582,020 |
| DVC declared bounds | 474,146 |
| DVC outer SVC | 880,725 |
| AVC admission | 983,593 |
| GFX PDU admission | 2,685,827 |
| Audio SVC ingress | 466,285 |

This is actual short parser fuzz/sanitizer evidence, not exhaustive fuzzing,
upstream codec/provider sanitizer acceptance or hostile remote RDP verification.
CI workflows remain prepared; no GitHub Actions execution is claimed.

Local logs use `build/iteration-184-*`: Windows suites, failed PIE runs,
`asan-diagnostic`, `asan-layout`, `clang-layout`, `linux-nonpie`,
`linux-node-retry` and seven `fuzz-*` receipts. The source archive with test
overlays has SHA-256
`fac1605c6a2a43f4f4aa9f68341ca3a781708107d3d1cfdf07e3ff6dcee84e5ea`.

An initial npm fetch failed TLS chain verification. Importing the general Windows
CA store into a persistent image was rejected by automatic approval review;
that file was removed and the build proceeded with offline public dependencies.
No certificate verification bypass, organizational CA import, laboratory secrets,
runtime directories or production dependency artifact was added to these images.

Remaining gates include Linux SOCK_SEQPACKET/priority output, linked exact Linux
FreeRDP/private codecs, clean network build, standard PIE sanitizer environment,
upstream/channel allocations, Linux RDP/device/browser integration, installers
and resource/network/concurrency soak. Windows RDP server lab is still unavailable.
