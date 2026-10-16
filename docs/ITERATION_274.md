# Iteration 274 — pinned Opus sanitizer profile and upstream cases

2026-10-16. Extends Stage 0 / SPECIFICATION §2.6 resource coverage after the
instrumented FreeRDP/WinPR SDK in iteration 272. No production code, dependency
pin, Release binary or package changes. The GCC minimum remains 12.

## Source and builds

The original cached xiph/opus v1.6.1 archive's SHA-512 matches
native/dependencies.json and the exact port recipe:
`b9a504f8576c977df57caee808412ab95e7424e9a64e3dd4045f05616c3ed58706bc3549195b61e25721e299547509d15206d246d96f1a307b82562b703b412c`.
The prepared source contains the same three existing vcpkg port patches,
including explicit pinned package version. Its bounded exported tar SHA-256 is
`fbef3e1041309cde5e394305ad681680d13f44cdde54ee29be87516068b60a90`.
This is a prepared patched source export, not a pristine upstream archive.

Separate shared and static-test builds use GCC/G++ 12.4, Debug `-Og -g1`,
floating-point API, stack protector, AVX2_SUPPORTED OFF and the existing default
codec features. C/C++ flags contain ASan/UBSan, frame pointers and
`-fno-sanitize-recover=undefined`. All 149 shared and 155 static/test compile
commands are checked. Default sanitizer environment options remain unchanged.
Shared libopus has actual libasan/libubsan NEEDED entries and SHA-256
`6978c113eefa31d71539aedbd0167964aa831d2e86d3e06cc97f86dc2713f241`.

## Upstream tests and retained timeout

The pinned CMake project only enables its own tests for a static library, hence
the separate static build. First verbose CTest with a 120-second per-test bound
passes decode (37.68 s), padding (0.06 s), API (21.88 s) and encode (92.91 s).
The extensions case times out at 120.10 s: this initial suite is 4/5, not a pass.

Source inspection shows the unchanged extensions test executes 100,000,000
random iterations, plus deterministic cases. A focused bounded repeat preserves
all iterations and the original seed 429160495, with a 900-second deadline.
It passes in 203.46 seconds, with no ASan/LSan/UBSan diagnostic markers.
All five distinct cases are therefore observed passing across the initial run
and focused repeat; no single-run 5/5 repeat is claimed. The initial timeout is
retained. A process check after timeout confirms no orphan test remains.

## Actual bridge / SDK integration

Existing iteration 272 instrumented bridge and FreeRDP/WinPR binaries are
unchanged. A separate generated CTest descriptor projects exactly the same 31
test commands and original working directory, with the new shared Opus prefix
first in LD_LIBRARY_PATH. The driver checks every command and loader property
against CTest JSON inventory before execution. The original generated descriptor
is unchanged. An initial setup attempt fails this check before any native test:
CTest appends duplicate ENVIRONMENT entries instead of replacing them. The
corrected bounded projection replaces exactly 31 original loader declarations;
each test has one verified loader path and no duplicate.

Verbose bridge CTest passes 31/31, with complete output scanned for sanitizer
diagnostics. The independent runtime probe explicitly reports
`opusRuntime=/work/build/opus-sanitizers-sdk-274/lib/libopus.so.0` and successful
Opus / other codec / libudev roundtrips. This confirms the new library is actually
loaded, rather than the old Release libopus. Full pnpm check passes 633 / 84
profile/platform skips / 717 total, zero failures. Actual worker lifecycle and
local strict-TLS cases run with the new loader profile. Parent Node has no
preload and the addon remains OFF.

Worker SHA-256 remains
`cb134e97800610715d47874e217b5e5aabdcb65e08138ab9bfe5b906e3168188`.
The fixture receipt is `/work/build/iteration-274-receipt.json`. Execution retains
UID1000, read-only root, no network, init, dropped capabilities,
no-new-privileges, two CPUs / 4 GiB and bounded build tmpfs. No lab or physical
capture is used. Bridge source remains the explicit iteration 269 overlay of
the prior archive, as described in iteration 272.

Evidence: `build/iteration-274-opus.log` (original 4/5 + timeout),
`build/iteration-274-extension-repeat.log`, `build/iteration-274-linked.log`
(setup refusal), `build/iteration-274-linked-repeat.log`.
Bounded local runners and SHA-256:

- `iteration-274-opus.py`: `31322f8e2b82711ba80843329a908ca2e93ce0f2499d2425c17f0604ebd3fbeb`.
- `iteration-274-extension-repeat.py`: `485e69a28de43f3ecd2ace82025e8e2a21e950cfd01692f350a353655e7afd30`.
- `iteration-274-linked.py`: `a0bd55bb49668f8d0b6194c4d4004364b67db5e9be1778b49674898f308746dc`.

This accepts the named local instrumented Opus runtime profile and observed
upstream cases. Other private dependencies/addon, complete upstream/platform /
fuzz/CI and actual audio/RDP/device/latency/soak acceptance remain open.
