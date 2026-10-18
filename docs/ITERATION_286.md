# Iteration 286 — libusb descriptor cleanup ownership and bounded fuzzing

2026-10-18. Continues Stage 0 / SPECIFICATION §3 and SECURITY §1–2 after the
bounded baseline in `c7e1302`. A separate Clang 18 ASan/UBSan/libFuzzer profile
finds an allocation leak in pinned libusb 1.0.30. A deterministic GCC 12
regression reproduces it. The correction below is deliberately confined to a
private **test build copy**. The original source, existing libusb/eudev SDK,
Release port, versions and application binaries are unchanged. The Release
library therefore still has this known cleanup gap; production adoption and
its full shared-backend validation remain open.

## Finding and exact correction

The first BOS smoke completes 100,000 runs. The descriptor smoke stops on
LSan's **40-byte direct leak**, allocated by `parse_interface()`'s `realloc`,
called from `parse_configuration()`. In the unchanged source these are lines
184 and 439. `parse_interface()` allocates an alternate-setting array before
checking the following descriptor type. A mismatch can return zero while still
owning that allocation. The caller reduces `bNumInterfaces` to the previous
slot count; its later cleanup consequently never visits the current slot.
This is not a missing cleanup in the harness: the normal configuration cleanup
also uses that reduced count.

The tracked [test-only patch](../native/sanitizers/libusb/interface-ownership.patch)
calls the existing `clear_interface(usb_interface + i)` before reducing the
count on this zero-return path. That helper frees the alternate-setting array
even when `num_altsetting == 0`, resets ownership and tolerates an empty slot.
The existing nonzero/error paths remain unchanged. This is a local candidate
correction, not a claimed upstream fix or a complete parser audit.

The CMake fixture first checks all seven original source/header hashes, copies
only those files into its own build directory and applies the exact patch with
zero fuzz. Original source files are never patched. Audits verify that only
`libusb/descriptor.c` differs in each GCC/Clang mirror, and the bytes equal the
single intended replacement. A second configure/build reapplies the same
correction from the original and still passes the focused regression.

| Item | SHA-256 |
| --- | --- |
| Original descriptor.c | `4e80077f28a033ba07befceac0347a64ea0e23c34c93b96cfaf8b188d69e401d` |
| Corrected build-copy descriptor.c | `363fac348e7d2024d7de75f179f1516ad1279991a4adbd5228a1ec19170b5d2b` |
| Tracked correction patch | `4c66e0a2b683a2c8b5eb3caca0b9cf72f59e4566652511a1825a37fbb6c5f419` |
| Retained diagnostic input | `e6ffa9b874715aaf58dcb8ebcacc750fb2b092a1aad87fbbae9e1e726eaa42a8` |

## Regression and smoke results

- A new `usb-interface-ownership` case feeds one fixed configuration/interface
  boundary to the unchanged descriptor harness. With the original descriptor
  source GCC 12/LSan exits **1**, reporting exactly the 40-byte leak. With the
  corrected build copy it exits **0**. Leak detection is not disabled.
- GCC 12.4 focused ownership CTest passes **1/1**; full standalone CTest passes
  **3/3** in 0.09 seconds. Three compile commands carry ASan/UBSan and
  nonrecovering UB checks. The existing 105 BOS checks and 150-input corpus
  regression continue to pass.
- Clang 18 standalone CTest passes **3/3** in 0.05 seconds. Its five compile
  commands carry ASan/UBSan; the descriptor object used by libFuzzer additionally
  has coverage instrumentation. The two fuzzer executables are opt-in only.
- Corrected BOS and descriptor smoke each complete **100,000 runs**, seed 1,
  with no ASan/UBSan/LSan error and no new failure artifact. Finite limits are
  20 seconds per target, 3 seconds per input, 1,024 MiB RSS and 8,192 input
  bytes. Final reported RSS is 68/110 MiB. These are short local smokes, not
  exhaustive size/path/format coverage or a long fuzz campaign.
- The original saved leak input also executes once through the corrected
  descriptor fuzzer without a leak. This replay is recorded separately from
  the two fuzz campaigns. Source hashes remain unchanged.

The fixture still compiles no real USB backend and calls no context initializer
or device enumeration. It uses only synthetic descriptors and copies of the
four local upstream seeds. The same restricted no-network/non-root/read-only
container and resource bounds from iteration 285 apply. No RDP or device access
is used. The absent Clang external symbolizer produces retained warnings;
`addr2line` maps the original stack, and the independent GCC report has file/
line details. There are no sanitizer suppressions or preload/runtime-option
changes.

Full bridge CTest **31/31** and `pnpm check` **633 passed / 84 skips / 717**
from iteration 285 are the original unchanged runtime control for this block.
They do not load the parser-copy correction. The completion review below adds
fresh local checks without repeating the previous fuzz campaigns.

## Reproduction and retained evidence

GNU `patch`, CMake/Ninja, Clang 18 and its sanitizer/libFuzzer runtimes are
required in addition to the pinned source. Default GCC configuration continues
to build the regression without libFuzzer. For the additional smoke targets:

```sh
cmake -S native/sanitizers/libusb -B build/usb-clang -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_COMPILER=clang-18 \
  -DCMAKE_CXX_COMPILER=clang++-18 -DBRIDGE_LIBUSB_FUZZERS=ON \
  -DBRIDGE_LIBUSB_SOURCE=/path/to/unmodified/libusb-1.0.30
cmake --build build/usb-clang --parallel 2
ctest --test-dir build/usb-clang -V
# Use separate writable copies of the pinned bos/descriptor_parsers corpus.
build/usb-clang/usb-bos-fuzz /path/to/bos-copy -seed=1 -runs=100000 \
  -max_total_time=20 -max_len=8192 -rss_limit_mb=1024 -timeout=3
build/usb-clang/usb-descriptor-fuzz /path/to/descriptor-copy -seed=1 \
  -runs=100000 -max_total_time=20 -max_len=8192 -rss_limit_mb=1024 -timeout=3
```

Host `build/` retains the initial `iteration-286-run.log`, GCC failing-before
`iteration-286-before.log`, passing `iteration-286-after.log`, source/reconfigure/
replay audit `iteration-286-audit.log`, scalar receipts and diagnostic input.
Original log SHA-256:
`4ea7eaade8a3aeb72edd645624e9668a14c5c9b9a88228e5df669166f3278fb3`.
GCC failing-before log SHA-256:
`9c216c4ea4843b10c9e977e21cfd237e326d91b540a2e40bb4ad5740676abb4b`.
Passing build/fuzz runner SHA-256:
`dfe098cb2ecb977adcc6c5117da5924b6920e40b285c6af1f21542dec9aee83c`.
Audit runner SHA-256:
`4305363d99b72a9051177dfd83b406a83be89be288b3a689e1a5e71cd5c4a0e3`.
Earlier diagnostics, including iteration 275, remain preserved.

## Completion review — 2026-10-18

The uncommitted implementation was reviewed against Stage 0, SPECIFICATION §3,
CODEX_INSTRUCTIONS and ADR-009/010. All five retained source/runner/diagnostic
hashes above match. A fresh GCC 12 and Clang 18 Debug build from the current
working tree passes standalone CTest **3/3 each**, with fuzz targets OFF and
three instrumented compile commands each. Both prepared descriptor hashes
match the correction above; the original source hash stays unchanged.

Full existing linked bridge CTest additionally passes **31/31** in 63.68
seconds. Fresh Windows `pnpm check`, using project-local Node **24.21.0** and
pnpm **10.11.0**, passes TypeScript build, ESLint, Prettier and **628 passed /
90 platform/profile skips / 718 total / zero failures** (354.23 seconds for
Node tests). This default local worker profile is separate from the prior
Linux linked profile; skips do not establish RDP/device acceptance.
These Linux checks use the existing local containers with network
disabled, UID1000 and read-only root. No new security investigation, fuzzing,
external service or RDP/device access is performed. Docker's initial refusal
to copy into the read-only root is retained; test files are instead delivered
through stdin to the existing writable build tmpfs, preserving the restrictions.

Review evidence: host `build/iteration-286-review-native.log`,
`iteration-286-review-linked.log` and `iteration-286-review-pnpm.log`.
Staged diff review identified required unified-diff context spaces before the
upstream tab indentation. A file-specific `.gitattributes` rule accounts for
that patch syntax; ordinary source whitespace checks remain enabled.
Release configuration, pinned versions and production binaries are unchanged.

Stage 0 remains IN PROGRESS. Production adoption of the cleanup correction,
full shared libusb/eudev/backend instrumentation, remaining descriptor APIs,
allocator faults, long fuzzing, other dependencies/addon/platform/CI and actual
USB/RDP/resource acceptance remain open. Stage 8 capability status is unchanged.
