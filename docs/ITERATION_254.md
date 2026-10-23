# Iteration 254 — Linux project consumes the complete source-rebuilt native chain

2026-10-16. Continues Stage 0 after `32bb6d4`. The source-only project helper
consumes the SDK's bound dependency receipt, validates its current source-only
provenance/status/hash and uses that exact root for vcpkg, dependency discovery,
feature inspection and runtime paths. It checks both unchanged receipts again
after verification. SDK receipt paths must belong to the isolated build
namespace before any read; malformed JSON is reported without its contents.
Portable refusal fixtures cover those boundaries and mixed/incomplete metadata.

New source-only consumer `build/native-clean-QLgO56` resolves FreeRDP, client and
WinPR packages under `build/freerdp-source-clean-HC5AcL/installed`, and dependency
libraries under `build/dependencies-source-clean-w2PFkb/installed/x64-linux-bundled`.
Neither prior installed prefix is used. The 328-file / 1,851,578-byte native
input retains unchanged hash
`b1bb08d242a533d21c8a0b29aae62c4cd3110254e68429c911864f998e446e9f`.
Prepared compiler/CMake/Ninja/vcpkg tools and offline Catch2 3.8.1 remain inputs.

Compilation, linked CTest 30/30 and actual-process/synthetic-TLS Node 40/40 pass.
The Node cases cover primary/framed IPC, 100 sequential workers, parent/worker
death, cancellation, bounded paused output, full 16 MiB clipboard transport and
selected clipboard strict TLS refusal/cancellation with joined cleanup. The
IPC addon's direct NEEDED inventory contains no FreeRDP/WinPR import.

Full Linux pnpm check against this exact new worker/addon passes 656 / 58 platform
skips / 714 with zero failures. Windows backcompat full check on the previously
verified rebuilt-SDK consumer passes 662 / 49 / 711. Additional final receipt
path/content refusal focus passes on both platforms after the full checks.

| New project artifact | SHA-256 |
| --- | --- |
| worker | `65712785447d11712374fbc2acaab9e2a296e66c730cf0068e9cc16899ddeca1` |
| IPC addon | `3175499f4d4289d95245d4f8a999863fb02694061d37f8cae9c3605037146bb1` |
| pairing manifest | `9d5b439b9c957b7554f2147f7d4ab1604a45363bef2348dfcbba1bbb7d981124` |

The consumer binds SDK receipt
`7e864b343083e7f94ef9e651bc6b6405c56a6473d0404567bff017f683b52455`
and dependency receipt
`20783b8d6cc5daf079e2f4ff9bd9a190be69814cb1088eb7afb4fe4ca3c0a32c`.
Both source-built-input flags are true; the helper itself consumes rather than
rebuilds those libraries. Logs: `build/iteration-254-linux-fresh-native-consumer.log`
and `build/iteration-254-linux-fresh-native-check.log`.

The newly compiled runtime probe also passes ZLIB, JPEG, H.264, actual FreeRDP
AVC420, Opus and libudev-context roundtrips. Canonical loaded origins require
FreeRDP under the new SDK and ZLIB/JPEG/OpenH264/Opus/libudev under the new
dependency prefix. Versions are ZLIB 1.3.2, FreeRDP 3.32.1, OpenH264 2.6.0 and
libopus 1.6.1. Report: `build/iteration-254-fresh-runtime-probe.json` in the Linux
fixture. No physical device is enumerated or captured by this probe.

This accepts the named local Linux cached-source private dependencies → SDK →
project chain, not a new clean OS/distro or complete fresh repository checkout /
CI. Windows cold dependency chain, standard PIE sanitizer, release packaging /
installers and actual RDP/device/resource gates remain open. No public session
protocol or runtime capability acceptance is broadened. Stage 0 stays IN PROGRESS.
