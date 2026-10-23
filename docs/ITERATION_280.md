# Iteration 280 — pinned libjpeg-turbo sanitizer profile

2026-10-18. Continues Stage 0 / SPECIFICATION §2.3 and §3 after the completed
[libspng block](ITERATION_279.md), commit `f160b2c`. This is a separate local
Debug build of pinned libjpeg-turbo 3.2.0 and its upstream regression fixtures.
Release recipes/artifacts, dependency versions and production code remain
unchanged. No external service, RDP or device access is used.

## Exact source and instrumentation

Cached `libjpeg-turbo-libjpeg-turbo-3.2.0.tar.gz` matches the existing port
SHA-512:

```text
1ce063e9e126d55019385da3a6ff4521a9a3958edeab15e2465ae3435026dac6e598277eea066173ada47da37159d0f7812b2227869c10dd141dcfe2ddeab720
```

Only the three existing port patches are applied with zero fuzz. New build and
install outputs use `jpeg-sanitizers-280` and `jpeg-sanitizers-sdk-280` under the
bounded container build tmpfs. GCC 12.4 Debug uses ASan/UBSan, nonrecovering UB
checks, frame pointers and `-Og -g1`. All **292 C compile commands** have these
flags. The **27 NASM commands** are not sanitizer-instrumented. SIMD stays ON;
the actual test ELF is standard PIE. No sanitizer suppression or
sanitizer-runtime option override is introduced.

Shared is ON, static OFF, JPEG7/8 compatibility OFF (the existing libjpeg ABI),
and the existing system-SPNG/system-ZLIB selection points explicitly to the
private instrumented libspng 0.7.4 / ZLIB 1.3.2 SDKs from iterations 279/277.
Tools and tests are enabled only in this independent test profile so the
upstream regression suite can run; this does not change packaged Release tools.

## Upstream regression ownership

The exact upstream inventory contains **332 tests**: 328 commands execute actual
instrumented native test/tool binaries and four ordinary CMake commands copy
test fixtures. An isolated CTest projection retains all command arguments,
205 dependency properties and the original working directory, changing only
loader/test output ownership. The native commands receive the new JPEG/SPNG/
ZLIB loader paths. Ordinary CMake commands and parent CTest retain an ordinary
loader so instrumented libz cannot break a host tool before its own startup.
Each test has a 90-second deadline and the complete run a 900-second bound.

The subsequent linked checks reuse the existing exported bridge/Node workspace
and worker, as in iteration 279. The standalone PNG test project is verified
separately. Neither profile establishes a fresh bridge source export/build.

Focused `tjunittest-shared`, `tjunittest-shared-bmp` and `bmpsizetest-shared`
pass **3/3** in 11.46 seconds. Full upstream CTest passes **332/332** in 250.94
seconds without ASan/LSan/UBSan diagnostics. This includes 8/12-bit lossy and
2..16-bit lossless API cases, allocation/YUV/bitmap/PNG cases, command-line
codec examples/transforms and their golden-output MD5 comparisons. These are
unchanged upstream assertions and fixture images, not actual RDP/device tests.

An additional default 8-bit `tjunittest` invocation passes with the upstream
`JSIMD_FORCENONE=1` test switch in a separate process/output directory. The
pinned `simd/jsimd.c` explicitly sets `simd_support=0` for this value, exercising
the instrumented C fallback, including its finite buffer-size regression. This
is one focused scalar API control, not a second complete scalar suite. SIMD is
unchanged for the 332-test run, installed library and bridge profile. No new
sanitizer diagnostic is observed.

Post-test source audit compares every regular archive file: only
`CMakeLists.txt`, `release/Config.cmake.in` and `release/libturbojpeg.pc.in`
differ, exactly the existing port-patch scope. No codec/test source is changed.
The installed shared ELFs retain actual libasan/libubsan NEEDED entries:

| Module | SHA-256 |
| --- | --- |
| libturbojpeg.so.0 | `56f0ef8c71ae583b1aefeff77d6538dabc93b639f738f793bc28715b1afc9af6` |
| libjpeg.so.62 | `985eb9a3b0aac412b6ebfef2c2e8a09610a4b89c273bc481ccaffd2356266517` |

## Linked regression

The same existing bridge worker and 31 exact CTest commands use a new loader
projection, preserving the original compiler-policy tool environment. Focused
JPEG/H.264/GDI/graphics-message cases pass **4/4** in 19.35 seconds; full native
CTest passes **31/31** in 58.14 seconds. The runtime probe performs actual codec
roundtrips and reports
`jpegRuntime=/work/build/jpeg-sanitizers-sdk-280/lib/libturbojpeg.so.0`.
The dynamic loader's resolved list additionally confirms this libturbojpeg and
the private instrumented libspng/ZLIB paths. Parent Node has no sanitizer
preload and the addon remains OFF.

Full `pnpm check` passes builds/lint/format and **633 passed / 84 profile/platform
skips / 717 total / zero failures**, 178.21 seconds for Node tests. The complete
linked output has no ASan/LSan/UBSan diagnostic. Worker SHA-256 stays
`cb134e97800610715d47874e217b5e5aabdcb65e08138ab9bfe5b906e3168188`.

Evidence: `build/iteration-280-configure.log` and
`build/iteration-280-upstream.log`, plus `build/iteration-280-linked.log`.
Local configure runner SHA-256:
`e0a495e8c976dcb983a8edd31bc23491d515bbfe8be1d57cf2ae02331fe6424a`;
upstream runner SHA-256:
`c70476e7e524d629abf622bade6cf8c9be7c5962f18d336362bce2a7ca216942`.
Linked runner SHA-256:
`60a124d3d5825a151b6b80ee599fbefc362faf02daea681cfcdeaedecbad52b`.
Focused scalar runner `build/iteration-280-scalar.py` SHA-256:
`a3e4ffbc6b0600fab622dc185550d26d3a26ab42076c18786adfa69e6871155d`.
The upstream, linked and scalar JSON receipts and final upstream CTest log are
exported from tmpfs to host `build/`. Scalar output is retained separately in
`build/iteration-280-scalar.log`. The original iteration 275 UB diagnostic file
still has its recorded SHA-256; prior reports are preserved.

The fixture retains UID1000, read-only root, no network, init, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB and bounded build tmpfs.
This is local codec/fixture acceptance. Assembly instrumentation, long fuzzing,
remaining dependencies/addon, platform/CI and actual RDP/resource gates remain
open, together with the previously retained OpenH264 API timeout.
