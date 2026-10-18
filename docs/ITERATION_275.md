# Iteration 275 — OpenH264 BsFlush undefined-shift regression

Started 2026-10-16; completed 2026-10-18. Implements Stage 0 sanitizer verification
and SPECIFICATION §2.3 / §3 correctness and resource requirements. The existing
Release port, dependency pin, SDKs and release artifacts are unchanged. The GNU
minimum remains GCC 12.

## Preserved state and original diagnostic

On resumption, Git contained no tracked modifications or stash corresponding to
the previously reported five files. Existing ignored runners, inputs and logs
were preserved. New work adds an isolated test project; it does not restore or
overwrite presumed previous changes.

The original `build/iteration-275-linked.log` is retained with SHA-256
`5865bae50d8ec4f28acfcbeef4a8a54dfbfb3938115a645f15c661c05a916926`.
Its diagnostic is:

```text
codec/common/inc/golomb_common.h:103:3: runtime error:
shift exponent 32 is too large for 32-bit type 'unsigned int'
```

That run passed `avc-admission-tests` and failed `h264-tests` immediately under
nonrecovering UBSan. Its filter included the nonexistent name `gfx-tests`, so
only two tests ran. No original full native/Node pass is claimed. Initial
preparation logs also retain the corrected compile-command count assertion and
the regression's initially missing internal-header prerequisite.

## Upstream comparison and correction

[OpenH264 commit 40555ec684ec0fede3948c8f272c04d88d05189d](https://github.com/cisco/openh264/commit/40555ec684ec0fede3948c8f272c04d88d05189d)
wraps the existing `BsFlush()` body in `if (pBitString->iLeftBits < 32)`.
For the valid empty state `iLeftBits == 32`, it returns success without shifting,
writing bytes, advancing the cursor or resetting pending bits. For 0..31, the
previous write, cursor advancement and reset remain identical. Upstream's added
regression uses `uiCurBits=123` with `iLeftBits=32`.

The standalone CMake project admits only the exact prepared OpenH264 2.6.0
header, bounded to 64 KiB and checked before generation. Canonical LF SHA-256:

- Original: `2f0b856c3599749095a774a3cbd85597d6e4421975276c5cf74cd509f8bd6676`.
- Corrected: `2250df8ab9c364372bc13dd8d9f4ef70c592bc1d10fd11376e792ce89ea3a17e`.

The complete corrected header matches the header at the upstream commit byte
for byte. CMake checks both the generated content and the output file hash.
Only a generated build copy changes; the input source tree remains unchanged.

## Reproducible focused test

Use the prepared pinned source with its existing port patches, not an already
corrected source tree:

```sh
cmake -S native/sanitizers/openh264-bsflush -B build/bsflush-fixed \
  -G Ninja -DCMAKE_CXX_COMPILER=g++-12 \
  -DBRIDGE_OPENH264_SOURCE=/absolute/path/to/prepared/openh264/source
cmake --build build/bsflush-fixed
ctest --test-dir build/bsflush-fixed -V
```

The default enables UBSan, frame pointers and nonrecovering undefined behavior
checks. Configure a separate output directory with
`-DBRIDGE_OPENH264_BSFLUSH_FIX=OFF` to reproduce the original failure; its expected
CTest exit code is 8. No sanitizer suppression or environment override is used.

The fixed regression checks empty initial state, upstream's nonzero pending
state, a cursor following a completed word, all 32 nonempty bit counts, exact
big-endian output, untouched trailing storage, cursor/state reset and repeated
empty flush. Checks remain active independently of `NDEBUG`.

GCC 12.4 UBSan observes the expected failure before and 1/1 / **2325 checks**
after. The original and fixed logs remain separate:
`build/iteration-275-bsflush-before.log` and
`build/iteration-275-bsflush-fixed.log`.
The final tracked CMake/C++ revision is reconfigured and rerun in
`build/iteration-275-final-regression.log`: the same expected before failure,
2325 passing fixed checks, rejection of an unknown header before output
generation, and unchanged original input hash. C++ clang-format validation
also passes.

## Separate instrumented library

The original public source/tool kit SHA-256 is
`511515d767fd655ca6a0ff112bfd5d01b5780e20cacb2c94d3d7b37c2b2c7a48`.
It contains the pinned 2.6.0 source with the same existing three port patches,
Meson 1.9.0 and NASM. A separate copy substitutes the generated header and
checks every regular source file: the only changed file is
`codec/common/inc/golomb_common.h`.

That copy builds in a separate prefix with GCC/G++ 12.4, `-O1 -g1`,
`-fno-sanitize-recover=undefined`, frame pointers, Meson
`-Db_sanitize=address,undefined`, `--buildtype=plain`, `--wrap-mode=nodownload`
and `-Dtests=disabled`. All 90 C++ compile commands carry instrumentation;
23 NASM commands remain uninstrumented. The installed shared object has actual
libasan/libubsan NEEDED entries. The first completed fixed build SHA-256 is
`b7c1fe20deffa73882f01557235e1f3d597764f5e351d3fa4a50a4da688ea038`.
Evidence: `build/iteration-275-bsflush-library.log`.

The earlier uncorrected instrumented library SHA-256 remains
`522bcbcf554300f7d0e3b7e5c45f7e93893345220a1e72fca44100f1a059746a`.
Neither library replaces the existing Release dependency.
The existing Release binaries therefore retain their original pinned OpenH264;
promotion of this correction into that profile is outside this iteration's
explicit no-Release-change scope.

## Integration and remaining acceptance

The first final integration attempt could not reach the Docker daemon.
Restarting the existing restricted fixture
confirmed that its executable build tmpfs was empty after shutdown. Host logs
and bound public input archives survived. Recovery rebuilds into the same
separate test paths and repeats before/after verification; it does not modify
Release artifacts. `build/iteration-275-recovery.log` and
`build/iteration-275-recovery-build.log` retain this recovery.

The final filter uses actual test names: `h264-tests`, `gdi-tests`,
`gfx-message-gate-tests`, `avc-admission-tests`, `avc-tests` and
`gfx-pdu-admission-tests`. All six pass with the corrected instrumented
OpenH264, instrumented Opus and instrumented FreeRDP/WinPR. The GFX message gate
takes 27.64 seconds, within its 60-second bound. The rebuilt OpenH264 and Opus
shared-library hashes equal their first successful builds. ELF inspection
confirms libasan/libubsan NEEDED entries in both codecs and all three
FreeRDP/WinPR libraries, plus a standard PIE worker.
Evidence: `build/iteration-275-instrumented-elf.log`.

The unchanged Windows Release consumer passes native CTest 30/30; a complete
current Windows `pnpm check` passes 669 / 49 platform skips / 718 total, zero
failures. Its initial interrupted log is preserved; the completed repeat is
`build/iteration-275-windows-full-check-repeat.log`. Native evidence is
`build/iteration-275-windows-release-ctest.log`.

Full corrected-library native CTest passes **31/31** in 84.36 seconds. A separate CTest
descriptor preserves exactly the original commands and working directory,
replacing only 31 loader declarations. CTest JSON inventory verifies every
command and its single loader property before execution. The original generated
descriptor is unchanged. Complete native output is scanned for sanitizer
diagnostics. The runtime probe reports
`openh264Runtime=/work/build/openh264-bsflush-sdk-275/lib/libopenh264.so.7`
and the instrumented Opus origin with successful codec roundtrips.

The rebuilt bridge source remains the prior `2885a57` export plus the explicit
iteration 269 overlays, as in iterations 272/274. Parent Node has no preload;
the addon is OFF. The fixture retains UID1000, read-only root, no network, init,
dropped capabilities, no-new-privileges, two CPUs / 4 GiB and bounded executable
build tmpfs. The completed full Linux Node repeat passes **633 / 84 explicit
profile/platform skips / 717**, zero failures, in 197.10 seconds. Its output
contains no ASan/LSan/UBSan diagnostic markers. Actual native lifecycle,
100 sequential workers, parent-death cleanup and local strict-TLS fixtures run
with this loader profile. This is SDK/process integration, not a remote desktop.

The first recovered full Node run is retained as a failure: 572 passed,
61 failed, 84 skips / 717. All 61 failures report TLS fixture initialization.
An independent dummy-certificate command reproduces the missing
`/usr/lib/ssl/openssl.cnf` error in the minimal image. The restored test CLI
wrapper supplies `OPENSSL_CONF=/dev/null` and its own matching public CLI
libraries, only for generating synthetic localhost certificates with explicit
subject/SAN arguments. Native certificate verification and sanitizer options
are unchanged. Focused actual-process/strict-TLS clipboard fixtures then pass
7/7 before the full repeat in `build/iteration-275-node-repeat.log`.

The final receipt is `/work/build/iteration-275-bsflush-receipt.json`.
Worker SHA-256 remains
`cb134e97800610715d47874e217b5e5aabdcb65e08138ab9bfe5b906e3168188`,
identical to iteration 272/274. Bound local runners and SHA-256:

- `iteration-275-bsflush-library.py`: `6ad6e95b339585250421f14b184618f6f977b266566e7dee7de2ff09e673d881`.
- `iteration-275-bsflush-linked.py`: `66e0ccc1c644fdc91c519b4dcaf68f6ffc8547347e7f043e080c791d62645216`.
- `iteration-275-final-regression.py`: `43b0e32a98d921ed1dc5522cf0f7c09384cc81db674d962a7aad86e390da7936`.

This completes the named correction and local instrumented runtime slice.

OpenH264's own upstream GoogleTest suite, exhaustive fuzzing, NASM instrumentation,
other private dependencies/addon and broader platform/CI/resource acceptance
remain separate. No actual RDP, browser desktop or device acceptance is claimed.
The user reports the RDP node unavailable; no connection is attempted pending
their announcement that access has been restored.
