# TODO — implementation plan

Current public capability release: **0.6.0**, managed HTTP files and redirected
sandbox drives. Private immutable `v0.6.0` is `98b8f46`; the public core tag is
`21b4091`. All ten exact npm packages are latest 0.6.0, all five OIDC workflows
and GitHub Releases pass, and eight fresh registry-only projects pass on
Windows/Linux (15 native file profiles, synthetic RDP state explicitly named).
Seven final standalone files are downloaded and verified. Public DEB/RPM
0.5.0 upgrades and actual installed-service file/RDP checks pass Astra 1.7.5 /
RED OS 7.3, separately from hosted Windows/Ubuntu installer acceptance.
Named Windows application and portable/XRDP evidence retains exact native
byte identities. [Public delivery, hashes and limits](docs/RELEASE_0_6_0.md#public-delivery).
Full Stage 7/V1, OS file clipboard and unaccepted resource/device gates remain open.

## Earlier delivery checkpoints

The following preparation checkpoints retain their historical scope.

Current public capability release: **0.5.0**, negotiated image clipboard.
Feature/release branches are merged into shared `master`; immutable private
`v0.5.0` is `cec3b8e`, public core tag is `31dcee4`. All ten exact npm packages
are latest 0.5.0, all five OIDC workflows/GitHub Releases pass, and all four fresh
registry-only consumers pass on each OS. Seven final standalone files are
downloaded and verified; actual public DEB/RPM 0.4.0 upgrades pass Astra 1.7.5 /
RED OS 7.3, separately from hosted Windows/Ubuntu installer acceptance.
Three named PNG application profiles use the exact published native bytes.
[Public delivery, hashes and limits](docs/RELEASE_0_5_0.md#public-delivery).
Full Stage 7/V1, file clipboard and unaccepted resource/device gates remain open.

Current unreleased managed-drive work: the dedicated Windows RDP-server
application scenario now passes with Windows and Linux RWS1/framed workers,
including Unicode CRUD, exact transfers, three read-only refusals and joined
cleanup with audio off. Full workspace/native checks and six Astra/RED OS
HTTP/RDP repeats also pass. This closes the named Windows-server source check;
exact published-package/installer acceptance and the wider Stage 7 matrix
remain open. [Current evidence](docs/DEVELOPMENT.md#prepared-windows-managed-file-application-check).

Versioned **0.6.0 prepublication acceptance** now passes exact installed npm
consumers, four Windows application profiles, six npm/XRDP profiles and six
standalone file profiles. Installed 0.5.0 upgrades pass Windows/Ubuntu CI and
Astra/RED OS; native RED OS/GCC 11.4.1 linked CTest passes 43/43. Public npm and
stable standalone delivery remain pending. This closes the named managed-file
capability slice, not all Stage 7 or file clipboard.
[Scope, exact archives and evidence](docs/RELEASE_0_6_0.md).

Previous public capability release: **0.4.0**, HTML clipboard. Feature and release
branches are merged into shared `master`; the immutable private tag is `53b5edb`
and public core tag is `b11db42`. Ten exact npm packages, five OIDC workflows,
five GitHub Releases and stable MSI/DEB/RPM/ZIP/TGZ/source companions are public.
All four fresh registry-only consumers pass on each OS. Final public DEB/RPM
0.3.0-to-0.4.0 upgrades pass Astra 1.7.5 / RED OS 7.3. Named versioned HTML and
desktop evidence retains its explicit scope. Additional main Windows foundation
also passes on an unchanged retry after Edge/OpenSSL tool timeouts; the failed
log is retained and all four source jobs are successful.
[Current delivery, hashes and limits](docs/CLIPBOARD_BROWSER.md#040-public-delivery).

Versioned **0.5.0 actual PNG RDP acceptance now passes** on Windows and Linux
RWS1/framed, both directions/new revisions with strict approved certificate and
joined cleanup, using native bytes matching the exact npm cohort. The dedicated
Linux lab container is removed. Candidate installer CI `40497112168` passes both
Windows/Ubuntu installed 0.4.0-to-0.5.0 upgrades and all seven distribution files,
including RPM; its publication is skipped. Astra/RED OS installed acceptance and
stable npm/standalone delivery remain open. [Versioned evidence](docs/CLIPBOARD_BROWSER.md#versioned-050-image-application-acceptance).
The following release-preparation checkpoint retains its original scope.

Release preparation is now on `release/0.5.0`, after accepted image merge
`a1909bd`. Ten exact npm archives and both production locks are aligned; all
four external consumers pass on each OS with installed image capability/assets,
codec/quota checks and strict TypeScript. Full checks pass Windows 1230/71 skips
and Linux UID1000/CapEff=0 1186/120 skips, zero failures/cancellations; fresh native
CTest passes 40/41 respectively. Windows recovery long-path fix `adcde20` has a
failing-before native test and nine focused passes. Windows candidate MSI/ZIP
are built and payload 10/10 plus portable relocation pass. Hosted release,
versioned RDP, installed upgrades and npm/standalone publication remain open;
0.4.0 is still public stable. [Release status](docs/VERSIONING.md).

Image **source feature acceptance is complete** at private `f922a9a` / public
`794f9b7`: all foundation, exact GCC 8.3, sanitizer/fuzz and both bundled jobs
pass. Linked CTest is Windows 40/40 and Linux 41/41; linked Node is Windows
1229/71 skips and Linux 1186/119 skips, zero failures. The final hosted Linux
service/runtime and full image SPDX checks pass, together with the three named
actual PNG RDP profiles. This accepts the image source feature for merging;
**0.5.0 npm/standalone release acceptance and publication remain open**.
[Source acceptance and limits](docs/CLIPBOARD_BROWSER.md#image-source-feature-acceptance).
The following image checkpoints retain their historical scope/status.

Image development branch: `feature/image-clipboard`, based on completed shared
0.4.0. Verified component checkpoint `696f1c8` implements bounded, allocation-free packed DIB/DIBV5 and
RGBA conversion. Full Windows foundation check passes 1065/137 skips/zero failures;
native CTest passes Windows 23, GCC 8.3/GCC 11/Clang 24, plus 170,987 sanitized
image fuzz runs. Image negotiation,
shared ownership/IPC, browser actions, actual OS/RDP roundtrips and full feature
acceptance remain open. The image checkbox below is deliberately still open.
[Component contract](docs/CLIPBOARD_TEXT.md#image-codec-in-development).
An independent C++/TypeScript RGBA inner-item codec is now implemented with a
16-byte header and the existing byte ceiling. Focused Node/legacy item checks
pass 11/11 on each OS. Full Windows `pnpm check` passes 1070/137 skips/zero
failures; native CTest passes Windows 23/23 and GCC 8.3/GCC 11/Clang 24/24.
Clang ASan/UBSan wire fuzz completes 795,134 runs without errors. This does not
enable image dispatch or a new capability. A later independent main Windows CI
Edge launch timeout remains recorded separately from these component results.
[Developing wire contract](docs/CLIPBOARD_IPC.md#image-inner-item-in-development).
The shared native CLIPRDR callback owner now implements opt-in image reads and
canonical DIBV5 writes alongside text/HTML. Eight new Windows pinned-plugin /
simulated-transport cases pass 829 assertions per platform. Full linked native
CTest passes Windows 40/40, GCC 8.3 and Clang ASan/UBSan 41/41; Windows linked
`pnpm check` passes 1136/71 skips/zero failures. RED OS GCC 11.4.1 compiles the
production owner/codec objects separately; linked/actual GCC 11 acceptance remains
open. Worker/public/browser image negotiation and actual
OS/RDP image application acceptance remain open.
[Native owner contract](docs/CLIPBOARD_TEXT.md#shared-native-image-owner-in-development).
Private image handoff now implements HELLO bit 512, CONFIGURE schema 14, schema-4
commands/state, shared worker scheduling and typed Node image read/write/revoke.
Focused checks pass 57/57; full Windows linked `pnpm check` passes 1152/71 skips,
Linux UID1000/CapEff=0 passes 1120/108 skips, zero failures. Linked CTest passes
Windows 40/40 and GCC 8.3/Clang ASan/UBSan 41/41; RED OS GCC 11 foundation passes
24/24 and three SDK modules compile. Wire/IPC fuzz passes 686,165/581,671 runs.
Public managed selection/browser
integration and actual image application acceptance remain open; the image
checkbox is not checked by these internal components.
[Handoff contract](docs/CLIPBOARD_IPC.md#private-image-handoff-in-development).
Public shared image ownership, exact native-adapter reservations and RWC1 image
control operations are now implemented. Focused ownership/adapter checks pass
34/34 and combined control checks 35/35, including actual WebSocket multi-window
RGBA with synthetic RDP. Full linked public `pnpm check` passes Windows
1178/71 skips and Linux UID1000/CapEff=0 1149/108 skips, zero failures.
Native sources are unchanged from the accepted private handoff. Browser
actions/permissions and actual OS/RDP image application acceptance remain open.
[Public contract](docs/CLIPBOARD_CONTROL.md#image-control-extension-in-development).
The browser byte client now negotiates the explicit RGBA descriptor and shares
the existing text/HTML flight, credit, deadlines and controller cleanup. Focused
pure composition checks pass 25/25, including the full 16 MiB ceiling; actual
Edge/WebSocket image and retained HTML helper checks pass 8/8 with synthetic
RDP and no OS clipboard access. Full linked `pnpm check` passes Windows
1191/71 skips and Linux UID1000/CapEff=0 1159/111 skips, zero failures. The
initial Linux run omitted Docker init and failed five parent-death checks;
an independent zombie/reaper probe and all five unchanged cases confirm the
environment correction before the passing full rerun. Browser ClipboardItem
actions and actual image application acceptance remain open.
[Browser contract](docs/CLIPBOARD_BROWSER.md#image-byte-client-in-development).
Explicit reference image ClipboardItem actions and independent image selection
are now implemented with disposable PNG conversion workers and fixed-size
previews. Pure conversion/config checks pass 19/19; actual Edge/viewer/control
checks with synthetic RDP pass 13/13, and preview/real permission-refusal checks
pass 4/4 without OS clipboard reads. Full linked `pnpm check` passes Windows
1207/71 skips and Linux UID1000/CapEff=0 1170/116 skips, zero failures.
A separate actual Windows/Edge 156 opaque 32x32 PNG profile passes local
paste/send, exact independent-browser-process OS readback, a new revision and
owned cleanup. This uses a synthetic session API, not RDP. Actual RDP image,
broader color/resource/platform and hosted/release acceptance remain open;
the Stage 7 checkbox stays open.
[Actions contract](docs/CLIPBOARD_BROWSER.md#explicit-image-actions-in-development).
Reproducible manual PNG OS and prepared-document actual-RDP helpers are now
implemented. Bounded document/receipt/CLI and actual-WS/synthetic-backend checks
pass 8/8. A fresh source-only Windows linked build passes CTest 40/40 and its
native/process/clipboard Node subset 60/2 skips. Full helper regression passes
Windows 1215/71 skips and Linux UID1000/CapEff=0 1176/118 skips, zero failures;
the tracked OS helper also passes the independent browser-process PNG scenario.
Actual image RDP remains open. The requested 09:58 Samara TCP retry timed out;
access was subsequently restored and the user approved the exact lab certificate.
The first Windows application challenge failed because the remote file was the
unexpanded template. An owned-source RDP Unicode read confirms both placeholders;
the ready generated document is supplied for the repeat. No image roundtrip is
accepted by these diagnostics; all probe workers/runtimes were cleaned.
[Prepared application procedure](docs/CLIPBOARD_BROWSER.md#prepared-image-application-helper).
Linux image application preparation now adds a bounded private image bootstrap,
separate read-only UID1000 container admission and actual-carrier preflight for
RWS1/framed IPC. Eleven focused image/legacy bootstrap/profile checks, five
linked Linux server profiles and both Windows-to-Linux browser bootstrap profiles
pass. Full regression passes Windows 1220/71 skips and Linux UID1000/CapEff=0
1181/118 skips, zero failures; native sources remain unchanged. Browser bootstrap
is headless with Clipboard APIs mocked to refuse access and creates no RDP
session. Actual remote application gates remain open; no RDP access is attempted
before the user's retry time.
[Linux preparation](docs/CLIPBOARD_BROWSER.md#linux-image-application-preparation).
The same native sources now also pass a fresh linked Release build and CTest
41/41 on RED OS 7.3/GCC 11.4.1. This reuses the pinned GCC 8.3 SDK; FreeRDP was
not rebuilt with GCC 11, the Node addon is disabled, and no RDP session is tested.
Public development commit `3115593` contains the exact 102 feature file changes.
Its GCC 8.3, Windows/default-Linux foundation and sanitizer jobs pass; the GCC 12
job exposes a test assumption that connected implies clipboard readiness. This
is now corrected with explicit readiness and a deterministic held-source case.
Eight focused checks and full Windows 1225/71 skips / Linux UID1000/CapEff=0
1182/119 skips pass, zero failures. New automatic Edge PNG profiles cover
non-square opaque, representable alpha and near-16-MiB conversion without OS/RDP.
The initial bundled-native Linux clean runtime fails because Ubuntu-built
dependencies require GLIBC_2.38; Windows is cancelled by fail-fast. Portable
builder repair remains open. The next checkpoint `677ba6f` passes all foundation,
sanitizer/fuzz and exact GCC 8.3 jobs. Its cold bundled Linux bootstrap identifies
missing `zip`; explicit prerequisites are corrected and a source-only vcpkg
bootstrap now passes locally. Full hosted bundled acceptance remains open.
The user defers real RDP tests after another application becomes active in the
lab session; the unused Linux application container is removed. Main, release
tags and published 0.4.0 inputs remain unchanged.
An independent artifact-only clean runtime also passes for the current GCC 8.3
image worker/addon: a fresh install stage has private dependency origins, then
the unchanged restricted bookworm verifier (glibc 2.36) runs codec probes, RWS1
pairing and native lifecycle/cleanup without SDK/source mounts or network,
with UID1000/read-only/CapDropALL. Image/HTML/revoke capabilities are present;
overall `rdp` stays false. This reuses the accepted SDK, does not accept the cold
hosted SDK build or an actual image RDP roundtrip, and publishes no archive.
[Clean runtime evidence](docs/CLIPBOARD_BROWSER.md#image-artifact-only-clean-linux-runtime).
The same exact archive also passes non-root artifact-only runtime checks on
actual Astra Linux 1.7.5 and RED OS 7.3 hosts, both glibc 2.28: six codec/private
origin probes, actual addon/RWS1 pairing, native lifecycle and joined cleanup.
Approved Node 24 bytes are independently verified and reused; no service, sudo
or RDP operation is involved. Both new temporary contexts are removed. This
extends named runtime portability, not image application or installer acceptance.
[Compiler/hosted checkpoint](docs/CLIPBOARD_BROWSER.md#image-gcc-11-and-hosted-checkpoint).
Hosted Windows bundled checkpoint `1399b3a` now passes the pinned FreeRDP build,
native CTest 40/40, linked `pnpm check` 1225/71 skips, staged relocation without
dependency PATH and SBOM/packaged CRT verification. Its 15 standalone packaging
skips remain separate installer gates. The 398 native files match the current
branch; Linux cold SDK/runtime and actual image RDP remain open.
[Windows hosted scope](docs/CLIPBOARD_BROWSER.md#image-hosted-windows-bundled-checkpoint).

The restored operator-ready window now passes three actual PNG RDP application
profiles: Windows native worker, Linux GCC 8.3 RWS1 and Linux framed IPC, all
against the prepared Windows Edge document. Exact opaque 32x32 pixels pass both
directions and a newer remote revision, with real public control/session APIs
and OS Clipboard APIs. The approved certificate matches; revoke, clipboard
cleanup, worker retirement and empty runtimes pass. The final profile requests
closing only its verified document; the temporary Linux container is removed.
This supersedes the earlier application deferral and failed preparation probes,
which remain recorded. All four current hosted foundation jobs also pass at
`b13f706`. Cold Linux bundled and versioned distribution acceptance remain open;
the image checkbox is not yet checked.
[Actual image RDP scope](docs/CLIPBOARD_BROWSER.md#actual-image-rdp-application-checkpoint).
Hosted `b13f706` also passes the cold GCC 8.3 dependency/FreeRDP build, CTest
41/41, linked Node 1182/119 skips and artifact-only restricted native runtime.
The next clean Node assembly fails because the host and builder use different
default pnpm stores. An explicit shared store now passes the actual offline
clean build/deploy/import regression with an empty host HOME and unchanged
lockfile. Workflow lint passes; complete hosted service assembly still requires
the corrected-source run. [Builder procedure](docs/DEVELOPMENT.md).
Corrected-source `c04c030` passes all foundation/sanitizer/fuzz and exact GCC 8.3
jobs, Windows bundled CTest 40/40 and Node 1227/71 skips, plus Linux bundled
CTest 41/41 and Node 1184/119 skips. Linux clean offline Node assembly/deploy,
application/native SBOM and restricted full API runtime also pass. The final
image inventory step fails before scanning with generic `SBOM_IMAGE_IDENTITY`;
its cause remains unverified. Fixed payload-free refusal codes are locally
tested without changing image size, platform or digest guards. The original
failure is retained; final image inventory, feature merge and versioned release
acceptance remain open. [SBOM diagnostic scope](docs/SBOM.md).
The diagnostic repeat at public `59d71eb` resolves that cause: Docker reports
312,426,738 bytes and seven layers, rejected by the 256 MiB inspection ceiling.
The SBOM artifact ceiling is explicitly corrected to 512 MiB, retaining the
separate bounded saved-archive/report checks. Eleven focused model checks pass
on Windows and Linux UID1000/CapEff=0, including failing-before measured-size,
exact ceiling, one-byte-over and invalid/platform/digest/layer refusals. This
does not change the clipboard quota or accept the hosted final scan; a
corrected-source hosted run remains required before feature merge.

The earlier preparation checkpoints below retain their historical scope.

The Stage 1 schema-1 runtime recovery feature is completed and published as
**0.3.0**. Feature/release and delivery repair branches are merged into shared
`master`. All ten exact npm packages, five successful OIDC workflows, four fresh
registry-only consumers on each OS and final standalone delivery pass. Public
DEB/RPM 0.2.5-to-0.3.0 upgrades pass on Astra 1.7.5 and RED OS 7.3.
Full current-source checks pass Windows 1050/70 skips and Linux 1030/92;
native CTest remains 38/39. Eight actual desktop profiles pass separately.
Broader multi-user isolation and the original full Stage 1 remain open.
[Delivery and evidence](docs/RUNTIME_RECOVERY.md#030-public-delivery).
Additional `feature/stage1-cross-principal-isolation` acceptance now passes:
actual Windows LocalService and distinct Linux UIDs cannot read/write/list/claim
or recover private live, sibling and orphan session directories; their owner
remains usable and joins cleanup. Full hosted Windows/Linux, exact GCC 8.3 and
sanitizer/fuzz checks pass. This is test/CI acceptance of the 0.3.0 boundary;
no published artifact is repacked or new RDP capability claimed.
[Acceptance scope](docs/RUNTIME_RECOVERY.md#cross-principal-acceptance).
The following preparation checkpoints retain their original scope/status.

Current next feature: `feature/html-clipboard`, based on shared `master`
`284d9b9` after the accepted Stage 1 branches were merged. A bounded native
CF_HTML codec is implemented and verified in `dd4b530`, and the combined native
HTML/Unicode CLIPRDR owner in `5de031a`. The bounded inner item now has independent
C++/TypeScript codecs. Explicit private worker/Node HTML negotiation and handoff
are implemented, together with shared public ownership and bounded HTML control
transport. The browser byte client now implements the same shared flight and
checked item schema. Reference ClipboardItem UI and inert selected-byte context
conversion are implemented. Named Windows/Edge OS ClipboardItem acceptance now
passes, together with the named Windows- and Linux-worker/Windows-peer prepared
Edge application roundtrips (Linux primary RWS1 and framed IPC); broader
platform/release acceptance remains separate. The Stage 7 HTML source feature
now passes its implementation/application/hosted gates and is checked below.
Release 0.4.0 is being prepared in `release/0.4.0`: product/native manifests
and package examples are aligned to 0.4.0; the public release remains 0.3.0.
Ten JS/native archives pass dependency/README/repository audits. New Windows
and exact GCC 8.3 Linux linked runtimes pass CTest 39/40 and installed probes.
All four exact npm consumers pass on both OSes, including installed HTML
capability/assets. Standalone locks bind their exact digests with an unchanged
external dependency graph. Full release checks now pass Windows 1131/71 skips
and Linux 1099/108, zero failures. Both portable candidates pass relocation,
recovery and joined shutdown; Windows payload checks pass 10/10. MSI/DEB are
built; RPM also builds and passes independent header/digest/extraction checks.
Release source CI passes at public `0bbc128`, including sanitizers/fuzz and GCC
8.3. Both Windows/Linux installed 0.3.0-to-0.4.0 CI jobs and combined verification
pass after the bounded extraction-budget correction. Actual upgrades also pass
Astra 1.7.5 and RED OS 7.3. Eight actual versioned desktop profiles and the
prepared Windows 0.4.0 HTML application test pass. RED OS GCC 11.4.1 foundation
passes 23/23 separately. All ten exact npm publish dry runs pass. Public stable
delivery and fresh registry-only consumers remain.
[Versioned acceptance and exact archives](docs/CLIPBOARD_BROWSER.md#040-versioned-distribution-acceptance).
An explicit prepared-Edge actual-RDP helper is now implemented and its bounded
document/receipt/CLI/public-WS fixture checks pass 5/5. The remote application
run now passes in its prepared-document Windows/Edge profile; fixture checks
remain separate from that actual RDP result.
Checkpoint `75a6a93` passes full Windows check 1119/71 skips/0 failures; a fresh
linked MSVC build passes CTest 39/39. The runtime/fixture evidence remains
separate from actual application acceptance.
[Named actual application acceptance](docs/CLIPBOARD_BROWSER.md#named-windows-rdp-html-application-acceptance).
The owned XRDP 0.10.1 negative remote-source profile also passes on the Windows
worker: HTML refusal has zero native reads/no automatic text fallback, followed
by a successful separately requested Unicode read and joined cleanup. Final
helper/document/guard/public-WS fixture checks pass 7/7. Broader
platform/release acceptance remains open.
Linux backend preparation now passes three actual linked bootstrap/start/stop
profiles (legacy, HTML auto, HTML framed) under UID1000/zero effective
capabilities, plus three bounded bootstrap/CLI tests on both OSes. This is not
Linux-worker remote HTML application acceptance.
The Windows-to-Linux application driver is prepared: seven fixture/profile checks
and both headed-Edge/native preflights pass, identifying actual RWS1/framed
transports and joining cleanup without RDP or clipboard access. Both actual
prepared-document Linux/RDP runs now pass: HTML/Unicode in both directions,
new remote revision, first-run document reset, final-run close request, native
revoke and OS/PID/runtime cleanup. Full current Windows check passes
1129/71 skips/0 failures and full Linux UID1000 check passes 1097/108 skips/0
failures. Hosted and versioned release acceptance remain.
[Named Linux application acceptance](docs/CLIPBOARD_BROWSER.md#named-linux-worker-html-application-acceptance).
The post-application CI compatibility corrections and their full/native/fuzz
checks are recorded in [source CI acceptance](docs/CLIPBOARD_BROWSER.md#source-ci-compatibility-correction);
the final hosted correction now passes. Versioned delivery remains separate.
[Completed HTML source acceptance](docs/CLIPBOARD_BROWSER.md#html-source-feature-acceptance).
Public ownership/control checkpoint `7ccef0a` passes full Windows 1092/71 skips,
Linux UID1000 1075/93, linked MSVC CTest 39/39 and focused checks 31/31, zero
failures. These are synthetic/socket and strict-TLS checks, not real RDP HTML
application or browser acceptance.
Browser byte-client checkpoint `57981d3` passes full Windows 1103/71 skips,
Linux UID1000 1083/96, linked MSVC CTest 39/39, browser/legacy composition 14/14
and actual Edge/WebSocket synthetic-RDP checks 3/3, zero failures. ClipboardItem
physical OS roundtrips and real RDP HTML acceptance remain open on this branch;
the reference ClipboardItem actions and conversion are now implemented.
Combined conversion/action checkpoints `a3542d7` / `7019d7a` pass full Windows
1113/71 skips, Linux UID1000 1085/104, linked MSVC CTest 39/39, focused
UI/permission/config/codec 25/25 and final normalizer 4/4, zero failures. Actual
permission denial is verified without OS data read; physical ClipboardItem and
RDP HTML application roundtrips remain required.
The later `c3447a5` named Windows/Edge 156 physical OS scenario passes known
Unicode/static formatting and independent-browser-process HTML/text readback
with real Clipboard API and owned cleanup. Its session API is synthetic; actual
RDP HTML application acceptance remains required.
[Current scope](docs/CLIPBOARD_TEXT.md#html-codec-in-development).

Completed preparation history: `feature/stage1-runtime-isolation` implemented the next
open worker/isolation item from shared `master`. Initial Linux runtime-root
admission has actual before/after evidence. Schema-1 native ownership locks now
pass Windows linked CTest 37/37, Linux sanitizer foundation CTest 21/21 and two
actual managed-worker crash/replacement tests per OS. The native recovery helper passes linked MSVC CTest 38/38,
GCC12 sanitizer and exact GCC8.3 foundation 22/22 each, crash/recovery scenarios
and full Windows check 1020/69 skips/0 failures. The SDK activation/recovery
revision now passes Windows check 1036/70 skips/0 failures and Linux sanitizer
foundation CTest 22/22 plus SDK/process checks 27/27. Windows standalone now passes
supervisor checks 9/9, portable ZIP 1/1, host CTest 1/1 and full check 1036/70 skips.
Linux portable now passes 1/1, current GCC 8.3 linked CTest 39/39 and SDK/recovery
27/27; Windows fresh CTest 38/38 and both installed-bundle relocations pass.
Installed upgrades, merge/publication and full Stage 1
acceptance remain open. User priority: finish
this recovery feature before HTML clipboard; its empty branch was removed.
The final helper-owner correction preserves a four-child limit until actual
close, including after timeout. Full checks now pass Windows 1037/70 skips and
Linux 1017/92 skips, zero failures. Capability release preparation targets 0.3.0;
the public stable version remains 0.2.5 until delivery is verified.
The extended Node/addon
sanitizer matrix continues separately in
`feature/stage0-sanitizer-matrix`; its unmet gates are preserved. The original
Stage 0 build/version gate already has the accepted 0.2.5 release profiles.
[Current scope](docs/DEVELOPMENT.md#current-functional-work).

The named [practical MVP](docs/MVP_ACCEPTANCE.md) is released as **0.1.0**,
tag `v0.1.0`. Current development follows this remaining full V1 plan while
preserving the accepted browser clipboard, audible output and desktop/lifecycle
profiles. Features use separate branches and merge only after their acceptance
checks pass; [version policy](docs/VERSIONING.md).

Prior accepted public release is **0.2.5**, standalone web service and portable/
MSI/DEB/RPM distribution. Full linked checks pass Windows 1002/63 and Linux
977/90; fresh native CTest 36/37, all four exact consumers on both OSes, eight
real desktop profiles and Windows/Ubuntu/Astra/RED OS upgrades pass. Source CI,
sanitizers/fuzz and combined seven-file candidate verification pass. Stable
npm publication and all four registry-only Windows/Linux consumers now pass;
all five OIDC workflows succeed, including the first actual Express write.
Actual main-push installer delivery, all final downloaded hashes and final public
DEB/RPM upgrades on Astra/RED OS pass; [delivery](docs/ITERATION_457.md);
[npm publication](docs/ITERATION_456.md);
[acceptance](docs/ITERATION_455.md). No original full V1 feature is silently closed.

Prior accepted local stable is **0.2.4**, tag `v0.2.4`: Express 5 root middleware,
same-port HTTP/HTTPS/WS and aligned native runtimes. Full checks: Windows
951 / 61 skips, Linux 928 / 87; fresh CTest 36/36 and 37/37. Ten exact archives
pass audit/dry-run, four external consumers/reinstall matrices and eight
versioned Astra/RED OS Express desktop profiles. All ten exact npm archives and
five GitHub Releases are public; hosted workflows and all four fresh Windows/Linux
registry-only consumers pass. Nine names publish through OIDC; new Express uses
the one separately authorized initial approve and has its trust read-back verified.
The old 0.2.3 manual queue remains stopped.
[Release acceptance](docs/ITERATION_438.md), [publication](docs/history/iterations/401-450.md#iteration-441).

Prior stable is **0.2.3**, tag `v0.2.3`: node:http/node:https integration,
explicit HTTP/WS dispatch and aligned native runtimes. Full checks: Windows
941 / 61 skips, Linux 918 / 87; fresh CTest 36/36 and 37/37. Nine exact
README-complete archives, external HTTP/NestJS/Fastify consumers with reinstall
and eight versioned Astra/RED OS HTTP desktop profiles pass. Registry publication
is intentionally partial: both runtimes public, seven JS versions unpublished.
Explicit user decision, 2026-10-24: retain 0.2.3 as an archived accepted release;
do not publish its missing JS packages. Complete public 0.2.4/0.2.5 suffice.
Preserve its tag/source/accepted archive bytes; manual approvals stay stopped.
[Release acceptance](docs/ITERATION_433.md), [archive decision](docs/ITERATION_458.md).

Prior stable **0.2.2**, tag `v0.2.2`: NestJS with Express and FastifyAdapter,
same-port HTTP/WS and aligned native runtimes. Final full checks: Windows
932 / 61 skips, Linux 909 / 87; clean CTest 36/36 and 37/37. Eight exact
README-complete npm archives, both external adapter consumers and all eight
versioned Astra/RED OS desktop profiles pass. Separate npm publication
is complete: all eight exact archives public, fresh Windows/Linux registry-only
NestJS consumers pass strict TS and 15/15. [Publication acceptance](docs/history/iterations/401-450.md#iteration-437).

Prior stable **0.2.1**, tag `v0.2.1`: same-port Fastify embedding, aligned
native npm runtimes and installed-package Astra/RED OS desktop acceptance.
Final checks: Windows 915 / 61 skips, Linux 892 / 87; native CTest 36/36 and
37/37. [Release evidence](docs/ITERATION_424.md). All seven npm packages are
published at 0.2.1 with exact accepted integrity; fresh registry-only Windows
and Linux consumers pass. [Publication evidence](docs/history/iterations/401-450.md#iteration-426).

Prior stable **0.2.0**, tag `v0.2.0`, retains the accepted GCC 8.3 port and
named Astra Linux 1.7.5 / RED OS 7.3 real desktop profiles. Final full checks:
Windows 905 / 61 skips, Linux 882 / 87 skips; native CTest 36/36 and 37/37.
[Release evidence and retained failures](docs/ITERATION_418.md). Intermediate
pre-release checkpoints below retain their original scope/status and are
superseded only for the explicitly accepted release profiles.

Delivery direction, 2026-10-22: stabilize 0.2.0 before new product work. The
user selects **Fastify npm integration on the existing application's HTTP/WS
port as 0.2.1**, developed in separate `feature/fastify-0.2.1`. Each next
accepted distribution variant advances the final number in 0.2.x. The
[delivery proposal](docs/DISTRIBUTION_OPTIONS.md) records current packaging,
same-port/diagnostics gaps and platform tradeoffs; it does not accept the
then-unimplemented Fastify adapter, installers or unfinished managed drives.

Updated user-selected adapter order, 2026-10-22:

| Target release | Adapter | Separate feature branch | Status |
| --- | --- | --- | --- |
| 0.2.1 | Fastify on the existing application's HTTP/WS port | `feature/fastify-0.2.1` | Accepted `v0.2.1`; all seven npm packages published; exact public integrity and fresh Windows/Linux registry-only consumers pass; iteration 426 |
| 0.2.2 | NestJS module using the same bridge core | `feature/nestjs-0.2.2` | Accepted v0.2.2 and all eight npm archives public; exact registry integrity and Windows/Linux registry-only consumers strict TS + 15/15 pass; iterations 427–429 and 437 |
| 0.2.3 | Built-in `node:http` integration | `feature/node-http-0.2.3` | Accepted aligned v0.2.3 with full/native/exact-consumer/reinstall and eight real RDP profiles; both runtimes public, seven JS stages pending; manual approvals stopped, future direct OIDC requested; iterations 431–433 |
| 0.2.4 | Express middleware/router | `feature/express-0.2.4` | Accepted local v0.2.4: full Windows 951/61, Linux 928/87; fresh CTest 36/36, 37/37; ten exact archives, all four consumers/reinstall and eight versioned real RDP profiles pass. All ten exact npm archives and five GitHub Releases public; hosted workflows and four fresh registry-only consumers pass on both OSes; iterations 435–436, 438 and 441 |

The latest user decision adds Express 0.2.4 to the selected initial set. Other
popular server integrations will be evaluated for concrete unmet requirements
after these adapters; they are not accepted merely by similarity. Other standalone/installer
delivery options remain documented for later selection. No adapter is DONE by
being assigned a version. Each requires external npm-consumer integration,
same-port HTTP/WS coexistence, scoped identity/diagnostics, bounded media and
joined cleanup, plus real RDP in its declared profiles before merging/release.

The user additionally requests external Node.js-project verification, npmjs.org
publication, full real-project usage guides as Markdown in `docs/`, separate
GitHub delivery repositories, then standalone installers
for the target OS families. Subsequent clarification: prepare the local Git
repositories and report their directories; the user will push/synchronize
GitHub themselves.

Subsequent explicit authorization, 2026-10-23: the user creates all five public
SensNyaha repositories and asks the agent to push them. All five verified local
main branches and annotated v0.2.4 tags are now pushed without force; remote
commits and public npm workflow bytes match. GitHub Releases and npm trust/OIDC
publication remain separate. [Delivery evidence](docs/history/iterations/401-450.md#iteration-439).

Superseding user requirement, 2026-10-23: standalone installers belong in
GitHub Releases of the existing **SensNyaha/freerdp-browser-bridge**, with a
workflow generating releases automatically on push to `master` or `main`.
This replaces the earlier separate-standalone-repository plan. Prepare and
verify the installer/workflow in core; actual hosted installer builds and
published releases remain distinct from local checks. Do not create a new
standalone repository for the superseded plan.

Standalone development starts in `feature/standalone-installers-0.2.5` after
the completed public 0.2.4 delivery. The private bounded-config/JWT service
passes complete Windows 976/63 skips and Linux 953/89 checks with actual linked
native TLS refusal/cleanup. Manifests remain 0.2.4 until aligned release
preparation. Portable packages, OS installers and auto-release remain pending;
[contract](docs/STANDALONE.md), [service evidence](docs/history/iterations/401-450.md#iteration-442).
The following browser/private-Node block passes complete Windows 978/63 skips
and Linux 954/90 checks, actual Edge authenticated pagehide cleanup and the
private-Node supervised CLI with a live native certificate prompt;
[evidence](docs/history/iterations/401-450.md#iteration-443). Installed services and releases remain open.
Windows supervisor compilation and 9/9 real private-Node/native process-tree,
crash-recovery and foreign-data preservation cases pass; SCM/MSI is still pending.
[Component evidence](docs/history/iterations/401-450.md#iteration-444).
Development MSI/DEB artifacts build, independent archive/database checks pass,
and the private Linux CLI passes as UID 1000. Full regression: Windows 981/63
skips, Linux repeat 957/90, no failures. These are prototype 0.2.4 dependencies,
not aligned 0.2.5 or installed SCM/systemd acceptance; [iteration 445](docs/history/iterations/401-450.md#iteration-445).
The following pinned-assembly block passes the actual installed-service matrix
on Windows Server 2025 and Ubuntu 24.04 at `4f3b886`: JWT/native TLS, non-root
identity, crash recovery, same-version reinstall and uninstall. The common Linux
stage also builds a real RPM whose header/cpio byte check passes. Astra/RED OS
installed service, cross-version upgrade, real standalone RDP and final release
remain separate; [iteration 446](docs/history/iterations/401-450.md#iteration-446).
Full regression for this assembly/staging block passes Windows 985/63 skips
and Linux 961/90, with zero failures; installed RPM/Astra/RED OS remain open.
The next block proves relocated Windows ZIP/Linux TGZ with private Node/native
TLS and joined shutdown, plus actual RED OS 7.3 RPM service identity, native
TLS, crash recovery, running/stopped reinstall and retained rpmsave on uninstall;
[iteration 447](docs/history/iterations/401-450.md#iteration-447). These remain prototype 0.2.4 artifacts;
Astra 1.7.5 DEB service identity/native TLS/crash recovery/running reinstall
and retained config on uninstall also pass. Full checks: Windows 988/63 skips,
Linux 963/90, zero failures. The next block passes all eight real standalone
desktop profiles (Windows portable and installed Astra/RED OS, H.264/JPEG),
including resize, reattachment and empty-runtime cleanup; [iteration 448](docs/history/iterations/401-450.md#iteration-448).
The preceding `992997c` also passes all three hosted workflows. Newer-version
upgrade and aligned 0.2.5 release remain separate gates. The temporary approval-review usage
failure is resolved through the normal review path, and the probe passes.
The desktop block `de46cea` subsequently passes all three hosted workflows too.
Prepublication candidate-cache and independent registry-only builds match every
payload byte on Windows/Linux; full checks pass Windows 990/63, Linux 965/90,
zero failures. This prepares acceptance before publication without changing
production lock URLs; [iteration 449](docs/history/iterations/401-450.md#iteration-449). It does not accept
aligned 0.2.5 artifacts, newer-version upgrade or automatic release delivery.

Following **release/0.2.5** preparation now has actual new MSVC/GCC8.3 workers
with fresh CTest 36/37, ten audited exact archives/official npm dry-runs and
matching production locks. Complete source repeats pass Windows 1002/63 and
Linux 977/90, zero fail. All four exact external adapter consumers pass on both
platforms, all eight actual standalone H.264/JPEG desktop/resize/reattach/cleanup
profiles pass, and actual Astra DEB/RED OS RPM 0.2.4→0.2.5 upgrades pass.
The public test candidate is a separately named unstable prerelease; stable
latest remains 0.2.4. Corrected Windows MSI upgrade/cross-job CI, stable 0.2.5
tagging, npm/public-integrity consumers and actual main/master installer
publication are still open. [Preparation](docs/history/iterations/451-500.md#iteration-453),
[upgrade/runtime evidence and retained failures](docs/history/iterations/451-500.md#iteration-454).
Corrected candidate pipeline **40022102839** now completes Windows MSI and
Ubuntu DEB 0.2.4→0.2.5 upgrades plus combined seven-file verification; publication
is skipped. This closes the prepublication installer upgrade gate, while stable
tagging/npm/registry-only/main delivery remain pending.

Clarified user scope, 2026-10-23: retain the standalone web server and OS
installers; exclude a separate desktop GUI application. The browser reference
interface, npm adapters and native runtime packages remain in scope. Standalone
still publishes in core Releases, with automatic main/master delivery.

Final user boundary, 2026-10-23: finish the standalone web service for VM portals,
non-Node backends, internal-network access, training/test environments, operator
portals and RDP integration checks. Deliver the agreed installers and automatic
core releases, then clean project-owned artifacts and stop. Do not add further
frameworks or product features. Shared viewing/recording, file management, VM
provisioning and new USB/smartcard implementations are outside this delivery.

Additional user direction, 2026-10-23: stop the rapid per-package npm approval
queue and prepare direct npm Trusted Publishing through GitHub Actions/OIDC.
Final GitHub owner is **SensNyaha**, not the npm scope `freerdp-bridge`.
0.2.2 is fully public and registry-only Windows/Linux NestJS consumers pass;
0.2.3 has only both runtimes public, seven accepted stages remain pending.
Do not restart manual approve automatically or claim OIDC configured before
the user's repository push and real publisher/workflow validation.

Additional user requirement, 2026-10-23: after plugin releases and standalone
installers, remove project-owned logs, temporary builds, unused Docker images
and similar artifacts that are unnecessary for further development. First
retain the required deliverables, reproducible build inputs and concise
acceptance/commit evidence. Do not prune unrelated Docker resources. Then
consolidate scattered documentation into a few primary semantic blocks,
preserving requirements and traceable evidence; update links and navigation.
Cleanup and documentation consolidation remain pending until those earlier
delivery gates are satisfied.

Cleanup checkpoint, 2026-10-24: the 0.2.5 delivery gates are accepted. Hidden
lab/runtime directories, obsolete native/consumer outputs, archived worktrees
and old logs have been reduced. 444 historical iteration reports now occupy ten
volumes with source hashes and checked links; nine key reports remain separate.
A missed incoming SDK junction was removed with the last compiler worktree;
the local SDK has since been rebuilt from the pinned source and verified with
a fresh linked worker. Accepted release bytes were preserved. See the single
[maintenance guide](docs/PROJECT_MAINTENANCE.md) for evidence, current physical
SDK paths and transport/context/staging cleanup. Four obsolete
delivery copies and their linked CI worktree have since been replaced by 12
independently restored/fsck-verified Git bundles; 701 old root helpers/receipts
are retained in one ZIP with every uncompressed SHA-256 checked. Current inputs
and 29 accepted/archived npm archives remain intact. This checkpoint does not
advance feature acceptance. The latest block removed another 99 obsolete
generated build directories and five trial installer archives, then 523 old root
helpers/logs/intermediate archives and an obsolete source snapshot. Only 12 root
build metadata files remain; required compiler inputs and current validation
are grouped in dedicated directories. Disk free space increased by 5.51 GB.
CTest remains 36/36 and all 29 retained npm archives and
eight final installer/checksum files retain their accepted hashes.

Earlier user goal update, 2026-10-24 (superseded by the cleanup-only goal below): after completing the requested releases,
project-owned cleanup and documentation consolidation, continue through this
TODO plan and implement the next unaccepted features in its prescribed order.
This replaces the earlier instruction to stop development after cleanup. It
does not remove the current release/installer/cleanup gates or restore a desktop
GUI. Complete and verify the current delivery before starting that next phase.
For that continued work, the user explicitly requires new feature branches,
merging into the shared branch only after stable checks, version increments
according to importance/scope, and prompt coordinated npm plus standalone
releases after acceptance. Preserve immutable prior releases and matching
JS/native versions; [version policy](docs/VERSIONING.md).

Latest user goal update, 2026-10-24: remove project-owned logs, temporary builds,
unused Docker images and other artifacts unnecessary for further development;
consolidate documentation into its important semantic blocks. This supersedes
the earlier instruction to continue feature implementation after cleanup.
Do not start new features or releases as part of this maintenance goal.

Additional user requirement, 2026-10-22: every npm package release includes its
own explanatory root README: purpose, installation, dependencies/platforms,
usage, limitations and licenses. This applies to shared JS packages and both
native runtimes as well as adapters. Workspace discovery and actual archive
checks enforce it; [publication contract](docs/NPM_PUBLISHING.md). Historical
accepted tags/tarballs remain immutable; new README content ships in new
release artifacts. Next-adapter version targets remain unchanged. Accepted in
`4153070`: all seven generated package archives contain their README, Windows
full check passes 918 / 61 skips / 0 fail, and README tests pass 3/3 on Windows
and Linux. [Evidence and partial npm publication](docs/history/iterations/401-450.md#iteration-425).
Subsequent explicit instruction: finish publishing the already accepted 0.2.1
set first, preserving its original archives. New README content follows in
the next release; no version/tag/accepted bytes are replaced.
That publication is now complete: 7/7 public exact-integrity versions and both
fresh registry-only consumers pass; [evidence](docs/history/iterations/401-450.md#iteration-426).

The user selects **MIT** for project-owned code; third-party
native dependency licenses/notices retain their own terms. The user has created
the npm organization `freerdp-bridge` and selects the `@freerdp-bridge/*` names. [Fastify development
contract and remaining acceptance](docs/FASTIFY_PLUGIN.md). Native npm runtime
packages/resolver now pass external Windows npm/pnpm and Linux pnpm consumers,
including strict TypeScript and actual native TLS rejection. The earlier
unreleased checkpoint passes 912 / 61 skips on Windows and 889 / 87 on Linux;
the final aligned 0.2.1 release evidence supersedes it for the named profiles.
Installed-package browser H.264/JPEG, resize/restoration, reattach and cleanup
now pass on the current Astra/RED OS addresses; [acceptance](docs/history/iterations/401-450.md#iteration-421). [Runtime evidence](docs/history/iterations/401-450.md#iteration-420),
[real-project runtime usage](docs/NATIVE_NPM_RUNTIME.md).

Legend: `[ ]` TODO, `[~]` IN PROGRESS, `[!]` BLOCKED, `[x]` DONE (accepted). Do not mark complete solely because code compiles.

Pre-release GCC 8.3 / distro checkpoint (2026-10-22): the bounded legacy XRDP
RDPSND negotiation correction passes clean linked GCC 8.3 and MSVC CTest,
full checks (877 / 87 skips and 900 / 61 skips), private package relocation,
and actual RED OS 7.3 plus Astra Linux 1.7.5 public Edge H.264/JPEG desktop,
resize/restoration, reattachment and cleanup. Earlier intermittent connection,
locked-desktop and resize observations remain recorded without a cause claim.
[Current acceptance](docs/history/iterations/401-450.md#iteration-417). This supersedes the open RED OS
desktop checkpoint below; 0.2.0 release preparation remains separate.

DONE applies to the named component and its explicit platform/test scope. A
verified component can be DONE while the containing stage remains IN PROGRESS.
An entire stage becomes DONE only when its requirements and **Gate** pass;
fixture/SDK integration does not substitute for actual RDP/device acceptance.
Iteration reports are evidence/history, not newly added unfinished stages.
Status clarification and preserved history: [iteration 173](docs/history/iterations/151-200.md#iteration-173).

Current stage acceptance:

| Stage | Current status | What prevents full DONE |
| --- | --- | --- |
| 0 — build | IN PROGRESS | Remaining checkout/distro/CI and private-dependency/addon/upstream-test sanitizer matrix; GCC 12 linked Release, bridge + FreeRDP/WinPR PIE sanitizer fixtures and independent Bookworm/Ubuntu native runtime pass |
| 1 — worker/IPC | IN PROGRESS | Primary/fallback Release IPC lifecycle passes on Linux/Windows; connected output/release/resource, addon sanitizer, configured capacity, broader isolation and abnormal cleanup remain |
| 2 — session/API | DONE for Windows fake-backend gate | Accepted lifecycle/WS gate; real RDP and platform acceptance belongs to the corresponding stages |
| 3 — connection | IN PROGRESS | Remaining Windows application/platform profiles, settings/auth/trust history, errors and reconnect |
| 4 — graphics | IN PROGRESS | Remaining GFX/resource/interactive cases, broader Windows server profiles and investigation of an intermittent Windows soak failure; Windows/Linux single-viewer XRDP 30-minute observations pass |
| 5 — input | IN PROGRESS | Actual keyboard/layout/IME, buttons/wheel/touch and no-stuck-input acceptance |
| 6 — audio | IN PROGRESS | User accepts named current Release three-minute Windows Opus/200 ms listening; numeric publication stalls/discontinuities, other profiles, recording, broader ready-source recovery and measured LAN queue target remain |
| 7 — clipboard/drives | IN PROGRESS | Named headed browser/host Clipboard API ↔ Windows Notepad and owned XRDP 0.10.1/Tk Unicode roundtrips, actual permission refusal and joined viewer/PID/runtime cleanup pass; wider producer/server/direction/quota/isolation/formats and managed-drive CRUD remain |
| 8 — devices | TODO | Implementation and per-advertised-device integration matrix |
| 9 — advanced settings | IN PROGRESS | Remaining Gateway/proxy/reconnect/channel settings and broader IP/appearance/platform integration |
| 10 — release | IN PROGRESS | Deployment/installers, resource/network/concurrency soak and complete regression |
| 11 — extensions | OPTIONAL TODO | Separate capability-gated extensions; not required for v1 |

Scope decision — 2026-10-09: **one primary monitor at 100% desktop/device scale
is sufficient**, using the existing orientation 0. Multimonitor and other RDP
scale/layout profiles are excluded from current required work by explicit user
instruction; they are not unfinished acceptance gates. [Accepted ADR-011](docs/adr/ADR-011-single-display-100-percent.md).
All other requirements, including confirmed resize, input, audio, devices,
platforms, resource limits and soak verification, remain.

## Implementation status — 2026-10-21

The user selected **0.2.0** as the next release for the GCC 8.3 port on
2026-10-22. Complete and verify `feature/astra17-gcc83`, then prepare the
separate release branch and version manifests; no 0.2.0 tag is accepted yet.
The prior `v0.1.0` remains the immutable practical MVP baseline.

The user now requires GCC 8.3.0/Astra Linux 1.7.5 and mandatory RED OS 7.3/GCC 11.
This supersedes the previous GNU 12 fallback policy without removing its
historical evidence. The separate compiler feature branch passes foundation
CTest 20/20 on exact GCC 8.3.0 and on the actual RED OS 7.3/GCC 11.4.1 host,
plus MSVC CTest 19/19 and framed lifecycle 16 / 1 skip. At this checkpoint,
linked dependency / FreeRDP / addon runtime closure, installed-Astra and actual
RDP acceptance were still open. With libraries from the supplied Astra ISO,
the same foundation binaries
pass CTest 20/20 and the GCC 8.3 IPC-only Node 24 addon passes 14/14 packet /
lifecycle tests in a separate unpacked runtime fixture using the Docker host
kernel. Full Windows foundation `pnpm check` passes 849 / 112 skips / 961 total.
This is not installed-Astra acceptance. Compiler-foundation checkpoint:
`f9758b5` on `feature/astra17-gcc83`; no shared-branch merge.
[Evidence and remaining gates](docs/history/iterations/401-450.md#iteration-407).

The supplied Astra ISO also boots its actual 6.1.50-1-generic kernel in a separate
diskless/networkless QEMU guest with checked runtime libraries. Foundation CTest
20/20, Node IPC-only addon 14/14 and explicit guest acceptance/clean poweroff
pass with unchanged deadlines. This is kernel/initramfs evidence; installed OS,
security profiles, other kernels and linked product/RDP acceptance remain open.
[Guest evidence](docs/history/iterations/401-450.md#iteration-408).

The subsequent exact GCC 8.3.0 source chain completes all ten required private
dependency roots and pinned FreeRDP/WinPR, with strict origins/foreign-prefix
refusal. A fresh linked Release consumer passes CTest 37/37 and real-worker
Node IPC/lifecycle/protocol-fixture checks 40/40 with source/artifact receipts.
Full linked `pnpm check` passes 877 / 87 skips / 964 total, zero failures.
Linked Astra closure, installed-OS/security profiles, actual RED OS product,
Windows linked regression and actual RDP gates remain open; no shared merge or
0.2.0 tag is accepted here. [Linked source build](docs/history/iterations/401-450.md#iteration-409).

The same GCC 8.3 linked worker/addon subsequently pass in the checked Astra
ISO-library container: CTest 37/37, codec/private-origin probes and actual Node
IPC/lifecycle/TLS fixtures 54/54. No OS/VM is installed for this check. A fresh
MSVC Release consumer with a separately rebuilt corrected SDK binds identical
native source bytes and passes CTest 36/36, focused process/protocol checks
27 / 1 skip and full physical-path Windows `pnpm check` 900 / 61 skips / 961.
Actual RED OS GCC 11 compiles all linked targets, but CTest passes 25/37 with
12 loader/worker failures from the reused CUPS library's absent `libcrypt.so.1`.
RED OS linked runtime and real desktop acceptance remain open.
[Runtime/control evidence](docs/history/iterations/401-450.md#iteration-410).

The CUPS client link and numactl byte-atomic configure corrections subsequently
retain all exported APIs and remove unused private-runtime dependencies.
Actual RED OS GCC 11 passes CTest 37/37 and Node IPC/lifecycle/TLS 54/54.
The final complete GCC 8.3 dependency/SDK/worker source chain passes CTest 37/37,
focused Node 40/40, full `pnpm check` 877 / 87 skips / 964, strict package closure
34 ELF files / 333 resolutions and relocation 1/1. The exact final package
passes an unprivileged artifact-only probe on actual RED OS without SDK/build
paths. Real desktop regression remains separate; no 0.2.0 tag is accepted here.
[Portable source/package evidence](docs/history/iterations/401-450.md#iteration-411).

The final exact GCC 8.3 package also passes an unprivileged cold Astra-library
container probe. Actual owned XRDP desktop, resize/restoration, both IPC
transports and controlled transport loss pass. Public Edge H.264/JPEG rendering,
viewer reattachment and Linux-producer CLIPRDR ↔ prepared Tk Unicode/multiline
roundtrips with repeated fresh Copy/Get pass their bounded profiles. Earlier
display/clipboard failures are retained without an unsupported cause claim.
The user defers Windows-host access for 60 minutes; its new-worker joint
regression remains unrun. No new audible, OS Clipboard API, installed-Astra or
0.2.0 acceptance is claimed. [Evidence](docs/history/iterations/401-450.md#iteration-412).

An exact GCC 8.3 foundation CI recipe now retains the pinned compiler/tool
inputs and runs build/CTest without network or host runtime mounts. Its actual
local container passes CTest 20/20 and the full linked Linux `pnpm check`
passes 877 / 87 skips / 964 total, zero failures. The GitHub-hosted workflow
has not run from these local commits. [Evidence](docs/history/iterations/401-450.md#iteration-413).

The user now explicitly requires real RDP connections to both Astra 1.7.5 and
RED OS 7.3 before 0.2.0. The separately confirmed real Astra node passes native
activation/heartbeat and public Edge H.264/JPEG desktop, resize/restoration,
reattachment and cleanup. Its 1.7.5 version is user-reported from astra_version;
no security-profile or application/audio acceptance is inferred.
[Astra evidence](docs/history/iterations/401-450.md#iteration-415). Actual RED OS XRDP 0.10.6.1 activates
but fails on an RDPSND receive callback before application input. Scalar-only
diagnostics narrow the failure; a verified diagnosis is not a repair.
The required RED OS RDP gate and 0.2.0 release remain open.
[RED OS evidence and active root worktree](docs/history/iterations/401-450.md#iteration-416).

The separate XRDP Clipboard feature passes real headed Edge Clipboard API ↔
CLIPRDR ↔ owned XRDP 0.10.1/Tk Unicode/emoji/multiline transfer in both
directions across two new RDP connections, repeated server Copy/Get, actual
permission refusal, revoke and joined PID/runtime cleanup. A prepared Tk Copy
hook supplies fresh ownership notifications; old XRDP 0.9.x surrogate handling
is not repaired. Full feature-branch `pnpm check` passes 900 / 61 skips /
961 total, with unchanged production/native inputs. Wider Stage 7 remains open.
[Evidence](docs/history/iterations/401-450.md#iteration-404).

The named practical MVP joint Windows gate now passes: actual public Edge /
Release H.264 1080p, Opus/200 ms, both Clipboard API/Notepad directions and
physical edit/readback for 30 minutes / 59 observations / 61 reads, followed
by resize, viewer/audio replay, actual permission refusal, revoke and joined
PID/runtime cleanup. The user reports steady sound without regular audible
interruptions. Numeric discontinuities and the prior unexplained Get stop are
retained; this does not claim they were fixed or accept broader V1 profiles.
[Evidence](docs/history/iterations/401-450.md#iteration-403), [runbook](docs/MVP_RUNBOOK.md),
[separate full V1 plan](docs/V1_NEXT_STEPS.md).

Linux regression of both current production corrections passes linked Release
CTest 35/35, focused process/TLS 7/7 and full Node 870 / 82 skips / 952 total,
with unchanged source/native inputs and a checked cleanup receipt. The outer
tool's nonzero status discrepancy is retained. The joint Windows helper reaches
both real Clipboard API/Notepad directions with live audio, then stops at an
epoch/config waiting observation; its full soak remains unaccepted. No new
audible-quality claim is made. The pending joint helper additionally passes
Windows `pnpm check` 891 / 61 skips / 952 total; actual repeat remains open.
[Evidence and next experiment](docs/history/iterations/401-450.md#iteration-402).

The combined current Release input/CLIPRDR worker passes CTest 34/34 and an
actual active owned-XRDP/public Edge H.264 1080p soak: 30 minutes / 61 samples,
5,781 frames, peak worker RSS 152,342,528 bytes, bounded queues and no observed
critical failure. Resize/restoration, cursor/display replay, reattachment,
joined PID/runtime cleanup pass. Audio/clipboard are off in this gate; joint
Windows and wider V1 acceptance remain separate. [Evidence](docs/history/iterations/401-450.md#iteration-401).

Bounded XRDP CLIPRDR zero-trailer compatibility now preserves declared quotas,
original deadlines and the absolute wire cap. Linked CTest 34/34 and isolated
Node 885 / 61 skips pass. Actual owned XRDP readiness and one fixed Tk/public
Get read pass; the subsequent fresh-connection re-offer receives no new offer
and remains open. [Evidence](docs/history/iterations/351-400.md#iteration-400).

Fresh-controller inherited pointer recovery now passes actual owned XRDP/public
Edge readback: after hard loss leaves Ctrl/left button held, one post-render
reset clears the standard buttons even with empty local pressed ownership.
The previous-worker negative control fails as expected. Current linked Release
CTest 34/34 and full Windows 898 / 51 skips pass. This does not claim release
delivery across broken TCP or full reconnect/soak acceptance.
[Evidence](docs/history/iterations/351-400.md#iteration-399).

The owned Linux application now confirms actual movable-object drop, both-axis
content scrolling, three buttons and blur/detach release through fixed X11
scalar readbacks. This does not imply Linux CLIPRDR acceptance. Two separate
synthetic accounts also pass short actual native RDP coexistence and sibling
retirement/cleanup. The initial active soak stops at 26.14 minutes without a
completion receipt and is not accepted. A hard-loss input control exposes a
preserved remote button; the user accepts release on the next connection and
the corrective control reset remains under verification.
[Evidence](docs/history/iterations/351-400.md#iteration-398).

An explicitly user-requested owned Linux/XRDP container now passes current
Release/public Edge JPEG and H.264 1080p, cursor, resize/restoration and viewer
replay. Actual connected public CPU/RSS failure scenarios pass exact terminal
errors, token retirement and joined query/PID/runtime cleanup. Strict default
certificate refusal passes. The Linux CLIPRDR ready/readback attempts remain
unaccepted; the active 30-minute observation is still running. This does not
close full platform/device/resource gates. [Evidence](docs/history/iterations/351-400.md#iteration-397),
[owned stand](docs/OWNED_XRDP_LAB.md).

The user-prepared Windows pointer page now passes actual public-viewer
left/right/middle buttons, captured drag, both wheel directions on both axes,
left-button blur release and held middle-button detach/reattach release.
Four bounded CLIPRDR receipts confirm balanced down/up and no held buttons;
no local Clipboard API or native offer is used. This accepts application event
delivery, not content scrolling, arbitrary drop targets or physical hardware.
The initial wrong-application attempt is retained. [Evidence](docs/history/iterations/351-400.md#iteration-396).

Current tracked-source Linux GCC 12 linked Release + IPC-only addon now passes
native CTest 35/35, focused process/synthetic-TLS 7/7 and full Node 863 / 81
skips / 944, zero failures. Exact reused SDK/dependency archives and real private
module origins are verified; initial missing test-CLI failures remain retained.
Source/native inputs are unchanged, PID/runtime retirement and container removal
pass. Actual XRDP/browser/device and full build matrices remain separate.
[Evidence](docs/history/iterations/351-400.md#iteration-395).

The user accepts the current Release Windows Opus/200 ms three-minute scenario
as excellent sound. Actual rendered samples cover 179.54 seconds; late intervals
11 / browser configurations 12 / Worklet underflows 4 remain visible, with one
scheduled consumer reset. This accepts the named audible MVP scenario, not
zero-loss/reset-free playback, other profiles or complete Stage 6. Joined
PID/runtime cleanup and unchanged protected inputs pass.
[Evidence and Debug comparison boundaries](docs/history/iterations/351-400.md#iteration-393).

The complete headed Edge / current Release / Windows Notepad small-text smoke
now passes both Unicode directions, actual Clipboard API denial, no-format
revoke, viewer field clearing and joined PID/runtime cleanup in one invocation.
The prior failed copy-offer run is retained. Own-document clear keystrokes
follow verified readback; empty application content is not separately read back.
Wider Stage 7 matrices remain open. [Evidence](docs/history/iterations/351-400.md#iteration-392).

A separate current-source Windows Release consumer now passes native CTest
34/34, process/TLS/lifecycle 27 / one skip and full Node 890 / 51 skips.
Its native source hash matches the current Debug consumer. Existing encoder
benchmarks show substantial Debug conversion overhead; this is not proof of
every audio stall or new Release audio acceptance. Original Release outputs,
configuration and pins stay unchanged. [Evidence](docs/history/iterations/351-400.md#iteration-391).

The user accepts the named Windows Opus/200 ms three-minute observation as
steady normal sound. The timer starts at the first decoded packet; rendered
samples cover 178.65 seconds. Forty configurations, 64 late publication
intervals and 12 Worklet underflows remain measured scheduling gaps, despite
the positive listening assessment. Joined PID/runtime cleanup passes; full
Windows Node passes 890 / 51 skips. Release and pins are unchanged.
[Current audio evidence](docs/history/iterations/351-400.md#iteration-390).

The user accepts the corrected Debug worker's actual short Opus/200 ms tone as
steady with almost no interruptions. The observed 23.52 seconds have one browser
epoch/configuration, zero late publication intervals and zero Worklet underflow;
full three-minute continuity is not yet demonstrated. Earlier source-launch /
console-input failures are retained. The new manual-source mode leaves fixed
text in the local draft and requires separate user Send/paste/execute actions.
[Exact audio scope](docs/history/iterations/351-400.md#iteration-387), [MVP acceptance](docs/MVP_ACCEPTANCE.md).

New Windows Debug workers advertise bounded host resource batching; trusted
CPU/RSS policies coalesce admitted requests across workers through the existing
16-active / 128-waiting owner. Per-member cancellation, original deadlines,
shared-child retirement and legacy scalar fallback pass focused tests. The
unchanged forty-worker / five-replacement fixture passes both focused and full
runs, with zero worker failures and maximum active query 550 / 664 ms against
the existing 3,000 ms bound. Native CTest passes 34/34; full Node passes
854 / 51 skips / 905 total, zero failures. Release, pins, connected/OS-failure /
sustained resource and broader stages remain unchanged/open.
[Owner and exact evidence](docs/history/iterations/351-400.md#iteration-378).

Controlled actual hanging-child timeout, partial/all-member cancellation and
missing-executable checks additionally pass 3/3, preserving an unrelated real
helper path and joined empty owners. Full Node passes 857 / 51 skips / 908,
zero failures, with unchanged production/native sources. Actual Windows query
API failures and wider connected/OS/load gates stay open.
[Fault-control evidence](docs/history/iterations/351-400.md#iteration-379).

A new Windows source-only foundation Debug output now verifies the host-batch
capability without FreeRDP: native CTest 17/17, resource integration 12/12 and
full Node 809 / 102 skips / 911 total pass. Three SDK browser tests now select
their prerequisite from actual native linkage rather than output-directory
names; all four codec/viewer cases still pass on linked Debug. Original failed
runs remain recorded. [Foundation evidence](docs/history/iterations/351-400.md#iteration-380).

New clean-foundation receipts now also bind actual worker/query-helper SHA-256
outputs through the existing bounded hashing routine. Windows source-only
Debug CTest 17/17, lifecycle 16 / one skip and full Node 813 / 102 skips pass;
linked artifact inventories remain unchanged. Linux inventory is portable-test
coverage only because the local Docker daemon is unavailable. Broader build
and platform gates stay open. [Receipt evidence](docs/history/iterations/351-400.md#iteration-381).

## Implementation status — 2026-10-20

One explicitly authorized Windows lab / Edge Opus/200 ms preview now passes
actual format/Training/Wave negotiation, packet decoding and Worklet rendering,
and the user confirms hearing the fixed remote tone. They also report short
Morse-like interruptions. Frequent source epochs/configurations, buffering
silence and underflows remain; Stage 6 stays IN PROGRESS.
[Audible slice and exact counters](docs/history/iterations/351-400.md#iteration-367).
Local helpers now preserve numeric native loss/cause receipts and separately
count browser-consumer reset calls/results, preparing the authorized repeat.
No specific cause or quality correction is accepted yet.
[Native collection](docs/history/iterations/351-400.md#iteration-368),
[consumer accounting](docs/history/iterations/351-400.md#iteration-369).
The separately authorized repeat reports zero Node consumer reset requests
and 581 skipped native publication intervals / 572 publisher resets. The user
reports much better sound with a few small interruptions. Native scheduling,
callback and graphics stalls remain to be distinguished; no production fix or
uninterrupted-quality pass is claimed. [Repeat evidence](docs/history/iterations/351-400.md#iteration-370).

The separately authorized corrected Debug preview renders 528 H.264 1080p
frames but receives no RDPSND Formats or audio packets. Fixed-tone input was
dispatched; source execution is unverified. Joined cleanup passes. This run
does not accept the scheduling correction's actual playback or quality;
negotiation/source and remaining Stage 6 gates stay open.
[Debug observation](docs/history/iterations/351-400.md#iteration-373).

Bounded listening previews now additionally collect one native video pipeline
snapshot using the existing capability/deadline API. Only eight validated
numeric fields are projected; unavailable evidence remains `null`. This local
instrumentation prepares encode/read-cost observations without accepting an
audio stall cause, connected timing, CPU or quality gate.
[Collector evidence](docs/history/iterations/351-400.md#iteration-374).
The full check passes 818 / 51 skips but retains one failing unchanged
40-worker resource-capacity case; a focused repeat also fails after active
resource queries exceed their unchanged three-second bound. This local
collector block does not close the resource/load limitation or claim a clean
full-suite result. Exact diagnostics remain in the same report.

## Implementation status — 2026-10-18

The user restored access and confirms the target is the Windows RDP lab;
they have cleared the initial desktop wizard. Legacy `test-xrdp-*` names do
not identify the current server OS. [Current scope](docs/LAB_STATUS.md),
[clarification](docs/history/iterations/301-350.md#iteration-301). Windows actual strict
certificate refusal / approved session-only connection, native and Edge
H.264/JPEG resize/restoration/replay, controlled connection loss and joined
cleanup pass. CLIPRDR and RDPEI inventories are ready. PCM/Opus output still
receives no formats/packets; PCM/Opus AUDIN remains waiting epoch 0 with no
channel/Open negotiation. Audio/recording, application/device and wider gates
remain open; access alone does not accept them. [Current lab evidence](docs/history/iterations/251-300.md#iteration-297); `9dce875`.
The desktop-ready Windows repeat also receives no RDPSND Formats/packets or
AUDIN Open for PCM/Opus, with heartbeat/frame/cleanup intact; audio and recording
remain unaccepted. [Repeat evidence](docs/history/iterations/301-350.md#iteration-302).

The user-prepared Windows Notepad now passes fixed Latin/Cyrillic/Japanese/
supplementary Unicode application readback, actual CLIPRDR paste-and-copy
roundtrip, a small physical-key/modifier/reset case, fixed left-button sequence,
empty-offer/revoke ACK and unsaved-window/native cleanup. Full Node passes
Windows 657 / 90 skips and Linux 602 / 148 skips. This is a named private small-text
slice, not complete layout/IME/button/browser/host-clipboard/device acceptance.
[Application evidence](docs/history/iterations/301-350.md#iteration-303).

The Windows lab now also supplies actual PCM/Opus Formats, Training/Waves and
private packet delivery during a fixed system-sound attempt; PCM samples include
nonzero data. Both preserve heartbeat and joined empty-runtime close. Substantial
epoch/config churn remains; browser/audible quality, reset, latency and resource
acceptance stay open. PCM/Opus AUDIN still waits at epoch 0 without Open.
Future host application/source launches should be requested from the user.
[Source observation and exact scope](docs/history/iterations/301-350.md#iteration-305).

With a source started by the user, the current Windows lab / Edge PCM and
Opus/200 ms also pass actual Worklet rendering, fresh-token audio recovery and
private ready resets with fresh config/data. Opus replay includes one scheduled
native reset. Frequent epoch/config churn, silence/underflows and skipped
intervals remain observed quality gaps; their cause is unverified.
[Current browser/recovery evidence](docs/history/iterations/301-350.md#iteration-307).

The pinned OpenH264 sanitizer run exposed a shift by 32 in `BsFlush()`. The
isolated build-copy correction matches upstream commit 40555ec6 byte for byte;
GCC 12.4 nonrecovering UBSan reproduces the original failure and passes all
2325 focused checks after correction. Original diagnostics are preserved.
The existing Release port/profile is unchanged. Corrected instrumented-library
integration passes six codec suites, full CTest 31/31 and Linux Node 633 / 84
skips; Windows Release passes CTest 30/30 and Node 669 / 49 skips. The first
recovered Linux Node failure is retained with its test-tool prerequisite fix.
The RDP node was unavailable during this correction; that historical access
block is superseded by the restored-lab results above. Actual complete RDP/device
acceptance remains open. [Correction evidence](docs/history/iterations/251-300.md#iteration-275).

OpenH264's own upstream ASan/UBSan common (17), decoder (50) and processing (10)
cases pass. A test-only initialization correction removes an uninitialized
`SSourcePicture` bool read; the focused reproducer and all 181 encoder tests
then pass. Original UB and 30-second timeout logs are retained. The API category
times out at its original 300-second bound and remains open; no complete
five-category upstream pass is claimed. Release/application code stays unchanged.
[Upstream evidence and test patch](docs/history/iterations/251-300.md#iteration-276); `9a8a8ab`.

The same GCC 12.4 sanitizer runtime now also uses rebuilt pinned ZLIB 1.3.2.
Upstream CTest 14/14, actual module/codec origins, linked CTest 31/31 and full
Node 633 / 84 skips pass with unchanged worker/Release artifacts. Ordinary
CTest/CMake tools and the instrumented native children have separate loader
ownership; initial tool startup/projection failures are retained. Other private
dependencies/addon, full upstream/platform/CI and actual RDP/device/resource
gates remain open. [ZLIB profile evidence](docs/history/iterations/251-300.md#iteration-277).

An independent static ZLIB ASan/UBSan output also passes all 19 compile-command
checks, focused static examples/infcover 4/4 and full upstream CTest 16/16,
including nested consumers. The original coverage assertions and source remain
unchanged; matching gcov 12 is used. This adds local static test coverage while
other private dependencies/addon and wider gates remain open.
[Static ZLIB evidence](docs/history/iterations/251-300.md#iteration-278).

Pinned libspng 0.7.4 now also passes a separate GCC 12.4 ASan/UBSan shared build
and bounded local PNG regression: eight exact RGBA8 roundtrip combinations,
size/truncation refusals and 2,424 upstream read-harness inputs from 202 PNGs.
Unknown harness input is refused by hash; actual private libspng/ZLIB loader
paths are verified. Full comparator/fuzz/platform and remaining dependency/addon
acceptance stay open. Linked CTest 31/31 and full Node 633 / 84 skips pass with
the new library profile and unchanged worker/Release. [PNG evidence](docs/history/iterations/251-300.md#iteration-279).

The independent pinned libjpeg-turbo 3.2.0 Debug profile now passes upstream
ASan/UBSan CTest 332/332, including API/buffer/PNG and golden codec-output cases.
All 292 C compile commands are instrumented; 27 SIMD assembly commands remain
outside sanitizer instrumentation. Existing port patches are the only source
differences. Release is unchanged. An additional focused C-fallback API control
passes. Actual new JPEG/SPNG/ZLIB
origins, linked native CTest 31/31 and full Node 633 / 84 skips also pass without
new sanitizer diagnostics; the existing worker hash remains unchanged.
[JPEG evidence](docs/history/iterations/251-300.md#iteration-280).

Pinned OpenSSL 3.6.5 also passes a separate GCC 12.4 C-only static ASan/UBSan
profile: all 1,163 library C commands, focused ASN.1 2/2 recipes and selected
ASN.1/X.509/BIO/buffer 10 recipes / 15 top-level tests. Exact patch/source audit
passes; missing-wrapper and backup-audit failures are retained. This is separate
from shared bridge runtime and full OpenSSL/TLS/platform acceptance; Release
and current bridge loader are unchanged. [Evidence](docs/history/iterations/251-300.md#iteration-281).
Additional local X.509/verify/store/CSR recipes pass 4 / 220 top-level tests
under the same static instrumentation, with unchanged source/library/CLI
hashes and bounded retained-result diagnostic scans. This is separate from
the bridge's real certificate/transport gate. [Evidence](docs/history/iterations/251-300.md#iteration-282).
Local SSL context/config and memory-BIO buffer recipes additionally pass 3/3
top-level tests, including all 13 available buffer variants, with unchanged
library/app/source hashes. No socket/TLSProxy or shared bridge acceptance is
claimed. [Evidence](docs/history/iterations/251-300.md#iteration-283).

A separate experimental OpenSSL shared C-only/no-module ASan/UBSan profile now
passes 4 upstream recipes / 211 top-level tests, exact module/source audit,
actual new SSL/crypto origins, linked CTest 31/31 and full Node 633 / 84 skips.
Pinned Configure permits this without RPATH; the upstream-recommended static
baseline remains separately verified. Worker/Release hashes and dependency
versions are unchanged. Full production features/modules/assembly, remaining
dependencies/addon/platform/CI and RDP gates remain open.
[Evidence](docs/history/iterations/251-300.md#iteration-284).

## Implementation status — 2026-10-16

Local Linux cached-source private dependencies, pinned FreeRDP and a new
source-only worker/addon now pass the complete native build chain: 20 dependency
packages, SDK identity/CTest, project CTest 30/30, process/TLS 40/40, codec/module
origins and full Node 656 passed / 58 skips. The Windows source dependency/SDK/
project chain also passes local native/process checks and full Node 662 / 49
skips. New Linux/Windows native
packages install and relocate; the Linux archive passes separate restricted
Bookworm and Ubuntu 24.04 runtime checks. Complete fresh OS/toolchain/distro
builds, CI, linked/upstream sanitizers, full service/release/installers and actual
RDP/device/resource gates remain open. [Linux chain](docs/history/iterations/251-300.md#iteration-254),
[Windows chain](docs/history/iterations/251-300.md#iteration-257), [packaging](docs/history/iterations/251-300.md#iteration-258),
[Ubuntu runtime](docs/history/iterations/251-300.md#iteration-259).

A complete tracked-source Linux project export now also passes new offline Node
installation/build/full regression, linked CTest 30/30, install/ELF closure,
relocation and production deploy/import without prior build/dist/node_modules.
Its native SDK/dependency/tool inputs remain external and verified. A complete
Windows export also passes offline install, linked CTest 30/30, full Node
663 / 49 skips, relocation and production deploy/import after correcting the
Node physical-path context. New OS/distro, CI and linked/upstream sanitizer
gates remain separate. [Linux evidence](docs/history/iterations/251-300.md#iteration-260),
[Windows evidence](docs/history/iterations/251-300.md#iteration-265).

GNU builds now explicitly require GCC 12 and a matching C++20 standard library.
A new actual GCC 12.2 linked consumer passes CTest 31/31, process/TLS 40/40 and
full Node 657 passed / 58 skips; MSVC foundation passes the probe and 15/15.
The local Ubuntu standard PIE ASan/UBSan foundation passes 16/16 with GCC 12.4
and 15/15 with GCC 13. Eleven Clang 18 PIE sanitizer fuzz smokes also pass.
The GNU minimum remains 12; explicit compiler/budget CI profiles are prepared,
not run. [Compiler support](docs/COMPILER_SUPPORT.md),
[policy/build](docs/history/iterations/251-300.md#iteration-263), [GCC 12 PIE/fuzz](docs/history/iterations/251-300.md#iteration-264),
[earlier PIE environment](docs/history/iterations/251-300.md#iteration-262).

A new complete tracked-source Ubuntu GCC 12 export also passes standard PIE
ASan/UBSan CTest 16/16 and full Node 569 / 146 profile/platform skips, including
100 actual sanitizer-worker lifecycles and parent-death cleanup. The parent Node
runs without preload and the addon is OFF. Separate Node-only preload controls
still fail LSan; addon sanitizer acceptance remains open.
[Evidence](docs/history/iterations/251-300.md#iteration-267).

The linked GCC 12 bridge sanitizer failure exposed lost Opus state in pinned
FreeRDP DSP reset. A hash-checked build-copy correction now retires the preceding
encoder/decoder before replacement, keeping the exact clean checkout/public ABI.
New SDK/consumer builds pass Windows CTest 30/30 and Node 666 / 49 skips, Linux
Release CTest 31/31 and Node 659 / 59 skips, and Ubuntu GCC 12 standard PIE linked
bridge ASan/UBSan CTest 31/31 and Node 633 / 84 skips. The public leak reproducer
now exits cleanly. Addon/upstream instrumentation, connected audio and wider
resource/platform/CI gates remain open. [Retained failure](docs/history/iterations/251-300.md#iteration-268),
[correction and scoped acceptance](docs/history/iterations/251-300.md#iteration-269),
[SDK rebuild contract](docs/FREERDP_OVERRIDES.md).

New Windows/Linux native archives also pass artifact-only SPDX generation:
the approved DSP correction and exact packaged recipe/metadata hashes are
recorded without consulting an installed SDK. Historical inventory explicitly
reports absent override metadata. Full Node passes Windows 669 / 49 skips and
Linux 662 / 59 skips, zero failures. Full release/license/vulnerability review
remains open. [Artifact provenance evidence](docs/history/iterations/251-300.md#iteration-270).

The same corrected Linux native archive passes independent pinned Bookworm and
Ubuntu 24.04 runtime smoke checks: UID1000/read-only/no-network, private module /
codec origins, actual IPC pairing, heartbeat/shutdown and empty runtime. SDK,
workspace and lab files are absent. This adds current artifact evidence while
fresh distro source builds, service/installer/CI and RDP/device/load gates stay
open. [Independent runtime evidence](docs/history/iterations/251-300.md#iteration-271).

A separate Ubuntu GCC 12.4 SDK now also instruments FreeRDP/WinPR themselves
with ASan/UBSan. All 390 compile commands carry instrumentation; linked bridge
verbose CTest passes 31/31, codec/module probe passes and full Node passes
633 / 84 profile/platform skips, zero failures. Standard PIE/default sanitizer
settings and ordinary parent Node remain; addon OFF. Private codec/crypto
instrumentation, the upstream test/fuzz suite and wider distro/CI/RDP/device /
resource gates remain open. [Instrumented SDK evidence](docs/history/iterations/251-300.md#iteration-272).

Bundled Linux CI now explicitly selects GCC/G++ 12 for dependencies, SDK and
worker instead of the runner default, with a separate compiler-profile cache
key. Actual local environment-selection/C++20 probing passes; GitHub execution
remains unrun. [Prepared workflow evidence](docs/history/iterations/251-300.md#iteration-273).

The local GCC 12.4 instrumented SDK profile additionally uses rebuilt ASan/UBSan
Opus 1.6.1. Shared-library origin, bridge CTest 31/31 and full Node 633 / 84 skips
pass. Four own Opus cases pass initially; the 100-million-iteration extensions
case first times out, then passes unchanged with the same seed and a finite
longer deadline. Other dependency/addon/platform/fuzz/CI and connected audio /
resource gates remain open. [Evidence](docs/history/iterations/251-300.md#iteration-274).

## Implementation status — 2026-10-15

Linux API/private-native service runtime now passes independent non-root /
read-only/no-network HTTP, default authorization refusal and synthetic host /
native lifecycle/cleanup. Production Node deployment retains pinned versions
and excludes source/devDependencies. The final runtime image is built; fresh
source/distro/CI, installers and actual RDP/device/load gates remain open.
[Iteration 211](docs/history/iterations/201-250.md#iteration-211), [current runtime/SBOM](docs/history/iterations/201-250.md#iteration-223),
[deployment](docs/CONTAINER_RUNTIME.md).

Current Linux native archive again passes the independent non-root/read-only /
no-network runtime smoke. A bounded private-stdin microphone inventory helper
is available without physical capture or sample submission. The earlier host
TCP timeout/RDP_CONNECT_TIMEOUT is retained in [Iteration 210](docs/history/iterations/201-250.md#iteration-210).
Restored XRDP now passes twelve actual input/output/carrier combinations with
heartbeat, 1080p JPEG and empty-runtime cleanup. Input remains waiting at epoch
0, so ready AUDIN/recording remains open. [Current evidence](docs/history/iterations/201-250.md#iteration-218).

Guarded Linux virtual PCM/Opus microphone selection now follows the existing
typed HELLO/CLI/Node/public capability contract. Twelve actual process/TLS cases
cover both IPC carriers and all input/output combinations; focused microphone
tests pass 46/46. This verifies activation/refusal/cleanup without physical
capture; ready AUDIN/recording/LAN acceptance remains open.
[Iteration 209](docs/history/iterations/201-250.md#iteration-209).

Actual Linux producer / Windows Edge now passes PCM/Opus packet decode and
AudioWorklet sample rendering with the 200 ms native profile, video resize /
restoration and fresh-token replay. Opus replay observes one actual scheduled
native reset and source epoch 8→10. First Opus admission attempt failed; repeats
pass. This is the named E2E smoke, not human audible/latency/quality/soak or all
audio-stage acceptance. [Iteration 208](docs/history/iterations/201-250.md#iteration-208).

Linux primary idle/assembly deadline separation now has a failing-before /
passing-after socket regression, repeated idle heartbeats and Release/sanitizer
checks. Actual primary XRDP receives PCM/Opus with ready reset/fresh config/data;
one Opus protocol failure remains unexplained. Browser/audio quality, latency and
resource/soak acceptance remain open. [Iteration 207](docs/history/iterations/201-250.md#iteration-207).

Guarded Linux amd64 PCM/Opus output, native reset and 120/200 ms selection are
activated through the primary and framed priority writers. Eight native/TLS
profile cases and full Node/native/relocation/independent archive checks pass.
Actual XRDP receives Formats but Linux has no samples yet, including one
RDP_PROTOCOL_ERROR; the Windows control receives active Opus. Linux source /
browser/audio acceptance remains open pending negotiation diagnosis.
[Iteration 205](docs/history/iterations/201-250.md#iteration-205).

Actual Linux producer/API/primary IPC now renders XRDP in Windows Edge through
both H.264/WebCodecs and JPEG/canvas. Nonblank 1080p, public confirmed resize /
restoration with fresh configs/IDRs and fresh-token reattachment replay pass;
joined server/worker cleanup leaves an empty runtime. This adds the named browser
smoke, not a Linux-browser/platform/audio or sustained resource gate.
[Iteration 202](docs/history/iterations/201-250.md#iteration-202).

Controlled actual Linux/XRDP loss now passes after real media and resize in both
primary and explicit framed IPC: exact RDP_DISCONNECTED, continued heartbeat and
empty-runtime/relay cleanup. This accepts the named private connected loss case;
remote held-input/device release, browser failure state, reconnect and sustained
resource acceptance remain open. [Iteration 203](docs/history/iterations/201-250.md#iteration-203).

Actual Linux amd64/XRDP now passes strict certificate rejection and the previously
approved session-only fingerprint over automatically selected primary IPC.
1920×1080 JPEG/H.264 IDR, confirmed 1280×720 resize/restoration with fresh IDRs,
heartbeat and empty-runtime cleanup pass. This is private Node/native RDP
integration; browser, audio/devices and sustained resource/soak acceptance remain
open. [Iteration 201](docs/history/iterations/201-250.md#iteration-201). Earlier Linux build-only statements
below describe their historical evidence and are superseded only for this slice.

Current IPC evidence: Linux automatically selects paired private RWS1
SOCK_SEQPACKET and keeps explicit/legacy framed fallback. Actual Node/native
100-worker lifecycles, parent/worker death, cancellation, independent deadlines,
private settings/secret, descriptor joins and installed/independent archive checks
pass. Full Node: Windows 537 passed / 25 platform skips; Linux 487 passed / 75
platform skips, 562 cases, zero failures. [Iteration 200](docs/history/iterations/151-200.md#iteration-200).
This completes the named Release transport component, not all Stage 1:
configured-capacity admission, addon sanitizer baseline, broader isolation /
abnormal cleanup and connected-RDP/resource gates remain explicitly open.

Lifecycle and the Stage 2 fake-backend gate are verified on **Windows x64**.
Actual Linux amd64 foundation now passes ASan/UBSan CTest 8/8, seven bounded
libFuzzer smoke targets and Node check (439 passed / 83 skipped / zero failures).
One hundred sequential workers and parent-death cleanup pass on Linux framed
pipes. Windows Node check passes 522/522. The local sanitizer placement workaround,
retained failed PIE runs and platform boundaries are recorded in
[iteration 184](docs/history/iterations/151-200.md#iteration-184); no linked Linux RDP/device acceptance is claimed.
Linked Linux Release FreeRDP/worker now passes CTest 20/20 and full Node check
(453 passed / 75 skipped / zero failures, 528 total). Private eudev/libusb and
complete staged ELF closure pass; canonical relocation passes 1/1. Windows Node
check passes 528/528. [Current closure evidence](docs/history/iterations/151-200.md#iteration-189),
[build evidence](docs/history/iterations/151-200.md#iteration-187). No actual Linux RDP/device
acceptance or clean-machine portability is claimed.
The experimental Stage 3 core has connected to the authorized XRDP lab. Stage 4
now renders real 1080p XRDP through H.264/WebCodecs and the JPEG fallback in Edge.
Stages 0/1/3/4/5/6 remain **IN PROGRESS**. Physical input and release ownership are
implemented and tested with native/fake/Edge fixtures; actual XRDP input is verified
for motion only. Independent cursor extraction/overlay and XRDP shape replay are
verified; broader cursor gates, Unicode/IME, audio, platforms and devices remain open.
Stage 6 has guarded static RDPSND PCM/Opus worker activation, public media
negotiation and gesture/decoder/Worklet admission ownership on Windows. Actual
linked channel data tests use simulated SVC transport; browser PCM fixtures use
synthetic samples and Opus fixtures use the pinned SDK. Active actual XRDP now
delivers PCM and Opus through Node and browser Worklet admission after padded
Training, identical format-table and large-callback corrections. Frequent epoch
changes and large-burst discard remain quality gaps. Private ready-source reset
passes for both codecs on this lab. The user hears Opus but reports interruptions;
uninterrupted audio, broader recovery, microphone and
latency/resource/platform acceptance remain open.
[Actual source evidence](docs/history/iterations/151-200.md#iteration-175).
The user accepts current Opus output quality for local development: the explicit
200 ms profile sounds smoother, with remaining interruptions. A slow tunnel is
the user's hypothesis, not a measured cause. Native 120/200 ms selection, actual
PCM/Opus reception and ready reset pass; uninterrupted quality, measured latency
and the remaining audio gates are not waived. [ADR-012](docs/adr/ADR-012-audio-compatibility-buffer.md),
[current evidence](docs/history/iterations/151-200.md#iteration-179).

Microphone foundations now include private Windows worker dispatch/reset,
bounded Node ingress and exclusive control/media session ownership. Restored
XRDP private off/PCM/Opus output combinations pass waiting-source inventory;
ready input, native selection/permission/capture and remote microphone acceptance
remain open. [Current session ownership](docs/MICROPHONE_SESSION.md),
[actual XRDP inventory](docs/history/iterations/101-150.md#iteration-115).
Explicit PCM microphone media routing is verified over actual loopback sockets
with fake RDP backends; this is separate from capture/RDP acceptance.
An isolated browser PCM sender now enforces local permission tokens, one issued
ACK correlation and one expiring latest unsent block. Capture/device ownership
and viewer activation remain open. [Sender contract](docs/MICROPHONE_SENDER.md).

Current explicit PCM/Opus microphone viewer, permission/Worklet/client and typed
native selection are implemented and verified with synthetic browser/socket
fixtures. Iteration 144 supersedes historical unactivated/PCM-only descriptions
below; actual authorized XRDP selection still reports waiting epoch 0 with no
capture. Ready AUDIN/device/recording/LAN/platform acceptance remains open.
[Current viewer](docs/history/iterations/101-150.md#iteration-144).

- **DONE:** strict pnpm workspace, CMake/Ninja C++20 worker, bounded RWI1 framing, HELLO,
  heartbeat/watchdog, graceful/forced shutdown, crash isolation and private-directory cleanup.
- **DONE:** initial TypeBox configuration contract and recursive redaction; real worker-backed
  build/capability REST endpoints; reusable Node worker API and lifecycle example.
- **Evidence:** [Node integration tests](tests/integration/worker.test.mjs),
  [protocol tests](tests/unit/protocol.test.mjs), [configuration tests](tests/unit/config.test.mjs),
  [native tests](native/ipc/tests.cpp). Latest bundled Windows `pnpm check`:
  **528/528**. Bounded browser fixture ports resolve the random 2049 refusal;
  focused Edge/socket 6/6 and full repeat pass. Earlier failures are preserved in
  [iteration 186](docs/history/iterations/151-200.md#iteration-186) and [iteration 188](docs/history/iterations/151-200.md#iteration-188).
  Recorded native assertion baseline: 72 IPC/input/state/audio-codec/output/capture cases / 61,347 assertions, 2 AVC cases / 19 assertions,
  2 cursor conversion cases / 11 assertions, 2 JPEG cases / 26 assertions and
  5 H.264 cases / 224 assertions. Dirty state adds 4 cases / 696 assertions;
  public GDI integration adds 5 cases / 9,199 assertions; GFX public callback fixtures
  add 7 cases / 27,160 assertions (combined GDI/GFX: 12 / 36,359), including
  actual incoming AVC420 decoder callbacks and malformed-command guards.
  [Cursor block evidence](docs/history/iterations/001-050.md#iteration-012), [dirty tracking evidence](docs/history/iterations/001-050.md#iteration-013),
  [GFX binding evidence](docs/history/iterations/001-050.md#iteration-014), [incoming AVC420 evidence](docs/history/iterations/001-050.md#iteration-015).
  GFX implementation commit: `90285bb`.
  Incoming AVC420 and incremental build corrections: `d5b1a0a`.
  [Quality/FPS profile evidence](docs/history/iterations/001-050.md#iteration-016): actual XRDP H.264/reset
  and JPEG report a configured 5 FPS cap; direct native capture intervals stay
  above 200 ms independently of Node pacing. Broader performance/soak gates remain open.
  Quality/FPS implementation commit: `bd8659b`.
  [Native Display Control foundation](docs/history/iterations/001-050.md#iteration-017): 8 cases / 280 assertions
  cover caps, layout bounds, pending/observed state, timeout and teardown. Actual public
  GDI realloc and resized AVC/JPEG decoding pass; public browser requests remain
  open. Windows foundation helper correction: `d295264`.
  Native Display Control/resize implementation commit: `4cc44d2`.
  [Private Display Control IPC evidence](docs/history/iterations/001-050.md#iteration-018): opt-in/capability,
  bounded request/result correlation, observed display generations and Node supervision pass.
  Actual XRDP negotiated caps, accepted 1920×1080 → 1280×720 → 1920×1080 and delivered
  fresh AVC IDRs plus resized JPEG. Public browser resize/lease/media ownership remains open.
  Private Display Control IPC implementation commit: `098ddab`.
  [Public Display Control/browser evidence](docs/history/iterations/001-050.md#iteration-019): current control-lease
  resize, typed results, actual display replay, input pause, media epoch/ACK preservation,
  same-size reset and stale unsent-frame rejection pass native/fake/Edge checks.
  Actual XRDP browser resize/restoration passes in H.264 and JPEG; Windows-server,
  resource limits and soak acceptance remain open. Broader display layouts are
  excluded from current scope by ADR-011.
  Public Display Control/browser implementation commit: `78fbb67`.
  [Modifier/focus synchronization evidence](docs/history/iterations/001-050.md#iteration-020): eight new pure /
  Edge-fake cases verify bounded modifier recovery, observed physical sides,
  lock ordering, composition and reset during a resize pause. Native tracking
  preserves both modifier sides across synchronize calls. Actual remote keyboard /
  layouts remain unverified; no broader input acceptance is claimed.
  Modifier/focus synchronization implementation commit: `236f1a1`.
  [Committed Unicode/IME fallback evidence](docs/history/iterations/001-050.md#iteration-021): bounded UTF-16BE,
  server capability refusal, old-peer gating, ordered Unicode down/up and release
  retry, text-rate budget and Edge preedit/explicit submission pass fixtures.
  Actual remote text/OS IME and direct canvas IME remain open.
  Committed Unicode/IME fallback implementation commit: `60e3ee4`.
  [Fractional wheel evidence](docs/history/iterations/001-050.md#iteration-022): bounded per-axis DOM
  pixel/line/page accumulation, gesture context/idle/reset handling and Edge
  ordering pass. Real wheel/trackpad sensitivity acceptance remains open.
  Fractional wheel implementation commit: `c5d9ec3`.
  [Native touch foundation evidence](docs/history/iterations/001-050.md#iteration-023): ten-contact bounded
  state, correct terminal coordinate ordering, API failure/cleanup ownership and
  public RDPEI projection pass 10 state cases / 13,114 assertions and 9 RDPEI cases /
  370 assertions. Five RDPEI cases use the actual linked addin with fake DVC
  transport; they are not remote touch acceptance. Worker suspension/contact
  cleanup, IPC/control, browser capture and real touch integration remain open.
  Native touch foundation implementation commit: `69e1717`.
- [Observable RDPEI transport evidence](docs/history/iterations/001-050.md#iteration-024): public-DVC
  SC_READY/CS_READY completion and periodic-frame suspension gate pass native
  tests. RDPEI suite now has 23 cases / 9,789 assertions, including ten actual-addin
  cases with fake transport. Transport resume is separate from contact/lease
  readiness; plugin/worker activation and end-to-end touch remain open.
  RDPEI transport gate implementation commit: `fb8643f`.
- [Public RDPEI ownership evidence](docs/history/iterations/001-050.md#iteration-025): pinned static addin
  registration, wrapped listener/gate, partial creation cleanup and lifecycle
  tests pass. RDPEI now has 34 cases / 10,127 assertions, including fourteen
  actual-addin/fake-DVC cases. Connection/contact drain, private IPC/browser and
  actual remote/physical touch remain open; no touch capability is advertised.
  Public RDPEI registration implementation commit: `af8b99e`.
- [Terminal contact drain evidence](docs/history/iterations/001-050.md#iteration-026): ten native/external
  contact pairs remain owned until terminal transport writes. Suspended native
  UP records survive periodic consumption, then drain before input readiness;
  resume-before-pump, reset, write/deadline failure and bounded parser cases pass.
  RDPEI has 51 cases / 12,314 assertions, including twenty-three actual-addin/fake
  transport cases. Timestamp-remoting/v1.0 compatibility and worker/IPC/browser
  activation remain open.
  Terminal contact drain implementation commit: `d38afe1`.
- [Scoped RDPEI provider/lifetime evidence](docs/history/iterations/001-050.md#iteration-027): Connection binds
  a public provider on the RDP thread after context creation, retires delegated
  resources before joining, and preserves the wrapper for later host termination.
  Other channels retain their previous provider. Touch loading/capability stays
  disabled until IPC/control/browser dispatch; actual remote RDPEI remains open.
  RDPEI: 62 cases / 12,612 assertions; bundled CTest 10/10, foundation 4/4,
  Node 124/124 and actual XRDP H.264 reset/resize/restoration pass.
  Scoped RDPEI provider/lifetime implementation commit: `1072e58`.
- [Bounded touch IPC codec evidence](docs/history/iterations/001-050.md#iteration-028): separate fixed
  versioned 16-byte record validates in native/TypeScript before body allocation.
  Portable touch is 14 cases / 14,182 assertions; current workers explicitly refuse
  dispatch and advertise no touch capability. Worker/control/browser wiring and
  remote touch acceptance remain open.
  Bundled Node 129/129, CTest 10/10, foundation CTest 4/4 and relocation 1/1 pass.
  Bounded touch IPC codec implementation commit: `156b5d4`.
  The 100 sequential worker test passes with no processes or
  runtime directories leaked. MSVC /analyze, /W4 /WX and clang-format checks pass.
- **Commits:** `9517003` build, `1672590` IPC/native lifecycle, `3610524` configuration,
  `316cdc0` Node supervisor/API/integration. Original blueprint is preserved in `3065f2d`.
- **Recent input commits:** private touch dispatch `6a34e2f`, public controller/browser `06b2527`, actual
  readiness/replay `1f73a98`, honest pen placeholder `26688c5`, terminal cleanup
  ordering `ff5fcdf`. [Current touch evidence](docs/history/iterations/001-050.md#iteration-031).
- **DONE on Windows:** exact FreeRDP/WinPR 3.32.1, local ZLIB 1.3.2, OpenSSL 3.6.5 and libusb
  1.0.30 build and link. Private native ZIP contains runtime DLLs, release CRT, licenses and
  dependency metadata. Relocation test checks actual loaded ZLIB/FreeRDP paths and static
  channel inventory without dependency PATH. JPEG now also ships privately and is encoded/decoded
  in the relocated runtime probe. OpenH264 encoding, AVCC and FreeRDP AVC420 decoding are verified natively.
  Current native ZIP is approximately 6.0 MiB, 14.9 MiB installed (47 files),
  including the private Opus runtime and excluding Node.js and future hardware
  providers/installers. Measured archive: 6,266,183 bytes; installed files:
  15,621,256 bytes. Earlier footprints remain in their historical reports.
  [Iteration 5](docs/history/iterations/001-050.md#iteration-005), [iteration 6](docs/history/iterations/001-050.md#iteration-006).
  Implementation commits: `7757d44`, `b1c779d`; local lab helper: `55e22cc`.
- **Retained acceptance:** Windows RDP access is restored; current endpoint and
  application evidence are summarized in [lab status](docs/LAB_STATUS.md), with
  a current verification limitation in [iteration 332](docs/history/iterations/301-350.md#iteration-332).
  Historical XRDP results retain their original server scope and include strict
  certificate rejection, approved session-only trust, activation, heartbeat
  and cleanup. [Iteration 4](docs/history/iterations/001-050.md#iteration-004) records the historical
  absent-Linux scope; primary Linux IPC is implemented and verified in
  [iteration 200](docs/history/iterations/151-200.md#iteration-200). Actual Linux RDP/device, broader
  platform/resource gates and CI execution remain open; local sanitizer/fuzz
  execution does not establish CI or linked Linux integration acceptance.
  [Documentation correction](docs/history/iterations/301-350.md#iteration-336).

Wire details: [IPC foundation](docs/IPC_FOUNDATION.md). Audit and iteration report:
[contract audit](docs/CONTRACT_AUDIT.md), [iteration 1](docs/history/iterations/001-050.md#iteration-001), [iteration 2](docs/history/iterations/001-050.md#iteration-002).

## Stage 0 — repository and reproducible build

- [x] DONE for current local GCC 12 foundation/Node source regression — Fresh
  complete tracked snapshot of `6415d9c`, frozen offline Node 24.21.0/pnpm
  installation and new GCC 12.4 Debug foundation pass CTest 18/18, framed
  lifecycle 15 / one absent-primary skip and Node 766 / 178 profile/platform
  skips. All 1,320 archived files and lockfile remain unchanged; no worker
  remains. The final Docker receipt-copy error is retained; its stdout receipt
  is recovered with explicit provenance and corrected export passes a separate
  control. Temporary containers are removed. This is not current linked Linux
  FreeRDP/RDP or wider Stage 0 acceptance. [Evidence](docs/history/iterations/351-400.md#iteration-389).

- [x] DONE for Windows clean-foundation output hashes — New source-only
  receipts bind worker/helper bytes after source/profile/native/lifecycle
  checks, with the existing streamed 64 MiB bound and complete-map publication.
  Known digests, exact/over-limit and missing output controls pass; actual new
  MSVC Debug CTest 17/17, lifecycle 16 / one skip and full Node 813 / 102 skips
  pass. Historical receipts and linked inventories are preserved. Actual Linux
  writer/distro/CI, deterministic outputs and wider gates remain open.
  [Evidence](docs/history/iterations/351-400.md#iteration-381).

- [x] DONE for current Windows foundation host-resource profile — New offline
  source-only MSVC Debug output has identical native source bytes to linked
  Debug, reports host batching with null FreeRDP and no connect capability,
  and starts no resource policy by default. CTest 17/17, resource integration
  12/12 and full Node 809 / 102 skips pass. SDK codec tests use actual linkage,
  with linked 4/4 controls; prelaunch staging expiry/cancellation passes too.
  Release, pins, other-platform/CI/connected/load and wider gates stay open.
  [Evidence](docs/history/iterations/351-400.md#iteration-380).

- [x] DONE for current full workspace regression — With Node 24.21.0 correctly first in the child-process PATH, `pnpm check` passes build, lint, format and Node **748 passed / 101 skipped / 0 failed**. Bundled native CTest passes **29/29** through the project's temporary `R:` workspace alias; no CMake reconfiguration or Release change was made. [Evidence](docs/history/iterations/301-350.md#iteration-347).

- [x] DONE for manual WEB harness source-worker selection — The Windows
  reference harness optionally selects a linked source build by verified
  receipt and worker/helper hashes; no option retains the bundled default.
  Unit/receipt coverage, full Windows `pnpm check` (742 passed / 101
  platform/profile skips) and source-selected headless Edge startup/cleanup
  pass without creating an RDP session. A first full run retained an
  intermittent resource-capacity deadline failure; the standalone control and
  full repeat pass, so broader resource/load acceptance stays open.
  [Evidence](docs/history/iterations/301-350.md#iteration-330).

- [x] DONE for symmetric Windows SDK/consumer CRT admission and current isolated
  Release consumer — Release rejects a Debug SDK before preparing output;
  historical Release receipts retain compatibility with a matching actual cache.
  A new source-only Release output uses unchanged existing Release flags, pinned
  SDK/dependency receipts and identical native source bytes to the Debug control.
  CTest 31/31, process/TLS 27 / 1 skip, resource focus 27/27 and full Windows
  Node 741 / 51 skips pass. Common Linux checks and existing foundation CTest
  17/17 / Node 644 / 151 skips pass. Codec/module origins and copied DLL bytes
  match; seven pre-existing Release/pin inputs retain their hashes. Connected
  RDP/resource, production packaging and wider stage gates remain open.
  [Evidence](docs/history/iterations/301-350.md#iteration-313).

- [x] DONE for local Windows isolated linked Debug SDK/consumer — Additive
  source-only Debug profiles pair FreeRDP/WinPR and worker with matching dynamic
  Debug CRT; mixed Release-CRT SDK/Debug consumer now refuses before output.
  The retained mixed-profile DVC timeout passes unchanged after matching CRT.
  SDK probe CTest 1/1, bridge CTest 31/31, process/TLS 27 / 1 skip, resource
  focus 27/27 and full Windows Node 740 / 51 skips pass. Common profile checks
  and existing Linux foundation CTest 17/17 / Node 643 / 151 skips also pass.
  Source/dependency receipts, actual compiler/build type and module/codec origins
  are verified; seven pre-existing Release/pin inputs retain their hashes.
  Existing Release modes/configuration and dependency versions are unchanged.
  Private dependency Debug/sanitizer, Debug CRT packaging, new Linux linked SDK,
  RDP/device/CI and full stage gates remain open. [Evidence](docs/history/iterations/301-350.md#iteration-312).

- [x] DONE for clean-native compiler provenance — New receipts bind the actual
  CMake version, compiler ID/version/path, Ninja generator
  and verified build type. Four unit cases and actual Clang/GNU reply probes
  pass. New GCC 13 Debug CTest 16/16, lifecycle 15 / 1 skip, full Node 578 / 147
  skips and new MSVC Debug CTest 15/15, lifecycle 16 / 1 skip pass; full Windows
  Node 632 / 90 skips also passes. Both native receipts bind identical source
  bytes. Release settings, pins and GNU minimum 12 are unchanged; broader gates
  remain open. [Evidence](docs/history/iterations/251-300.md#iteration-289); `911bb21`.

- [x] DONE for current local Clang 18 Debug source export — Complete tracked
  archive of `3534484`, frozen offline Node installation and fresh native-only
  foundation compilation pass CTest 16/16, framed lifecycle 15 / 1 skip and full
  Node 574 / 147 platform/profile skips / 721 total. All 1,107 archived files
  remain byte-identical; no old objects, SDK or lab files are copied. Prepared
  compiler/Catch2/public caches are reused. GNU minimum 12, Release, dependency
  pins and wider distro/CI/RDP/device gates remain unchanged.
  [Evidence](docs/history/iterations/251-300.md#iteration-288); `ffa0959`.

- [x] DONE for incremental libusb test-copy preparation — CMake tracks the
  test-only patch as a configure dependency. A private-copy build regression
  fails before the correction and passes patch edit/restore/incremental builds
  with GCC 12 and Clang 18; full standalone CTest 4/4 each and repeated focused
  CTest 1/1 each pass. Original sources, Release and dependency pins stay
  unchanged. This closes one reproducibility detail, not the Stage 0 gate.
  [Evidence](docs/history/iterations/251-300.md#iteration-287); `3534484`.

- [x] DONE for isolated libusb descriptor cleanup regression — A retained
  40-byte LSan leak reproduces with GCC 12 before correction. Exact test-only
  build-copy cleanup passes GCC/Clang CTest 3/3 each, original-input replay and
  two 100,000-run ASan/UBSan/libFuzzer smokes without new errors. Original
  sources and Release remain unchanged; production libusb still has the known
  cleanup gap. Shared-backend/eudev, production adoption and wider gates stay
  open. [Evidence](docs/history/iterations/251-300.md#iteration-286); `5427e70`.

- [x] DONE for bounded local GCC 12 libusb descriptor seed replay — Separate
  pinned 1.0.30 device-free parser fixture passes 105 BOS value checks and 150
  deterministic inputs through two unchanged upstream harnesses; standalone
  CTest 2/2, source/hash-refusal audits, linked control CTest 31/31 and full Node
  633 / 84 skips pass. The next Clang fuzz attempt exposes a retained 40-byte
  cleanup leak beyond this corpus; the isolated correction above supersedes
  only this test slice. Full parser/backend/eudev/platform/CI/device acceptance
  remains open. Release is unchanged. [Evidence](docs/history/iterations/251-300.md#iteration-285).

- [x] DONE for local experimental OpenSSL shared sanitizer runtime slice —
  Separate pinned 3.6.5 C-only/no-module Debug ASan/UBSan profile, without RPATH,
  passes 4 upstream recipes / 211 top-level tests, exact source/shared/static
  hash audit, safe runtime transfer and actual SSL/crypto origins. Linked native
  CTest 31/31 and full Node 633 / 84 skips pass with unchanged worker/Release.
  The recommended static baseline stays separate; full production OpenSSL
  features/modules/assembly, remaining dependencies/addon/platform/CI and RDP
  gates remain open. [Evidence](docs/history/iterations/251-300.md#iteration-284).

- [x] DONE for selected local GCC 12 OpenSSL static sanitizer cases — Pinned
  3.6.5 follows upstream no-shared/PEDANTIC sanitizer recommendations in a
  separate no-asm Debug output. Focused ASN.1 2 recipes and selected 10 recipes /
  15 top-level tests pass without sanitizer diagnostics; exact source/backup
  audit passes. Four additional X.509 recipes / 220 top-level tests pass with
  unchanged hashes and no sanitizer diagnostics. Prior failed harness/audit
  runs are retained. [Certificate evidence](docs/history/iterations/251-300.md#iteration-282). Three local
  SSL context/config/memory-BIO recipes and all 13 available buffer variants also
  pass. [Memory SSL evidence](docs/history/iterations/251-300.md#iteration-283). Full production shared
  OpenSSL selection, full algorithms/TLS/upstream/fuzz/platform/CI and remaining
  dependency/addon acceptance stay open. [Evidence](docs/history/iterations/251-300.md#iteration-281).

- [x] DONE for local GCC 12 shared JPEG upstream sanitizer profile — Independent
  pinned libjpeg-turbo 3.2.0 Debug build, instrumented private libspng/ZLIB,
  292 instrumented C commands and focused 3/3 / full upstream CTest 332/332 pass.
  Exact commands/dependencies are preserved with native/tool loader separation;
  post-test source audit matches only existing port patches. Focused C fallback,
  actual module origins, linked CTest 31/31 and full Node 633 / 84 skips pass.
  Release is unchanged.
  Assembly instrumentation, longer fuzz, remaining dependencies/addon/platform/CI
  and RDP/resource gates remain open. [Evidence](docs/history/iterations/251-300.md#iteration-280).

- [x] DONE for local GCC 12 libspng PNG sanitizer slice — Separate pinned 0.7.4
  shared build and both fixture translation units carry ASan/UBSan. Eight
  whole/progressive/Adam7 RGBA8 roundtrips, output/image/truncation bounds and
  202-file / 2,424-input upstream read replay pass standalone CTest 2/2.
  Private instrumented libspng/ZLIB origins and unknown-harness refusal pass.
  Linked CTest 31/31 and full Node 633 / 84 skips pass; Release is unchanged.
  Full libpng comparison, write/long fuzz, remaining
  dependencies/addon/platform/CI and RDP gates stay open.
  [Evidence](docs/history/iterations/251-300.md#iteration-279).

- [x] DONE for local GCC 12 static ZLIB sanitizer cases — All 19 compile commands,
  including upstream infcover, carry ASan/UBSan with nonrecovering UB checks.
  Four focused static/coverage cases and full CTest 16/16 pass, with matching
  gcov 12, unchanged source/assertions and no new sanitizer diagnostic.
  The prior shared runtime/Release remains unchanged. Broader dependency/addon,
  upstream/fuzz/platform/CI and RDP gates remain open.
  [Evidence](docs/history/iterations/251-300.md#iteration-278).

- [x] DONE for local GCC 12 instrumented ZLIB runtime profile — Pinned 1.3.2
  source/port correction, all 18 compile commands, actual ASan/UBSan NEEDED entries,
  upstream CTest 14/14 and linked module/codec origins pass. Thirty instrumented
  native executables plus compiler-policy CMake pass 31/31; full Node passes
  633 / 84 profile/platform skips with ordinary parent Node and addon OFF.
  Release is unchanged. Remaining dependency/addon/static/upstream/fuzz/platform/
  CI and actual RDP gates stay open. [Evidence](docs/history/iterations/251-300.md#iteration-277).

- [x] DONE for local OpenH264 BsFlush correction/instrumented runtime — Exact upstream
  build-copy guard skips the undefined shift in the valid empty state. GCC 12.4
  UBSan fails before and passes 2325 checks after; unknown input is refused and
  original source/diagnostics are preserved. Corrected shared-library origin,
  six codec suites, full native CTest 31/31 and Node 633 / 84 skips pass with
  instrumented FreeRDP/WinPR/Opus. Release remains unchanged. Assembly, remaining
  private dependencies/addon, platform/upstream/CI and actual RDP gates stay open.
  [Evidence](docs/history/iterations/251-300.md#iteration-275).

- [x] DONE for local GCC 12 instrumented SDK / bridge fixture profile — Separate
  pinned FreeRDP/WinPR + approved DSP correction compiles with ASan/UBSan;
  actual SDK runtime dependencies, bridge PIE, verbose CTest 31/31, codec probe
  and full Node 633 / 84 skips pass under the restricted Ubuntu fixture.
  Private dependency/addon instrumentation, upstream tests/fuzz and actual
  RDP/device/platform/CI gates remain separate. [Evidence](docs/history/iterations/251-300.md#iteration-272).

- [x] DONE for pinned DSP reset ownership / local linked bridge sanitizer slice —
  Exact-source build-copy correction releases previous Opus state; bounded source
  and SDK provenance guards, failing-before/passing-after public regression,
  Windows/Linux SDK rebuilds, native/Node suites and installed relocation pass.
  Ubuntu GCC 12 default PIE ASan/UBSan covers bridge-owned linked code against
  uninstrumented private FreeRDP/codecs; addon OFF. Upstream/addon sanitizers,
  actual RDP/audio/device and broader resource/CI gates remain separate.
  [Evidence](docs/history/iterations/251-300.md#iteration-269), [build contract](docs/FREERDP_OVERRIDES.md).

- [x] DONE for Windows native-driver Node path ownership — Physical Node project,
  test and binary paths preserve ESM error identity across SUBST/pnpm junctions;
  CMake/SDK receipt aliases remain bound. Actual new linked consumer passes
  CTest 30/30 and process/TLS/identity 27 / 1 skip. Full Windows 664 / 49 skips
  and Linux GNU 12.2 657 / 59 skips pass. This is a local driver correction;
  actual CI and broader platform/resource acceptance remain open.
  [Evidence](docs/history/iterations/251-300.md#iteration-266).

- [x] DONE for complete tracked-source Windows project export — New archive
  fixture has no prior build/dist/node_modules/.deps/lab files; frozen offline
  install, new Release build, CTest 30/30, full Node 663 / 49 skips / 712,
  install/relocation 1/1 and production deploy/import pass. Lockfile and external
  source-built SDK/dependency receipts stay unchanged. Prepared tools/Catch2 and
  public caches are reused; fresh OS/distro/CI and linked/upstream sanitizer
  acceptance remain open. Alias-induced duplicate ESM identity and the passing
  physical-path correction are retained. [Evidence](docs/history/iterations/251-300.md#iteration-265).

- [x] DONE for local GNU 12 compiler baseline — Explicit GNU >=12 admission and
  actual C++20 library probe, policy boundary CTest, new GNU 12.2 linked source
  build (CTest 31/31, process/TLS 40/40, full Node 657 / 58 skips / 715) and MSVC
  probe/foundation 15/15 pass. The user's GCC 12 fallback retains C++20; GCC 8
  requires a separate compatibility port and is unsupported. Explicit GCC 12 CI
  entry is prepared, not executed. [Support](docs/COMPILER_SUPPORT.md),
  [evidence](docs/history/iterations/251-300.md#iteration-263).

- [x] DONE for local Ubuntu standard PIE sanitizer foundation — GCC 12.4 / GCC 13
  ASan/UBSan CTest 16/16 and 15/15, honest worker CLI and actual PIE ELF identity pass under
  UID1000/read-only/no-network with bounded executable build tmpfs. GCC/Clang
  empty PIE sanitizer programs each pass 100 launches with default options.
  No ASLR/seccomp or non-PIE workaround is used. Eleven Clang 18 seeded PIE fuzz
  targets pass bounded 20-second / 512 MiB smokes; the local external symbolizer
  remains unavailable. The GCC 12 minimum and addon/upstream/exhaustive-fuzz/CI
  boundaries remain; prior Bookworm failures are retained.
  [GCC 12 and fuzz](docs/history/iterations/251-300.md#iteration-264), [earlier profile](docs/history/iterations/251-300.md#iteration-262).

- [x] DONE for complete tracked-source Linux project export — New git archive
  fixture begins without build/dist/node_modules/.deps/lab files, performs frozen
  offline Node installation, native CTest 30/30, full Node 656 passed / 58 skips /
  714, install/ELF closure, relocation and production deploy/import. Lockfile and
  external source-built SDK/dependency receipts remain unchanged. Prepared build
  tools/Catch2/public caches are reused; new OS/toolchain/distro, Windows export,
  network checkout/download, CI and sanitizer acceptance remain separate.
  [Evidence](docs/history/iterations/251-300.md#iteration-260).

- [x] DONE for current source-built native packages — New Linux TGZ and Windows
  ZIP install the exact pinned-source license and generated feature report.
  Windows relocation 1/1 and Linux ELF closure (34 files / 274 edges), independent
  non-root/read-only/no-network Bookworm and Ubuntu 24.04 codec/module/IPC/
  cleanup smokes pass. This is native artifact runtime evidence; Ubuntu source
  compilation, complete fresh checkout/distro/CI, full service images/installers
  and actual RDP/device acceptance remain open.
  [Packaging](docs/history/iterations/251-300.md#iteration-258), [Ubuntu runtime](docs/history/iterations/251-300.md#iteration-259).

- [x] DONE for local Windows cached-source native chain — Fourteen dependency
  packages, a new pinned SDK and a new source-only worker consume unchanged bound
  receipts and private package/module origins. SDK CTest 1/1, project 29/29 and
  process/TLS 26 passed / one skip and full Node 662 / 49 skips pass.
  Prepared tools/Catch2/source archives are
  reused. The first MSBuild access failure is retained; the authorized repeat
  passes without disabling FileTracker. Complete clean-machine/checkout/CI and
  remaining acceptance gates stay open. [Dependencies](docs/history/iterations/251-300.md#iteration-255),
  [SDK](docs/history/iterations/251-300.md#iteration-256), [consumer](docs/history/iterations/251-300.md#iteration-257).

- [x] DONE for local Linux cached-source native chain — New source-built private
  dependencies and FreeRDP feed a new source-only worker/addon with both bound
  unchanged receipts and exact CMake/loaded-library origins. SDK CTest 1/1,
  project 30/30, process/TLS 40/40, codec/context probe and full Node 656 passed /
  58 skips / 714 pass. Build tools/Catch2/source archives remain prepared inputs;
  Complete fresh checkout/distro/CI and remaining acceptance
  gates stay open. [Evidence](docs/history/iterations/251-300.md#iteration-254).

- [x] DONE for local Linux isolated private dependency source rebuild — All 20
  planned packages compile/install with new work/package/installed trees,
  disabled binary caches, no downloads/network and concurrency two. Current
  pinned recipes and 22 installed status records are bound by a checked receipt.
  Compiler/vcpkg tools and cached source archives are reused; complete fresh
  checkout/distro/CI and remaining acceptance gates stay open. The corresponding
  Windows source rebuild is now verified in iteration 255.
  [Evidence and input hashes](docs/history/iterations/251-300.md#iteration-252).

- [x] DONE for local Windows/Linux fresh project consumer of the rebuilt SDK — Another
  source-only Release worker/addon tree resolves all three CMake packages from
  the new SDK, with a bound unchanged SDK receipt. Windows/Linux CTest 29/29 and
  30/30, actual-process/synthetic-TLS Node 26 passed / one skip and 40/40 pass.
  Current full Windows check passes 660 / 49 skips / 709; Linux 654 / 58 / 712.
  Mixed/incomplete/oversized receipts refuse before build output. Private
  dependencies/toolchain/Catch2 are reused; complete fresh
  dependency/distro/CI and remaining sanitizer/runtime gates stay open.
  [Linux evidence and hashes](docs/history/iterations/201-250.md#iteration-248),
  [Windows evidence and hashes](docs/history/iterations/201-250.md#iteration-250).

- [x] DONE for local Windows/Linux isolated FreeRDP source rebuild — A new no-hardlink
  clone of the exact clean pinned checkout compiles and installs into a new SDK
  prefix. Public runtime version/static inventory, three canonical module origins,
  foreign-prefix refusal and consumer CTest 1/1 pass. Existing private dependency /
  toolchain inputs are reused; full fresh
  dependency/distro/CI and remaining sanitizer/runtime gates remain open.
  [Linux evidence and hashes](docs/history/iterations/201-250.md#iteration-247),
  [Windows evidence and hashes](docs/history/iterations/201-250.md#iteration-249).

- [x] DONE for isolated Windows/Linux linked project-native source build — New Release
  build reuses the clean pinned SDK and external Catch2/toolchain, with no copied
  project binary/object/cache. Windows/Linux CTest 29/29 and 30/30 and Node
  lifecycle 26 passed / one absent-primary skip and 40/40 pass. Source/feature /
  artifact hashes are retained. Upstream dependency/FreeRDP rebuilds, distro/CI
  and remaining sanitizer/runtime gates stay open.
  [Windows evidence](docs/history/iterations/201-250.md#iteration-246), [Linux evidence](docs/history/iterations/201-250.md#iteration-245).

- [x] DONE for isolated Windows/Linux project-native foundation source build — New
  source-only fixture has no copied binary/cache/SDK/Node dependencies or lab
  input. MSVC/GCC CTest 14/14 and 15/15 and Node framed lifecycle 15 passed /
  one absent-primary skip on each pass, with the same unchanged source hash.
  Local Catch2 source is reused; upstream dependencies/FreeRDP, linked fresh
  project build, distro/CI and remaining sanitizer gates stay open.
  [Windows/Linux evidence](docs/history/iterations/201-250.md#iteration-244), [initial Linux](docs/history/iterations/201-250.md#iteration-243).

- [x] DONE for current local foundation regression — Refreshed Windows/Linux
  foundation CTest passes 14/14 and 15/15; framed clipboard/worker lifecycle passes
  15 with one platform/absent-primary skip on each. Shared test waits now honor
  finite requested deadlines and browser port retry failures preserve their cause.
  Existing local trees/dependencies are used; fresh-checkout/distro/CI and actual
  remote/device gates remain open. [Evidence](docs/history/iterations/201-250.md#iteration-242).

- [x] DONE for clean Linux Node workspace — New source-only fixture has no dist /
  node_modules; frozen offline installation, all four TypeScript builds and fresh
  production deployment/import pass with unchanged lockfile. Native fresh-checkout
  and distro matrix remain open. [Evidence](docs/history/iterations/201-250.md#iteration-213).

- [x] DONE for independent Linux native archive smoke — Pinned Node 24 Bookworm
  verifier uses only TGZ/probe, with no SDK/system FreeRDP/libudev, UID 1000,
  read-only root, no network and bounded tmpfs. Six private loaded modules,
  codec/libudev context roundtrips, exact HELLO/heartbeat/shutdown and worker
  directory cleanup pass. Full Node service image, distro/fresh-build/installer
  gates remain separate. [Evidence](docs/history/iterations/151-200.md#iteration-190). ELF closure: `8a51dc3`.

- [x] DONE for current Linux native ELF profile — Private eudev 3.2.14 keeps
  libusb udev enabled. Pre-CPack bounded canonical dependency/origin-path checks
  pass 33 ELF files / 268 edges, plus codec/libudev-context/lifecycle relocation
  1/1. Four portable ownership/parser cases pass. Independent clean-runtime,
  fresh-checkout/CI and actual device/platform gates remain separate.
  [Evidence](docs/history/iterations/151-200.md#iteration-189). Prior linked build: `a825c18`;
  IPC exact allocation: `4152919`; browser port correction: `194562d`.

- [x] DONE for local Linux dependency compilation — Pinned private ZLIB/OpenSSL/
  libusb/JPEG/libspng/OpenH264/Opus build, plus required Linux-only Kerberos 1.22.2
  and ICU 78.3, now CUPS 2.4.20, libfuse 3.18.3 and numactl 2.0.19. Exact
  FreeRDP/worker Release build and CTest 20/20 pass; private discovery, metadata,
  licenses and codec relocation are verified. eudev closure now passes in
  iteration 189; fresh-build and actual remote/device gates remain open.
  [Build evidence](docs/history/iterations/151-200.md#iteration-187),
  [previous reboot checkpoint](docs/history/iterations/151-200.md#iteration-186).
- [x] DONE — Create pnpm monorepo layout from `STACK.md` (core packages/apps/native; future component directories are created with their implementations). `9517003`.
- [x] DONE — Add TypeScript strict config, lint/format, CI skeleton. `pnpm check`; `9517003`.
- [x] DONE — Add CMake/Ninja native workspace. MSVC x64 build + CTest; `9517003`, `1672590`.
- [x] DONE on Windows — Pin FreeRDP **3.32.1** source/build and record commit/checksum. Source commit verified as `bf217a504e54cc719880c228e82353382cd7d4fa`; libraries built locally, linked CLI reports 3.32.1, archive SHA-256 generated. [Lock metadata](native/dependencies.json), [verification](docs/history/iterations/001-050.md#iteration-002). Linux build/fresh-checkout gate remains open.
- [x] DONE for Windows/local Linux build inventory — Required client channels and filtered feature reports agree with actual public static-addin enumeration after relocation: Windows 20, Linux 22. Serial/parallel are compiled on Linux and explicitly OFF on Windows where pinned upstream lacks those clients. Runtime/device support is separately capability gated and remains Stage 8 work. [Relocation and current artifact evidence](docs/history/iterations/201-250.md#iteration-222).
- [x] DONE — Add `rdp-worker --version --capabilities`. Native CLI and handshake reports agree; absent library reported as null, RDP false. [Integration test](tests/integration/worker.test.mjs); `1672590`, `316cdc0`.
- [x] DONE — Add Node `/v1/build` backed by real worker/build information. Fastify injection + native handshake/CLI comparison; `316cdc0`.
- [x] DONE for portable local Linux verification — Add debug ASan/UBSan job and execute native foundation: CTest 8/8 in the documented non-PIE Docker environment. [Workflow](.github/workflows/ci.yml) remains prepared; actual CI and standard PIE environment acceptance are open. [Evidence](docs/history/iterations/151-200.md#iteration-184).

**Gate:** clean build from fresh checkout/container; exact FreeRDP version visible; no UI required.

## Stage 1 — native worker process and IPC

- [x] DONE for named actual OS-principal runtime privacy — A separate Windows
  LocalService task and Linux UID/GID 42421 are denied session listing, marker
  read/write, child creation, native lease and recovery against two live workers
  and an orphan owned by another OS principal. A readable-root positive control
  and Linux readable-orphan counterexample exclude permission-test false positives.
  Owner heartbeats, owner-only orphan recovery and joined PID/directory cleanup
  pass. Dedicated Windows/Linux steps pass 2/2 each; full source CI, native CTest,
  sanitizers/fuzz and exact GCC 8.3 pass. `7a17eca`, `1838a05`, `5c4ac52`.
  [Evidence and explicit limits](docs/RUNTIME_RECOVERY.md#cross-principal-acceptance).
  Same-OS-user adversaries, the broader installed-distro multi-user matrix and
  future drive/spool retention are not closed by this test-only acceptance.

- [x] DONE for verified schema-1 metadata-only runtime recovery — Independent
  Node ownership endpoints and native marker locks preserve live/uncertain
  owners. Bounded recovery removes only known orphan metadata and empty owned
  directories after simultaneous hard kill, including startup prefixes. SDK
  exports and standalone pre-listen recovery are accepted in public 0.3.0:
  native/full checks, all installed npm consumers, portable/service upgrades on
  Windows/Ubuntu/Astra/RED OS and eight real desktop profiles pass. Core changes
  `51283d1`, packaging `df95d74`, elevated Windows correction `ee78be3`.
  [Frozen archives and evidence](docs/RUNTIME_RECOVERY.md#030-local-release-acceptance).
  Feature/release and delivery repairs are merged; all ten npm archives,
  five OIDC workflows and final standalone publication/installed upgrades pass.
  [Public delivery](docs/RUNTIME_RECOVERY.md#030-public-delivery).
  Broader multi-user/isolation and future
  drive/spool retention requirements are not closed by this slice.

- [x] DONE for observed absolute backend startup deadline — One monotonic
  budget now covers invocation staging, pending startup state callbacks and
  completion. Overdue work fails with existing WORKER_START_TIMEOUT; a finished
  startup retires its deadline, preserving later progress and explicit close.
  Four failing-before controls are retained; corrected focus passes 26/26,
  composed native lifecycle 2/2, CTest 17/17 and full Windows Node 827 / 102
  skips pass. Kernel preemption, cleanup deadlines, actual RDP and broader
  platform gates remain open. [Evidence](docs/history/iterations/351-400.md#iteration-383).

- [x] DONE for host supervisor timer-range admission — Startup, graceful-close
  and forced-termination budgets refuse integer delays beyond Node's supported
  2,147,483,647 ms maximum before timer/worker creation, preserving existing
  defaults and exact-maximum admission. Three failing-before controls and
  actual Node overflow behavior are retained; corrected manager focus passes
  19/19, current native CTest 17/17 and full Windows Node 818 / 102 skips pass.
  Delayed callbacks, actual forced-deadline expiry and uncertain OS retirement
  remain open. [Evidence](docs/history/iterations/351-400.md#iteration-382).

- [x] DONE for native lifecycle fixture startup cancellation — The test-only
  registry adapter now terminates a still-starting WorkerProcess before joined
  close, matching the production adapter's existing behavior. A failing-before
  control observes an unwanted child PID; corrected Windows/Linux composed
  lifecycle suites pass 3/3 with no child spawn after synchronous startup abort.
  Production startup/Release code is unchanged; broader startup/OS/isolation
  gates remain open. [Evidence](docs/history/iterations/251-300.md#iteration-293); `876ecea`.

- [x] DONE for unconnected native registry crash isolation — Three actual
  framed worker processes use the explicit lifecycle-only registry adapter.
  Forced exit of one produces WORKER_FAILED, retires its PID/runtime and active
  slot, preserves two sibling heartbeats and permits replacement. Windows/Linux
  focused suites pass; the 40-worker capacity test still passes after fixture
  extraction. Connected RDP, simultaneous parent/worker kill, forced-deadline,
  broader resource/isolation and soak gates remain open.
  [Evidence](docs/history/iterations/251-300.md#iteration-292); `7574f63`.

- [x] DONE for configured framed native lifecycle capacity — An explicit
  test-only registry adapter composes 40 actual native workers, global limit
  40 / per-principal 20, pre-factory overflow refusal, ten-slot replacement,
  automatic/manual heartbeat and joined PID/runtime cleanup; Linux FD count
  returns to baseline. Windows/Linux focused cases, CTest 15/15 and 16/16 and
  full Node 633 / 90 skips and 579 / 147 skips pass. No RDP connection is made.
  Fixed primary-carrier capacity 32, arbitrary larger policies, connected
  soak/resource and isolation gates remain open. [Evidence](docs/history/iterations/251-300.md#iteration-291); `fa55758`.

- [x] DONE for local Ubuntu GCC 12 standard PIE sanitized-worker lifecycle — New
  tracked-source fixture, frozen offline Node install, ASan/UBSan CTest 16/16 and
  full Node 569 / 146 profile/platform skips / 715 pass. Actual 100-worker,
  parent-death and bounded-output cleanup run with default sanitizer settings in
  the separate worker. Parent Node is not preloaded; addon/FreeRDP are OFF.
  Node-only preload LSan controls still fail, so addon/linked/upstream/CI and
  connected-RDP/resource gates remain open. [Evidence](docs/history/iterations/251-300.md#iteration-267).

- [x] DONE for Linux default IPC capacity — 32 concurrent actual native workers,
  automatic/manual heartbeat, refused pre-spawn 33rd owner, sixteen-slot
  replacement and joined process/FD/runtime cleanup pass. This is unconnected
  lifecycle evidence, separate from larger configured limits and 30+ connected
  RDP soak. [Evidence](docs/history/iterations/201-250.md#iteration-212).

- [x] DONE for Linux worker bounded stream lifecycle slice — Foundation/linked
  stdout now uses fixed priority lanes and finite nonblocking writer ownership.
  Actual paused-parent flood exits natively and cleans runtime; lifecycle 13/13,
  linked CTest 21/21, local non-PIE ASan/UBSan foundation 9/9, full Node 453 pass /
  75 skip and independent restricted TGZ pass. Primary seqpacket, actual connected
  media/release and broader resource/soak remain open. Driver: `9b4618f`.
  [Evidence](docs/history/iterations/151-200.md#iteration-192).

- [x] DONE for isolated Linux stream writer — Fixed dispatcher lanes, eventfd /
  one-thread nonblocking FIFO/Unix-stream writes, whole-record/drain deadlines,
  flags/SIGPIPE ownership and FD cleanup pass six real descriptor cases / 174
  assertions in Release and local ASan/UBSan. Linked CTest 21/21 passes. Worker
  selection/connected faults, primary seqpacket and broader gates remain open.
  [Contract](docs/LINUX_STREAM_OUTPUT.md), [evidence](docs/history/iterations/151-200.md#iteration-191).

- [x] DONE — Implement worker process entrypoint with no RDP connection yet. Real C++ executable, not a fake RDP client; `1672590`.
- [x] DONE — Implement versioned `RWI1` IPC envelope. [Native](native/ipc/tests.cpp) and [Node](tests/unit/protocol.test.mjs) boundary/golden/fragmentation tests; `1672590`.
- [x] DONE for Linux amd64 Release IPC lifecycle — Primary `SOCK_SEQPACKET`/RWS1, automatic verified-bundle selection and framed legacy/explicit fallback. Actual 100-worker Node/native runs, parent/worker death, startup cancellation, pre-secret identity/refusal, independent record deadlines, bounded queue/output and joined cleanup pass. Installed RPATH pairing, relocation and independent archive smoke pass. This is transport acceptance; larger configured-capacity admission, addon sanitizer, connected RDP/resource and broader platform gates remain separately tracked. [Contract](docs/LINUX_SEQPACKET.md), [owner](docs/history/iterations/151-200.md#iteration-198), [explicit activation](docs/history/iterations/151-200.md#iteration-199), [default/packaging](docs/history/iterations/151-200.md#iteration-200).
- [x] DONE — HELLO/HELLO_ACK capability negotiation. Real worker capability/CLI checks; incompatible version/required-feature native tests; `1672590`, `316cdc0`.
- [x] DONE — Heartbeat and graceful shutdown. Real-worker and adversarial fake-worker deadline/watchdog tests; `316cdc0`.
- [x] DONE — Length limits and parser unit tests. Header checked before body allocation; malformed/truncated inputs fail without input disclosure. `1672590`.
- [x] DONE for bounded local Linux smoke — libFuzzer IPC target and seeded run: 2,074,807 executions in 21 seconds with ASan/UBSan and zero failure. Six other portable parser targets also pass. Extended/upstream fuzzing and actual CI remain open. [Target](native/ipc/fuzz.cpp), [evidence](docs/history/iterations/151-200.md#iteration-184).
- [~] IN PROGRESS — Parent-death handling and private runtime directory cleanup. Windows and actual Linux framed-pipe parent-death/cleanup and 100 sequential worker tests pass. Windows private ACL creation/startup is implemented. Verified schema-1 ownership adds bounded orphan recovery after simultaneous Node/worker hard kill, live-owner/worker protection, finite scans and joined cancellation on both OSes. Windows supervisor, Windows/Linux portable, new-version installed upgrades and public 0.3.0 release acceptance pass. Broader multi-user/service isolation remains open. [Current recovery evidence](docs/RUNTIME_RECOVERY.md#030-public-delivery), [earlier Linux evidence](docs/history/iterations/151-200.md#iteration-184).

**Gate:** Node test supervisor can spawn 100 sequential workers, exchange heartbeats, kill/restart without leaked processes/files.

## Stage 2 — Node session manager and public API

- [x] DONE — Fastify, TypeBox and Pino. Recursive credential/log tests pass.
- [x] DONE — POST/GET/DELETE /v1/sessions. Owner-scoped lifecycle tests pass with explicit fake backend.
- [x] DONE — Attach-token generation/TTL/scope. Hash-only storage, bounded TTL/count, replay/expiry/channel tests pass.
- [x] DONE — Control/media WebSocket authorization and Origin checks. Actual socket tests pass; JPEG media is now implemented in Stage 4.
- [x] DONE — Per-session/global limits. Startup/cleanup/retention/rate/body/token/socket bounds tested.
- [x] DONE — Registry crash supervision. Isolation/state/error tests pass; native connection adapter remains Stage 3.
- [x] DONE — Prometheus baseline metrics. Protected endpoint and bounded label tests pass.
- [x] DONE — Session state/error model. Transition, deadline, abort and shutdown tests pass.

**Gate:** fake worker can drive complete lifecycle and WS attach tests.
**Accepted on Windows:** eight manager and eight API tests; full pnpm check passes 32/32.
The CLI denies protected routes until hosting authentication is configured; without
a native backend creation returns 501. [Contract](docs/SESSION_API.md),
[evidence](docs/history/iterations/001-050.md#iteration-003). Linux and actual RDP acceptance remain open.

## Stage 3 — FreeRDP connect core

- [x] DONE on Windows — Custom RDP_CLIENT_ENTRY_POINTS and bridge context, headless connection callbacks, WinSock initialization; actual XRDP activation and native lifecycle tests pass.
- [~] IN PROGRESS — Public settings mapper supports host/port, password credentials, auto/NLA/TLS, minimum TLS, initial display, deadlines and native video quality/FPS profiles. Broader settings remain explicit unsupported errors. [Quality contract](docs/VIDEO_QUALITY.md).
- [~] IN PROGRESS — Supplied credentials/auth callback are implemented; interactive replacement prompts remain TODO.
- [~] IN PROGRESS — Strict chain/name validation and one-session certificate prompts pass native/HTTP/WS tests. Persistent trust/TOFU and changed-certificate history remain TODO.
- [~] IN PROGRESS — Load addins and connect: historical XRDP activation/heartbeat
  remains verified. The restored Windows RDP endpoint passes strict certificate
  refusal and a separately approved session-only connection. The private native
  helper and public Edge H.264/JPEG paths render 1920×1080, resize to 1280×720,
  restore the original display and join cleanup. These named endpoint/profile
  results do not accept other Windows server profiles, interactive input,
  application, audio or device behavior. [Current lab scope](docs/LAB_STATUS.md),
  [strict refusal](docs/history/iterations/301-350.md#iteration-344), [activation](docs/history/iterations/301-350.md#iteration-346),
  [native resize](docs/history/iterations/301-350.md#iteration-350), [Edge H.264](docs/history/iterations/351-400.md#iteration-352),
  [Edge JPEG](docs/history/iterations/351-400.md#iteration-353).
- [x] DONE for selected remote disconnect reasons — Pinned FreeRDP ERRINFO idle/logon timeout and logoff codes map to fixed `RDP_SERVER_TIMEOUT` / `RDP_SERVER_LOGOFF` failures. Unknown codes and all non-disconnect errors preserve their existing classification; no private wire change. Other remote reasons and actual server-profile coverage remain open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/301-350.md#iteration-332).
- [x] DONE for selected connection authentication failures — Pinned FreeRDP CONNECT credential/account refusal codes map to the existing fixed `RDP_AUTHENTICATION_FAILED`; transport/TLS and unknown codes remain `RDP_CONNECT_FAILED`. No IPC change or diagnostic numeric disclosure. Other auth methods/server profiles remain open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/301-350.md#iteration-333).
- [x] DONE for selected server ERRINFO refusals — Server-denied and insufficient-privilege reasons map to fixed `RDP_SERVER_REJECTED`; fresh-credentials-required maps to authentication failure. Unknown reasons stay generic. Broader server error history remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/301-350.md#iteration-334).
- [x] DONE for public RDP failure envelope — Selected terminal reason codes retain fixed HTTP status, message and retryability with no numeric FreeRDP diagnostic leakage. [API contract](docs/SESSION_API.md), [evidence](docs/history/iterations/301-350.md#iteration-335).
- [x] DONE for native state-to-public failure handoff — Adapter-level event composition confirms selected FreeRDP reasons reach the established fixed failures while transport/protocol classes remain intact. [Evidence](docs/history/iterations/301-350.md#iteration-337).
- [x] DONE for selected server operational failures — Pinned out-of-memory, driver and Windows session-component ERRINFO values map to fixed `RDP_SERVER_FAILURE`; unknown reasons remain generic. Actual Windows server-reason emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/301-350.md#iteration-338).
- [x] DONE for pinned licensing ERRINFO classification — All eleven FreeRDP licensing disconnect values map to fixed `RDP_LICENSE_FAILURE`; unknown and non-disconnect values retain their existing classes. Unit, manager and HTTP snapshot coverage passes. Actual server emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/351-400.md#iteration-355).
- [x] DONE for Connection Broker VM boot timeout classification — The pinned `ERRINFO_CB_SESSION_ONLINE_VM_BOOT_TIMEOUT` is exposed as the existing fixed `RDP_SERVER_TIMEOUT`, with unknown broker reasons unchanged. Native-adapter, manager and HTTP-category regression coverage passes. Actual server emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/351-400.md#iteration-356).
- [x] DONE for missing Connection Broker destination classification — The pinned `ERRINFO_CB_DESTINATION_NOT_FOUND` maps to the fixed `RDP_SERVER_REJECTED`; other broker destination/pool errors stay generic. Native-adapter and public error propagation regressions pass. Actual broker emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/351-400.md#iteration-358).
- [x] DONE for Connection Broker cancellation classification — The pinned `ERRINFO_CB_CONNECTION_CANCELLED` maps to the existing fixed `RDP_CONNECT_CANCELLED`; other broker processing failures remain generic. Adapter, manager and HTTP contract coverage passes. Actual broker emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/351-400.md#iteration-360).
- [x] DONE for selected Connection Broker ERRINFO classification — Destination loading/redirection, VM wake/boot/DNS, pool and session-monitor failures map to fixed `RDP_SERVER_FAILURE`; invalid routing settings map to rejection. Unknown broker codes remain generic. Actual broker emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/351-400.md#iteration-361).
- [x] DONE for replaced RDP session reason — Pinned `ERRINFO_DISCONNECTED_BY_OTHER_CONNECTION` maps to fixed `RDP_SESSION_REPLACED`; other disconnect reasons retain their own whitelist or generic class. Actual server emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/301-350.md#iteration-339).
- [x] DONE for session-manager remote failure snapshot — Recognized remote terminal codes preserve their fixed code/message/retryability in the failed session snapshot; unknown worker errors keep the existing fallback. This fake-backend layer does not claim RDP emission. [Evidence](docs/history/iterations/301-350.md#iteration-340).
- [x] DONE for server-disconnect manager propagation — The fake backend now verifies `RDP_SERVER_DISCONNECT` survives manager failure handling into the public failed snapshot alongside the replaced-session case. No actual server ERRINFO emission is claimed. [Evidence](docs/history/iterations/301-350.md#iteration-342).
- [x] DONE for server-disconnect HTTP snapshot — An actual local Fastify test server with fake backend returns the failed session through GET with exact `RDP_SERVER_DISCONNECT` code, fixed message and retryability. This does not claim remote RDP emission. [Evidence](docs/history/iterations/301-350.md#iteration-343).
- [x] DONE for server-initiated disconnect reasons — Pinned generic and user-initiated RPC disconnect ERRINFO codes map to fixed `RDP_SERVER_DISCONNECT`; logoff and replacement reasons stay distinct. Actual server emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/301-350.md#iteration-341).
- [x] DONE for pinned NLA-required connect failure — FreeRDP 3.32.1 `ERRCONNECT_HYBRID_REQUIRED_BY_SERVER` maps to fixed non-retryable `RDP_SECURITY_MODE_REQUIRED`, distinct from credentials and generic transport/TLS failures. Actual server emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/history/iterations/301-350.md#iteration-345).
- [x] DONE for NLA-required error propagation — Fake-manager and Fastify HTTP regressions preserve `RDP_SECURITY_MODE_REQUIRED`, its fixed message and non-retryable status in failed session snapshots; the retryable server-disconnect control also remains covered. This does not claim real-server emission. [Evidence](docs/history/iterations/301-350.md#iteration-348).
- [x] DONE for replaced-session HTTP propagation — The fake-backend HTTP snapshot preserves exact `RDP_SESSION_REPLACED` message and retryability alongside the disconnect and security-mode cases; real-server reason emission remains separate. [Evidence](docs/history/iterations/301-350.md#iteration-349).
- [x] DONE for selected remote failure HTTP propagation — The fake-backend Fastify snapshot now also preserves the fixed timeout, logoff, refusal and server-failure code/message/retryability. The actual integration test passes 10/10; this verifies public error propagation, not server emission or broader profiles. [Evidence](docs/history/iterations/351-400.md#iteration-354).
- [x] DONE for connection failure HTTP snapshots — The fake-backend Fastify test also checks fixed connection, authentication, certificate, timeout, cancellation and protocol failures through GET snapshots, including exact messages and retryability. This is API propagation coverage, not real-server emission. [Evidence](docs/history/iterations/351-400.md#iteration-357).
- [x] DONE for renewed Windows endpoint activation — After explicit one-session approval of the new exact certificate fingerprint, the native helper connects, captures a 1024×768 JPEG, exchanges heartbeat and joins cleanup with an empty runtime directory. This does not accept the broader graphics/input/audio/application/device gates. [Evidence](docs/history/iterations/301-350.md#iteration-346).
- [~] IN PROGRESS — Stable connect/auth/certificate/timeout/disconnect failures are implemented; remaining remote ERRINFO reasons and broader Windows server/application profiles need actual integration acceptance.
- [~] IN PROGRESS — Graceful disconnect and cancellation verified; reconnect remains unsupported.
- [x] DONE for current connection slice — Password is delivered through a separate private IPC class after HELLO, with transport copies overwritten. No per-session secrets enter argv/env; unsupported hash/PIN modes are rejected.

**Gate:** CLI-less worker connects to Windows and XRDP, reports state, rejects changed certificate correctly.

- [x] DONE on Windows/XRDP — Named active transport-loss case: real decoded
  desktop, controlled loss of only the test connection, `RDP_DISCONNECTED`, failed
  public session, closed viewer and empty runtime after joined cleanup. Broader
  error categories, reconnect and remote input/device release remain open.
  [Evidence](docs/history/iterations/151-200.md#iteration-183).

## Stage 4 — graphics, cursor and browser video

- [x] DONE for current Windows lab static-desktop H.264 1080p 30-minute
  observation — Linked Debug worker/public API/Edge pass 61 samples over
  1,800,145 ms, sampled empty queues, worker RSS peak 238.1 MiB below the
  explicit 256 MiB fixture cap, confirmed resize/restoration and fresh-token
  display/cursor replay. Joined cleanup leaves no worker or runtime entries.
  Audio/Clipboard are off; moving/interactive/audio and total-session resource
  gates remain open. [Evidence](docs/history/iterations/351-400.md#iteration-388).

- [x] DONE for supported-settings/manual WEB connection example (2026-10-14):
  manual RDP host/port, username/domain/password, supported connection/display /
  quality/media settings, explicit session-only certificate decision and connect /
  disconnect actions. Hosting authentication stays separate from RDP credentials;
  no password/profile persistence. Other Remmina-like functions follow their
  backend stages and must show explicit unsupported state until implemented.
  Form/schema, authorization refusal, secret clearing, late-create cancellation
  and actual Edge/HTTP fixtures pass. Real Linux/XRDP H.264/JPEG creation through
  the form, session-only certificate click, resize/replay and cleanup pass;
  empty Windows launcher smoke passes. This accepts the named UI example, not
  the pending backend functions. [Contract/run](docs/WEB_CONNECTION_EXAMPLE.md),
  [evidence](docs/history/iterations/201-250.md#iteration-204).

Current actual soak attempt stopped with `RDP_PROTOCOL_ERROR` after its last
successful sample at 22 minutes 9 seconds. Memory/queue samples were within
bounds. A full repeat now passes; the first failure's cause remains unverified.
[Failure evidence and diagnostics](docs/history/iterations/151-200.md#iteration-180),
[completed 30-minute repeat](docs/history/iterations/151-200.md#iteration-182).

- [x] DONE on Windows/XRDP — Named single-viewer H.264 1080p 30-minute observation,
  sampled bounded queues/worker memory, resize/restoration, cursor/attachment replay
  and empty-runtime cleanup. This does not close broader interactive, Windows-server,
  resource or intermittent-failure acceptance. [Evidence](docs/history/iterations/151-200.md#iteration-182).

- [x] DONE for local Linux producer/Windows Edge — Actual H.264 1080p XRDP
  observation lasts 30 minutes with 61 bounded queue/RSS/credit samples,
  5,163 frames, worker RSS below 256 MiB, confirmed resize/restoration,
  fresh-token replay and clean shutdown. This does not close broader interactive,
  audio/device, total per-session memory, latency, Windows-server or load gates.
  [Evidence](docs/history/iterations/201-250.md#iteration-220).

- [x] DONE on Windows and local Linux amd64/XRDP — Initialize headless FreeRDP GDI/framebuffer. Native codec tests and real 1080p Edge rendering verified; [Windows evidence](docs/history/iterations/001-050.md#iteration-005), [Linux producer evidence](docs/history/iterations/201-250.md#iteration-202). Broader server/platform/resource acceptance remains open.
- [~] IN PROGRESS — Classic BeginPaint/EndPaint/DesktopResize and synchronous public GFX binding wired. Native GFX frame-end/inter-frame pixels, AVC420 IDR/predictive decode, reset, bounded surface/cache/command guards and teardown fixtures pass; actual XRDP browser regression passes. Actual negotiated GFX, AVC444/other compressed codecs, true scaled-output mapping, decoder resource limits and dynamic server resize remain open. [Contract](docs/GFX.md), [binding evidence](docs/history/iterations/001-050.md#iteration-014), [AVC420 evidence](docs/history/iterations/001-050.md#iteration-015).
- [~] IN PROGRESS — Native Display Control binds negotiated caps and one bounded layout; private IPC/Node and public control leases expose opt-in, typed results, server-observed generations and deadlines. Actual XRDP browser resize/restoration, display replay, fresh AVC IDRs/JPEG configs, nonfatal input pause and transmitted media ACK preservation pass. The named private native Windows RDP resize/restoration passes with fresh AVC IDRs and JPEG, and public Edge/H.264/JPEG resize/restoration passes with display/cursor replay and reattachment; local fake IPC/media regressions pass 10/10 and 26/26. Broader Windows server profiles, DVC resource audit and soak acceptance remain open. The single-primary layout at 100% scale satisfies ADR-011; automatic viewport policy is optional follow-up and wider layouts are outside current scope. [Contract](docs/DISPLAY_CONTROL.md), [native evidence](docs/history/iterations/001-050.md#iteration-017), [IPC/XRDP evidence](docs/history/iterations/001-050.md#iteration-018), [public/browser evidence](docs/history/iterations/001-050.md#iteration-019), [Windows private-worker evidence](docs/history/iterations/301-350.md#iteration-350), [local regression](docs/history/iterations/351-400.md#iteration-351), [H.264 evidence](docs/history/iterations/351-400.md#iteration-352), [JPEG evidence](docs/history/iterations/351-400.md#iteration-353).
- [~] IN PROGRESS — Rectangle accumulation uses a fixed 64-region set, conservative union/collapse, clipped revision changes and snapshot consumption after successful encode/send. Native coverage and public GDI/GFX callback tests pass; actual XRDP regression is recorded in [iteration 13](docs/history/iterations/001-050.md#iteration-013) and [iteration 14](docs/history/iterations/001-050.md#iteration-014). Partial-region encoding and actual negotiated GFX tracking remain pending; AVC/JPEG continue encoding full frames per ARCHITECTURE §4. [Contract](docs/DIRTY_REGIONS.md).
- [x] DONE on Windows/XRDP — Public pointer callbacks extract bounded RGBA shape, hotspot, position and visibility; native conversion/state/parser tests and actual XRDP shape delivery/replay pass. [Contract](docs/CURSOR.md), [evidence](docs/history/iterations/001-050.md#iteration-012). Exact mono inversion and broader server/platform cases remain retained gaps.
- [~] IN PROGRESS — JPEG/AVC latest-state scheduling shares one pending capture with render credit. Configurable FPS caps and quality/bitrate profiles reach native encoders; effective ceilings remain 20 JPEG / 30 AVC FPS. Native/fake and actual XRDP cap checks pass. Provider selection and adaptive congestion remain pending. [Contract](docs/VIDEO_QUALITY.md), [evidence](docs/history/iterations/001-050.md#iteration-016).
- [x] DONE on Windows — H.264 encoder interface and private OpenH264 software provider; real encode/decode, forced IDR, GOP and resize tests pass. [Contract](docs/MEDIA_H264.md), [evidence](docs/history/iterations/001-050.md#iteration-006). Linux/hardware selection pending.
- [x] DONE on Windows/XRDP — AVCC config/access-unit packetization, IPC/RWB1 bounds and actual browser decode verified; [evidence](docs/history/iterations/001-050.md#iteration-007).
- [x] DONE on Windows and local Linux amd64/XRDP — Encoded JPEG/AVC worker→Node RWI1 and browser RWB1 forwarding, without raw frames in JS. Linux primary IPC/public API/Windows Edge smoke passes [iteration 202](docs/history/iterations/201-250.md#iteration-202); sustained resource/platform gates remain open.
- [x] DONE in Edge/Windows — Reference harness checks WebCodecs support, renders actual 1080p AVC/JPEG and closes VideoFrames/ImageBitmaps. Other browsers/platforms remain unverified.
- [x] DONE in Edge/Windows — Independent binary shape stream and transparent overlay; local movement, CSS-scaled hotspot, hide/default and disposal tested. Actual XRDP shape and browser reattachment replay pass. [Evidence](docs/history/iterations/001-050.md#iteration-012). Full desktop soak remains open.
- [x] DONE on Windows/XRDP — Native JPEG fallback and browser canvas path, private libjpeg-turbo, bounded allocation and relocation verified. [Contract](docs/MEDIA_JPEG.md).
- [~] IN PROGRESS — Single-frame credit, ACK deadline, stale lease/ACK/reset rejection, static/latest revision and dimension config verified. Actual WebCodecs decoder-error recovery forces config/IDR; adaptive bitrate/drop policy remains pending.
- [~] IN PROGRESS — Bounded native encode/read counters, browser decode/draw timings and a deterministic 1080p encoder benchmark implemented. Protected Node capture/write/render-credit histograms, queued frame/byte counters and credit occupancy now distinguish consumer stalls from capture time. Forward timing requires all configuration/image writes to succeed, with partial-failure regression coverage. Full dirty-to-send/queue-delay and performance gates remain open. [Encoder evidence](docs/history/iterations/001-050.md#iteration-009); `06233ce`, build tracking `be42b9d`. [Node timing evidence](docs/history/iterations/001-050.md#iteration-011), [write-group correction](docs/history/iterations/351-400.md#iteration-366).

**Gate:** stable 1080p interactive Windows/XRDP desktop for 30 min, resize safe, cursor smooth, no unbounded queue growth.

## Stage 5 — keyboard, mouse, wheel and touch

- [x] DONE for named Windows public pointer/application slice — Prepared
  offline page confirms left/right/middle button pairs, captured drag, both
  wheel axes/directions, left-button blur release and middle-button release
  across viewer detach/fresh-token reattachment. Fixed scalar readbacks and
  joined cleanup pass. Content scrolling, arbitrary drop targets, physical
  hardware and hard transport-loss-held input remain open.
  [Evidence](docs/history/iterations/351-400.md#iteration-396).

- [x] DONE for named current Windows public-viewer keyboard/release smoke —
  Actual Notepad readback confirms Shift/number entry, Ctrl/Shift/Alt blur/reset
  and held right Ctrl across viewer detach/fresh-token reattachment on the same
  native session. Alt includes Escape to leave menu mode. Unicode Clipboard,
  permission refusal and joined viewer/native/runtime cleanup also pass.
  Wider layouts/shortcuts, mouse/drag/wheel, hard transport loss and full input
  gates remain open. [Evidence and retained first failure](docs/history/iterations/351-400.md#iteration-394).

- [x] DONE for named Windows Notepad input/readback smoke — Committed
  Latin/Cyrillic/Japanese/emoji text, physical Shift/number keys, held-left-Ctrl
  reset, extended right-Ctrl copy and fixed left-button/application sequence
  pass exact remote Unicode readback and unsaved-window/native cleanup.
  This does not accept full layouts/IME, wheel/other buttons/touch, physical
  hardware or disconnect-held input. [Evidence](docs/history/iterations/301-350.md#iteration-303).

Current integration evidence: [private/native touch](docs/history/iterations/001-050.md#iteration-029),
[public lease/browser](docs/history/iterations/001-050.md#iteration-030), [actual XRDP readiness/replay](docs/history/iterations/001-050.md#iteration-031),
[pen placeholder](docs/history/iterations/001-050.md#iteration-032), [terminal cleanup](docs/history/iterations/001-050.md#iteration-033),
[international keyboard positions](docs/history/iterations/001-050.md#iteration-034). The historical foundation
records above do not describe today's activation state. Actual touch/application
and other remote acceptance gates remain open.

Manual local Edge viewing: `test-xrdp-viewer.mjs ... h264 --manual`.
[Launch commands](docs/DEVELOPMENT.md#manual-windowsxrdp-viewer).

- [~] IN PROGRESS — Physical set-1 mapping, extended left/right/numpad and eight international physical positions implemented; native/Node/Edge fixtures pass. Symbols are not used for mapping, composition stays local and reset releases held positions. Remote keyboard-layout/IME/hardware gate remains pending. [Contract](docs/INPUT.md), [initial evidence](docs/history/iterations/001-050.md#iteration-008), [international positions](docs/history/iterations/001-050.md#iteration-034).
- [~] IN PROGRESS — Browser modifiers reconcile before focused input; observed left/right sides survive canvas focus/resize pauses, missed releases are repaired, and Caps/Num/Scroll Lock synchronize after physical lock edges. Bounded pure/native and Edge/fake-control fixtures pass; actual remote layouts, AltGraph portability and no-stuck-key acceptance remain open. [Contract](docs/INPUT.md), [evidence](docs/history/iterations/001-050.md#iteration-020).
- [~] IN PROGRESS — Explicit committed Unicode/IME textarea, bounded UTF-16BE private IPC and FreeRDP Unicode events implemented; native, pure, fake IPC/control and Edge composition fixtures pass. Server Unicode negotiation is required; no automatic retry of partial/uncertain delivery. The named Windows Notepad text/supplementary readback case now passes [iteration 303](docs/history/iterations/301-350.md#iteration-303); OS IME, line endings, broader application/platform profiles and direct canvas IME remain unverified. [Contract](docs/INPUT.md#committed-unicode-text), [initial evidence](docs/history/iterations/001-050.md#iteration-021).
- [~] IN PROGRESS — Absolute coordinates and five buttons implemented; Edge captured-drag and native tracking tests pass. Real XRDP motion ACK and the named Windows left-button/application readback sequence pass; other remote button/platform and physical-device acceptance remain open. [Windows evidence](docs/history/iterations/301-350.md#iteration-303).
- [~] IN PROGRESS — Both wheel axes and bounded fractional DOM pixel/line/page accumulation implemented; pure/Edge/control fixtures pass. Gesture context, focus/reset/resize pauses and idle gaps discard stale fractions; no new timer/queue or wire change. Actual remote wheel sensitivity and physical trackpad acceptance remain open. [Contract](docs/INPUT.md#fractional-wheel-and-trackpad-accumulation), [evidence](docs/history/iterations/001-050.md#iteration-022).
- [x] DONE in Edge/fake fixture — Only adjacent pointer moves are coalesced; transitions flush preceding motion. Independent remote cursor display now passes XRDP/Edge; measured latency and desktop soak gates remain open.
- [~] IN PROGRESS — Native pressed-state reset and retry, blur/disposal, transport loss and stale lease cancellation verified. Graceful close resets input; actual remote no-stuck-key gate pending.
- [~] IN PROGRESS — Native state, public RDPEI projection/registration and observable handshake gate implemented. Terminal IDs remain owned through transport writes; suspended native UP records drain before readiness in the RDPEI 1.0.1+/disabled-timestamp profile. Scoped public provider/retirement now follows Connection's RDP-thread lifecycle. Pure/public-call and actual-addin/fake-DVC tests pass. Contact dispatch/reset/resize/control wiring, timestamp-remoting/v1.0 compatibility, bounded IPC, browser capture and actual remote/physical touch remain open. Same-plugin DVC reopening is unimplemented. No touch capability is advertised. [Contract](docs/INPUT.md#terminal-contact-ownership-and-drain), [state](docs/history/iterations/001-050.md#iteration-023), [transport](docs/history/iterations/001-050.md#iteration-024), [registration](docs/history/iterations/001-050.md#iteration-025), [drain](docs/history/iterations/001-050.md#iteration-026), [provider/lifetime](docs/history/iterations/001-050.md#iteration-027).
- [~] IN PROGRESS — Opt-in worker/private Node touch dispatch, generation/readiness checks, fixed mixed FIFO and reset/resize drain are implemented. Native, codec and fake-worker tests pass; actual XRDP reports RDPEI ready with ten contacts, without sending touch. This supersedes the historical no-capability statement above. Public control/browser wiring, physical/remote acceptance and compatibility/resource audits remain open. [Evidence](docs/history/iterations/001-050.md#iteration-029), [contract](docs/IPC_FOUNDATION.md#generation-bound-touch-dispatch-iteration-29).
- [~] IN PROGRESS — Public touch control lease, queued readiness/generation checks, metadata replay and bounded browser Pointer Events capture are implemented. Node/control and Edge emulated two-contact fixtures pass; physical and remote application acceptance remain open. [Evidence](docs/history/iterations/001-050.md#iteration-030). Private dispatch implementation: `6a34e2f`.
- [x] DONE (unsupported placeholder) — `penInput=false` in HELLO decoding, native CLI and capability REST; owned RDPEI does not negotiate multi-pen, and browser pen Pointer Events produce no mouse/touch fallback. Native/public-context, actual-addin/fake-DVC and Edge fixtures pass. This is not pen support; optional future implementation/device acceptance remains. [Evidence](docs/history/iterations/001-050.md#iteration-032).

**Gate:** keyboard-layout test set, mouse/wheel, touch smoke; no stuck keys after disconnect.

## Stage 6 — audio output and microphone

- [x] DONE for named current Release Windows Opus/200 ms audible MVP scenario —
  Three-minute observation starts at first decoded data and renders 179.54
  seconds. User reports excellent sound; joined PID/runtime cleanup passes.
  Twelve configurations, eleven late intervals, four Worklet underflows and
  one scheduled consumer reset remain measured limitations. Other profiles,
  latency/recording/platform and reset-free continuity stay open.
  [Evidence](docs/history/iterations/351-400.md#iteration-393).

- [x] DONE for named Windows Opus/200 ms three-minute listening observation —
  User reports steady normal sound; the bounded observation starts at the first
  decoded packet and renders 178.65 seconds of samples. Joined PID/runtime
  cleanup passes. This does not accept reset-free scheduling: 40 configurations,
  64 late intervals and 12 Worklet underflows remain. Other profiles, measured
  latency, recovery, recording and broader platform gates stay open.
  [Evidence](docs/history/iterations/351-400.md#iteration-390).

- [x] DONE for the named short corrected-worker Windows Opus/200 ms listening
  slice — User reports steady sound with almost no breaks and accepts it.
  Actual counters cover 23.52 rendered seconds, one epoch/configuration, no
  publication skips or Worklet underflow; joined runtime cleanup passes.
  This does not close full multi-minute, other format/profile/platform, latency
  or recording acceptance. [Evidence](docs/history/iterations/351-400.md#iteration-387).

Current repeat: the newly approved Windows Opus/200 ms browser session renders
1080p H.264 but remains audio-waiting with zero configurations/packets/played
frames. Recovery preconditions fail and joined cleanup passes. A verified
active source is needed before playback or quality conclusions; the earlier
accepted smoke below retains its historical scope.
[Retained observation](docs/history/iterations/351-400.md#iteration-362). The explicitly approved repeat
with a user-started continuous tone also stays waiting and fails before detach;
the source endpoint/session and current negotiation cause remain unverified.
[Tone repeat](docs/history/iterations/351-400.md#iteration-363).
The local helpers now collect fragmented native negotiation counters through
joined cleanup; recovery-source failures identify the source-ready phase before
snapshot/detach. This improves diagnosis without accepting audio playback or
identifying the current cause. [Helper evidence](docs/history/iterations/351-400.md#iteration-364).
The user confirms the tone was started through `mstsc`. The bounded visible
listening preview now reports one fresh scalar Worklet observation and final
native negotiation counters, preparing a source restart inside the active
Bridge viewer. The subsequent explicitly authorized fixed-source preview below
now verifies a short audible output slice; the earlier idle-source results remain.
[Preview evidence](docs/history/iterations/351-400.md#iteration-365).

- [x] DONE for named Windows lab / Edge audible Opus tone preview — The user
  authorizes a fixed in-memory 45-second tone launched through the active Bridge
  connection and confirms hearing it with short Morse-like interruptions.
  Actual RDPSND negotiation, 2,369 decoded
  packets, 2,014,016 Worklet played frames, 1080p H.264 and joined empty-runtime
  cleanup pass. Frequent epochs/configurations, buffering silence and underflows
  remain; continuous quality, recovery, microphone, LAN latency and sustained
  resource/platform acceptance stay open. [Evidence](docs/history/iterations/351-400.md#iteration-367).
  Both browser/private lab helpers now preserve the existing native lifetime
  loss/reset and clock/format/Close cause receipts across arbitrary stderr
  chunks, with exact uint64/refusal checks. These diagnostics prepare further
  continuity work; they do not identify the previous run's cause or accept
  uninterrupted quality. [Collector evidence](docs/history/iterations/351-400.md#iteration-368).
  The browser footer also counts Node consumer reset calls/results without
  altering retries or queue policy. This keeps native lifetime resets separate
  from requested consumer recovery. [Counter evidence](docs/history/iterations/351-400.md#iteration-369).
  The authorized same-profile repeat now observes zero Node reset requests,
  581 native skipped publication intervals and 572 publisher resets. The user
  reports much better sound with a few short interruptions; publication timing
  remains the next work item, without a complete cause or quality pass.
  [Repeat](docs/history/iterations/351-400.md#iteration-370).

- [x] DONE for named current Windows lab / Edge PCM/Opus recovery smoke —
  User-started source, actual H.264 1080p, Opus decode/Worklet played frames,
  fresh-token audio replay and one scheduled Opus reset pass with the 200 ms
  profile. Separate private PCM/Opus resets return fresh config/data; heartbeat
  and joined empty-runtime close pass. Frequent churn, buffering silence,
  underflows and publication gaps remain; audible continuity, LAN latency,
  recording and sustained/resource/platform acceptance stay open.
  [Evidence](docs/history/iterations/301-350.md#iteration-307).

- [x] DONE for Linux amd64 producer / Windows Edge PCM/Opus output smoke —
  Real XRDP packets, Opus decode, Worklet played samples, 200 ms profile, video
  resize/restoration, fresh-token replay and observed native Opus reset/new epoch
  pass. Native source/TLS/IPC, private relocation and cleanup are verified.
  Human audible quality, latency, intermittent protocol-failure diagnosis,
  prolonged resource/soak and remaining platform/microphone gates stay open.
  [Evidence](docs/history/iterations/201-250.md#iteration-208), [deadline fix](docs/history/iterations/201-250.md#iteration-207).

**Overall: IN PROGRESS.** Windows PCM/Opus output and input paths are implemented;
fixtures exercise their composition. Actual XRDP output now supplies real PCM/Opus
and browser decoder/Worklet admission. The user accepts smoother Opus output
with the 200 ms profile for local development; uninterrupted quality, recording
and the measured LAN queue gate remain open. Synthetic
browser samples and linked SDK channels with simulated transport establish
component behavior, not remote or physical-device acceptance.

### Accepted components

DONE below applies only to the stated component/profile and test scope. Linux,
broader format profiles and end-to-end acceptance are separate open work.

| Component | Status and accepted scope | Evidence |
| --- | --- | --- |
| PCM normalization/resampling | DONE — bounded native PCM8/PCM16 mono/stereo 8..48 kHz to S16LE 48 kHz stereo, portable fixtures | [36](docs/history/iterations/001-050.md#iteration-036), [47](docs/history/iterations/001-050.md#iteration-047) |
| Volume mapping | DONE — independent stereo perceptual gains, mute/full identity, exhaustive and linked fake-SVC fixtures | [44](docs/history/iterations/001-050.md#iteration-044) |
| Native PCM queue and packetization | DONE — fixed 120 ms ring and 20 ms publication, underflow/overflow/reset fixtures | [37](docs/history/iterations/001-050.md#iteration-037), [49](docs/history/iterations/001-050.md#iteration-049), [62](docs/history/iterations/051-100.md#iteration-062) |
| Native output buffer selection | DONE on Windows — immutable 120/200 ms profiles, bounded queue/configuration, legacy refusal, actual XRDP PCM/Opus selection and reset; not total latency acceptance | [179](docs/history/iterations/151-200.md#iteration-179), [ADR-012](docs/adr/ADR-012-audio-compatibility-buffer.md) |
| Ready output attachment recovery | DONE on Windows/XRDP — actual PCM/Opus 200 ms browser detach/reattach, fresh Worklet samples and scheduled Opus native reset; not general reconnect or loss/latency acceptance | [181](docs/history/iterations/151-200.md#iteration-181) |
| Private Opus output codec | DONE on Windows — pinned SDK encode/decode/reset/bounds and DLL relocation | [73](docs/history/iterations/051-100.md#iteration-073), [75](docs/history/iterations/051-100.md#iteration-075) |
| PCM/Opus record codecs | DONE — bounded native/Node/browser wire vectors and malformed-record fixtures | [50](docs/history/iterations/001-050.md#iteration-050), [75](docs/history/iterations/051-100.md#iteration-075), [76](docs/history/iterations/051-100.md#iteration-076) |
| Browser PCM playback owner | DONE in Edge synthetic fixtures — queue, Worklet admission ACK, gesture and cleanup | [70](docs/history/iterations/051-100.md#iteration-070), [71](docs/history/iterations/051-100.md#iteration-071) |
| Browser Opus decoder owner | DONE in Edge pinned-SDK synthetic fixtures — decode/priming, admission and cleanup | [77](docs/history/iterations/051-100.md#iteration-077) |
| Output record delivery/credit | DONE in fake-backend/actual loopback-WS fixtures — independent bounded PCM/Opus credit and recovery ownership | [69](docs/history/iterations/051-100.md#iteration-069), [93](docs/history/iterations/051-100.md#iteration-093), [94](docs/history/iterations/051-100.md#iteration-094) |
| Native microphone PCM source | DONE — fixed newest-data queue, silence/underflow, epoch and wipe-on-stop portable fixtures | [95](docs/history/iterations/051-100.md#iteration-095) |
| Private Opus input codec/compensation | DONE on Windows synthetic SDK composition — strict 20 ms decode, pre-skip and bounded reblocking | [129](docs/history/iterations/101-150.md#iteration-129), [132](docs/history/iterations/101-150.md#iteration-132) |
| Browser microphone capture/permission owners | DONE in synthetic Edge fixtures — packetizer, Worklet, denied/late permission and cleanup; no physical capture | [121](docs/history/iterations/101-150.md#iteration-121), [122](docs/history/iterations/101-150.md#iteration-122), [126](docs/history/iterations/101-150.md#iteration-126) |
| Explicit PCM/Opus microphone viewer | DONE in synthetic Edge/WS/fake-RDP fixtures — matching selection, gesture, stop/restart, source/controller loss | [143](docs/history/iterations/101-150.md#iteration-143), [144](docs/history/iterations/101-150.md#iteration-144) |
| Protected transport telemetry | DONE — fixed-label output/input counters, credit and timing tested with fake RDP/real sockets | [72](docs/history/iterations/051-100.md#iteration-072), [145](docs/history/iterations/101-150.md#iteration-145) |

### Remaining implementation and acceptance

- [~] Custom `rdpsnd-browser` virtual sink: selected Windows worker/native/Node/
  viewer PCM/Opus path and guarded static/dynamic ingress are implemented.
  Real XRDP negotiation and PCM/Opus browser admission pass; Opus is audible and
  the user accepts current 200 ms quality for development. Uninterrupted playback,
  burst quality and broader transport/platform recovery remain open. Private
  ready-source reset and public PCM/Opus 200 ms attachment recovery pass on this lab.
  [181](docs/history/iterations/151-200.md#iteration-181).
  [175](docs/history/iterations/151-200.md#iteration-175), [94](docs/history/iterations/051-100.md#iteration-094),
  [167](docs/history/iterations/151-200.md#iteration-167), [168](docs/history/iterations/151-200.md#iteration-168).
- [~] Custom `audin-browser` source, browser microphone capture and packet
  transport: selected Windows/Linux PCM/Opus AUDIN/worker/Node/viewer path is implemented.
  Actual XRDP input remains waiting epoch 0; negotiated ready input, physical
  permission/device capture and remote application recording remain unverified.
  Twelve real Linux carrier/codec combinations pass; bounded negotiation counters
  now distinguish accepted DVC/validated formats/Open from waiting state.
  [144](docs/history/iterations/101-150.md#iteration-144), [169](docs/history/iterations/151-200.md#iteration-169),
  [218](docs/history/iterations/201-250.md#iteration-218), [219](docs/history/iterations/201-250.md#iteration-219).
- [~] PCM normalization/resampling and Opus compatibility beyond the accepted
  fixed profiles: larger callbacks split within fixed storage and identical
  selected tables can repeat. Wider/higher-rate formats, changed server tables,
  callback CPU/quality and other browser/device sample rates remain open.
  Existing explicit profile refusals do not remove these retained requirements.
- [~] Audio queue/jitter/backpressure metrics: transport metrics exist; native/
  browser underflow, jitter, encode and host-queue export and measured LAN queue/
  latency acceptance remain open. [145](docs/history/iterations/101-150.md#iteration-145).
- [~] Underflow/silence behavior that does not block the RDP loop: bounded native/
  Worklet/capture fixtures pass. Native PCM/Opus event waits now follow the active
  packet deadline with bounded overdue retries and ordinary polling under output
  blockage; portable virtual-minute and Windows linked ownership/lifecycle controls
  pass. Connected new-worker scheduling, callback CPU/wakeup budgets and real
  transport/audio-quality acceptance remain open. [Deadline correction](docs/history/iterations/351-400.md#iteration-371).
  The Windows lab viewer can explicitly select the corrected isolated Debug
  worker by its bound native receipt, preserving the bundled default and
  validating worker/helper bytes before lab configuration. Actual new-worker
  audio remains pending its own session. [Helper checks](docs/history/iterations/351-400.md#iteration-372).
- [~] Audio reconnect/discontinuity reset: epoch, Close/reset, reattachment and
  ownership barriers pass fixtures; actual XRDP private reset and ready-source
  browser attachment recovery pass for the named profiles. Broader recovery and
  connection reconnect remain open. General reconnect is still unsupported in Stage 3.
- [ ] Actual remote output is audible and microphone recording usable, including
  stop/restart, controller/transport loss and no stale audio after reset.
- [ ] Measure the bounded <150 ms LAN queue target with active real sources.
- [ ] Verify native pool/codec/total RSS and CPU budgets, failure injection,
  lost-transport cleanup, Windows-server and Linux/platform behavior, sanitizer/
  fuzz execution and sustained/concurrent audio use. Prepared jobs are not passes.

The [original Stage 6 iteration records](docs/STAGE_6_HISTORY.md) preserve every
historical item, requirement, gap and test reference. They are not additional
release gates. Current evidence supersedes their earlier inactive-path wording;
unresolved compatibility/resource/device requirements remain required work.

**Gate:** remote audio audible and microphone usable with bounded <150 ms queue target in LAN test.
ADR-012 explicitly permits a 200 ms native output ring in the optional
compatibility profile; it does not establish total latency or waive the ordinary
profile's target, microphone, recovery, resource or platform acceptance.

## Stage 7 — clipboard and managed drives

Current individual capability statuses include the verified public 0.6.0
release and later resource checks. Original preparation checkpoints below
retain their historical scope; their then-pending publication checks are
superseded by the linked public acceptance. Broader resource/platform gates
remain explicit under quota/disk-full and the final V1 qualification.

- [x] DONE for the named 0.6.0 managed-file release slice — opt-in HTTP
  storage and redirected sandbox drives pass the dedicated Windows application,
  Linux RWS1/framed and Astra/RED OS profiles. Ten exact npm packages, five
  GitHub Releases, eight fresh registry projects and final standalone files
  are public and verified. Final DEB/RPM upgrade and installed-service file/RDP
  checks pass both named Linux platforms. This closes the versioned release
  slice; the wider original matrix, OS file clipboard and Stage 7 remain open.
  Private release commit `98b8f46`, public core commit `21b4091`.
  [Final acceptance and exact hashes](docs/RELEASE_0_6_0.md#public-delivery).

- [x] DONE for named owned XRDP 0.10.1/Tk Unicode clipboard slice — Windows
  Release producer and real headed Edge Clipboard API pass Cyrillic/Japanese/
  emoji/multiline text both ways under a 1,024-byte cap. Two new RDP connections
  reuse the prepared Tk process; repeated server-origin Copy/Get also passes
  before any native client write. Actual browser permission refusal, no-format
  revoke, viewer clearing and joined PID/runtime cleanup pass. Full feature
  check: 900 / 61 skips / 961 total. The fixture clears its old CLIPBOARD owner
  before ordinary Copy. Old XRDP 0.9.x conversion, wider Linux producer/server
  profiles, direction/quota/isolation/formats and drives remain separate.
  [Evidence](docs/history/iterations/401-450.md#iteration-404).

- [x] DONE for named headed Edge/Windows Notepad Unicode clipboard slice —
  Real Browser Clipboard API, public API/control, CLIPRDR and application
  paste/copy readback pass both ways with Cyrillic/Japanese/emoji and three
  lines under a 1,024-byte cap. One prepared-editor focus click is required.
  The current Release repeat also passes actual browser permission refusal,
  accepted no-format revoke, cleared viewer fields and joined PID/runtime close
  in one invocation. Own-document clear keystrokes follow verified readback;
  empty application content is not separately read back. The actual wider
  direction / quota / isolation matrix and full Stage 7 remain open.
  [Current complete run](docs/history/iterations/351-400.md#iteration-392),
  [earlier evidence and retained failures](docs/history/iterations/351-400.md#iteration-385).

- [x] DONE for named Windows Notepad Unicode roundtrip — Explicit private
  Node/native bidirectional CLIPRDR selection with 1,024-byte cap passes actual
  application paste and subsequent copied exact readback of fixed Unicode.
  Empty-offer/no-format revoke ACK and joined cleanup pass; no host Clipboard
  API, remote file save or remote clipboard logging occurs. Browser/host OS,
  full quota/direction/resource matrix, other formats and drives remain open.
  [Contract](docs/WINDOWS_APPLICATION_SMOKE.md), [evidence](docs/history/iterations/301-350.md#iteration-303).

- [x] DONE for isolated native conversion — Allocation-free bounded UTF-8/CF_UNICODETEXT
  conversion, CRLF normalization and atomic refusal pass Windows/Linux native,
  local ASan/UBSan and seeded Clang fuzz checks. This is not channel/browser or
  actual remote acceptance. [Contract](docs/CLIPBOARD_TEXT.md),
  [evidence](docs/history/iterations/201-250.md#iteration-224).
- [~] IN PROGRESS — CLIPRDR Unicode text both directions: explicit raw schema-10
  selection now maps guarded CLIPRDR
  directions/size limits, serialized command dispatch and RDP-thread retirement.
  Actual Windows/Linux worker strict TLS/cancellation and linked fake-channel
  quota checks pass. HELLO-gated private Node selection/read/write now preserve
  current source/offer authority, one flight and late-result disposal; synthetic
  IPC and actual native TLS checks pass. Explicit reference browser text selection
  and local actions pass Edge/fake-RDP/mocked-Clipboard-API fixtures; actual remote /
  OS clipboard and total-resource acceptance remain open.
  [Browser evidence](docs/history/iterations/201-250.md#iteration-238), [Native evidence](docs/history/iterations/201-250.md#iteration-231),
  [typed API and actual XRDP offer/empty-text ACK evidence](docs/history/iterations/201-250.md#iteration-232).
  Native offer revocation now has a separate content-free schema-2 command and
  checked public send/ACK path; unlike empty text, it removes all offered formats.
  Prepared manager control grants now drain prior work and require native revoke
  completion before replacement; fake/backend and synthetic process composition
  pass. The native adapter now accepts matching numeric item reservations and
  both clipboard HELLO capabilities; legacy refusal precedes settings/secrets.
  Actual remote/browser/OS transfer/revoke acceptance remains open.
  [Native adapter evidence](docs/history/iterations/201-250.md#iteration-237),
  [Controller contract](docs/CLIPBOARD_SESSION.md),
  [evidence](docs/history/iterations/201-250.md#iteration-234).
  Explicit nonsecret factory/IPC reservations and independent prepared RWC1
  byte chunks now cover the full 16 MiB item without larger control messages;
  Server control reassembly/credit now passes both-way 16 MiB virtual-clock and
  multi-window Unicode actual-socket/fake-RDP fixtures, with input interleave,
  independent deadlines and controller retirement. Native adapter selection
  passes synthetic full-item and actual worker TLS checks. The explicit browser
  owner now uses bounded RWC1 windows, original deadlines and late-permission /
  detach barriers. Actual remote/OS transfer remains open.
  [Browser contract](docs/CLIPBOARD_BROWSER.md).
  Actual Windows/XRDP JPEG/H.264 viewer regression keeps clipboard off, checks
  zero native/browser requests, nonblank 1080p, cursor/attachment replay and
  empty runtime. This is not enabled clipboard acceptance.
  [Off-path evidence](docs/history/iterations/201-250.md#iteration-239).
  Per-operation browser admission now waits for initial native ACK/owned-offer
  drain, with failing-before/passing-after Edge evidence. Actual Windows/XRDP/Edge
  now passes one Unicode offer ACK, no-format revoke ACK while ready, fresh-token
  replay and joined cleanup, with zero remote reads or host Clipboard API requests.
  The first failed invocation is retained; application consumption/readback and
  OS clipboard acceptance remain open. [Probe/readiness evidence](docs/history/iterations/201-250.md#iteration-240).
  Actual Linux primary and framed IPC now pass the same fixed Unicode offer /
  no-format revoke ACK, ready-source barrier, heartbeat and empty-runtime cleanup,
  with zero reads. This is private Node/native evidence, separate from browser /
  application/OS acceptance. [Linux carrier evidence](docs/history/iterations/201-250.md#iteration-241).
  [Control contract](docs/CLIPBOARD_CONTROL.md), [evidence](docs/history/iterations/201-250.md#iteration-236).
  [Chunk/reservation contract](docs/CLIPBOARD_CHUNKS.md),
  [evidence](docs/history/iterations/201-250.md#iteration-235).
  [Revocation evidence](docs/history/iterations/201-250.md#iteration-233).
- [x] DONE for clipboard private transport — Versioned RWI1 class/correlation
  bounds, dedicated latest-state/one-result output and full 16 MiB command delivery
  pass actual Windows/Linux process/carrier tests, native/Node regression and
  local sanitizer/fuzz checks. Unselected workers explicitly return unavailable;
  typed private selection is implemented above. Public session/browser selection and
  actual remote acceptance remain open.
  [Contract](docs/CLIPBOARD_IPC.md), [evidence](docs/history/iterations/201-250.md#iteration-228).
- [x] DONE for prepared private clipboard payloads — Independent bounded native /
  TypeScript scalar-state and Unicode command/result codecs pass golden, malformed,
  ownership and exact-size tests, local sanitizer/fuzz and full Node regression.
  Public session/browser selection and actual remote acceptance remain open.
  [Contract](docs/CLIPBOARD_IPC.md), [evidence](docs/history/iterations/201-250.md#iteration-227).
- [x] DONE for native public text owner — Independent direction policies,
  Unicode advertisement/ACK/data callbacks, one outstanding remote request and
  stale-response/timeout/retirement ownership pass actual pinned CLIPRDR with
  simulated SVC on Windows/Linux. Public session/browser activation and actual
  remote acceptance remain open. [Contract](docs/CLIPBOARD_TEXT_SESSION.md),
  [channel evidence](docs/history/iterations/201-250.md#iteration-226). Serialized IPC/RDP handoff now retains
  one command/result with admitted authority, peer completion and finite dispatch /
  publication deadlines; linked fixtures also verify RDP-thread cleanup before
  root-thread destruction. [Handoff evidence](docs/history/iterations/201-250.md#iteration-230).
- [x] DONE for prepared CLIPRDR ingress — Header admission before fragmented-body
  allocation, bounded tables/names and public receive routing pass Windows/Linux
  native and actual pinned-channel/fake-SVC checks plus seeded sanitizer fuzz.
  Public session/browser selection and actual clipboard acceptance remain open.
  Valid over-policy data is drained without body allocation and completes only
  the read as refused; the full wire maximum fits classic SVC fragmentation.
  [Contract](docs/CLIPBOARD_INGRESS.md), [initial evidence](docs/history/iterations/201-250.md#iteration-225),
  [quota/fragment evidence](docs/history/iterations/201-250.md#iteration-229).
- [~] IN PROGRESS — Explicit text directions/item caps pass native, Node, server
  and Edge fixtures, including full 16 MiB composition. Actual remote direction /
  quota, other required formats and total-resource acceptance remain open.
- [x] HTML clipboard — Opt-in negotiated HTML with bounded CF_HTML/inner-item
  codecs, shared HTML/Unicode native ownership, private IPC, public session/control
  transport and explicit reference ClipboardItem actions/conversion. Named
  Windows/Edge OS and Windows-/Linux-worker remote application roundtrips pass,
  including Linux RWS1/framed IPC and an explicit Unicode-only XRDP refusal.
  Full local/hosted regression, exact GCC 8.3 and sanitizer/fuzz gates pass at
  private `bba3c98` / public `04fd0cc`. Safe static formatting/browser permission
  limits are documented. Versioned 0.4.0 is also publicly delivered with exact
  npm/standalone acceptance; other formats and full Stage 7 remain separate.
  [Public delivery](docs/CLIPBOARD_BROWSER.md#040-public-delivery),
  [source acceptance](docs/CLIPBOARD_BROWSER.md#html-source-feature-acceptance),
  [contract](docs/CLIPBOARD_TEXT.md#html-codec-in-development).
- [x] Image clipboard where negotiated — Opt-in bounded DIB/DIBV5/RGBA native,
  private/public transport and explicit PNG reference UI are source accepted at
  private `f922a9a` / public `794f9b7`. Three named Windows/Edge application
  profiles pass both directions/new revisions with Windows and Linux
  RWS1/framed workers. All current required local/hosted/compiler/fuzz/runtime
  gates pass. Versioned 0.5.0 npm/standalone delivery and all eight fresh
  registry consumers now pass; [public acceptance](docs/RELEASE_0_5_0.md#public-delivery).
  Published 0.4.0 has no image support. Full Stage 7, total-resource
  and arbitrary color/browser/server matrices remain separate.
  [Source acceptance](docs/CLIPBOARD_BROWSER.md#image-source-feature-acceptance).
- [x] Session sandbox and safe path resolver.
  Accepted for the supported 0.6.0 paths: retained-root traversal/link/special
  object controls, public package native IO, actual Windows application and
  installed Astra/RED OS ownership/cleanup profiles pass.
  [Current capability acceptance](docs/FILES.md#accepted-managed-file-capabilities).
  Internal native owner and bounded worker file IPC now pass Windows/Linux
  transport and Astra/RED OS component checks. Authenticated opaque IDs and
  scoped native drives are implemented. Native cleanup of declared managed
  trees after both owners die now passes actual worker tests. Automatic
  live-Node retirement and delayed registry-capacity return also pass actual
  worker/HTTP checks and connected Windows/Linux-worker to Astra crash runs;
  two simultaneous Astra/RED OS sessions now also pass quota/namespace
  isolation, staged-upload crash cleanup and a real replacement RDP connection
  while the sibling remains readable (Windows and both Linux transports).
  Complete linked/product acceptance remains required.
  A new Windows adapter stress exposes intermittent `FILE_NOT_EMPTY` after
  child removal. The bounded same-handle namespace-completion candidate now
  passes native suites, 85 Windows adapter/lifecycle cases, full workspace
  check and both Linux transports. Astra/RED OS and actual RDP repeats await
  reachable lab hosts. RED OS/GCC 11 component repeats now pass 95 cases /
  8704 assertions with verified private-payload cleanup; current Windows and
  both Linux transports also pass the complete real HTTP/RDPDR CRUD/read-only
  composition against RED OS with mandatory captured-PID exit. Astra and
  Astra repeats now pass the same 95 cases / 8704 assertions and three real
  HTTP/RDPDR profiles. Current two-server crash/isolation/replacement repeats
  pass all three worker profiles (nine real connections), with joined cleanup.
  The namespace-deletion fix passes its named integration scope; Windows
  RDP-server application checks now pass on all three worker profiles; full
  product gates remain open, so this whole item is not
  accepted by those passes.
  [Dead-owner cleanup scope](docs/RUNTIME_RECOVERY.md#claimed-managed-file-trees-unreleased).
  [Current implementation and evidence](docs/DEVELOPMENT.md#current-functional-work).
- [x] Streaming file upload/download REST API.
  Accepted in public 0.6.0: eight independent registry projects pass 15 native
  profiles with 131111-byte producer-before-EOF streaming and joined cleanup;
  actual installed HTTP/RDPDR profiles pass separately.
  [Current capability acceptance](docs/FILES.md#accepted-managed-file-capabilities).
  Unreleased opt-in HTTP routes and session-scoped opaque IDs are implemented;
  actual HTTP/native worker tests use synthetic connected RDP state. Separate
  Windows/Linux workers now pass actual HTTP/NativeSessionWorker/Astra RDPDR
  composition, including both Linux transports. Bounded Linux tmpfs now proves
  HTTP 507/ENOSPC, repeated quota refund and fresh IO through both transports;
  actual two-server concurrent quota/ID isolation and crash/replacement pass
  the same three worker profiles.
  Local development npm archives now pass four independent installed adapter
  projects on each OS: five Windows and ten GCC 8.3 Linux file/IPC profiles,
  including strict TypeScript, producer-before-EOF streaming, owner refusal,
  host body parsing and joined PID/root cleanup. RDP state is synthetic in
  these package checks; future exact published archives and installers remain
  separate gates. [Installed package evidence](docs/DEVELOPMENT.md#installed-package-checks).
  Local Windows/Linux portable archives also pass real native file-policy
  initialization, JWT ownership and pre-connect refusal/cleanup; successful
  connected transfer now also passes against Astra/RED OS in fresh Windows
  and Linux portable candidates, through real JWT/HTTP/RDPDR with read-only,
  quotas, stale IDs and joined launcher cleanup. A reproduced early 413 TCP
  reset is addressed by bounded discard before refusal; eight fresh portable
  runs and the focused/full workspace checks pass its named scope.
  [Portable evidence and remaining gates](docs/DEVELOPMENT.md#portable-connected-file-check-and-early-refusal).
  Fresh local DEB/RPM also pass actual installed systemd service / private Node /
  JWT / RDPDR file roundtrips on Astra and RED OS, followed by configuration
  restoration and uninstall. A private-checkout EACCES is fixed by normalizing
  only public program modes; configuration/runtime privacy stays unchanged.
  [Installed scope](docs/DEVELOPMENT.md#installed-linux-managed-files-and-program-permissions).
  Windows-server/disk-full and final published/installer acceptance remain open. Live-Node file
  fault retirement/capacity now passes actual-worker tests with synthetic RDP.
  [API and acceptance boundaries](docs/FILES.md).
- [x] RDPDR managed drive redirection.
  Accepted in public 0.6.0: three dedicated Windows application profiles and
  exact installed Astra/RED OS packages pass Unicode CRUD, readback and cleanup.
  XRDP legacy deletion remains an explicit trusted-host compatibility policy.
  [Current capability acceptance](docs/FILES.md#accepted-managed-file-capabilities).
  Native scoped shares and a session-wide bounded drive-handle backend are
  implemented, including read-only, sharing modes, deferred deletion and the
  HTTP quota/download-pin boundary. A bounded wire codec and public FreeRDP
  device/IRP adapter now pass component tests. Bounded SVC writes, stream-cache
  limits and joined callbacks also pass with the actual SDK plugin and synthetic
  SVC/server packets. Session VFS basic metadata and a narrowed IO capability
  response are implemented. Guarded runtime selection, private CONFIGURE v15
  and alias expansion are now implemented; the full remote application/platform
  matrix and packaged acceptance remain open. [Current adapter scope](docs/FILES.md#rdpdr-codec-and-public-sdk-adapter-in-development).
  Actual Windows-worker to Astra XRDP/FUSE create/read/write/truncate/rename,
  binary/Unicode transfer and read-only refusal now pass. The observed XRDP
  delete sequence omits DELETE access; strict refusal preserves the file.
  A subsequent trusted-host opt-in now passes the same server's complete owned
  file/directory CRUD, including post-delete enumeration and native-owner
  readback. The identical worker still refuses legacy deletion under the
  default strict policy. Linux worker also passes the same real Astra CRUD
  through RWS1 and framed IPC. Separate real HTTP-to-Astra RDPDR composition
  also passes all three worker/transport profiles. Windows-server application
  checks now pass on all three worker profiles; packaged acceptance remains
  open. Named actual Astra connected-crash
  recovery now passes on Windows/Linux workers with Node alive.
  Concurrent Astra/RED OS sessions also preserve the sibling's actual drive
  readback through crash, joined cleanup and real RDP replacement.
  [Two-server isolation scope](docs/FILES.md#two-server-session-isolation).
  [Interoperability checkpoint](docs/FILES.md#actual-xrdp-interoperability-checkpoint),
  [explicit compatibility policy](docs/FILES.md#xrdp-legacy-delete-policy).
- [x] `thinclientDrives` alias mapped to sandbox drive descriptors.
  Runtime expansion and shared validation are implemented and pass synthetic
  IPC / actual-worker strict-TLS tests. Final 0.6.0 Windows application and
  public npm/standalone profiles use the alias for the actual read-only share;
  all ten exact packages, installers and both target-server profiles pass.
  The connected public portable resource tests repeat the alias together with
  an explicit RW drive, real CRUD and three read-only refusals.
  [Versioned evidence](docs/RELEASE_0_6_0.md#public-delivery),
  [resource evidence](docs/FILES.md#connected-public-standalone-disk-full-acceptance).
- [x] Read-only drive enforcement.
  Accepted in public 0.6.0: native immutable-rights guards and three actual
  remote mutation refusals pass on all named Windows and installed Linux
  profiles, including the alias-backed read-only share.
  [Current capability acceptance](docs/FILES.md#accepted-managed-file-capabilities).
  Share-policy and per-entry attribute enforcement are implemented. Maximum
  allowed access now selects a reduced immutable grant for read-only entries;
  explicit forbidden rights remain refused. Wire and public SDK regressions
  pass, with actual Astra HTTP/RDP regression on Windows/Linux workers.
  The named Windows-server application checks now pass on all three worker
  profiles; full matrix and packaged acceptance remain open.
  [Rights and current scope](docs/FILES.md#session-file-metadata).
- [x] DONE for explicit deferral — public HTTP capabilities return
  `clipboardFiles: false`. Enabled file clipboard selection in every direction
  refuses before backend/native process start; actual file-manager Ctrl+C/Ctrl+V
  remains unimplemented and is not supplied by HTTP/RDPDR. Focused refusal
  checks pass **2/2**, full Windows `pnpm check` **1280 / 73 skips / 1353 total**,
  and the Linux HTTP/file/runtime/capability subset **90 / 4 skips / 94 total**.
  This checks the explicit deferred-flag alternative, not file clipboard itself.
  [Scope and future acceptance](docs/FILES.md#file-clipboard-is-deferred).
- [ ] Quota/disk-full handling.
  Saved opt-in Linux HTTP/native tmpfs tests pass through framed IPC and RWS1:
  twelve real ENOSPC failures return 507, join abort, refund space/quota and
  allow fresh upload/download. Unsafe roots refuse before allocation; ordinary
  test runs skip without the explicit small tmpfs. Windows, connected-RDP and
  packaged resource acceptance were separate gates at that checkpoint.
  Actual **public 0.6.0 Linux portable** now passes twelve connected HTTP 507
  refunds and a real redirected-drive write that exhausts a private 1 MiB
  tmpfs against both Astra and RED OS. Native partial-content verification,
  cross-HTTP 507, delete/stale-ID/space recovery, subsequent real CRUD/read-only
  and joined cleanup pass. Actual Windows NTFS/HTTP disk-full now passes
  both the source worker and exact published npm 0.6.0 runtime: twelve 507
  responses, zero physical free bytes, repeated quota refund, fresh IO and
  detached/empty cleanup. RDP state is synthetic in that Windows fixture;
  exact public DEB/RPM installed services now also pass on Astra/RED OS:
  twelve connected HTTP 507 responses, independently observed zero physical
  free bytes, subsequent real RDPDR CRUD/read-only and complete uninstall /
  configuration / bounded-mount cleanup. Actual installed RDPDR-initiated exhaustion also passes both platforms:
  strict-SSH free space zero, verified native partial bytes, cross-HTTP 507,
  owned delete/stale-ID/space recovery and subsequent CRUD. The exact public
  Linux runtime now also passes actual Windows-server RDPDR exhaustion over
  RWS1 and framed IPC, plus an independent RWS1 repeat: Windows error 112,
  zero physical free bytes, exact native partial-content verification, 13 HTTP
  507 responses per run, deletion/refund and subsequent real CRUD/read-only /
  joined cleanup. The initial final-cleanup assertion failure remains recorded
  separately; no assertions were relaxed. Connected Windows-worker/NTFS and
  the exact public MSI / LocalService scenario now pass two fresh Windows CI
  runners with unchanged functional helper/product bytes: twelve staged HTTP
  507 refunds, real RDPDR error 112, zero physical free bytes, verified partial
  content, subsequent CRUD/read-only/quota refusals and complete service /
  account / task / volume cleanup. Broader resource/soak acceptance remains
  open; this checkbox stays open.
  [Installed Windows MSI scope](docs/FILES.md#installed-windows-msi-physical-full-acceptance).
  [Windows-server scope](docs/FILES.md#connected-windows-server-rdpdr-disk-full-acceptance).
  [Installed Linux scope](docs/FILES.md#installed-astra-and-red-os-disk-full-acceptance).
  [Windows physical scope](docs/FILES.md#bounded-windows-ntfs-disk-full-check).
  [Connected public scope](docs/FILES.md#connected-public-standalone-disk-full-acceptance).
  [Bounded test and evidence](docs/FILES.md#bounded-http-disk-full-acceptance).

**Gate:** Unicode clipboard + remote file CRUD through redirected drive; traversal/symlink tests pass.

## Stage 8 — printer, smartcard, serial, parallel, USB

- [x] DONE for bridge-host metadata — Capability inventory for CUPS/PCSC/libusb/device nodes.
  Development branch `feature/host-device-inventory` starts with matching
  TypeScript/native binary codecs: explicit bridge-host origin, five classes,
  separate availability/refusal states, 128-device / 64-KiB response bounds,
  strict UTF-8 metadata and request-selection validation. Native decoding uses
  fixed storage and borrowed views. The private worker/SDK implements single-use
  inventory before any session settings/credentials/IO, with an eight-second
  maximum RPC deadline and joined cleanup. Windows printer/PCSC/COM/LPT and
  Linux device-node providers are implemented, with pinned CUPS/WinPR-PCSC/
  libusb bindings for linked builds. Actual backend/platform and installed-
  consumer acceptance passes below; physical redirection stays disabled by its
  existing gates.
  The exact metadata component passes twice on Astra 1.7.5 and RED OS 7.3,
  separately from GCC 8.3 compiler checks. Two isolated CUPS/virtual-PCSC daemon
  containers pass populated snapshots and normal shutdown. Four fresh Windows
  npm projects now pass strict types, adapter exports, automatic packaged-runtime
  selection and actual inventory RPCs. The bundled hosted workflow
  `41072347727` also passes all four installed consumers on Windows and Linux:
  four framed profiles on Windows and eight framed/RWS1 profiles on Linux.
  Exact 0.7.0 prepublication distribution acceptance now passes Windows,
  Ubuntu, Astra and RED OS; public delivery remains pending.
  Standalone now has an explicit operator-only `--inventory` CLI, without
  reading server configuration or starting HTTP/RDP. Pure/invalid-CLI controls
  and source CLI composition with the real SDK/native worker pass; runtime
  resolution is controlled in that composition, so installed acceptance remains
  separate. [Usage and limits](docs/STANDALONE.md).
  An additional Windows source-CLI staging check uses an unchanged entry point
  and real installed npm packages with automatic resolution (no loader hook),
  and joins its empty private runtime. It is not final 0.7.0 installer evidence.
  All current hosted source gates pass, including exact GCC 8.3, GCC 11,
  GCC 12, MSVC, sanitizers and both linked bundled profiles. The Windows
  timeout and unchanged successful repeat are retained, not suppressed.
  [Source acceptance and commit references](DEVICE_REDIRECTION.md#inventory-source-feature-acceptance)
  permits merging the feature. Exact 0.7.0 npm consumers, portable/installed CLI,
  four-platform 0.6.0 upgrades and actual RED OS/GCC 11 CTest 43/43 now pass.
  Remote test inputs are removed; public delivery remains a separate gate.
  [Versioned prepublication acceptance](docs/RELEASE_0_7_0.md).
  [Development contract](PROTOCOL.md#host-device-inventory-grammar-in-development).
- [ ] Host printer allowlist and RDPDR printer mapping.
- [ ] Virtual spool printer backend and download event/API.
- [ ] Smartcard reader enumeration and redirection.
- [ ] Smartcard PIN prompt path and redaction.
- [ ] Serial allowlist + RDPDR mapping.
- [ ] Pseudo-TTY loopback integration test.
- [ ] Parallel mapping capability and smoke path.
- [ ] USB inventory + explicit selection.
- [ ] URBDRC redirect/unplug/replug behavior.
- [ ] Audit events for sensitive devices.

**Gate:** each advertised feature passes its hardware/emulator integration test; unsupported features report false rather than failing session creation.

## Stage 9 — advanced connection/Remmina-like settings

- [x] DONE for named Windows localhost dual-family transport — Actual FreeRDP
  observes IPv6 preference/current OS order, force-4 precedence, force-6 refusal
  after owned IPv6 listener close and IPv4 fallback through two loopback TLS
  endpoints. Five workers preserve heartbeat, zero application bytes and joined
  PID/runtime cleanup; focused IP suites pass 9/9. Full Node repeat Windows
  785 / 51 skips and Linux 676 / 163 skips pass. The first capacity failure and
  repeat timeout diagnostics remain separately open resource limitations; no
  deadlines are relaxed. Broader DNS, IPv6 RDP/server and linked Linux gates
  remain open. [Evidence](docs/history/iterations/301-350.md#iteration-327).

- [x] DONE for named IP-family WEB controls — Independent capability gates
  default/system/IPv6-first preference and default/IPv4-only/IPv6-only choices;
  defaults omit fields and explicit system order preserves false. Pure cases
  and four Edge/HTTP capability combinations pass 11/11, CLI guards 3/3.
  Actual Windows prefer-6/force-4 form projection, 1080p JPEG, heartbeat and
  Disconnect pass with joined PID/runtime cleanup. Full Node Windows 783 / 51
  skips and Linux 675 / 162 skips pass; native artifacts remain unchanged.
  Broader dual-stack DNS, IPv6 RDP/server and linked Linux gates stay open.
  [Evidence](docs/history/iterations/301-350.md#iteration-326).

- [x] DONE for named Windows IP-family backend projection — Existing preference
  and force-4/6/null fields use explicit capability and canonical schema 12;
  false/null require support before CONFIGURE/SECRET while omission preserves
  legacy bytes/defaults. Public SDK readback, both loopback IP families and
  opposite-family refusal pass; actual Windows force-4/prefer-6-on-IPv4-literal
  JPEG/heartbeat and joined cleanup pass. New linked/foundation CTest 33/33 and
  17/17, full Node Windows 780 / 51 skips and Linux 674 / 160 skips pass.
  Linked Linux, dual-stack DNS selection/fallback and actual IPv6
  RDP/server acceptance remain open. [Contract](docs/IP_SETTINGS.md),
  [evidence](docs/history/iterations/301-350.md#iteration-325).

- [x] DONE for manual custom quality profile — The WEB form exposes the existing
  custom profile without injecting appearance booleans when inherited. All four
  profiles agree with strict schema; Edge/synthetic HTTP verifies balanced to
  custom selection on capable and old backends, with unchanged secret/ownership
  behavior. Focus passes 8/8; full Node Windows 766 / 51 skips and Linux
  666 / 154 skips pass. Native code/artifacts remain unchanged; broader actual
  profile/server effects and resource gates stay open.
  [Evidence](docs/history/iterations/301-350.md#iteration-324).

- [x] DONE for named Windows JPEG appearance-form smoke — Manual form passes
  six explicit booleans through the real API/native adapter, exact approved
  session certificate, nonblank 1920×1080 / 5 FPS Edge canvas, heartbeat and form
  Disconnect with joined PID/runtime cleanup. The first blank-frame test failure
  is retained; waiting for nonblank output within the original deadline passes.
  Windows/Linux CLI guards 2/2 each and lint/format pass; production/native
  artifacts remain unchanged from iteration 322. Server visual/policy effects,
  other profiles and wider acceptance stay open. [Evidence](docs/history/iterations/301-350.md#iteration-323).

- [x] DONE for manual WEB appearance controls — Six inherited/enabled/disabled
  selects preserve omitted fields and explicit false. Actual capability gates
  controls and submission; legacy profiles retain video-only behavior. Pure
  builder/ownership and two Edge/synthetic HTTP cases pass 8/8; full Node passes
  Windows 765 / 51 skips and Linux 665 / 154 skips, unchanged native CTest 32/32
  and 17/17. The named actual Windows form chain is separately verified above;
  server visual/policy and broader integration remain open.
  [Evidence](docs/history/iterations/301-350.md#iteration-322).

- [x] DONE for named Windows quality/performance projection — Existing six
  appearance booleans and selected presets use capability-gated schema 11,
  checked public FreeRDP setters and canonical masks. Legacy workers retain
  encoder-only profiles and refuse explicit appearance before configuration/
  secrets. Portable/synthetic/native SDK cases and four actual Windows RDP
  profile/override connections pass 1080p JPEG/heartbeat and joined cleanup.
  New Windows linked CTest 32/32, Linux foundation 17/17, full Node Windows
  763 / 51 skips and Linux 664 / 153 skips pass with byte-identical native
  source inputs across builds. Server visual/policy effects, Linux linked/
  wider profiles and budgets remain open. Manual UI controls are separately
  verified in their own named scope, including the Windows JPEG/form smoke above.
  [Contract](docs/RDP_PERFORMANCE_SETTINGS.md), [evidence](docs/history/iterations/301-350.md#iteration-321).

- [ ] RDP Gateway with same/separate credentials.
- [ ] Proxy support.
- [~] IPv4/IPv6 preference/force options — Typed API/private/native mapping,
  Windows loopback IPv4/IPv6 transport and named actual IPv4 Windows RDP cases
  pass the backend slice above; manual controls pass their named gate.
  The named localhost dual-family case passes; linked Linux, broader DNS
  preference/fallback history and actual IPv6 RDP/server profiles remain open.
- [ ] Timeouts/reconnect policy and auto-reconnect cookie where supported.
- [~] IN PROGRESS — Opt-in single-primary DisplayControl at 100% scale satisfies ADR-011 and works through native/private IPC, public control leases and actual XRDP browser H.264/JPEG resize/restoration. The named private native Windows RDP resize and public Edge H.264/JPEG browser resize/restoration also pass; broader Windows-server settings, DVC resource audit and soak acceptance remain open. [XRDP evidence](docs/history/iterations/001-050.md#iteration-019), [Windows private-worker evidence](docs/history/iterations/301-350.md#iteration-350), [Windows H.264 browser evidence](docs/history/iterations/351-400.md#iteration-352), [Windows JPEG browser evidence](docs/history/iterations/351-400.md#iteration-353).
- OUT OF CURRENT SCOPE — Multimonitor policy: explicitly excluded by the user, ADR-011; not an unimplemented release requirement.
- [~] IN PROGRESS — Selected quality profiles and six explicit appearance
  booleans now map through capability-gated schema 11 to checked public FreeRDP
  settings. New Windows SDK/worker and Linux portable source builds, synthetic
  compatibility/wire cases and four actual Windows RDP configuration smokes pass;
  full Node regression passes. Server visual/policy behavior, Linux linked/
  wider profiles and broader browser-to-RDP appearance acceptance remain open;
  the manual controls and named Windows JPEG/form chain pass their separate
  gates above.
  [Contract](docs/RDP_PERFORMANCE_SETTINGS.md), [evidence](docs/history/iterations/301-350.md#iteration-321).
- OUT OF CURRENT SCOPE — Additional RDP smart sizing/scales/orientation profiles: existing orientation 0 and scale 100% are sufficient under ADR-011. Browser CSS sizing/coordinate mapping remains supported independently.
- [ ] RemoteApp/RAIL capability and launch parameters.
- [ ] Custom VC/DVC admin allowlists.
- [ ] Restricted admin/pass-the-hash privileged policy path.
- [ ] Per-session FreeRDP log level/filter with secret redaction.

**Gate:** config schema → FreeRDP settings mapping has unit coverage and at least one integration test per major category.

## Stage 10 — hardening, packaging and performance acceptance

- [x] DONE for capability-gated local Windows resource batching — New Debug
  HELLO/CLI support selects a bounded shared Node owner; legacy workers retain
  scalar queries. Original 16/128 admission, one-second polls and two-/three-second
  helper/policy bounds stay unchanged. Cancellation/expiry/shared retirement,
  per-PID errors and malformed-group synthetic checks pass. Actual forty-call
  control uses three launches; original forty-worker capacity passes focused
  and full runs, with zero worker failures and joined empty owners. New source
  CTest 34/34 and full Node 854 / 51 skips pass. Shared OS-failure/connected /
  sustained gates, other-platform batching and Release adoption remain open.
  [Contract](docs/PROCESS_RESOURCE_BATCH.md), [evidence](docs/history/iterations/351-400.md#iteration-378).
  Controlled actual child timeout, partial/all-member cancellation and missing
  executable integration now also passes; full Node is 857 / 51 skips / 908,
  zero failures, on the same unchanged native output. This is simulated helper
  process failure, not actual Windows query API failure acceptance.
  [Additional evidence](docs/history/iterations/351-400.md#iteration-379).

- [x] DONE for phase-aware capacity diagnostics — Lifecycle-only fixtures retain
  startup/active/retiring failure categories, fixed maximum query timings and
  event-loop delay; failed sampling waits stop on the actual known error.
  Synthetic notification / actual native ownership control and 40-slot resource
  cases pass Windows/Linux 2/2 each, lint/format and CTest 33/33 / 17/17.
  A new run classifies five IPC timeouts as retiring; later focus has none but
  still observes active queries beyond nominal three seconds. No production
  policy or timeout is changed; original spike, absolute-deadline behavior,
  connected/OS/load/soak gates remain open. [Evidence](docs/history/iterations/301-350.md#iteration-328).

- [x] DONE for named connected Windows public CPU failure — Actual public
  1080p JPEG precedes the first global/connected CPU baseline; bounded valid
  16-flight IPC load produces growing OS counters and exact WORKER_CPU_LIMIT
  through the native adapter/manager/control WS. Both channels close 1000,
  HTTP snapshot/token statuses and pre-factory overflow refusal pass, with
  joined native/query/PID/runtime retirement. The original public RSS mode
  also passes again. Full Node Windows 756 / 51 skips and Linux 657 / 153 skips,
  CTest 31/31 and 17/17 pass. Linux is common foundation evidence; browser
  terminal display, connected siblings, complete budgets, hard OS/CI/deployment
  and soak gates remain open. [Evidence](docs/history/iterations/301-350.md#iteration-320).

- [x] DONE for named connected Windows public RSS failure — Actual source-
  receipt-selected Release worker produces 1080p JPEG over media WS before the
  first connected RSS sample. Exact WORKER_MEMORY_LIMIT reaches control once,
  both channels close 1000, GET retains HTTP 200 failed snapshot, new tokens
  refuse 409 and an unused token upgrade refuses 401. Pre-factory overflow and
  joined native/query/PID/runtime retirement pass. Full Node Windows
  755 / 51 skips and Linux 656 / 153 skips, CTest 31/31 and 17/17 pass.
  Linux is common/foundation evidence only; the helper is Windows-only. Browser
  rendering/terminal display, CPU failure, connected siblings, complete budgets,
  hard OS failures and soak remain open. [Evidence](docs/history/iterations/301-350.md#iteration-319).

- [x] DONE for native RSS failure over public HTTP/WS at certificate wait —
  Actual linked Windows worker/OS sampling with a local synthetic TLS peer
  delivers one fixed WORKER_MEMORY_LIMIT control error, closes control/media
  with 1000, retains HTTP 200 failed snapshot, refuses new token issuance with
  409 and an unused old token upgrade with 401. Joined native PID/runtime
  cleanup and known-value diagnostic regression pass. Full Node Windows
  754 / 51 skips and Linux 655 / 153 skips pass; Linux foundation explicitly
  skips linked integration. This does not accept a connected desktop/public
  failure, connected siblings, CPU composition or sustained budgets.
  [Evidence](docs/history/iterations/301-350.md#iteration-318).

- [x] DONE for named native-adapter/registry RSS failure composition — Actual
  Windows RDP with an isolated Release worker passes connected 1080p JPEG,
  first over-cap RSS sample, exact fixed WORKER_MEMORY_LIMIT envelope, one
  error event, pre-factory overflow refusal, token/media authority retirement
  and capacity release after joined close with empty PID/runtime/query owners.
  A separate actual-native/synthetic-TLS pending-certificate case also passes.
  Full Node Windows 753 / 51 skips and Linux 655 / 152 skips, CTest 31/31 and
  17/17 pass; final helper-only wait correction passes actual RDP and focused
  6/6 each. Failed lab/fixture runs are retained. Public HTTP/WS delivery,
  connected siblings, CPU composition, hard OS/total-budget and soak gates remain
  open. [Evidence and exact chronology](docs/history/iterations/301-350.md#iteration-317).

- [x] DONE for named Windows connected RSS-limit breach — Actual connected
  1080p JPEG and heartbeat precede sampling; the first global/connected RSS
  sample exceeds a one-byte fixture cap and produces exact WORKER_MEMORY_LIMIT.
  Joined PID/runtime cleanup and both healthy/CPU-breach repeats pass without
  remote application actions or artificial memory load. Full Node Windows
  751 / 51 skips and Linux 654 / 151 skips pass. This is private single-worker
  failure acceptance; registry/sibling isolation, total-session/startup budgets,
  hard OS failures, production deployment and soak remain open.
  [Contract](docs/RDP_RESOURCE_SMOKE.md), [evidence](docs/history/iterations/301-350.md#iteration-316).

- [x] DONE for named Windows connected CPU-limit breach — Actual connected
  1080p JPEG and heartbeat precede the first real CPU baseline. Bounded local
  16-flight IPC load then produces increasing platform counters and exact
  WORKER_CPU_LIMIT under an explicit 1% fixture cap; joined PID/runtime cleanup
  and an ordinary healthy-policy repeat pass. Full Node Windows 749 / 51 skips
  and Linux 652 / 151 skips pass. This is private single-worker acceptance;
  connected registry/sibling isolation, RSS breach, production budgets and
  sustained/OS-failure gates remain open.
  [Contract](docs/RDP_RESOURCE_SMOKE.md), [evidence](docs/history/iterations/301-350.md#iteration-315).

- [x] DONE for named Windows connected CPU/RSS healthy-policy smoke — Explicit
  native-source receipt selection verifies worker/helper hashes before reading
  lab credentials. Actual approved-session Windows RDP with isolated Release
  and matched Debug workers passes eight connected samples per resource,
  100%-of-one-core / 256 MiB policies, 1080p JPEG, heartbeat and joined PID/runtime
  retirement. No remote input/app launch or saved desktop image occurs.
  Full Node Windows 744 / 51 skips and Linux 647 / 151 skips, CTest 31/31 and
  17/17 pass; Linux is common unit/foundation evidence only. Connected cap
  breaches, total-session/between-sample/startup budgets, production helper/
  package adoption, platform and soak gates remain open.
  [Contract](docs/RDP_RESOURCE_SMOKE.md), [evidence](docs/history/iterations/301-350.md#iteration-314).

- [x] DONE for native resource-policy crash/retirement composition — One actual
  framed worker exits while a synthetic barrier holds completion of an actual
  OS resource read. Its registry slot/runtime remain owned until completion;
  two siblings keep CPU/RSS sampling and heartbeat, and one replacement starts
  after joined retirement. Windows shared CPU/RSS and Linux separate CPU-owner
  cases pass. Full Node Windows 694 / 92 skips and Linux 639 / 150 skips,
  CTest 16/16 and 17/17 pass. This does not accept an OS-stalled helper,
  forced-deadline expiry, simultaneous parent/worker kill or connected RDP
  failure. Production code, Release and pins are unchanged.
  [Evidence](docs/history/iterations/301-350.md#iteration-311).

- [x] DONE for configured unconnected CPU/RSS lifecycle capacity — Forty actual
  framed native workers at ordinary 1,000 ms polls, global 40 / per-principal
  20, pre-factory overflow refusal, five replacements and joined PID/runtime
  cleanup pass Windows/Linux; Linux parent FD count returns to baseline.
  Windows equal-interval policies share one CPU/RSS query; helper admission is
  bounded to 16 active / 128 waiting per Node context. Failed startup/queue
  controls and CPU/RSS measurements are retained; the three-second watchdog
  deadline is unchanged and Windows timing headroom remains small. Full Node
  Windows 693 / 92 skips and Linux 638 / 150 skips, CTest 16/16 and 17/17 pass.
  Connected concurrency/faults, total-session budgets, primary capacity beyond
  32, production helper adoption and soak remain open. Release and pins stay
  unchanged. [Evidence and changed files](docs/history/iterations/301-350.md#iteration-310).

- [x] DONE for actual unconnected native CPU-limit breach — Fixed 16-flight
  heartbeat load and genuine platform counter growth trigger WORKER_CPU_LIMIT
  at an explicit 1% fixture cap on Windows/Linux. The owned PID/runtime retire,
  all requests join and a sibling keeps heartbeat. CPU focus passes 17/17 each;
  full Node Windows 680 / 92 skips and Linux 627 / 148 skips, CTest 16/16 and
  17/17 pass. This is real C++ lifecycle load, not a production budget or
  connected RDP/media/concurrency/soak acceptance. Release and dependencies
  remain unchanged. [Evidence](docs/history/iterations/301-350.md#iteration-309).

- [x] DONE for local Linux CPU-query/policy lifecycle slice — New colocated
  helper uses bounded proc-stat parsing, actual `_SC_CLK_TCK`, checked exact
  conversion and joined descriptor/process retirement. Portable C++ passes
  6 cases / 62 assertions on MSVC/GCC 13; a focused GCC 12.4 helper query passes.
  Actual Linux native CPU/RSS polling/cancellation, owned test-process growth
  and separate synthetic breach/fault/isolation cases pass. Fresh Debug install
  retains exact binaries and passes 4/4 query controls. Focus is Linux 24/24,
  Windows 22 / 2 skips; full Node 626 / 148 skips and 679 / 92 skips, CTest
  17/17 and 16/16 pass. Release settings/artifacts and pins are unchanged.
  Connected application overload/total-session budgets, production adoption,
  OS-failure and broader platform/sanitizer/soak gates stay open.
  [Contract](docs/PROCESS_CPU.md), [evidence](docs/history/iterations/301-350.md#iteration-308).

- [x] DONE for optional sampled Windows CPU-policy lifecycle slice — Trusted
  host opt-in uses bounded cumulative queries and a conservative monotonic
  rate window, fixed failure codes and joined cancellation/cleanup. Actual
  unconnected C++ workers pass healthy CPU/RSS sampling; synthetic counters
  separately pass breach/sibling isolation, invalid/regressing/unavailable,
  deadline and late/uncertain-retirement cases. Focus is Windows 26/26 and
  Linux 18 / 8 skips; full Node 678 / 90 skips and 613 / 158 skips, CTest
  16/16 and 17/17 pass. The local Linux extension is separately verified above;
  connected application overload/total-session/production-helper/OS/soak gates remain
  open. Defaults, Release
  and dependency pins are unchanged. [Contract](docs/WORKER_CPU_POLICY.md),
  [evidence](docs/history/iterations/301-350.md#iteration-306).

- [x] DONE for typed Windows CPU-query prerequisite — Strict bounded schema-1
  parsing, validated PID, optional cancellation and joined query-helper close
  return cumulative CPU microseconds without raw OS output/reasons. Actual
  unconnected native-worker samples and eight cancellations preserve heartbeat
  and normal cleanup. Windows focused 10/10, full Node 662 / 90 skips and
  Linux 605 / 150 skips, CTest 16/16 and 17/17 pass. Linux validates common
  parser/refusals only; the separately verified sampled Windows policy above
  and Linux query extension above do not close Release helper adoption or actual
  overload/connected CPU gates. [Contract](docs/PROCESS_CPU.md),
  [evidence](docs/history/iterations/301-350.md#iteration-304); `df40276`.

- [x] DONE for native Windows CPU-counter prerequisite — The existing host
  helper reports bounded cumulative kernel+user microseconds through limited
  query access with RAII handle retirement and exact scalar/overflow checks.
  Actual owned-process CPU growth/grammar controls and portable 2-case/12-assertion
  conversion tests pass. Debug CTest Windows 16/16 and Linux 17/17, full Node
  654 / 90 skips and 599 / 148 skips pass. This native-only block does not claim
  the separately verified Node reader above, CPU watchdog or Linux process
  query; complete CPU/connected resource gates remain open.
  [Contract](docs/PROCESS_CPU.md), [evidence](docs/history/iterations/251-300.md#iteration-300); `059c866`.

- [x] DONE for cancellable shared RSS queries — Optional AbortSignal stops
  pre-aborted work before resource acquisition, joins proc-file/helper-process
  retirement and returns only a fixed cancellation error. Eight actual query
  cancellations preserve target-worker heartbeat and a subsequent sample;
  Linux parent FD count returns to baseline. Focus passes Windows 11/11 and
  Linux 12/12; full Node 640 / 90 skips and 586 / 147 skips, CTest 15/15 and
  16/16 pass. Watchdog enforcement and complete kernel/OS-failure/connected
  resource gates remain open. [Evidence](docs/history/iterations/251-300.md#iteration-295); `61ec364`.

- [x] DONE for bounded shared host RSS sampling — Existing Linux proc and
  Windows colocated-helper readers now share strict TypeScript, typed fixed
  errors and scalar-only output; lab wrappers preserve their existing errors.
  Focused compatibility/actual-owned-worker samples pass Windows 9 / 1 skip and
  Linux 10/10; full Node 638 / 90 skips and 584 / 147 skips, native CTest 15/15
  and 16/16 pass. This is a sampler prerequisite, not watchdog enforcement or
  CPU/private/total-session memory acceptance. [Contract](docs/PROCESS_RESIDENT.md),
  [evidence](docs/history/iterations/251-300.md#iteration-294); `f9ff66d`.

- [x] DONE for Linux foundation runtime smoke — Ordinary GCC CTest 8/8 and
  actual worker suite 12 passed / one Windows skip under UID 1000, read-only
  root, bounded runtime tmpfs, dropped capabilities/default seccomp and Docker
  init. No-init orphan zombie failure is retained; init/reaping is an explicit
  deployment requirement. This is separate from the production service image,
  linked Linux RDP/devices and resource/soak acceptance. [Evidence](docs/history/iterations/151-200.md#iteration-185).
- [x] DONE — Linux amd64 non-root multi-stage API/native artifact runtime.
  UID1000, production JS/dependency closure, private worker, actual HTTP/build /
  auth refusal and synthetic host/native lifecycle pass with primary IPC.
  Upstream source/fresh-checkout/distro builds and CI execution remain separate
  open gates. [Deployment](docs/CONTAINER_RUNTIME.md), [evidence](docs/history/iterations/201-250.md#iteration-211).
- [x] DONE — Read-only-root/init/cap-drop/no-new-privileges deployment example
  with bounded private runtime tmpfs passes the actual service fixture. Additional
  device mappings and broader load/resource acceptance remain open. [Evidence](docs/history/iterations/201-250.md#iteration-211).
- [x] DONE for documentation — Optional USB/DRI/serial/PCSC mapping reference
  records explicit nodes/socket directory, host permissions, numeric groups,
  retained non-root runtime restrictions and current public-device refusal.
  All 31 local links and reference-shell syntax pass; no device mapping is
  executed or accepted as supported. Stage 8/device/hotplug/isolation gates
  remain open. [Reference](docs/CONTAINER_DEVICE_MAPPINGS.md),
  [verification](docs/history/iterations/251-300.md#iteration-290); `63b980e`.
- [ ] seccomp/AppArmor recommendation and tested baseline profile if feasible.
- [~] Resource watchdogs and cleanup on abnormal exit — Optional trusted-host
  sampled worker RSS policy now fails an owned child on an observed cap breach
  or unavailable/deadline sample, stops polling and joins query/native/runtime
  retirement. Default behavior remains off. Actual unconnected Windows/Linux
  breach/healthy cases and separate synthetic fault/lifetime cases pass; CPU,
  startup/total-session memory, hard kernel/OS deadlines, connected RDP and
  broader abnormal-exit/soak acceptance remain open.
  Shared query diagnostics now separate admission/continuation, synchronous
  task invocation and joined task maxima. The current 40-worker control
  collects 969 paired samples with no active failures but three retirement
  IPC timeouts; earlier active query-deadline failures remain retained. This
  instrumentation does not close the load/retirement requirement or change
  its bounds. [Measured phases](docs/history/iterations/351-400.md#iteration-375).
  The full repeat still fails this load case (821 passed / 51 skips / one
  failure): twelve active resource-deadline failures, up to 149 ms synchronous
  invocation and 1,466 ms admission/continuation. No load correction is claimed.
  Invocation staging now yields between successive launches while preserving
  sixteen concurrent permit owners, cancellation and the original absolute
  admission/query deadlines. Controlled observer/expiry checks and the first
  unchanged Windows capacity control pass; the 2,949 ms maximum query remains
  near its 3,000 ms bound. Wider load/retirement stability remains open.
  [Scheduling evidence](docs/history/iterations/351-400.md#iteration-376).
  Full check still fails that resource sampling case: 825 passed / 51 skips /
  one failure, two active query expiries at up to 3,057 ms despite event-loop
  delay reduced to 372 ms. Helper launch volume/query headroom remains open.
  A prepared Windows sixteen-PID helper command and strict bounded positional
  codec now pass new linked Debug CTest 34/34 and actual helper/codec checks
  14/14. Current watchdogs remain scalar; automatic coalescing, individual
  cancellation/shared retirement, shared 16/128 admission and native-support
  gating remain required before adoption or any load-fix acceptance.
  [Prepared batch evidence](docs/history/iterations/351-400.md#iteration-377).
  The new profile's full check passes 832 / 51 skips and retains one failing
  scalar-watchdog capacity case, with two active deadline failures. Batch
  command availability alone is not a throughput/adoption acceptance result.
  [Contract](docs/WORKER_MEMORY_POLICY.md), [evidence](docs/history/iterations/251-300.md#iteration-296); `6752257`.
  A subsequent short Windows actual RDP 1080p healthy-policy smoke passes
  26 connected samples below the explicit 256 MiB cap, heartbeat/JPEG and joined
  empty-runtime close. This does not accept total-session/CPU, connected faults,
  Linux connected or sustained budgets. [Evidence](docs/history/iterations/251-300.md#iteration-298).
  Connected smoke helper commit: `be3ee69`.
  A separate optional Windows CPU policy now passes healthy unconnected native
  sampling and synthetic limit/fault/lifetime compositions. Actual overload,
  connected/total-session CPU, Linux CPU and production-helper adoption remain
  open. [Scoped CPU evidence](docs/history/iterations/301-350.md#iteration-306).
  Local Linux CPU queries and the same sampled policy also pass native/Node
  lifecycle and Debug-install checks. Actual overload, production helper,
  connected/total-session, OS-failure and broader platform/soak acceptance remain
  separate. [Linux CPU extension](docs/history/iterations/301-350.md#iteration-308).
  Genuine Windows/Linux CPU-counter breach under bounded native heartbeat load
  now also verifies owned-process cleanup and sibling survival. Connected
  RDP/application/media loads and configured resource-policy concurrency remain
  separate. [Actual native CPU control](docs/history/iterations/301-350.md#iteration-309).
  A later full-suite capacity run has an unexplained resource-query latency
  spike and worker failures; an unchanged standalone control and full repeat
  pass, but the repeat still records unclassified IPC timeouts. Original logs
  and thresholds are preserved. A subsequent phase-aware run identifies retiring
  timeouts and longer active query observations; no original root cause or
  production correction is claimed. A separate failing-before/passing-after
  control now proves RSS/CPU samples that return after a three-second deadline
  during a 3.1-second event-loop stall fail closed across separate and paired
  Windows queries; the original capacity-failure cause and wider load/OS timing
  acceptance remain open. [Original evidence](docs/history/iterations/301-350.md#iteration-327),
  [diagnostics](docs/history/iterations/301-350.md#iteration-328).
- [x] DONE for worker resource-query deadline enforcement under event-loop
  stalls — Absolute monotonic expiry checks prevent late RSS/CPU values from
  reviving an expired query for separate policies, paired Windows policies and
  the shared Windows helper. The actual-worker stall controls fail before and
  pass after; Windows resource focus 25/25, full Node 740 passed / 101
  platform/profile skips and CTest 33/33 pass. This does not identify the
  earlier capacity spike's root cause or prove hard OS close, Linux, connected
  fault, total-session or soak bounds. [Evidence](docs/history/iterations/301-350.md#iteration-329).
- [ ] 5–10% packet-loss/latency backpressure test.
- [ ] 30+ concurrent idle session soak (environment permitting).
- [ ] 4+ simultaneous active media session soak.
- [x] DONE for current API/release artifacts — Credential diagnostic snapshots pass for malformed/oversized
  requests, credentials in URL/header/body, backend failure and metric privacy.
  Completed-record redaction now covers child/setBindings and implicit Error
  messages; oversized records are replaced with a fixed event. The exact Iteration 217
  Linux native/Node/application-SBOM/image-SPDX artifacts pass a streamed search
  for the authorized lab password in UTF8/UTF16LE, with boundary/size tests.
  The Windows native/SBOM ZIPs also pass the same known-value scan. This is a
  regression gate, not discovery of arbitrary unknown credentials.
  [Log evidence](docs/history/iterations/201-250.md#iteration-216), [Linux scope/evidence](docs/history/iterations/201-250.md#iteration-217),
  [Windows scope/evidence](docs/history/iterations/201-250.md#iteration-221).
- [~] IN PROGRESS — Linux application/native artifact SPDX 2.3 collection is
  generated and root-schema validated: actual Node graph, native versions/source,
  13 original vcpkg documents, 101 runtime files and exact artifact hashes.
  Five portable privacy/boundary/reference cases and full platform Node checks
  pass. Host export now passes after the initial review-service usage limit.
  A separate Syft final-image inventory adds Debian and Node distribution
  packages with digest-verified OCI index/config/layer ownership. Windows native
  ZIP inventory now binds 24 runtime files, seven vcpkg companions and eight
  packaged CRT version resources. Complete embedded Node/native edges and licensing /
  vulnerability review remain open.
  [Contract](docs/SBOM.md), [Linux evidence](docs/history/iterations/201-250.md#iteration-214),
  [Windows native evidence](docs/history/iterations/201-250.md#iteration-221).
  New corrected Windows/Linux artifacts additionally bind the approved DSP
  correction to two exact metadata/recipe files and GENERATED_FROM edges;
  independent artifact-only generation and full platform Node suites pass.
  [Correction provenance](docs/history/iterations/251-300.md#iteration-270).
- [ ] Performance report against `PERFORMANCE.md` metrics.
- [x] DONE for a fresh local synthetic 1080p H.264 encode sample — Three
  existing-binary runs record total/convert/compress p95 and encoded bytes at
  1/2/4 threads. Four-thread encode p95 is 33.730–39.882 ms in these samples;
  forwarding, queue, browser, CPU/RSS and soak measurements remain outside this
  result, so the full report item above stays open. [Evidence](docs/history/iterations/301-350.md#iteration-331).
- [ ] Full Windows + XRDP regression.

**Gate:** release candidate v1.0.0.

## Stage 11 — optional extended redirection

- [ ] RDPECAM bridge-host capability.
- [ ] Browser-virtual camera adapter.
- [ ] RDPEWA/WebAuthn bridge-host capability.
- [ ] Design companion-agent protocol and separate threat model.
- [ ] Companion USB redirection.
- [ ] Companion smartcard redirection.
- [ ] Companion serial redirection.
- [ ] Evaluate WebRTC media transport behind `IMediaTransport` using measured lossy-network benefit.
- [ ] Evaluate shared-memory media ring only after profiling proves need.

**Gate:** each feature remains capability-gated until E2E test passes.

## Cross-cutting checklist — apply at every stage

The iteration records below retain resource/lifetime audit history. Their scoped
fixtures are verified, but the cumulative remote/platform/resource acceptance
remains open; they are not additional independent release stages.

- [~] IN PROGRESS — Exact AUDIN name now selects 64 KiB message/codec output /
  128 KiB encoded admission before native host assembly/decompression, preserving
  guarded negotiation/capture ownership. Four public cases / 30 assertions and
  two actual linked AUDIN/fake-DVC cases / 61 assertions pass; linked DVC 147 /
  7,909 and bundled CTest 21/21 pass. Actual microphone/core/pool/RSS/CPU/platform/
  fuzz/soak gates remain open. [Iteration 169](docs/history/iterations/151-200.md#iteration-169).

- [~] IN PROGRESS — Exact audio DVC name now selects 64 KiB message/output /
  128 KiB encoded admission before host assembly/decompression and complete
  RDPSND validation before pool copying. Eight public/actual-linked-fake-SVC
  cases / 120 assertions, linked DVC 143 cases / 7,879 assertions and bundled
  CTest 21/21 pass. Pool/RSS/core/remote/platform/fuzz/soak remain open.
  [Iteration 168](docs/history/iterations/151-200.md#iteration-168).

- [~] IN PROGRESS — Production static RDPSND receive placement now checks
  complete bounded records before SDK pool/assembly/parser, including audio-off
  fake fallback. Eight public/actual-linked-fake-SVC cases / 189 assertions,
  linked DVC 135 cases / 7,759 assertions and bundled CTest 21/21 pass. Dynamic
  audio, core/pool/RSS/remote/platform/fuzz/soak gates remain open.
  [Iteration 167](docs/history/iterations/151-200.md#iteration-167).

- [~] IN PROGRESS — Isolated complete RDPSND owner composes fixed 64 KiB /
  4,096-fragment assembly and bounded PDU validation with one nonrenewing deadline
  over fragments and legacy WaveInfo/Wave. Nine portable cases / 8,358 assertions,
  foundation CTest 9/9 and bundled 21/21 pass. Automatic audio-off fake fallback
  placement, core/pool/remote/platform/fuzz/soak gates remain open; no worker
  callback is installed by this block. [Iteration 166](docs/history/iterations/151-200.md#iteration-166).

- [~] IN PROGRESS — Production Graphics completion now owns bounded decoded
  batch inspection before original metadata parsing, preserves pending-close
  borrows and consumes zero-output messages before the pinned null-buffer
  assertion. Public binding and actual rdpgfx/drdynvc/fake-SVC counter/lifetime
  cases pass. Large literal CPU, total RSS, multiple-channel/remote/platform /
  allocator/fuzzer/soak remain open. [Iteration 165](docs/history/iterations/151-200.md#iteration-165).

- [~] IN PROGRESS — Isolated owner now decodes bounded ZGFX through public APIs,
  inspects each PDU before target metadata parsing and forwards only inspected
  literal segments with independent dictionary/borrow/retirement ownership.
  Nine native cases and actual SDK AVC/large-literal cost measurements pass;
  production placement, large-batch CPU, codec/RSS/remote/platform/soak remain
  open. [Iteration 164](docs/history/iterations/151-200.md#iteration-164).

- [~] IN PROGRESS — Scoped DVC selection now distinguishes bare dynamic plugin
  requests from subsystem/type backend ABIs sharing the DYNAMIC flag. This fixes
  actual XRDP `rdpsnd,sys:fake` Open refusal with browser audio off, preserving
  previous backend policy and strict DVC admission. Six provider cases and
  restored H.264 resize/reattachment pass; fake-backend resource, actual audio,
  remote GFX/platform/soak gates remain open. [Iteration 163](docs/history/iterations/151-200.md#iteration-163).

- [~] IN PROGRESS — Portable decoded GFX batch inspection bounds each PDU before
  array/bitmap count checks, refusing cross-PDU borrowing and excessive AVC420
  metadata. Five portable and one public ZGFX-output cases pass; production
  decoded-message ownership/placement before metadata allocation remains open,
  together with codec/RSS/remote/platform/fuzzer/soak gates.
  [Iteration 162](docs/history/iterations/151-200.md#iteration-162).

- [~] IN PROGRESS — Allocation-free complete Annex-B SPS/subset-SPS inspection
  now bounds coded dimensions to the public GFX surface before AVC420 decoder
  creation/dispatch. Profiles/scaling/POC/escape/UE and byte/NAL boundaries plus
  actual private SDK prediction/refusal/recovery fixtures cover the new path.
  Total reference/working memory, aggregate surfaces/RSS, remote GFX, platforms,
  sanitizer/fuzzer and soak gates remain open. [Iteration 161](docs/history/iterations/151-200.md#iteration-161).

- [~] IN PROGRESS — Exact public graphics DVC name selects nested ZGFX inspection
  before the codec callback; malformed/excessive output/count claims are refused
  without decode, with complete-message reservation release and owned close.
  Six public/codec, one required identity-API and two actual rdpgfx/drdynvc/fake-SVC
  cases pass, including 12 MiB codec output and valid CapsConfirm. Dictionary/
  metadata/codec working memory, pool/total RSS and actual remote/platform/soak
  gates remain open. [Iteration 160](docs/history/iterations/151-200.md#iteration-160).

- [~] IN PROGRESS — Production synchronous scoped DVC provider now selects the
  bounded public entry/plugin/shared-manager/listener/channel ownership chain.
  Worker reserves up to 32 known logical declarations / 64 MiB before host
  allocation, polls own faults/deadlines and retires callbacks before SDK plugin
  teardown. Five provider fixtures and one actual drdynvc/fake-SVC fixture pass;
  total RSS/pool/nested codec, remote/Windows-server and platform/soak gates remain
  open. [Iteration 159](docs/history/iterations/151-200.md#iteration-159).

- [~] IN PROGRESS — Bounded public DVC entry-point registry captures one pinned
  plugin per entry, publishes stable proxy/name storage after entry success,
  projects GetPlugin back to original objects and shares one bounded manager.
  Failed publication retains an inert late-callback proxy. Seven public/generic
  fixtures and one actual drdynvc/fake-SVC fixture pass; scoped provider/worker,
  allocator-fault and remote aggregate/cached/nested resource gates remain open.
  [Iteration 158](docs/history/iterations/151-200.md#iteration-158).

- [~] IN PROGRESS — Public DVC plugin lifecycle proxy resolves a shared manager,
  preserves original delegate identity and cleanup notifications, and terminates
  a self-deleting/throwing plugin once without uncertain retry. Six public cases
  and one actual drdynvc/fake-SVC case pass. Production registration/provider,
  shared manager/worker lifetime and remote resource acceptance remain open.
  [Iteration 157](docs/history/iterations/151-200.md#iteration-157).

- [~] IN PROGRESS — Bounded public DVC listener manager installs accepted callback
  proxies, rejects live duplicate names and slot overflow, defers destruction
  during factory calls and retains uncertain native handles until explicit final
  host unpublication. Actual pinned generic acceptance default is preserved.
  Six public fixtures and one actual drdynvc/fake-SVC fixture pass; production
  addin/plugin/worker and aggregate/cached/nested/remote resource gates remain open.
  [Iteration 156](docs/history/iterations/151-200.md#iteration-156).

- [~] IN PROGRESS — Public listener factory proxy transfers only explicitly
  accepted live callbacks, preserves ordinary factory refusal, prevents late
  publication on close and keeps uncertain cleanup visible. Seven public-ABI and
  two actual drdynvc/fake-SVC cases pass; production provider/host lifetime,
  aggregate/cached/nested/remote resource acceptance remain open.
  [Iteration 155](docs/history/iterations/151-200.md#iteration-155).

- [~] IN PROGRESS — Accepted DVC callback handoff closes rejected new targets once,
  preserves separate uncertain cleanup status and refuses shared live callback
  aliases without closing the existing owner. Five fixtures and two actual
  drdynvc/fake-SVC cases pass; production listener/provider handoff and aggregate/
  cached/nested/remote resource acceptance remain open. [Iteration 154](docs/history/iterations/151-200.md#iteration-154).

- [~] IN PROGRESS — Pinned public manager facade normalizes failed CreateListener
  output to stable fallback without touching a potentially freed native pointer;
  actual generic addin and successful drdynvc/fake-SVC fixtures pass. Production
  provider placement, partial/failed handoff and actual allocator-failure resource
  acceptance remain open. [Iteration 153](docs/history/iterations/151-200.md#iteration-153).

- [~] IN PROGRESS — Fixed public DVC ID/callback registry reserves DATA_FIRST only
  for registered live channels, retains rejected-target caller ownership and joins
  callback retirement. Seven public-ABI and five actual drdynvc/fake-SVC cases
  pass; production addin/listener handoff, aggregate admission and pool/nested
  memory/resource acceptance remain open. [Iteration 152](docs/history/iterations/151-200.md#iteration-152).

- [~] IN PROGRESS — Public DVC completion/close proxy preserves callback borrow,
  defers nested close, joins retirement and releases DATA_FIRST reservations only
  after actual callback return or host close. Eight public-ABI and five actual
  drdynvc/fake-SVC cases pass. Production registration, cumulative admission and
  pool/nested memory acceptance remain open. [Iteration 151](docs/history/iterations/151-200.md#iteration-151).

- [~] IN PROGRESS — Allocation-free cumulative DATA_FIRST reservation foundation
  has fixed 32 slots / 64 MiB aggregate / 16 MiB individual hard caps, original
  deadlines and observed release. Five portable cases and two public WinPR pool
  fixtures pass. Not active in worker: public completion/close wiring, host
  retirement, channel and retained-pool/nested memory limits remain open.
  [Iteration 150](docs/history/iterations/101-150.md#iteration-150).

- [~] IN PROGRESS — Worker public receive admission now bounds individual outer
  SVC, DATA_FIRST and compressed-DVC claims before pinned host dispatch. Six
  actual-linked drdynvc/fake-SVC cases include compressed decoding, 12 MiB input,
  two logical channels and partial shutdown; RDP-thread polling and callback
  restoration are implemented. Cumulative/pool/nested resource and actual
  hostile/lost-transport acceptance remain open. [Iteration 149](docs/history/iterations/101-150.md#iteration-149).

- [~] IN PROGRESS — Public ReceiveChannelData adapter normalizes only complete
  inspected drdynvc input, preserves other SVC arguments and validates raw flags,
  notifications, channel-ID lifetime and callback retirement. Seven linked public
  ABI fixture cases pass; actual host/worker activation and remote resource
  acceptance remain open. [Iteration 148](docs/history/iterations/101-150.md#iteration-148).

- [~] IN PROGRESS — One bounded outer drdynvc SVC message owner now validates
  total before staging allocation and inner claims before synchronous forwarding.
  Whole packets borrow without a copy; exact abandonment/framing/clock/reentrant
  cleanup checks pass portable and linked-codec regression. No production receive
  callback is installed yet; actual host placement, raw flags, cumulative/channel
  budgets, nested GFX/control/codec and hostile/lost-transport/platform/fuzz/soak
  gates remain open. [Evidence](docs/history/iterations/101-150.md#iteration-147). Headers: `6744bff`.
- [~] IN PROGRESS — Allocation-free DVC DATA_FIRST/ZGFX declared-size/count
  inspection and linked public-codec/large-payload fixtures are implemented.
  Limits are independent of touch size and include SDK output padding. This
  foundation is not installed before the actual host yet; outer/cumulative
  admission, public callback/lifetime placement, nested GFX/control/codec
  allocations, concurrent budgets, actual hostile/lost transport, platforms and
  sanitizer/fuzz/soak acceptance remain open. [Evidence](docs/history/iterations/101-150.md#iteration-146).
- [ ] No new secret in logs/argv/env.
- [ ] No unbounded queue introduced.
- [ ] Public protocol change is versioned/documented.
- [ ] Native parser change has boundary tests/fuzz coverage where relevant.
- [ ] Actual drdynvc host preallocation/decompression limits and lost-transport terminal release acceptance. The source audit identifies allocations before the public RDPEI gate and a NOT_CONNECTED-to-OK write path; current bridge bounds do not establish upstream bounds or remote release. [Audit and required follow-up](docs/RDPEI_UPSTREAM_AUDIT.md).
- [ ] FreeRDP return values checked.
- [ ] Unsupported feature is explicit capability state, not a crash.
- [ ] Documentation and schema match actual code.
- [ ] Focused commits made during implementation, not one giant final commit.

## Additional foundation tasks and retained requirements

- [x] DONE — Initial typed SessionCreate schema, unknown-field/range checks, safe privilege policy and recursive secret redaction. [Config tests](tests/unit/config.test.mjs); `3610524`. Traces to SPECIFICATION §2.1/3.2, CONFIG_SCHEMA, SECURITY §3/5. This is contract validation, not RDP feature support.
- [~] IN PROGRESS — Separate bounded config/secret IPC classes now deliver credentials after HELLO; transport copies and the active FreeRDP password setting are overwritten. Upstream/immutable JS copies and future secret classes remain open. [Contract](docs/CONNECTION_CORE.md).
- [x] DONE on Windows (component) — Atomic native private-directory creation:
  protected current-user/LocalSystem inheritable ACLs, bounded metadata and
  unchanged existing objects. Five actual filesystem cases / 91 assertions.
  [Iteration 170](docs/history/iterations/151-200.md#iteration-170); `8aaa379`.
- [x] DONE on Windows (component) — Colocated helper packaging/discovery:
  three actual process cases and explicit relocated execution with minimal PATH.
  [Iteration 171](docs/history/iterations/151-200.md#iteration-171); `5c75f26`.
- [~] IN PROGRESS — Windows runtime ACL/multi-user isolation acceptance:
  Node now selects the helper before marker/worker spawn and joins normal startup
  cancellation/confirmed cleanup. Trusted root/parent validation, uncertain
  bootstrap outcome reclamation, other filesystems and actual second-account/
  service isolation remain open. Traces to ARCHITECTURE §2 and SECURITY §2/6.
  [Startup contract](docs/WINDOWS_DIRECTORY_STARTUP.md),
  [iteration 172](docs/history/iterations/151-200.md#iteration-172); `2e30d14`.
- [~] IN PROGRESS overall; verified schema-1 metadata-only recovery accepted in public 0.3.0 — Reclaim directories after simultaneous parent/worker hard kill, including stale ownership records. The named scope passes simultaneous hard-kill recovery, parent-only cleanup, surviving-worker/live-owner preservation, foreign-principal refusal, bounded SDK cancellation, portable restart and installed-service upgrades on Windows/Ubuntu/Astra/RED OS. Feature/release branches are merged; exact npm archives and final standalone files are public and verified. Legacy/unknown contents remain protected; broader filesystem failure and future drive/spool reclamation acceptance remain open. Traces to SPECIFICATION §3.1 and Stage 10 watchdog cleanup. [Public acceptance](docs/RUNTIME_RECOVERY.md#030-public-delivery), [cross-principal acceptance](docs/RUNTIME_RECOVERY.md#cross-principal-acceptance).
- [~] IN PROGRESS — Registry retains capacity through native forced-termination completion with a separate bounded deadline; filesystem/HELLO cancellation guards prevent late spawn/readiness. Unconfirmed cleanup now keeps global/per-principal capacity after logical close and wait expiry, releasing only on trusted graceful/forced completion. Synthetic fault cases and an actual unconnected native delayed-completion/replacement case pass; Windows foundation Node 835 / 102 skips and CTest 17/17 pass. Physical uncertain-resource reclamation, legacy backend adoption, OS/filesystem failures, connected faults and orphan acceptance remain open. [Current evidence](docs/history/iterations/351-400.md#iteration-384), [earlier completion contract](docs/history/iterations/051-100.md#iteration-056). Observed race: [iteration 55](docs/history/iterations/051-100.md#iteration-055), `46245b2`.
- [~] IN PROGRESS overall; named 0.2.5 distributions accepted — Exact Windows x64/Linux x64 npm runtimes include private FreeRDP/WinPR dependencies. Standalone adds private Node.js, portable ZIP/TGZ and MSI/DEB/RPM, with successful public main-push CI, native lifecycle, version upgrades and final public-file installation on Windows Server 2025, Ubuntu 24.04, Astra 1.7.5 and RED OS 7.3. [Public acceptance](docs/ITERATION_457.md), [local scope](docs/ITERATION_455.md). The earlier Windows ZIP/manual-CI-only checkpoint is superseded. Original broader clean-machine/OS coverage and a separate EXE format remain unaccepted; named distribution acceptance does not complete all Stage 12 requirements.
