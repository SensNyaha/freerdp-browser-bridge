# Iteration 285 — device-free libusb descriptor sanitizer regression

2026-10-18. Continues Stage 0 / SPECIFICATION §3 and SECURITY §1–2 with local
native parser checks. The starting tracked tree was clean at `73e8583`.
This adds an independent test project, not a USB backend or device capability.
Release recipes, dependency versions, worker and existing SDKs are unchanged.
No network, RDP, USB enumeration, device node or physical device is used.

## Source and build boundary

The cached libusb 1.0.30 archive matches the existing port SHA-512:

```text
3251c9f41e900efa13caf981483f46886c8434bf4c30f3fd3073921b06be9977cebcf4a18f7bc46db86e33d7f19752296377be9050abfb8d887ffeb377864647
```

The [standalone project](../native/sanitizers/libusb/CMakeLists.txt) compiles
the two unchanged pinned upstream `tests/fuzz` harnesses. The descriptor harness
already includes `descriptor.c` and supplies inert backend/log/control-transfer
stubs. The BOS harness calls the public descriptor helpers from that same object.
Only callback symbols are renamed to link both harnesses into one regression
executable. No platform backend, context initializer or ordinary stress program
is compiled. The minimal test-only POSIX config supplies types/attributes; it
does not pretend to be a configured full libusb library.

Seven source/header SHA-256 guards reject unrecognized input before compilation.
The active descriptor source hash is
`4e80077f28a033ba07befceac0347a64ea0e23c34c93b96cfaf8b188d69e401d`.
Every extracted regular source file remains unchanged after testing. A separate
negative control modifies a copied harness and fails at the expected hash guard.
Missing corpus input is also refused.

GCC/G++ 12.4 Debug builds all three C/C++ commands with ASan/UBSan,
nonrecovering UB checks and frame pointers. Own C++20 code retains
`-Wall -Wextra -Wpedantic -Werror`. The first build diagnosed the upstream C
header's flexible/zero-length arrays under C++ pedantic mode. Its log is
preserved; the corrected build marks the external include directory SYSTEM,
without changing the header or weakening warnings on our driver.

The executable needs libasan/libubsan and does not need a libusb shared module.
Its undefined-symbol audit contains no USB context/enumeration, udev, ioctl,
socket, open or opendir entry point. This is an isolated descriptor translation
unit; it does not instrument or accept the existing shared Linux backend.

## Cases and reproduction

- Focused BOS values pass **105 checks**: USB 2.0 extension little-endian
  attributes, SuperSpeed fields and exact Container ID bytes; all shorter
  declared lengths, a mismatched type, null output ownership and null frees.
- Both upstream harnesses receive **150 deterministic inputs / 317 checks**:
  four exact upstream seeds, every seed prefix, one-byte inversions and fixed
  zero/FF buffers around the 9-byte, 252-byte and 8,192-byte admission boundaries.
  Includes the upstream endpoint-null and IAD-bound regression seeds. The extra
  8,193-byte case exercises the descriptor harness's over-limit refusal.
- Focused CTest passes **1/1**, then full standalone CTest passes **2/2** in
  0.05 seconds. No ASan/LSan/UBSan diagnostic is observed. Upstream parser
  refusal is permitted; harness return success is not a claim that malformed
  descriptors are accepted.
- The driver has a fixed four-file corpus list, checks regular-file/size
  admission before allocation (8 KiB per seed), finite truncation/variation
  loops and RAII-owned outputs. This is seeded replay, not a fuzz campaign.

```sh
cmake -S native/sanitizers/libusb -B build/usb-parsers -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_COMPILER=gcc-12 \
  -DCMAKE_CXX_COMPILER=g++-12 \
  -DBRIDGE_LIBUSB_SOURCE=/path/to/unmodified/libusb-1.0.30
cmake --build build/usb-parsers --parallel 2
ctest --test-dir build/usb-parsers -V
```

## Regression, retained evidence and limits

The unchanged existing bridge sanitizer profile is checked separately; it does
not load this parser-only executable as a new libusb runtime. Ordinary tools
keep their separate loader, parent Node has no preload, and addon remains OFF.
The reused bridge source export/binaries are those documented in iteration 284,
not a new source checkout. Focused native CTest passes **3/3** in 4.72 seconds;
full native CTest passes **31/31** in 94.77 seconds. Full `pnpm check` passes
build/lint/format and **633 passed / 84 profile/platform skips / 717 total /
zero failures**, 238.47 seconds for Node tests. Existing module/worker hashes
match iteration 284; this is a regression control, not new shared libusb coverage.

The UID1000 read-only/no-network container retains init, dropped capabilities,
no-new-privileges and finite CPU/memory/tmpfs bounds. Host `build/` retains
`iteration-285-run.log` (initial compile refusal), `iteration-285-retry.log`,
`iteration-285-audit.log`, `iteration-285-linked.log` and exported receipts.
Final standalone runner SHA-256:
`1cc6b16f08be9f8299d55e75efaedec78e21e5d2847da7e4e3bf19f8922456f4`.
Negative-control runner SHA-256:
`c2484a3dce791f4c5fcacbc835e7cd3867d488c2d08dfa8291e6e2331bae96b2`.
Bridge-control runner SHA-256:
`9cfb4a578b92f5e210b5feb1416dd59c62ff06d83f3c3d926c16c61e9fdff5f4`.
The original iteration 275 UB diagnostic retains SHA-256
`5865bae50d8ec4f28acfcbeef4a8a54dfbfb3938115a645f15c661c05a916926`.

The next independent Clang fuzz attempt already reports a **40-byte descriptor
cleanup leak** beyond this seed set. A separate GCC reproducer confirms it.
That diagnostic is retained for iteration 286; the passing bounded baseline
above must not be interpreted as complete parser acceptance.

Full shared libusb/eudev/backend instrumentation, ordinary upstream device
tests, broader descriptor APIs, this newly observed leak, allocator-fault/long fuzzing, platform/CI and
actual USB/RDP/resource acceptance remain open. No Stage 8 capability is added;
Stage 0 remains IN PROGRESS.
