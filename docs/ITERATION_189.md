# Iteration 189 — private Linux libudev and complete ELF closure

2026-10-14. Implements ADR-010 and the Stage 0 dependency-closure follow-up after
`a825c18`. The native package's current ELF imports are now private except for
the explicit OS CRT/loader prerequisites. This does not establish actual USB or
other device acceptance, a production service image, or all-distro compatibility.

## Dependency ownership

The Linux libusb udev feature remains enabled. Its overlay adds a pinned
**eudev 3.2.14** client-library dependency from commit
`9e7c4e744b9e7813af9acee64b5e8549ea1fbaa3`, with recorded archive SHA-512.
The library builds dynamically in the private prefix. Its daemon, utilities,
rule generator and hardware database are not installed; the existing host device
service remains responsible for those. Host **gperf 3.3** comes from the pinned
registry and does not ship as runtime code. Both source hashes pass. The first
GNU mirror times out; the registry-listed primary HTTPS endpoint succeeds.
[Public source release](https://github.com/eudev-project/eudev/releases/tag/v3.2.14).

The libusb overlay otherwise retains the registry 1.0.30 implementation, including
its Windows build. CUPS/FUSE/codec settings are unchanged. Linux eudev commit /
port hash, libusb port hash and dependency receipts ship with the package. Both
overlays and copyright/license notices are installed; the eudev notice includes
the LGPL 2.1 text in addition to upstream's COPYING. No system libudev-dev build
prerequisite remains in bundled CI.

## Enforced release checks

Before CPack, the Linux build helper checks both executables and every unique
shipped shared object. Bounded readelf/ldd processes have a five-second deadline,
64 KiB output bound and fixed system environment without dependency search paths.
All non-CRT imports must resolve canonically inside the staging directory.
RPATH/RUNPATH accepts only origin-relative directories that stay inside that
directory; absolute paths, empty cwd entries and escaping links are refused.
The current stage passes **33 ELF files / 268 dependency edges**.

Four portable Node cases cover mapped paths with spaces, direct loader/virtual
DSO records, malformed/missing/duplicate/excessive claims, sibling-prefix escape,
Linux symlink escape and relative search paths. ICU's data-only DSO legitimately
appears as `statically linked` in ldd: it is accepted only when its bounded readelf
dynamic/SONAME report confirms no NEEDED imports. Static or incomplete reports
alone remain rejected. The initial gate refusal and this narrow correction are
retained in the logs.

The expanded runtime probe links only the private Linux libudev include/library,
constructs/frees its public context and reports the actual loaded module. It
does not enumerate or open devices. Relocation verifies that path and all shipped
ELF imports, plus codec roundtrips, static FreeRDP addins, metadata/licenses and
worker HELLO/heartbeat/shutdown/cleanup.

The stronger canonical check exposed a limitation of the previous relocation
fixture: Node cp's default symlink rewriting pointed copied links at the original
stage. Earlier tests checked reported paths, not those canonical link targets.
The fixture now uses `verbatimSymlinks: true`, matching the archive's relative
links. The installed stage passed the gate before this fixture correction; the
corrected relocated copy now also passes **1/1**. Historical reports remain
preserved; their earlier 1/1 does not substitute for this stronger ownership check.

## Verification and remaining gates

- Linux Release linked CTest **20/20** and full `pnpm check` **452 passed /
  76 skipped / zero failures**, 528 cases. Platform/browser/device skips remain
  explicit. Complete ELF gate and relocation **1/1** pass.
- Windows rebuilt libusb 1.0.30, foundation CTest **10/10**, linked CTest **22/22**,
  complete Node check **528/528** and relocation **1/1** pass.
- The first Windows dependency rebuild failed with MSBuild FileTracker
  E_ACCESSDENIED inside the sandbox. The normal authorized unsandboxed build
  succeeds; no compiler/antivirus checks were disabled.

Linux TGZ remains approximately 24 MiB / 64 MiB installed disk usage, excluding
Node.js. Linux shared-library closure and codec/lifecycle relocation for this
profile are complete; clean independent runtime, fresh-checkout/CI, installers,
Linux primary IPC/priority output, dynamic provider/device behavior, actual Linux
RDP and broader resource/platform/soak gates remain open.

Local evidence: `build/iteration-189-*`. Source/metadata tests and the gate are
versioned in the repository; the local no-network SDK container is a build cache.
