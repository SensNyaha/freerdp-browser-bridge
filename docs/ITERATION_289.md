# Iteration 289 — actual compiler provenance in clean-native receipts

2026-10-18. Implements a reproducible-build evidence detail of Stage 0 /
SPECIFICATION §3.4 after `ffa0959`. The clean-native helper previously retained
source hashes and test results without structured evidence of which compiler
or CMake produced them. Console compiler messages were the only record.

## Implementation

Before configuration, the helper creates the CMake `toolchains-v1` File API
query in its new, empty build directory. It reads the newest reply index,
follows that index's toolchain reference and selects the unique CXX compiler.
The additive `buildProfile.v = 1` receipt includes compiler ID/version/path,
CMake version, Ninja generator and the build type checked against the actual
cache. Missing/inconsistent evidence fails the helper before native compilation.
Historical receipts remain unchanged.

The reader admits at most 512 reply-directory entries and 1 MiB per input file,
with bounded selected strings and at most 32 language records. Build-type
matching detects duplicate entries without accumulating a match array.
Only the selected scalar fields enter the receipt. No environment, command-line
fragment or implicit toolchain directory list is copied. The File API contract
was checked against the installed CMake manual and actual replies; no external
documentation/service was accessed.

Existing foundation Debug and linked Release choices, compiler flags, SDK/
dependency inputs, production code and protocols are unchanged. This block
builds only Debug foundation workers and does not modify or rebuild Release.
No sanitizer profile, fuzz campaign, device or RDP target is used.

## Verification

- Four portable unit tests pass: selected GNU/Clang/MSVC fields, Debug/Release
  distinction, incomplete/ambiguous compiler evidence and following the newest
  reply without fallback to stale evidence. They include actual reader file I/O.
- Independent real configure-only probes with CMake **3.28.3** report Clang
  **18.1.3** and GNU **13.3.0**. A final read of the completed GCC build profile
  equals the stored receipt exactly, using byte-identical final helper inputs.
- New Linux **GCC 13.3.0 Debug** native objects pass CTest **16/16** in 6.52
  seconds and framed native lifecycle **15 / one absent-primary skip / 16**.
  Full `pnpm check` passes **578 / 147 platform/profile skips / 725 total /
  zero failures**, including build/lint/format, 97.13 seconds for Node tests.
- New Windows **MSVC 19.44.35228.0 Debug**, CMake **3.31.6-msvc6**, passes CTest
  **15/15** in 5.77 seconds and native lifecycle/path tests **16 / one
  absent-primary skip / 17**, zero failures. The existing Windows wrapper keeps
  its temporary ASCII alias through compilation, CTest and Node verification.
- Full Windows `pnpm check` passes **632 / 90 platform/profile skips / 722
  total / zero failures**, including build/lint/format, 346.82 seconds for Node
  tests. Final focused lint, formatting and unit checks also pass.
- Both native receipts bind the exact same **342 files / 1,895,221 bytes**,
  SHA-256 `4f3f80d64c630f060bef31a041e95008f301db1c1b60e5bf52951813dc545378`,
  prebuiltOutput=false and sourceUnchanged=true. GCC worker SHA-256 is
  `36422fd4ca31d90b19c9d6c44720600daad8d70429308cc445afae0f8f584bdb`.
- `git diff --check` and staged diff checks pass. No dependency pin, Release
  preset/profile, public protocol or native C++ file changes.

## Scope and retained evidence

Linux reuses the existing restricted local container/source export from
iteration 288, with the three changed helper/unit files explicitly overlaid
and hash-compared to the final working tree. The native output is a separate
fresh source-only fixture, not reused Clang objects. The full root source is
therefore **not claimed to be a new pristine Git archive** for this follow-up.
The existing local Node installation and Catch2 source are reused. Windows
also uses prepared local Node/Catch2/MSVC tools with new native objects.

Evidence: host `build/iteration-289-run.log`, `iteration-289-receipt.json`,
`iteration-289-input-hashes.json`, `iteration-289-probe.log`,
`iteration-289-windows-check.log` and `iteration-289-msvc-clean.log`.
The Windows fixture is `build/native-clean-whWrt6/receipt.json`.
Linux runner `build/iteration-289-run.py` SHA-256:
`609021fa74fd2ddfc1a404f241bbd25f5edf891f413c80be0bf6bbeabc9cac83`.
Linux complete log SHA-256:
`03df795d3c67172d773c8aa85593cc9cfd8dbe41804836ae2a79e03ec4c939c8`.

These are local build-toolchain/foundation results. Linked FreeRDP, full fresh
OS/distro/CI, upstream/addon and actual RDP/device/resource acceptance remain
open. The GNU baseline stays 12 and Stage 0 remains IN PROGRESS.
