# Iteration 279 — bounded libspng sanitizer regression

2026-10-18. Continues Stage 0 / SPECIFICATION §2.3 and §3 with local PNG
correctness and sanitizer checks. The initial tracked working tree was clean.
Only a standalone test project and documentation are added. No Release recipe,
dependency version, root build, production parser or worker is changed. No
network, RDP or device access is used.

## Pinned build and ownership

The cached `randy408-libspng-v0.7.4.tar.gz` matches the existing port SHA-512:

```text
cd729653599ed97f80d19f3048c1b3bc2ac16f922b3465804b1913bc45d9fc8b28b56bc2121fda36e9d3dcdd12612cced5383313b722a5342b613f8781879f1a
```

Every extracted regular file is compared with the archive before applying only
the two existing vcpkg config/pkg-config patches with zero fuzz. The library
source `spng/spng.c` remains unchanged, SHA-256
`59243c1ca05956f124c7debef763b707378b52e4dbfeaf17e6192917dd8c8dc2`.

A separate GCC 12.4 Debug CMake output selects shared ON, static/examples OFF,
optimizations at their existing default, and the instrumented private ZLIB 1.3.2
from iteration 277. The actual library compile command has ASan/UBSan,
nonrecovering UB checks and frame pointers. ELF NEEDED includes libasan,
libubsan and libz. Installed libspng SHA-256:
`2e542ba53b391edc1e6bd1351923deb5c5b5d8c35d5d5903d13f24c7c18c1ad4`.

The standalone [test project](../native/sanitizers/libspng/CMakeLists.txt) also
instruments its C++ driver and unchanged upstream C read harness. A hash guard
pins that harness to
`3ed658e5b3dab357d1e9078d3cdd930fe0e4e4965755bd2ee2b06b5074a4d122`.
An unknown-source negative control fails configuration at this guard. The
dynamic loader's actual resolved list confirms both the new libspng and private
instrumented ZLIB paths.

## PNG cases

Upstream `fuzz_main.c` discards the harness return value. The new driver checks
it instead and owns bounded input files using RAII. It appends the four control
bytes expected by the unchanged `LLVMFuzzerTestOneInput`; raw PNG bytes alone
would lose their final four bytes to these controls.

- All **202** pinned `tests/images` / `tests/crashers` PNG files are replayed in
  RGBA8, native PNG and raw formats, each through whole-buffer, callback stream,
  progressive callback and progressive FILE modes: **2,424 inputs / 3,842 checks**.
  Upstream's ordinary malformed-image refusal is allowed; a successful replay
  is not a claim that every corpus image decoded successfully.
- Eight synthetic RGBA8 encode/decode combinations cover Adam7/noninterlaced
  images and whole/progressive encoding and decoding. Every successful result
  is compared byte for byte with the fixed 32×17 source pattern.
- Each combination also refuses an undersized destination, an image exceeding
  its configured width and a truncated header: **664 roundtrip/boundary checks**.
- Input admission bounds are 2,048 PNG files, 8 MiB per file and 64 MiB total,
  checked before allocation. The unchanged upstream harness retains its
  80,000,000-byte decoded-output and 4/8-million-byte chunk limits. Synthetic
  roundtrips use 64×64 / 1 MiB limits and finite row iteration.
- Focused roundtrip passes, then complete standalone CTest passes **2/2**,
  including a final rebuild/repeat. No ASan/LSan/UBSan diagnostic is observed.

This is bounded seeded replay and exact synthetic pixel regression. The full
libpng-comparison suite, write-fuzzer campaign, additional formats, long fuzzing,
platform/CI and connected integration remain separate acceptance work.

The standalone project is reproducible against the separately installed Debug
libraries (the library build itself must also carry sanitizer flags):

```sh
cmake -S native/sanitizers/libspng -B build/spng-regression -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_COMPILER=gcc-12 -DCMAKE_CXX_COMPILER=g++-12 \
  -DBRIDGE_SPNG_SOURCE=/path/to/pinned/libspng-0.7.4 \
  -DSPNG_DIR=/path/to/spng-debug-sdk/lib/cmake/spng \
  -DZLIB_INCLUDE_DIR=/path/to/zlib-debug-sdk/include \
  -DZLIB_LIBRARY=/path/to/zlib-debug-sdk/lib/libz.so
cmake --build build/spng-regression --parallel 2
ctest --test-dir build/spng-regression -V
```

## Linked regression and evidence

The existing 31 bridge CTest commands are projected into a new loader-only
driver; command identity and working directories are checked. Thirty native
executables receive the new libspng profile, while the ordinary compiler-policy
CMake command keeps its tool loader. Parent Node has no sanitizer preload;
the addon stays OFF.

- Focused JPEG/GDI/graphics-message cases: **3/3 pass** in 17.62 seconds.
- Full linked native CTest: **31/31 pass** in 57.03 seconds.
- Full `pnpm check`: builds, lint, format and **633 passed / 84 profile/platform
  skips / 717 total / zero failures**, 174.51 seconds for Node tests.
- Full linked output has no ASan/LSan/UBSan diagnostic. The worker hash remains
  `cb134e97800610715d47874e217b5e5aabdcb65e08138ab9bfe5b906e3168188`.
  Runtime probes retain the separately instrumented ZLIB/Opus/OpenH264 origins.

Evidence is retained in `build/iteration-279-spng.log`,
`build/iteration-279-audit.log` and `build/iteration-279-linked.log`.
Both `iteration-279-spng-receipt.json` and
`iteration-279-linked-receipt.json` are exported from build tmpfs to host `build/`.
Local build runner `build/iteration-279-spng.py` SHA-256:
`1590ebd915e3909158fbb324b285c3f9bc63a840d783f85c1c8b1ae9d4b435ff`.
Linked runner `build/iteration-279-linked.py` SHA-256:
`65bd721bd37888245cc63c43a5cca0e41190b4031709c0cb01f9aa6ed03fa45a`.

The fixture retains UID1000, read-only root, no network, init, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB and bounded build tmpfs. Prior
OpenH264 UB/timeout and ZLIB diagnostic reports remain retained. Stage 0 remains
IN PROGRESS; this does not accept all dependency/addon/platform or RDP gates.
