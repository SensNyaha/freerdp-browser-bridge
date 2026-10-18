# Native compiler support

User decision, 2026-10-16: prefer GCC 8 if feasible, otherwise GCC 12. The bridge
retains its required C++20 implementation and sets **GCC 12 as the GNU minimum**.
The complete private dependency → FreeRDP 3.32.1 → worker/addon chain already
builds and passes linked CTest/full Node checks with GCC 12.2 on local Linux.
[Source-chain evidence](ITERATION_254.md), [clean source export](ITERATION_260.md).

GCC 8 with its stock libstdc++ cannot compile the current source: production
IPC/parser APIs use `std::span`, connection supervision uses `std::jthread` /
`std::stop_token`, and public addin adaptation uses `std::bit_cast`. These are
implemented after GCC 8 in the [official libstdc++ C++20 implementation table](https://gcc.gnu.org/onlinedocs/libstdc++/manual/status.html#status.iso.2020).
This is an incompatibility assessment from actual source requirements and the
upstream library table, not a claimed execution of a GCC 8 build. A separate
backport/replacement-library effort would require new lifetime/bounds/ABI and
platform validation; it is not part of the selected GCC 12 fallback.

CMake checks the GNU version before dependency/test setup and compiles a probe
for the required C++20 library facilities. This also detects an incompatible
compiler/standard-library combination. MSVC and Clang remain supported within
their independently tested scopes. The compiler-policy CTest tests the version
boundary as policy; it does not substitute for an actual compiler build.

With this policy enabled, a new source-only GNU 12.2 linked consumer passes
CTest 31/31, process/TLS 40/40 and full Node 657 passed / 58 platform skips / 715.
MSVC passes the actual library probe and foundation CTest 15/15. CI now includes
an explicit GCC 12 foundation entry, prepared but not run.
[Current policy/build evidence](ITERATION_263.md).

Ubuntu GCC 12.4 also passes the standard PIE ASan/UBSan foundation: actual
library probe, native CTest 16/16 and 100 default-option empty-program launches.
Its distribution sanitizer runtimes are 14.2; the historical Bookworm/GCC 12.2
PIE startup failures remain retained as a separate environment result. Eleven
Clang 18 PIE sanitizer fuzz smokes pass in the same restricted Ubuntu fixture.
[Sanitizer/toolchain evidence](ITERATION_264.md).

A new complete tracked-source Ubuntu export additionally passes full Node
regression against its GCC 12.4 standard PIE sanitizer worker: CTest 16/16 and
569 passed / 146 profile/platform skips / 715. The 100-worker lifecycle and
parent-death cases execute under ASan/UBSan in the separate worker. Parent Node
uses no sanitizer preload; the addon is OFF. Separate Node-only preload controls
still fail LSan, so addon sanitizer acceptance remains open.
[Supervisor/sanitized-worker evidence](ITERATION_267.md).

A linked bridge-owned Debug consumer now also passes standard PIE ASan/UBSan
CTest 31/31 and full Node 633 / 84 profile/platform skips / 717 under GCC 12.4.
The earlier DSP leak is retained with its failing reproducer; the exact pinned
SDK is rebuilt with a hash-checked ownership correction. FreeRDP/private codecs
remain uninstrumented Release libraries and the addon is OFF. This is scoped
linked bridge sanitizer evidence, separate from upstream/addon and connected
audio/device acceptance. [Correction/evidence](ITERATION_269.md).

An additional GCC 12.4 profile instruments FreeRDP/WinPR themselves with
ASan/UBSan, then links the bridge sanitizer worker against that separate SDK.
Verbose native CTest passes 31/31 and full Node passes 633 / 84 skips / 717.
The worker remains standard PIE and parent Node has no preload. Private
codec/crypto dependencies and the addon are not instrumented; the upstream
project's own test/fuzz suite and connected RDP/device gates remain separate.
[Instrumented SDK evidence](ITERATION_272.md).

The GCC 12.4 sanitizer runtime profile now also includes a separately rebuilt
Opus 1.6.1. Its five own static test cases are observed passing, with an initial
extensions timeout retained and the full 100-million-iteration focused repeat
passing. Actual shared-library selection, bridge CTest 31/31 and full Node
633 / 84 skips / 717 pass. Other private dependencies/addon and wider acceptance
remain separate. [Opus profile/evidence](ITERATION_274.md).

OpenH264 2.6.0 instrumentation exposes an undefined shift by 32 in `BsFlush()`.
An isolated build-copy correction matches upstream commit 40555ec6 exactly.
GCC 12.4 nonrecovering UBSan reproduces the original failure and passes 2325
focused checks with the correction; unknown input is refused before generation.
The original diagnostic is retained and the Release profile stays unchanged.
The corrected instrumented shared library passes actual origin/codec probes,
six focused suites, full native CTest 31/31 and full Node 633 / 84 skips / 717
with instrumented FreeRDP/WinPR/Opus. The first restored fixture run's missing
OpenSSL test configuration and failed result are retained. Assembly, remaining
private dependencies/addon, upstream/platform/CI and actual RDP gates stay open.
[Correction/regression evidence](ITERATION_275.md).

The OpenH264 upstream fixture also builds its exact GoogleTest 1.8.0 prerequisite
with ASan/UBSan. Common 17/17, decoder 50/50 and processing 10/10 pass. A test-only
`SSourcePicture` value-initialization patch removes a caller-fixture bool UB;
the focused reproducer and all 181 encoder tests pass in separate runs. The
original UB and timeout logs remain; the complete API category still times out
at 300 seconds. This is not a full upstream suite/platform acceptance.
[Upstream fixture evidence](ITERATION_276.md).

Pinned ZLIB 1.3.2 now also passes an independent GCC 12.4 ASan/UBSan shared build:
18 instrumented compile commands and upstream CTest 14/14. Actual module/codec
origins, linked CTest 31/31 and full Node 633 / 84 skips / 717 pass with the new
ZLIB and the existing instrumented SDK/codecs. Ordinary CTest/CMake tools use
their separate loader profile; parent Node has no preload and addon is OFF.
The worker/Release artifacts remain unchanged. Static-only coverage, remaining
dependencies/addon and wider acceptance stay open.
[ZLIB runtime evidence](ITERATION_277.md).

An independent static ZLIB profile verifies sanitizer flags in all 19 compile
commands, including the upstream infcover owner/fault fixtures. Static examples
and coverage cases pass 4/4, and complete upstream static CTest passes 16/16
with matching gcov 12 and no new sanitizer diagnostics. Source/assertions and
the prior shared runtime remain unchanged. This is local static-test evidence;
broader dependency/addon/platform/fuzz/CI and actual RDP gates remain open.
[Static ZLIB evidence](ITERATION_278.md).

Pinned libspng 0.7.4 also passes a separate GCC 12.4 shared ASan/UBSan build
with private instrumented ZLIB. A standalone C++20 driver and unchanged pinned
upstream C read harness pass eight exact RGBA8 roundtrip combinations plus
destination/image/truncation refusals and 2,424 seeded inputs from 202 PNGs.
Actual module paths, hash refusal, linked CTest 31/31 and full Node 633 / 84 skips
pass with unchanged worker/Release artifacts. This is a Linux local PNG slice;
full comparator/write-fuzz/platform/CI and remaining dependency/addon acceptance
stay open. [PNG regression evidence](ITERATION_279.md).

The separate pinned libjpeg-turbo 3.2.0 GCC 12.4 Debug shared profile now also
passes upstream ASan/UBSan CTest 332/332, after focused API/bitmap/buffer 3/3.
All 292 C compile commands are instrumented; 27 SIMD assembly commands are not.
It uses the instrumented private libspng/ZLIB SDKs, keeps existing source port
patches only, and preserves ordinary CMake tool ownership. A focused scalar API
control, actual module origins, linked CTest 31/31 and full Node 633 / 84 skips
also pass with unchanged worker/Release. Wider sanitizer/fuzz/platform/CI and
remaining dependency/addon gates stay open. [JPEG evidence](ITERATION_280.md).

A separate GCC 12.4 OpenSSL 3.6.5 static C-only Debug profile follows upstream
ASan no-shared and UBSan PEDANTIC guidance. All 1,163 library C commands are
checked; focused ASN.1 2/2 recipes and selected ASN.1/X.509/BIO/buffer 10 recipes /
15 top-level tests pass with no new sanitizer diagnostic. Wrapper prerequisites
and exact patch-backup states are verified; initial failures remain retained.
The shared bridge runtime/Release is unchanged. Full OpenSSL/TLS, assembly,
remaining dependency/addon/platform/CI acceptance stays open.
[Static OpenSSL evidence](ITERATION_281.md).
Four additional local X.509/verify/store/CSR recipes pass 220 top-level tests;
retained result files have no sanitizer diagnostics and source/library/CLI
hashes remain unchanged. No shared bridge/real TLS acceptance is added.
[Certificate fixture evidence](ITERATION_282.md).
Three local SSL context/config/memory-BIO recipes also pass all three top-level
tests and 13 available buffer variants with the same libraries and no sanitizer
diagnostic. Five new test C commands are instrumented; socket, dynamic-engine
and shared bridge acceptance remain separate. [Memory SSL evidence](ITERATION_283.md).

A separate experimental OpenSSL shared C-only/no-module GCC 12.4 profile also
passes ASan/UBSan: 2,092 planned library C commands, 4 upstream recipes / 211
top-level tests, actual SSL/crypto origins, linked native CTest 31/31 and full
Node 633 / 84 skips. Pinned Configure permits it without RPATH; this does not
replace the upstream-recommended static sanitizer baseline. Worker/Release and
pins stay unchanged. Modules/assembly/full production features, remaining
dependency/addon/platform/CI and actual RDP gates remain open.
[Experimental runtime evidence](ITERATION_284.md).

A separate pinned libusb 1.0.30 parser-only GCC 12.4 Debug fixture instruments
both unchanged upstream C harnesses and its C++20 driver. BOS values (105 checks)
and bounded seed replay (150 inputs) pass standalone CTest 2/2, with exact
source/hash-refusal checks and no device backend. The unchanged linked control
passes CTest 31/31 and full Node 633 / 84 skips. A subsequent Clang fuzz attempt
finds a retained 40-byte cleanup leak, confirmed by GCC; this bounded baseline
does not accept all parsers, shared libusb/eudev or device integration.
[Descriptor baseline evidence](ITERATION_285.md).
The same leak has a failing-before/passing-after GCC 12 regression. A local
test-only source-copy correction passes GCC/Clang CTest 3/3 each, saved-input
replay and two 100,000-run Clang ASan/UBSan/libFuzzer smokes. Original source and
Release libusb remain unchanged; production adoption/backend/eudev acceptance
is still open. [Cleanup correction evidence](ITERATION_286.md).

The manual bundled workflow now also selects Linux `CC=gcc-12` and
`CXX=g++-12` before building private dependencies, FreeRDP and the worker.
Its cache key distinguishes the GCC 12 Linux and MSVC Windows profiles.
A fresh local CMake environment-selection probe verifies actual GNU C/C++ 12
and the required C++20 library facilities. The workflow itself remains prepared,
not executed. [Selection/validation record](ITERATION_273.md).

GCC 12 is a build-toolchain baseline. It is separate from the minimum glibc,
libstdc++ symbol versions and distribution runtime closure of a particular
binary archive. Installing a prebuilt npm/native artifact does not by itself
require a compiler; development builds and future local addon builds do.
