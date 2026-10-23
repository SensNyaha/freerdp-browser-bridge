# Iteration 276 — OpenH264 upstream sanitizer tests and fixture initialization

2026-10-18. Continues Stage 0 / SPECIFICATION §2.3 and §3 verification after
[the corrected OpenH264 runtime](ITERATION_275.md). The Release recipe, installed
SDKs, shared libraries and application code are unchanged. No RDP access is used.

## Inputs and independent upstream build

The prepared OpenH264 2.6.0 input retains the exact iteration 275 `BsFlush`
build-copy correction. The original prepared source and previous build outputs
are preserved. Its `subprojects/gtest.wrap` pins GoogleTest 1.8.0; the public
GoogleTest release ZIP is checked against that exact SHA-256:
`f3ed3b58511efd272eb074a3a6d6fb79d7c2e6a0e374323d1e6bcbcc1ef141bf`.
Source ZIP admission is bounded to 16 MiB, 3,000 entries and 32 MiB expanded.

GoogleTest's two C++ units are built with GCC 12.4, C++11 as supported by this
dependency, `-O1 -g1`, ASan/UBSan, frame pointers and
`-fno-sanitize-recover=undefined`. GoogleMock and GoogleTest's own tests are OFF.
An isolated static install and local pkg-config descriptors supply both
`gtest` and `gtest_main` 1.8.0. The wrapdb Meson adapter is not needed; no fallback
download occurs in the network-disabled fixture.

A separate OpenH264 Meson 1.9.0 output enables the five original upstream
categories: common, encoder, decoder, processing and API. All 145 C/C++ compile
commands carry ASan/UBSan and nonrecovering UB checks. NASM remains outside
compiler sanitizer instrumentation. The build and tests retain UID1000,
read-only root, no network, init, dropped capabilities, no-new-privileges,
two CPUs / 4 GiB and bounded executable build tmpfs. Meson's normal fail-fast
ASan/UBSan test settings are visible in the logs; no suppression is introduced.

## Original outcomes and retained diagnostic

| Original upstream category | Observed result |
| --- | --- |
| common | 17/17 tests pass |
| decoder | 50/50 tests pass |
| processing | 10/10 tests pass |
| encoder | UBSan abort in `EncoderInterfaceTest.EncoderOptionSetTest` |
| API | Timeout at 300.11 seconds; no full pass |

The encoder starts 181 tests, then fails at
`codec/encoder/core/src/encoder_ext.cpp:3918:48`:

```text
runtime error: load of value 190, which is not a valid value for type 'bool'
```

The library reads `pSrcPic->bPsnrY`. The caller's upstream fixture allocates
`pSrcPic = new SSourcePicture;` without initializing the structure; its frame
preparation does not assign the PSNR flags. This is a test-caller initialization
defect. The bridge's `native/media/openh264.cpp` already uses
`SSourcePicture picture{};` before assigning frame fields. No application
correction is needed for this finding.

The original API category starts 194 tests. Its last active test at timeout is
`EncodeDecodeTestAPI.ENCODER_OPTION_IDR_INTERVAL`. Source inspection shows finite
randomized dimensions up to 4096×2304 and 2..6 interval-change rounds; the timeout
alone does not establish a deadlock or a pass. Its original 300-second deadline
and all test cases/iterations are preserved.

Original host logs `build/iteration-276-{common,encoder,decoder,processing,api}.txt`
are exported independently. Encoder diagnostic SHA-256:
`fc3d13dd608c61fc9789d642f5e9fc61964cb3fdd7cd498ee6ebf32d788e7258`.
API timeout log SHA-256:
`d6e2de008c91c1d75f687500102a611a9503dc72567618e31834ad756533a38b`.
Build/driver output: `build/iteration-276-upstream.log`.

## Test-only correction and regression

`native/sanitizers/openh264-test-picture-init.patch` changes only the upstream
fixture allocation to `new SSourcePicture()`. It value-initializes all fields;
no assertion, scenario, iteration or codec source is changed. The patch applies
with `patch --fuzz=0 -p1` to a new source copy, after exact original-file SHA-256
admission. A comparison of every regular source file verifies that this fixture
is the sole difference from the iteration 275 prepared source.

- Original fixture SHA-256: `c4d9d082907ec2cd7cb9d91d81d7ca75e2e760be94e66c4d47f275c421503152`.
- Corrected fixture SHA-256: `2cd93f4571cb62ed79d72f8d856946eb7f47b74770d41c6c7fb2d83bd29c3d6f`.
- Patch SHA-256: `53f4b0d8c34d45aedeb158e89e1306fe3327098f7712f64bb475612e03f4bee4`.

An independent targeted encoder rebuild uses the same sanitizer settings and
GoogleTest install. `EncoderInterfaceTest.EncoderOptionSetTest` now passes in
1.44 seconds without a sanitizer diagnostic. The first complete encoder repeat
reaches the original Meson 30-second bound at 30.02 seconds; it is retained as
another timeout, not a pass. A bounded 300-second full encoder repeat preserves
all 181 tests, their order and original iterations. It passes 181/181 in
24.01 seconds with no ASan/LSan/UBSan diagnostics. This repeat takes less than
the original bound; the cause of the first run's timing difference is not
established. No single five-category pass is claimed.
Evidence: `build/iteration-276-fixture.log`,
`build/iteration-276-encoder-fixed.txt`, `build/iteration-276-encoder-repeat.log`.
The complete successful encoder output is preserved in
`build/iteration-276-encoder-repeat.txt`, SHA-256
`cf751d4f88fdefb4fcbc167bac0e8e2b933a5163db08c69fe70883d408886081`.

Local runners:

- `iteration-276-upstream.py`: `b82958f4c117cb3ed2e324e68ff0231083ae393026bbdc8adfd792348ebf8cb3`.
- `iteration-276-fixture.py`: `d434c6005e4ab07f4b57c48218c19f4b054929045ae4557729a7d56991de61c9`.

The fixture correction does not establish a five-category upstream pass.
The complete API category, NASM coverage, broader dependency/addon/platform/CI
and actual RDP/device/resource acceptance remain open.
