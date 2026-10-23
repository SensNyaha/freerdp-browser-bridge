# Iteration 409 — GCC 8.3 linked source build

Date: 2026-10-22. Requirement: the user's GCC 8.3.0/Astra Linux 1.7.5 port,
with mandatory RED OS 7.3/GCC 11 support retained. Feature branch:
`feature/astra17-gcc83`, following foundation checkpoint `f9758b5` and the
ISO-kernel report [408](ITERATION_408.md). The release target is **0.2.0**;
the existing `v0.1.0` tag and version manifests are unchanged in this block.

## Source and dependency chain

The owned, network-disabled GCC 8.3.0 fixture builds the private dependencies,
pinned FreeRDP/WinPR 3.32.1 and a fresh Release bridge consumer from source.
The compiler image is
`gcc@sha256:1a0bcc0c30351efce55d76fd419dc74aa4d449204e4d66cf86a0ee9bb95a9d61`.
Node is 24.21.0, pnpm 10.11.0, CMake 3.31.6 and Catch2 3.8.1.
No host mounts, lab credentials or downloaded binary dependency cache enter
this fixture. Public source archives and prepared build tools are cached inputs.

The dependency receipt records 22 installed records and all ten required roots:
Zlib 1.3.2, OpenSSL 3.6.5, libusb 1.0.30, JPEG 3.2.0, OpenH264 2.6.0,
Opus 1.6.1, krb5 1.22.2, ICU 78.3, CUPS 2.4.20 and FUSE 3.18.3.
It binds the unchanged recipe, disables binary cache/source downloads and
explicitly records resumption of its own source outputs. The resumed transaction
does not substitute the prepared SDK's third-party library binaries.

Missing build prerequisites are retained as failed attempts. Bison 3.8.2,
NASM 3.01 and Autoconf 2.72 are source-built into this fixture's tool prefixes;
the architecture-independent autoconf-archive macros come from the checked
prepared package recorded in iteration 408. OpenH264 assembly remains enabled.

The libfuse overlay retains the pinned archive and all examples. Its only
upstream-source adjustment asks Meson for `cpp_std=c++20` on `memfs_ll`, instead
of forcing the literal `-std=c++20` spelling unsupported by GCC 8. Meson selects
`-std=c++2a` for GCC 8.3 and `-std=c++20` for the independent GCC 12 control.
Both compile the example and run its help path without mounting a filesystem.
The overlay increments the port revision to 1 and retains `utils=false`.

The SDK rebuild retains commit
`bf217a504e54cc719880c228e82353382cd7d4fa` and the existing hash-checked DSP
ownership correction. Its private-origin probe passes **1/1**, verifies all
three private FreeRDP/WinPR module origins and 22 channel names, and rejects
a foreign prefix. The receipt records resumption of its own SDK build and binds
the source-built dependency receipt.

## Bridge corrections

- The SDK probe links `stdc++fs` for GNU compilers older than 9.
- Linux origin probes compile with `-fPIC` so `dladdr` observes the imported
  function rather than an executable PLT stub. The original strict-origin
  failure is retained; no origin check is relaxed. This addresses the behavior
  documented in [dladdr's PLT caveat](https://man7.org/linux/man-pages/man3/dladdr.3.html).
- AUDIN validates the incoming format before constructing a fully initialized
  PCM value. This avoids GCC 8's optimized empty-optional uninitialized-payload
  warning without suppressing warnings. Expanded tests refuse null/unsupported
  formats and retain the last valid configuration. The changed source also
  compiles with MSVC Release `/W4 /WX /analyze`; that is a narrow compile check.
- The owned Opus tests/tone use a limited `bridge::compat::numbers::pi` fallback.
  It has exactly the standard double's bits, `0x400921fb54442d18`, checked in
  normal and forced-fallback compatibility tests. No production waveform or
  general math-library contract changes.

## Clean linked results

After diagnostic builds found these compiler issues, a **new untouched source
snapshot** builds all targets and passes native CTest **37/37**, zero failures,
15.44 seconds. Focused Node lifecycle/packet/clipboard/process/TLS checks pass
**40/40**, zero skips. These exercise the real native worker and addon with
controlled protocol fixtures; they are separate from an actual RDP desktop.

The clean receipt records GNU 8.3.0, Release/Ninja, 363 native source files /
2,021,386 bytes, `sourceUnchanged=true`, no prebuilt consumer output, and no
FreeRDP dependency in the IPC-only Node addon. The bridge warnings remain errors
and existing test deadlines remain unchanged.

| Bound input/output | SHA-256 |
| --- | --- |
| Public source export, 1,375 files / 9,543,680 tar bytes | `850f27196d0d43489c49c8b92de901ded42ba8775a151726115b8707d848b9be` |
| Dependency receipt | `95df594b324af945f5453a5984217d9fab4483e7fab2c23b2f03364147e00af6` |
| SDK receipt | `6d008cd0d7b33bdcdc8f943a44b27c67bc0d48e31cc57b67b7439a274d8ee747` |
| Clean native source | `29297ea4fb985ba18e59ad553c91c13b3c012f47bda1776978a1941dd9aba138` |
| Clean consumer receipt | `5b020d7bae52b5a3de4410c3fbe50b00c7287de8eaa024031bf55b7d5054511b` |
| Worker | `9ecbad8f155f72a4539c9ea0a8f503a0e06b8c2ed2ac910de6cd66d41385f64f` |
| IPC addon | `6fedaf4e3af30ae9b5580b7aec7fb7fbb86bbeb8071568ed69ca49b0583290d1` |

The earlier full Linux foundation `pnpm check` passes **805 / 159 skips /
964 total**, after retaining and correcting missing CMake on PATH and absent
addon sidecar metadata in the local fixture. Its focused repeat passes 11 with
one foundation skip. A subsequent full `pnpm check` bound to the final clean
linked worker/addon passes **877 / 87 skips / 964 total**, zero failures,
185.44 seconds for the test suite. Version consistency, TypeScript build,
lint and formatting checks also pass. Actual browser/remote-desktop profiles
remain among the separate skipped acceptance scopes.

Local retained logs/receipts are under the ignored root `build/` directory:
`iteration-409-gcc83-dependencies6.log`, `iteration-409-gcc83-freerdp3.log`,
`iteration-409-gcc83-linked-clean.log`, `iteration-409-gcc83-linked-receipt.json`,
`iteration-409-gcc83-linked-node-check.log`, `iteration-409-gcc83-node-check2.log`,
`iteration-409-libfuse-gcc12-control.log`
and `iteration-409-audin-msvc.log`. Earlier failing logs remain available.
The C++ sources, overlay and this report are tracked in the feature worktree's
own Git index, sharing the root repository's object database. Its location
inside ignored `build/` does not make its branch commits untracked.

## Remaining acceptance

Linked runtime closure under the Astra ISO's libraries/kernel,
installed-Astra/security-profile acceptance, actual RED OS
linked product checks, fresh Windows linked regression and actual RDP desktop
regression remain separate gates. Foundation/runtime results from iterations
407–408 remain valid within their recorded scopes. No platform/Stage 0 checkbox,
shared-branch merge or 0.2.0 release is accepted by this report alone.
