# Iteration 264 — GCC 12 standard PIE sanitizers and eleven Clang fuzz targets

2026-10-16. Continues the user's GCC 12 baseline and Stage 0 sanitizer/fuzz
verification after `2885a57`. A new complete tracked-source archive of that
commit has SHA-256
`aabca591dd1c0705658dc778f4d6af0ac3a4f4a2f3329d7368fe629b0a14cc09`.
It is extracted into a new source directory in the restricted Ubuntu verifier;
the original image's older source directory is not used by these builds.

Official Ubuntu GCC/g++ 12.4.0-2ubuntu1~24.04.1 and libstdc++-12-dev use the
image's libasan8/libubsan1 14.2.0-4ubuntu2~24.04.1. The first apt attempt failed
on mirror connection timeouts/incomplete index and could not locate g++-12.
A bounded retry with strict update error mode and HTTP/retry deadlines installs
the actual package successfully. No TLS/signature checks are disabled.

GCC 12.4 default PIE ASan/UBSan empty programs pass **100/100** launches.
The standard sanitizers preset, with explicit g++-12 and offline prepared
Catch2, compiles and passes **CTest 16/16**, including the new compiler policy.
The actual library probe succeeds. Readelf confirms PIE ipc-tests/worker;
worker CLI runs with honest FreeRDP-absent foundation capabilities. No non-PIE,
ASLR/sysctl, seccomp or sanitizer-options workaround is used.

Clang 18.1.3 then compiles all eleven libFuzzer targets from the same source
with ASan/UBSan and actual PIE identity. Each seeded smoke runs with a 20-second
budget, five-second input timeout, 512 MiB RSS limit and bounded input length
(32 KiB IPC/seqpacket; 16 KiB others). All exit zero:

| Target | Executions | Peak RSS MiB |
| --- | ---: | ---: |
| IPC | 320,755 | 274 |
| AUDIN ingress | 367,894 | 220 |
| DVC declared bounds | 917,665 | 144 |
| DVC outer SVC | 548,389 | 261 |
| AVC admission | 759,933 | 263 |
| GFX PDU admission | 2,740,984 | 276 |
| Audio SVC ingress | 249,486 | 350 |
| Seqpacket records | 1,288,906 | 263 |
| Clipboard text | 13,156 | 46 |
| Clipboard ingress | 870,029 | 270 |
| Clipboard wire | 212,871 | 263 |

The local minimal image lacks the external LLVM symbolizer: libFuzzer emits
symbolizer warnings while reporting some new-function coverage addresses.
These runs have no sanitizer error/nonzero exit, but symbolized diagnostics
are a retained tooling gap. This is bounded smoke, not exhaustive/upstream fuzz
or a total connected-session resource acceptance.

Seed scripts use the public Node 24.21.0 binary from the pinned SDK image
(SHA-256 `7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c`)
and the verified iteration 260 compiled protocol export solely for seed
generation (tar SHA-256
`6b92a7ff6a9e8d3b0c2f0be9b54cae5eafea756f1c4e83ed20d93caaae3c43aa`).
Native parser sources are compiled anew; no FreeRDP/native SDK is loaded into
Node or selected by this foundation. Build/test execution retains UID1000,
read-only root, network none, init, dropped capabilities, no-new-privileges,
bounded executable build tmpfs, noexec /tmp, two CPUs / 4 GiB.

Prepared CI now explicitly selects g++-12 for sanitizers and clang++-18 for
fuzzing, with the same per-target input/time/RSS budgets. The Ubuntu builder
recipe includes GCC 12 and bounded strict apt acquisition. Formatting passes;
actual CI execution remains open. Node/linked-native regression of the compiler
policy is recorded in iteration 263; this block changes development recipes only.

Evidence: `build/iteration-264-ubuntu-gcc12-builder.log` (failed acquisition),
`build/iteration-264-ubuntu-gcc12-builder-repeat.log`,
`build/iteration-264-source-extract.log`,
`build/iteration-264-gcc12-standard-pie.log`,
`build/iteration-264-standard-pie-fuzz.log`,
`build/iteration-264-fuzz-summary.json`,
`build/iteration-264-fuzz-tool-inputs.log`.
Builder identity: `383bb1384d0778b8496b7e092ff26732376de98a876c17372c599287c8e4c458`.

GCC 12 is now verified both for the linked Release chain (12.2) and the named
Ubuntu standard PIE foundation (12.4). Historical Bookworm/GCC 12.2 PIE failures
remain preserved; no causal diagnosis or waiver is inferred. Addon/instrumented
FreeRDP/codec, broader toolchain/distro/CI and RDP/device/resource gates stay open.
