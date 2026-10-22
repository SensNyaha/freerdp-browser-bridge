# Changelog

Product release versions follow [the version policy](docs/VERSIONING.md).

## Unreleased

- Develop NestJS module targeting 0.2.2 on its separate feature branch: DI
  configuration, shared-port Express/FastifyAdapter routing and existing native
  session/media core. Windows/Linux external npm consumers, strict declarations,
  HTTPS/WSS, lifecycle/admission and real installed-package Astra/RED OS desktop
  profiles pass for both adapters. Aligned release/publication remains separate;
  [feature acceptance](docs/ITERATION_427.md).

- Add explanatory root README files to every publishable JS package and both
  native runtime templates. Check discovered packages during `pnpm check` and
  actual tarballs during native packaging/external Fastify consumer acceptance.
  The immutable 0.2.1 artifacts predate this requirement; README changes ship
  in a subsequent release without changing the reserved adapter versions.

## 0.2.1 — 2026-10-22

Accepted Fastify distribution, immutable `v0.2.1`. Final full checks: Windows
915 passed / 61 skipped, Linux 892 / 87 skipped; clean linked native CTest
MSVC 36/36, GCC 8.3 37/37. Exact Windows npm/Linux pnpm consumers and current
Astra/RED OS installed-package desktop profiles pass.
[Final acceptance and registry publication status](docs/ITERATION_424.md).

All seven exact accepted archives are now published to npm as 0.2.1. Public
integrity checks and fresh registry-only Windows/Linux consumers pass, including
strict declarations, host HTTP/WS coexistence and actual native TLS rejection.
[Publication evidence and package links](docs/ITERATION_426.md).

- Fastify 0.2.1 embedding with encapsulated prefixed HTTP/WS,
  host-owned upgrade dispatch, bounded optional session diagnostics and packaged
  reference browser assets. External npm/pnpm consumers and actual Astra/RED OS H.264/JPEG,
  resize/restoration and reattachment pass with installed native npm packages.
  [Implementation/evidence](docs/ITERATION_419.md), [usage](docs/FASTIFY_USAGE.md).
- Matching native runtime packages include ready worker/IPC components,
  private FreeRDP dependencies, notices and pinned LGPL corresponding sources
  with their exact build recipes/patches. Installation requires no compiler
  or system FreeRDP. Windows x64 and Linux x64/glibc are the supported package
  profiles; this does not imply arbitrary OS/CPU support or new device support.
  [Runtime installation](docs/NATIVE_NPM_RUNTIME.md).
- MIT license for project-owned code, as selected by the user. Third-party
  dependency notices retain their own terms.

## 0.2.0 — 2026-10-22

Stable `v0.2.0`. Final checks: Windows 905 passed / 61 skipped; Linux 882 /
87 skipped; native CTest MSVC 36/36 and GCC 8.3 37/37. Full V1 and installer
acceptance remain open. Fastify same-port npm integration targets **0.2.1**
on its own feature branch under the explicit [0.2.x delivery policy](docs/VERSIONING.md).

- Product/native versions and package/runtime/SBOM archive selectors agree on
  the release version; current archive selection preserves older releases.
  [Release preparation and artifact evidence](docs/ITERATION_418.md).
- GCC 8.3.0 source support for the required Astra Linux 1.7.5 target, retaining
  C++20 mode and bounded compatibility facilities in `bridge::compat`.
  Mandatory RED OS 7.3/GCC 11 and MSVC linked checks pass. Private CUPS,
  numactl and libfuse build corrections preserve the pinned dependency versions.
- Actual Astra and RED OS public Edge H.264/JPEG desktop, resize/restoration,
  viewer reattachment and cleanup. A bounded legacy XRDP format proposal is
  validated before pinned RDPSND ignores it; microphone policy remains gated.
  [Current evidence and retained failures](docs/ITERATION_417.md).
- Exact GCC 8.3 container foundation CI recipe, locally verified with CTest
  20/20; hosted execution remains separate. Strict installed Linux runtime
  closure and relocation pass. [Build/package evidence](docs/ITERATION_411.md),
  [CI scope](docs/ITERATION_413.md).

- Named owned XRDP 0.10.1 / prepared Tk / headed Edge Unicode Clipboard API
  roundtrip acceptance, including emoji/multiline text, repeated Copy and new
  RDP connections, permission refusal, revoke and joined cleanup. Adds an
  independent fixed Unicode-capable lab profile and a fixture Copy ownership
  notification; production code, native artifacts and dependency pins are
  unchanged. Full check: 900 passed / 61 skipped. [Evidence](docs/ITERATION_404.md).
  Old XRDP 0.9.x surrogate conversion and wider Stage 7 gates remain open.

## 0.1.0 — 2026-10-21

Stable practical MVP for the [named accepted profiles](docs/MVP_ACCEPTANCE.md).
All product manifests already declare 0.1.0; this release formalizes the stable
MVP boundary and adds a version consistency gate.

- Public Node API with one native FreeRDP worker per session; Windows and XRDP
  desktop, H.264/JPEG, cursor, resize and viewer reattachment.
- Actual Windows Unicode Clipboard API ↔ CLIPRDR ↔ Notepad in both directions,
  explicit permission/refusal/revoke and cleanup; keyboard/mouse acceptance.
- User-accepted Windows Opus/200 ms listening, including the joint 30-minute
  H.264/input/Clipboard observation. Measured discontinuities remain visible.
- Fresh-controller inherited-button recovery and bounded XRDP zero-trailer
  CLIPRDR normalization, with strict certificate verification and pinned inputs.
- Active owned-XRDP 30-minute observation, named CPU/RSS failure/cleanup cases
  and short two-account coexistence. Windows/Linux linked regression passes.

Evidence: [joint Windows](docs/ITERATION_403.md),
[active XRDP/current Release](docs/ITERATION_401.md),
[Windows/Linux regression](docs/ITERATION_402.md).
Run: [MVP runbook](docs/MVP_RUNBOOK.md).

Known limits include nonzero audio epoch/underflow counters, an earlier
unclassified Get failure, unaccepted repeatable XRDP Clipboard ownership and
the deferred full V1 device/drive/advanced-connection/platform matrix. These
remain recorded; stable MVP does not mean all V1 requirements are complete.
