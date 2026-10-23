# Iteration 248 — fresh Linux bridge consumer of the rebuilt SDK

2026-10-16. Continues Stage 0's new SDK acceptance from Iteration 247. The
existing source-only linked helper accepts an optional third argument naming
the completed isolated SDK receipt. Foundation mode refuses that input. Before
building, it bounds/validates the receipt, requires the exact pinned source,
new source/output/install directory relationship, reused dependency prefix,
completed SDK runtime/foreign-prefix check and matching FreeRDP/WinPR version.
The receipt bytes are bound by SHA-256 and must remain unchanged through the run.

The feature inspector reads this SDK's new cache and installed headers. No
original SDK feature report is substituted. After configuration the helper
requires FreeRDP, FreeRDP-Client and WinPR package directories to resolve inside
the rebuilt SDK prefix. Project source is copied into another empty output
fixture, preserving existing source hash/limits, disconnected Catch2, linked
CTest inventory, public capability checks and IPC addon's direct import boundary.

The first new consumer `build/native-clean-mSaffk` passes linked CTest 30/30 and
focused actual-process/synthetic-TLS Node tests 40/40. Full `pnpm check` against
that new worker/addon pair, with runtime libraries from the rebuilt SDK and
existing private dependency directory, passes 653 with 57 platform skips / 710
and zero failures. The three CMake package cache origins are independently
confirmed under `/work/build/freerdp-source-clean-vGWbFA/installed/lib/cmake`.
The guard-enforcing repeat creates `build/native-clean-dRSIF7` and again passes
CTest 30/30 and Node 40/40, with identical worker/addon/manifest hashes. Full
Linux check on that repeat plus the new receipt-refusal fixture passes 654 with
57 skips / 711 and zero failures.

The unchanged project source input is 328 files / 1,851,578 bytes / SHA-256
`b1bb08d242a533d21c8a0b29aae62c4cd3110254e68429c911864f998e446e9f`.
SDK receipt SHA-256 is
`67765e295d0891867cab3d6d61ff43f849c609d31958b9690f04265e38c2b1f7`.
Filtered feature SHA-256 remains
`bb6dd3290963488d7ae3baa4cc54d0066dd4290611b250515aceb9d13be5d76e`.

| First consumer artifact | SHA-256 |
| --- | --- |
| worker | `3258ddda510f1ead4f8859d35d080d24c7185553b5bd8edf22396e1a5141546e` |
| IPC addon | `3175499f4d4289d95245d4f8a999863fb02694061d37f8cae9c3605037146bb1` |
| pairing manifest | `3c05d3ff81f96d55934d5d8bbeee6fb35054c33b3d9d6c4fae7a213d36d506d5` |

Logs: `build/iteration-248-linux-rebuilt-sdk-consumer.log`,
`build/iteration-248-linux-rebuilt-sdk-check.log` and the separate consumer-repeat
log and `build/iteration-248-linux-rebuilt-sdk-check-repeat.log`.
The receipt-refusal fixture also passes on Windows. It exercises a mixed old
SDK prefix, missing completed origin check and oversized receipt, each refusing
before any source/output directory is created. Actual-process tests cover
automatic primary/explicit framed IPC, heartbeat,
100 sequential workers, parent/worker death, bounded paused-output failure,
16 MiB clipboard transport and selected clipboard strict TLS/cancellation with
zero application bytes and joined cleanup. SDK fixtures use simulated channel
transport; they do not establish real RDP/device acceptance.

`freerdpRebuilt=false` in the project helper receipt means that invocation
consumes its SDK rather than rebuilding it again. `sdkBuildRebuilt=true` and the
bound SDK receipt identify the actual source-rebuilt SDK from Iteration 247.
Private dependencies/Catch2/compiler/toolchain are still reused. Windows
consumer execution with a rebuilt SDK, full fresh dependency/distro/CI,
standard PIE sanitizer, packaging/installer and RDP/device/resource gates remain
open. Stage 0 remains IN PROGRESS.
