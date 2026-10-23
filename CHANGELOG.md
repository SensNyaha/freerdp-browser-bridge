# Changelog

Product release versions follow [the version policy](docs/VERSIONING.md).

## 0.2.5 — 2026-10-24

Accepted local standalone web service release: bounded public config/JWT owner
identity and approved RDP targets, private Node runtime, Windows supervisor,
portable ZIP/TGZ and MSI/DEB/RPM service installers. Windows/Ubuntu/Astra/RED OS
0.2.4→0.2.5 upgrade/lifecycle checks, eight actual desktop profiles and all four
exact npm adapter consumers on both platforms pass. Full linked checks:
Windows 1002/63 skips, Linux 977/90, zero failures; fresh native CTest36/37.
Hosted source/sanitizer/fuzz and combined installer verification pass.

Stable npm/GitHub/main installer publication and fresh registry-only consumers
remain separate gates; the unstable candidate is not the stable release.
[Local acceptance](docs/ITERATION_455.md), [service contract](docs/STANDALONE.md).
The original full V1 TODO remains open. Following delivery, cleanup and docs
consolidation, feature development continues in new tested/released branches
under the user’s updated instruction.

## 0.2.4 — 2026-10-23

Accepted local Express release with root middleware and same-port HTTP/HTTPS/WS.
Full checks: Windows 951 pass / 61 skips, Linux 928 / 87, zero failures. Fresh
CTest passes MSVC 36/36 and exact GCC 8.3 37/37. Ten exact README-complete
archives pass bounded audit, SensNyaha repository binding and npm dry-run;
all four external consumers/reinstall matrices and all eight versioned
Astra/RED OS Express desktop profiles pass. All ten exact npm archives and five
GitHub Releases are now public; hosted workflows and four fresh registry-only
consumers pass Windows/Linux. Nine existing names publish via OIDC; Express
uses its separately authorized initial approval and verified trust setup.
The old 0.2.3 approval queue remains stopped.
[Local release acceptance](docs/ITERATION_438.md),
[publication acceptance](docs/ITERATION_441.md).

- Implement Express 5 root middleware on the accepted HTTP core, retaining
  strict raw-body limits, selective upgrades and joined lifecycle. Add public
  type/browser exports, independent consumer checks and real-project guides.
  Feature checks pass Windows 951/61 and Linux 928/87, external/reinstall 11/11
  on both and all eight actual Astra/RED OS desktop profiles. Separate aligned
  release checks also pass; public publication remains separate.
  [Feature evidence](docs/ITERATION_435.md).

## 0.2.3 — 2026-10-23

Accepted node:http/node:https distribution with explicit same-port HTTP/WS
dispatch. Fresh aligned CTest: MSVC 36/36, exact GCC 8.3 37/37. Full checks:
Windows 941 passed / 61 skipped, Linux 918 / 87. Nine exact README-complete
archives pass audits/dry-run, external HTTP/NestJS/Fastify consumers and reinstall;
all eight versioned Astra/RED OS HTTP desktop profiles pass. Registry publication
remains separate. [Release acceptance](docs/ITERATION_433.md).

- Add the node:http/node:https adapter on its own branch:
  explicit same-port request delegation, selective WS ownership, bounded mounts
  and joined host-owned lifecycle. Windows/Linux external consumers and full
  checks, HTTPS/WSS and eight installed-package Astra/RED OS desktop profiles
  pass. Aligned release checks pass; registry publication remains separate;
  [feature evidence](docs/ITERATION_431.md).

## 0.2.2 — 2026-10-22

Accepted NestJS distribution with Express and FastifyAdapter. Fresh aligned
native CTest: MSVC 36/36, exact GCC 8.3 37/37. Full checks: Windows 932 passed /
61 skipped, Linux 909 / 87. Exact Windows/Linux NestJS and Fastify consumers,
uninstall/reinstall and eight versioned Astra/RED OS H.264/JPEG profiles pass.
Eight README-complete archives pass integrity audits and npm dry-run; registry
publication is pending. [Release acceptance](docs/ITERATION_429.md).

Subsequent publication is complete: all eight exact archives are public and
fresh registry-only Windows/Linux NestJS consumers pass strict TypeScript and
15/15 each. [Publication acceptance](docs/ITERATION_437.md).

- Add NestJS module on its separate feature branch: DI
  configuration, shared-port Express/FastifyAdapter routing and existing native
  session/media core. Windows/Linux external npm consumers, strict declarations,
  HTTPS/WSS, lifecycle/admission and real installed-package Astra/RED OS desktop
  profiles pass for both adapters. Aligned release checks pass; publication remains separate;
  [feature acceptance](docs/ITERATION_427.md).

- Add explanatory root README files to every publishable JS package and both
  native runtime templates. Check discovered packages during `pnpm check` and
  actual tarballs during native packaging/external Fastify consumer acceptance.
  The immutable 0.2.1 artifacts predate this requirement; README changes ship
  in 0.2.2 without changing earlier accepted bytes or the reserved adapter versions.

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
