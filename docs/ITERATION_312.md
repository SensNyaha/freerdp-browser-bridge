# Iteration 312 — explicit isolated linked Debug consumer

2026-10-19. Implements the next local build/resource prerequisite from TODO
Stages 0/10: a new Debug worker/helper linked to the verified pinned SDK, without
rebuilding or replacing existing Release artifacts/settings or dependencies.
This is separate from production helper adoption and connected resource gates.

The source-only consumer driver now has explicit profiles: foundation stays
Debug, linked stays Release, and the additive linked-debug mode uses Debug.
The new mode requires an isolated rebuilt-SDK receipt before Catch2 access or
build preparation. Its filtered feature input is generated inside the new
fixture, avoiding replacement of the ordinary build feature inventory. The
same source/receipt/hash/CMake-origin checks, offline Catch2, compilation budget,
native tests and actual-process/TLS checks remain in use. The actual CMake File
API build-type reply must agree with the selected profile.

Windows exposes `clean-bundled-debug` through the existing MSVC/temporary-alias
wrapper, with an explicit SDK receipt. Missing provenance is rejected before
alias/toolchain acquisition. Existing tasks retain their selected profiles.
Common profile tests assert that the existing linked build remains Release;
the same incomplete/mixed SDK receipts refuse for both linked modes. Initial
Windows focused profile/receipt tests pass **8/8**.

The first local consumer uses the existing Release SDK
`build/freerdp-source-clean-pf2yqW/receipt.json`. Compilation completes all
403 steps as Debug (`/Zi /Ob0 /Od /RTC1`, `/MDd`, warnings-as-errors and
analysis); the first five native suites pass. The DVC suite then reaches the
unchanged whole-CTest 180-second bound. A separate 15-second compact-duration
control completes seven portable cases and stops at the first public SDK ZGFX
case, which owns returned output through caller CRT free. The SDK's recorded
Release build uses `/MD`; its allocation CRT differs from the consumer's
Debug CRT. Both failed controls are retained. No assertions are disabled and
no test/driver timeout is increased.

Windows linked-debug now requires SDK receipt/cache Debug provenance and a
dynamic Debug CRT before consumer output preparation. A separate additive SDK
`--clean-debug` / Windows `clean-freerdp-debug` task builds the exact clean
pinned checkout and approved DSP build-copy correction into new directories,
using the existing bound source-dependency receipt. Its probe uses the same
Debug configuration, and the SDK receipt records the checked build type.
Ordinary SDK and clean-local SDK modes stay Release. The private dependencies
remain their existing outputs; they are not rebuilt or claimed as Debug/
sanitizer coverage here. Profile and receipt/CRT controls pass **10/10**.

## Verified matching Debug profile

The new SDK is `build/freerdp-source-clean-iVDioP` (receipt SHA-256
`9faa165e65c90b76fd2404a5922fd8c9e83d95537bedf6a7cfcf92d66571ba74`).
Its actual core compile flags include `/MDd`; SDK probe CTest passes **1/1**,
including version, three private module origins, 20-channel inventory and
foreign-prefix refusal. Stock upstream C warnings remain in the log; no
warning suppression or source correction is introduced for this profile.

A fresh consumer `build/native-clean-7UfcdO` completes all 403 compile/link
steps. CTest passes **31/31** in 29.39 s; the previously stopped DVC suite now
passes in 2.83 s with the same source/tests and unchanged timeouts. Actual
process/TLS/physical-Node-path checks pass **27 / 1 platform skip** in 51.96 s.
The receipt verifies Ninja, CMake 3.31.6-msvc6, MSVC 19.44.35228.0 and Debug.
Its 346 copied native input files / 1,910,427 bytes remain unchanged, source hash
`d0069a38cb184fca4baaea2e99c9d2e03bc7ca0d67dbb6bcf3178cf9674a8c39`.
No prior project objects/binaries are copied. Prepared Catch2 3.8.1 and the
separately built SDK/dependencies are declared reused inputs.

| New Debug artifact | SHA-256 |
| --- | --- |
| rdp-worker.exe | d244362c1f5083e90acf0e58143dfd692a6744a26ea1b6c395e646b52824aefd |
| rdp-runtime-directory.exe | b4afcc52d67ca5c68ed9aecce1cc1099ba4ba1292958d67f5ca5c2bb1fdf812b |

Resource focus with the actual new linked binary passes **27/27** in 94.30 s,
including actual CPU/RSS limits, cancellation, synthetic fault/retirement,
native crash composition and configured capacity. The 40-worker / five
replacement control passes with 903 paired queries, no watchdog failures,
maximum query 2,722 ms and joined empty-runtime/query-owner cleanup. Sampled
worker peak RSS is 23,318,528 bytes, parent peak 81,821,696 bytes; parent CPU
10,906,000 microseconds over 58.21 s. These are unconnected observations,
not connected/total-session budgets or a comparative performance benchmark.

The runtime probe additionally passes ZLIB compression and JPEG/H.264/public
FreeRDP AVC420/Opus roundtrips. Five symbol origins resolve inside the new
output: JPEG/OpenH264 are static in the probe, ZLIB/FreeRDP/Opus are local DLLs.
All 11 DLLs copied from SDK/bin (three core libraries plus eight CRT files)
and two selected dependency DLLs match their source bytes. The first audit
incorrectly assumed SDK/bin contained only the three core DLLs; its failed
log is retained, and the corrected audit checks all eleven without artifact
changes. This is local developer-runtime evidence, not a relocated/redistributable
Debug CRT package or clean-machine acceptance.

All seven protected pre-existing worker/helper/feature/SDK/dependency-receipt/
pin inputs retain their pre-build hashes. In particular the original Release
worker remains `2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
General profile/receipt controls pass Windows **12/12**, Linux **11 / 1 Windows
skip**. Linux existing foundation CTest passes **17/17**; full Linux `pnpm check`
passes build/lint/format and **643 passed / 151 skips / 794 total / zero
failures**, Node duration 129.26 s. No new Linux SDK/linked build is claimed.
Full Windows `pnpm check` with this new linked Debug binary also passes
build/lint/format and **740 passed / 51 platform/profile skips / 791 total /
zero failures**, Node duration 544.02 s. Its configured CPU/RSS capacity and
native crash-retirement cases pass again. Final protected-input/origin audit,
local documentation links and `git diff --check` pass.

Ignored evidence: `build/iteration-312-{windows-profile,windows-profile-final,profile-guard,profile-final,linux-profile}.log`,
`iteration-312-{windows-native,dvc-focused,mixed-sdk-refusal,windows-sdk-debug,windows-matched-native}.log`,
`iteration-312-{module-probe,inputs-origins,inputs-origins-final,windows-resource-focus,windows-full,linux-full}.log`,
protected-input snapshot, exact receipts and explicit audit/transfer/run scripts.

Connected RDP/device/media, production helper adoption, private dependency
Debug/sanitizer coverage, remaining build/distro/CI and complete resource/soak
gates remain open.
