# Iteration 257 — Windows project consumes the source-rebuilt native chain

2026-10-16. Continues Stage 0 after `899d3d1`. A new source-only project fixture
`build/native-clean-sFV4vM` consumes the new FreeRDP SDK
`build/freerdp-source-clean-MpfPs4` and private dependency prefix
`build/dependencies-source-clean-MypULr/installed/x64-windows-bundled`.
Neither ordinary installed prefix supplies this build. Prepared MSVC/CMake/
Ninja/vcpkg tools, source archives and Catch2 3.8.1 remain inputs.

The helper verifies both completed unchanged receipts, exact pinned SDK source,
all three CMake package origins and generated feature metadata. Source-input
hash after the packaging fix in iteration 258 is
`b9faf3f3c3123dc0c89eff7bbedc3462a402b342dae0a41ff67842834f6c0c8b`.
New Release compilation, CTest 29/29 and actual-process/synthetic-TLS Node
26 passed / one platform skip / 27 pass. These include 100 sequential workers,
parent/worker death, cancellation, bounded output/clipboard IPC and strict TLS
refusal/cleanup; they do not contact an actual RDP host or physical device.

| Artifact | SHA-256 |
| --- | --- |
| worker | `501a0064e50668cef33b3012e99095eba02b2479baeaf8fdb55151c05083c361` |
| directory helper | `da9144bd601c4b733cf76a7ccdb3162945bcae154db2ea8fd27e1e78cc4214c5` |
| SDK receipt | `835eef48d535ee32243cfaa34fb4047c5fe5f8b6ee47bc7fd1668a87d13890df` |
| dependency receipt | `0d47332311bd1050e66d3f72a7d508143b6cf0c50f53af46893ed282eb132d83` |

Full Windows pnpm check against this exact new worker/helper passes 662 / 49
platform skips / 711 with zero failures. The corresponding Linux source-built
consumer passes 656 / 58 / 714 in iteration 258. Logs:
`build/iteration-257-windows-fresh-native-consumer.log` and
`build/iteration-257-windows-full-check.log`.
Packaging/relocation of this exact consumer follows in iteration 258. This
accepts the named local Windows cached-source dependency → SDK → project chain,
separately from complete fresh checkout/clean-machine/distro/CI, standard PIE
sanitizer, installers and actual RDP/device/resource acceptance. Stage 0 remains
IN PROGRESS.
