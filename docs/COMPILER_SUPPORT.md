# Native compiler support

## Current target and verified scope — 2026-10-22

Release 0.2.0 accepts the named compiler port and distro desktop profiles;
final checks pass GCC 8.3 CTest 37/37, MSVC 36/36, Linux full 882 / 87 skips
and Windows full 905 / 61 skips. [Release evidence](ITERATION_418.md). The
intermediate checkpoints below preserve their historical open/completed states;
they do not remove the remaining installed-security/device/platform matrix or
override that later scoped acceptance.

Latest checkpoint (2026-10-22): the linked GCC 8.3 package now passes actual
RED OS 7.3 and Astra Linux 1.7.5 public Edge H.264/JPEG, resize/restoration,
viewer reattachment and cleanup after bounded legacy XRDP RDPSND admission.
Clean linked CTest passes 37/37 on GCC 8.3 and 36/36 on MSVC; full checks pass
877 / 87 skips and 900 / 61 skips. [Exact scope and retained failures](history/iterations/401-450.md#iteration-417).
This supersedes the earlier open RED OS desktop gate below. It does not accept
all installed-OS/security/device profiles or a new Windows application/audio run.

The user now requires **GCC 8.3.0 / Astra Linux 1.7.5** and retains mandatory
**RED OS 7.3 / GCC 11** support. This supersedes the earlier GCC 12 fallback
decision below. The GNU source-version gate is 8.3; CMake remains at least 3.24,
Node remains 24, and the worker stays in the C++20 language mode (GCC 8 spells
this experimental mode `-std=c++2a`). This is a port in progress, not a claim of
complete C++20 standard-library support in GCC 8 or completed distro acceptance.

`native/compat` supplies the bridge's limited borrowed-view, representation-copy,
whole-range algorithm and joining-thread/stop subset. Modern standard facilities
are used where available. The fallback lives in `bridge::compat`, never in `std`;
it retains explicit bounds, constness and joined callback/thread lifetimes.
Both native and forced-fallback CTest targets exercise these contracts.

The exact GCC 8.3.0 foundation build passes CTest **20/20** in an isolated Debian
fixture. The actual RED OS 7.3 host with GCC 11.4.1 also passes **20/20**.
A clean MSVC Debug build passes **19/19** and framed lifecycle **16 passed /
1 platform skip**. The same GCC 8.3 binaries pass **20/20** with the supplied
Astra 1.7.5.16 ISO's glibc/libstdc++ in a separate unpacked runtime fixture;
the GCC 8.3 IPC-only addon passes 14/14 actual Node 24.21.0 packet/lifecycle
tests there. Windows full foundation `pnpm check` passes 849 / 112 skips /
961 total. These are foundation
results, not linked FreeRDP, dependency closure, RDP/device or installed-Astra
results. The runtime fixture uses the Docker host kernel.
[Port evidence and remaining gates](history/iterations/401-450.md#iteration-407).

A separate QEMU TCG guest additionally boots the ISO's actual Astra
`6.1.50-1-generic` kernel with the checked runtime libraries and custom initramfs.
It passes foundation CTest **20/20** and actual Node IPC-only addon **14/14**,
then powers off cleanly. This is kernel/runtime evidence, separate from a full
installed Astra/security profile, other kernels, linked FreeRDP and RDP/device
acceptance. [Guest evidence](history/iterations/401-450.md#iteration-408).

The next exact GCC 8.3.0 source build completes all ten required private
dependency roots and the pinned FreeRDP/WinPR SDK, including strict private
origins and foreign-prefix refusal. A fresh Release linked consumer passes
CTest **37/37** and real-worker Node IPC/lifecycle/protocol-fixture checks
**40/40**, with unchanged source and recorded compiler/artifact receipts.
Full `pnpm check` against that clean linked worker/addon passes **877 / 87 skips /
964 total**, zero failures.
The libfuse example's language flag is selected by Meson; bridge origin probes
use PIC, AUDIN avoids an old optimized-optional warning, and the owned tone has
an exact-value `pi` fallback. This linked build is separate from linked Astra
runtime, installed-OS, RED OS product, Windows regression and actual RDP gates.
[Linked source-chain evidence](history/iterations/401-450.md#iteration-409).

The identical GCC 8.3 worker/addon also run in a separate `scratch` container
with the checked Astra 1.7.5 ISO's glibc/libstdc++ and private rebuilt DSOs.
Native CTest **37/37**, codec/origin probes and actual Node IPC/lifecycle/TLS
fixture checks **54/54** pass. This uses the Docker host kernel, with no OS/VM
installation. A fresh MSVC Release consumer with a separately rebuilt corrected
SDK binds exactly the same native source hash and passes CTest **36/36** and
focused process/protocol checks **27 / 1 skip**. Full physical-path Windows
`pnpm check` also passes **900 / 61 skips / 961**.
The actual RED OS GCC 11 linked consumer compiles all targets, but its runtime
finds a retained missing `libcrypt.so.1` imported by the reused private CUPS
library: CTest 25/37, 12 loader/worker failures. RED OS linked runtime and
actual RDP gates remain separate and open; installed/security profiles are
not accepted by these results. [Astra runtime and Windows control](history/iterations/401-450.md#iteration-410).

The subsequent source-level CUPS client link correction removes its unused
legacy libcrypt dependency. A numactl configure correction links its actual
byte atomic builtins before requesting libatomic, retaining the external-library
fallback where required. GCC 8.3 and GCC 12 controls preserve both exported
ABIs and upstream IPP/bitmap checks. Actual RED OS GCC 11 then passes CTest
**37/37** and Node fixtures **54/54**. A final complete GCC 8.3 source chain
passes CTest **37/37**, focused Node **40/40**, full `pnpm check` **877 / 87 skips /
964**, strict installed-runtime closure and relocation. Its exact self-contained
package passes an unprivileged artifact-only probe on actual RED OS without
SDK/build paths. Actual RDP regression remains separate.
[Portable dependency/package evidence](history/iterations/401-450.md#iteration-411).

The exact final package subsequently passes a cold unprivileged Astra-library
container probe and actual owned XRDP desktop/resize/transport-loss regression.
Public Edge H.264/JPEG and Linux-producer CLIPRDR ↔ prepared Tk Unicode
roundtrips pass their named profiles, with earlier failed attempts retained.
[Actual RDP evidence](history/iterations/401-450.md#iteration-412). A dedicated exact GCC 8.3 foundation
CI recipe is also locally verified at CTest **20/20**; full linked Linux
`pnpm check` remains **877 / 87 skips / 964**, zero failures. The hosted workflow
itself is not claimed as executed. [CI evidence](history/iterations/401-450.md#iteration-413).

The user additionally requires real RDP connections to both named distros for
0.2.0. The real user-confirmed Astra 1.7.5 node passes public Edge H.264/JPEG,
resize/restoration, reattachment and cleanup with the final GCC 8.3 package.
[Exact scope](history/iterations/401-450.md#iteration-415). The real RED OS 7.3 / XRDP 0.10.6.1 node
activates but fails on RDPSND reception. Its installed-package/build checks
do not satisfy that still-open desktop gate. [Current diagnosis](history/iterations/401-450.md#iteration-416).

## Historical GCC 12 decision and acceptance

The following records the earlier decision and its independently verified
profiles. Its GNU minimum statements describe that historical baseline.

User decision, 2026-10-16: prefer GCC 8 if feasible, otherwise GCC 12. The bridge
retains its required C++20 implementation and sets **GCC 12 as the GNU minimum**.
The complete private dependency → FreeRDP 3.32.1 → worker/addon chain already
builds and passes linked CTest/full Node checks with GCC 12.2 on local Linux.
[Source-chain evidence](history/iterations/251-300.md#iteration-254), [clean source export](history/iterations/251-300.md#iteration-260).

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
[Current policy/build evidence](history/iterations/251-300.md#iteration-263).

A current tracked-source export also passes an independent local Clang 18.1.3
Debug foundation build: CTest 16/16, framed native lifecycle 15 / 1 skip and
full Node 574 / 147 platform/profile skips / 721 total. The original 1,107
archived files remain unchanged. Compiler/Catch2/public caches are prepared
inputs; this is separate from actual CI, linked FreeRDP and RDP/device gates.
The GNU minimum remains 12. [Clang Debug evidence](history/iterations/251-300.md#iteration-288).

Clean-native receipts now record the actual compiler ID/version/path, CMake
version, Ninja generator and checked build type through CMake File API. New
GCC 13.3.0 and MSVC 19.44.35228.0 Debug foundation builds bind identical native
source bytes and pass CTest 16/16 and 15/15 respectively; native lifecycle and
full platform Node controls also pass. These additional profiles keep GCC 12
as the GNU minimum. [Provenance/build evidence](history/iterations/251-300.md#iteration-289).

An explicit local Windows linked Debug profile now also builds a separate
Debug FreeRDP/WinPR SDK and source-only consumer with matching dynamic Debug
CRT. A mixed Release-CRT SDK/Debug-CRT consumer exposed a retained DVC timeout;
that combination now refuses before consumer output. No assertions or timeouts
are relaxed. The matched profile passes native CTest 31/31, process/TLS checks,
resource policy composition and full Windows Node 740 / 51 skips. Existing
Release modes/artifacts and pins remain unchanged; private dependency outputs
are reused. This is a developer-host profile, separate from production/Debug
CRT redistribution, new Linux linked SDK and RDP/device/soak acceptance.
[SDK/consumer evidence](history/iterations/301-350.md#iteration-312).

Ubuntu GCC 12.4 also passes the standard PIE ASan/UBSan foundation: actual
library probe, native CTest 16/16 and 100 default-option empty-program launches.
Its distribution sanitizer runtimes are 14.2; the historical Bookworm/GCC 12.2
PIE startup failures remain retained as a separate environment result. Eleven
Clang 18 PIE sanitizer fuzz smokes pass in the same restricted Ubuntu fixture.
[Sanitizer/toolchain evidence](history/iterations/251-300.md#iteration-264).

A new complete tracked-source Ubuntu export additionally passes full Node
regression against its GCC 12.4 standard PIE sanitizer worker: CTest 16/16 and
569 passed / 146 profile/platform skips / 715. The 100-worker lifecycle and
parent-death cases execute under ASan/UBSan in the separate worker. Parent Node
uses no sanitizer preload; the addon is OFF. Separate Node-only preload controls
still fail LSan, so addon sanitizer acceptance remains open.
[Supervisor/sanitized-worker evidence](history/iterations/251-300.md#iteration-267).

A linked bridge-owned Debug consumer now also passes standard PIE ASan/UBSan
CTest 31/31 and full Node 633 / 84 profile/platform skips / 717 under GCC 12.4.
The earlier DSP leak is retained with its failing reproducer; the exact pinned
SDK is rebuilt with a hash-checked ownership correction. FreeRDP/private codecs
remain uninstrumented Release libraries and the addon is OFF. This is scoped
linked bridge sanitizer evidence, separate from upstream/addon and connected
audio/device acceptance. [Correction/evidence](history/iterations/251-300.md#iteration-269).

An additional GCC 12.4 profile instruments FreeRDP/WinPR themselves with
ASan/UBSan, then links the bridge sanitizer worker against that separate SDK.
Verbose native CTest passes 31/31 and full Node passes 633 / 84 skips / 717.
The worker remains standard PIE and parent Node has no preload. Private
codec/crypto dependencies and the addon are not instrumented; the upstream
project's own test/fuzz suite and connected RDP/device gates remain separate.
[Instrumented SDK evidence](history/iterations/251-300.md#iteration-272).

The GCC 12.4 sanitizer runtime profile now also includes a separately rebuilt
Opus 1.6.1. Its five own static test cases are observed passing, with an initial
extensions timeout retained and the full 100-million-iteration focused repeat
passing. Actual shared-library selection, bridge CTest 31/31 and full Node
633 / 84 skips / 717 pass. Other private dependencies/addon and wider acceptance
remain separate. [Opus profile/evidence](history/iterations/251-300.md#iteration-274).

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
[Correction/regression evidence](history/iterations/251-300.md#iteration-275).

The OpenH264 upstream fixture also builds its exact GoogleTest 1.8.0 prerequisite
with ASan/UBSan. Common 17/17, decoder 50/50 and processing 10/10 pass. A test-only
`SSourcePicture` value-initialization patch removes a caller-fixture bool UB;
the focused reproducer and all 181 encoder tests pass in separate runs. The
original UB and timeout logs remain; the complete API category still times out
at 300 seconds. This is not a full upstream suite/platform acceptance.
[Upstream fixture evidence](history/iterations/251-300.md#iteration-276).

Pinned ZLIB 1.3.2 now also passes an independent GCC 12.4 ASan/UBSan shared build:
18 instrumented compile commands and upstream CTest 14/14. Actual module/codec
origins, linked CTest 31/31 and full Node 633 / 84 skips / 717 pass with the new
ZLIB and the existing instrumented SDK/codecs. Ordinary CTest/CMake tools use
their separate loader profile; parent Node has no preload and addon is OFF.
The worker/Release artifacts remain unchanged. Static-only coverage, remaining
dependencies/addon and wider acceptance stay open.
[ZLIB runtime evidence](history/iterations/251-300.md#iteration-277).

An independent static ZLIB profile verifies sanitizer flags in all 19 compile
commands, including the upstream infcover owner/fault fixtures. Static examples
and coverage cases pass 4/4, and complete upstream static CTest passes 16/16
with matching gcov 12 and no new sanitizer diagnostics. Source/assertions and
the prior shared runtime remain unchanged. This is local static-test evidence;
broader dependency/addon/platform/fuzz/CI and actual RDP gates remain open.
[Static ZLIB evidence](history/iterations/251-300.md#iteration-278).

Pinned libspng 0.7.4 also passes a separate GCC 12.4 shared ASan/UBSan build
with private instrumented ZLIB. A standalone C++20 driver and unchanged pinned
upstream C read harness pass eight exact RGBA8 roundtrip combinations plus
destination/image/truncation refusals and 2,424 seeded inputs from 202 PNGs.
Actual module paths, hash refusal, linked CTest 31/31 and full Node 633 / 84 skips
pass with unchanged worker/Release artifacts. This is a Linux local PNG slice;
full comparator/write-fuzz/platform/CI and remaining dependency/addon acceptance
stay open. [PNG regression evidence](history/iterations/251-300.md#iteration-279).

The separate pinned libjpeg-turbo 3.2.0 GCC 12.4 Debug shared profile now also
passes upstream ASan/UBSan CTest 332/332, after focused API/bitmap/buffer 3/3.
All 292 C compile commands are instrumented; 27 SIMD assembly commands are not.
It uses the instrumented private libspng/ZLIB SDKs, keeps existing source port
patches only, and preserves ordinary CMake tool ownership. A focused scalar API
control, actual module origins, linked CTest 31/31 and full Node 633 / 84 skips
also pass with unchanged worker/Release. Wider sanitizer/fuzz/platform/CI and
remaining dependency/addon gates stay open. [JPEG evidence](history/iterations/251-300.md#iteration-280).

A separate GCC 12.4 OpenSSL 3.6.5 static C-only Debug profile follows upstream
ASan no-shared and UBSan PEDANTIC guidance. All 1,163 library C commands are
checked; focused ASN.1 2/2 recipes and selected ASN.1/X.509/BIO/buffer 10 recipes /
15 top-level tests pass with no new sanitizer diagnostic. Wrapper prerequisites
and exact patch-backup states are verified; initial failures remain retained.
The shared bridge runtime/Release is unchanged. Full OpenSSL/TLS, assembly,
remaining dependency/addon/platform/CI acceptance stays open.
[Static OpenSSL evidence](history/iterations/251-300.md#iteration-281).
Four additional local X.509/verify/store/CSR recipes pass 220 top-level tests;
retained result files have no sanitizer diagnostics and source/library/CLI
hashes remain unchanged. No shared bridge/real TLS acceptance is added.
[Certificate fixture evidence](history/iterations/251-300.md#iteration-282).
Three local SSL context/config/memory-BIO recipes also pass all three top-level
tests and 13 available buffer variants with the same libraries and no sanitizer
diagnostic. Five new test C commands are instrumented; socket, dynamic-engine
and shared bridge acceptance remain separate. [Memory SSL evidence](history/iterations/251-300.md#iteration-283).

A separate experimental OpenSSL shared C-only/no-module GCC 12.4 profile also
passes ASan/UBSan: 2,092 planned library C commands, 4 upstream recipes / 211
top-level tests, actual SSL/crypto origins, linked native CTest 31/31 and full
Node 633 / 84 skips. Pinned Configure permits it without RPATH; this does not
replace the upstream-recommended static sanitizer baseline. Worker/Release and
pins stay unchanged. Modules/assembly/full production features, remaining
dependency/addon/platform/CI and actual RDP gates remain open.
[Experimental runtime evidence](history/iterations/251-300.md#iteration-284).

A separate pinned libusb 1.0.30 parser-only GCC 12.4 Debug fixture instruments
both unchanged upstream C harnesses and its C++20 driver. BOS values (105 checks)
and bounded seed replay (150 inputs) pass standalone CTest 2/2, with exact
source/hash-refusal checks and no device backend. The unchanged linked control
passes CTest 31/31 and full Node 633 / 84 skips. A subsequent Clang fuzz attempt
finds a retained 40-byte cleanup leak, confirmed by GCC; this bounded baseline
does not accept all parsers, shared libusb/eudev or device integration.
[Descriptor baseline evidence](history/iterations/251-300.md#iteration-285).
The same leak has a failing-before/passing-after GCC 12 regression. A local
test-only source-copy correction passes GCC/Clang CTest 3/3 each, saved-input
replay and two 100,000-run Clang ASan/UBSan/libFuzzer smokes. Original source and
Release libusb remain unchanged; production adoption/backend/eudev acceptance
is still open. [Cleanup correction evidence](history/iterations/251-300.md#iteration-286).

The manual bundled workflow now also selects Linux `CC=gcc-12` and
`CXX=g++-12` before building private dependencies, FreeRDP and the worker.
Its cache key distinguishes the GCC 12 Linux and MSVC Windows profiles.
A fresh local CMake environment-selection probe verifies actual GNU C/C++ 12
and the required C++20 library facilities. The workflow itself remains prepared,
not executed. [Selection/validation record](history/iterations/251-300.md#iteration-273).

GCC 12 is a build-toolchain baseline. It is separate from the minimum glibc,
libstdc++ symbol versions and distribution runtime closure of a particular
binary archive. Installing a prebuilt npm/native artifact does not by itself
require a compiler; development builds and future local addon builds do.
