# TODO — implementation plan

The named [practical MVP](docs/MVP_ACCEPTANCE.md) is released as **0.1.0**,
tag `v0.1.0`. Current development follows this remaining full V1 plan while
preserving the accepted browser clipboard, audible output and desktop/lifecycle
profiles. Features use separate branches and merge only after their acceptance
checks pass; [version policy](docs/VERSIONING.md).

Legend: `[ ]` TODO, `[~]` IN PROGRESS, `[!]` BLOCKED, `[x]` DONE (accepted). Do not mark complete solely because code compiles.

DONE applies to the named component and its explicit platform/test scope. A
verified component can be DONE while the containing stage remains IN PROGRESS.
An entire stage becomes DONE only when its requirements and **Gate** pass;
fixture/SDK integration does not substitute for actual RDP/device acceptance.
Iteration reports are evidence/history, not newly added unfinished stages.
Status clarification and preserved history: [iteration 173](docs/ITERATION_173.md).

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
[Evidence and remaining gates](docs/ITERATION_407.md).

The supplied Astra ISO also boots its actual 6.1.50-1-generic kernel in a separate
diskless/networkless QEMU guest with checked runtime libraries. Foundation CTest
20/20, Node IPC-only addon 14/14 and explicit guest acceptance/clean poweroff
pass with unchanged deadlines. This is kernel/initramfs evidence; installed OS,
security profiles, other kernels and linked product/RDP acceptance remain open.
[Guest evidence](docs/ITERATION_408.md).

The subsequent exact GCC 8.3.0 source chain completes all ten required private
dependency roots and pinned FreeRDP/WinPR, with strict origins/foreign-prefix
refusal. A fresh linked Release consumer passes CTest 37/37 and real-worker
Node IPC/lifecycle/protocol-fixture checks 40/40 with source/artifact receipts.
Full linked `pnpm check` passes 877 / 87 skips / 964 total, zero failures.
Linked Astra closure, installed-OS/security profiles, actual RED OS product,
Windows linked regression and actual RDP gates remain open; no shared merge or
0.2.0 tag is accepted here. [Linked source build](docs/ITERATION_409.md).

The same GCC 8.3 linked worker/addon subsequently pass in the checked Astra
ISO-library container: CTest 37/37, codec/private-origin probes and actual Node
IPC/lifecycle/TLS fixtures 54/54. No OS/VM is installed for this check. A fresh
MSVC Release consumer with a separately rebuilt corrected SDK binds identical
native source bytes and passes CTest 36/36, focused process/protocol checks
27 / 1 skip and full physical-path Windows `pnpm check` 900 / 61 skips / 961.
Actual RED OS GCC 11 compiles all linked targets, but CTest passes 25/37 with
12 loader/worker failures from the reused CUPS library's absent `libcrypt.so.1`.
RED OS linked runtime and real desktop acceptance remain open.
[Runtime/control evidence](docs/ITERATION_410.md).

The separate XRDP Clipboard feature passes real headed Edge Clipboard API ↔
CLIPRDR ↔ owned XRDP 0.10.1/Tk Unicode/emoji/multiline transfer in both
directions across two new RDP connections, repeated server Copy/Get, actual
permission refusal, revoke and joined PID/runtime cleanup. A prepared Tk Copy
hook supplies fresh ownership notifications; old XRDP 0.9.x surrogate handling
is not repaired. Full feature-branch `pnpm check` passes 900 / 61 skips /
961 total, with unchanged production/native inputs. Wider Stage 7 remains open.
[Evidence](docs/ITERATION_404.md).

The named practical MVP joint Windows gate now passes: actual public Edge /
Release H.264 1080p, Opus/200 ms, both Clipboard API/Notepad directions and
physical edit/readback for 30 minutes / 59 observations / 61 reads, followed
by resize, viewer/audio replay, actual permission refusal, revoke and joined
PID/runtime cleanup. The user reports steady sound without regular audible
interruptions. Numeric discontinuities and the prior unexplained Get stop are
retained; this does not claim they were fixed or accept broader V1 profiles.
[Evidence](docs/ITERATION_403.md), [runbook](docs/MVP_RUNBOOK.md),
[separate full V1 plan](docs/V1_NEXT_STEPS.md).

Linux regression of both current production corrections passes linked Release
CTest 35/35, focused process/TLS 7/7 and full Node 870 / 82 skips / 952 total,
with unchanged source/native inputs and a checked cleanup receipt. The outer
tool's nonzero status discrepancy is retained. The joint Windows helper reaches
both real Clipboard API/Notepad directions with live audio, then stops at an
epoch/config waiting observation; its full soak remains unaccepted. No new
audible-quality claim is made. The pending joint helper additionally passes
Windows `pnpm check` 891 / 61 skips / 952 total; actual repeat remains open.
[Evidence and next experiment](docs/ITERATION_402.md).

The combined current Release input/CLIPRDR worker passes CTest 34/34 and an
actual active owned-XRDP/public Edge H.264 1080p soak: 30 minutes / 61 samples,
5,781 frames, peak worker RSS 152,342,528 bytes, bounded queues and no observed
critical failure. Resize/restoration, cursor/display replay, reattachment,
joined PID/runtime cleanup pass. Audio/clipboard are off in this gate; joint
Windows and wider V1 acceptance remain separate. [Evidence](docs/ITERATION_401.md).

Bounded XRDP CLIPRDR zero-trailer compatibility now preserves declared quotas,
original deadlines and the absolute wire cap. Linked CTest 34/34 and isolated
Node 885 / 61 skips pass. Actual owned XRDP readiness and one fixed Tk/public
Get read pass; the subsequent fresh-connection re-offer receives no new offer
and remains open. [Evidence](docs/ITERATION_400.md).

Fresh-controller inherited pointer recovery now passes actual owned XRDP/public
Edge readback: after hard loss leaves Ctrl/left button held, one post-render
reset clears the standard buttons even with empty local pressed ownership.
The previous-worker negative control fails as expected. Current linked Release
CTest 34/34 and full Windows 898 / 51 skips pass. This does not claim release
delivery across broken TCP or full reconnect/soak acceptance.
[Evidence](docs/ITERATION_399.md).

The owned Linux application now confirms actual movable-object drop, both-axis
content scrolling, three buttons and blur/detach release through fixed X11
scalar readbacks. This does not imply Linux CLIPRDR acceptance. Two separate
synthetic accounts also pass short actual native RDP coexistence and sibling
retirement/cleanup. The initial active soak stops at 26.14 minutes without a
completion receipt and is not accepted. A hard-loss input control exposes a
preserved remote button; the user accepts release on the next connection and
the corrective control reset remains under verification.
[Evidence](docs/ITERATION_398.md).

An explicitly user-requested owned Linux/XRDP container now passes current
Release/public Edge JPEG and H.264 1080p, cursor, resize/restoration and viewer
replay. Actual connected public CPU/RSS failure scenarios pass exact terminal
errors, token retirement and joined query/PID/runtime cleanup. Strict default
certificate refusal passes. The Linux CLIPRDR ready/readback attempts remain
unaccepted; the active 30-minute observation is still running. This does not
close full platform/device/resource gates. [Evidence](docs/ITERATION_397.md),
[owned stand](docs/OWNED_XRDP_LAB.md).

The user-prepared Windows pointer page now passes actual public-viewer
left/right/middle buttons, captured drag, both wheel directions on both axes,
left-button blur release and held middle-button detach/reattach release.
Four bounded CLIPRDR receipts confirm balanced down/up and no held buttons;
no local Clipboard API or native offer is used. This accepts application event
delivery, not content scrolling, arbitrary drop targets or physical hardware.
The initial wrong-application attempt is retained. [Evidence](docs/ITERATION_396.md).

Current tracked-source Linux GCC 12 linked Release + IPC-only addon now passes
native CTest 35/35, focused process/synthetic-TLS 7/7 and full Node 863 / 81
skips / 944, zero failures. Exact reused SDK/dependency archives and real private
module origins are verified; initial missing test-CLI failures remain retained.
Source/native inputs are unchanged, PID/runtime retirement and container removal
pass. Actual XRDP/browser/device and full build matrices remain separate.
[Evidence](docs/ITERATION_395.md).

The user accepts the current Release Windows Opus/200 ms three-minute scenario
as excellent sound. Actual rendered samples cover 179.54 seconds; late intervals
11 / browser configurations 12 / Worklet underflows 4 remain visible, with one
scheduled consumer reset. This accepts the named audible MVP scenario, not
zero-loss/reset-free playback, other profiles or complete Stage 6. Joined
PID/runtime cleanup and unchanged protected inputs pass.
[Evidence and Debug comparison boundaries](docs/ITERATION_393.md).

The complete headed Edge / current Release / Windows Notepad small-text smoke
now passes both Unicode directions, actual Clipboard API denial, no-format
revoke, viewer field clearing and joined PID/runtime cleanup in one invocation.
The prior failed copy-offer run is retained. Own-document clear keystrokes
follow verified readback; empty application content is not separately read back.
Wider Stage 7 matrices remain open. [Evidence](docs/ITERATION_392.md).

A separate current-source Windows Release consumer now passes native CTest
34/34, process/TLS/lifecycle 27 / one skip and full Node 890 / 51 skips.
Its native source hash matches the current Debug consumer. Existing encoder
benchmarks show substantial Debug conversion overhead; this is not proof of
every audio stall or new Release audio acceptance. Original Release outputs,
configuration and pins stay unchanged. [Evidence](docs/ITERATION_391.md).

The user accepts the named Windows Opus/200 ms three-minute observation as
steady normal sound. The timer starts at the first decoded packet; rendered
samples cover 178.65 seconds. Forty configurations, 64 late publication
intervals and 12 Worklet underflows remain measured scheduling gaps, despite
the positive listening assessment. Joined PID/runtime cleanup passes; full
Windows Node passes 890 / 51 skips. Release and pins are unchanged.
[Current audio evidence](docs/ITERATION_390.md).

The user accepts the corrected Debug worker's actual short Opus/200 ms tone as
steady with almost no interruptions. The observed 23.52 seconds have one browser
epoch/configuration, zero late publication intervals and zero Worklet underflow;
full three-minute continuity is not yet demonstrated. Earlier source-launch /
console-input failures are retained. The new manual-source mode leaves fixed
text in the local draft and requires separate user Send/paste/execute actions.
[Exact audio scope](docs/ITERATION_387.md), [MVP acceptance](docs/MVP_ACCEPTANCE.md).

New Windows Debug workers advertise bounded host resource batching; trusted
CPU/RSS policies coalesce admitted requests across workers through the existing
16-active / 128-waiting owner. Per-member cancellation, original deadlines,
shared-child retirement and legacy scalar fallback pass focused tests. The
unchanged forty-worker / five-replacement fixture passes both focused and full
runs, with zero worker failures and maximum active query 550 / 664 ms against
the existing 3,000 ms bound. Native CTest passes 34/34; full Node passes
854 / 51 skips / 905 total, zero failures. Release, pins, connected/OS-failure /
sustained resource and broader stages remain unchanged/open.
[Owner and exact evidence](docs/ITERATION_378.md).

Controlled actual hanging-child timeout, partial/all-member cancellation and
missing-executable checks additionally pass 3/3, preserving an unrelated real
helper path and joined empty owners. Full Node passes 857 / 51 skips / 908,
zero failures, with unchanged production/native sources. Actual Windows query
API failures and wider connected/OS/load gates stay open.
[Fault-control evidence](docs/ITERATION_379.md).

A new Windows source-only foundation Debug output now verifies the host-batch
capability without FreeRDP: native CTest 17/17, resource integration 12/12 and
full Node 809 / 102 skips / 911 total pass. Three SDK browser tests now select
their prerequisite from actual native linkage rather than output-directory
names; all four codec/viewer cases still pass on linked Debug. Original failed
runs remain recorded. [Foundation evidence](docs/ITERATION_380.md).

New clean-foundation receipts now also bind actual worker/query-helper SHA-256
outputs through the existing bounded hashing routine. Windows source-only
Debug CTest 17/17, lifecycle 16 / one skip and full Node 813 / 102 skips pass;
linked artifact inventories remain unchanged. Linux inventory is portable-test
coverage only because the local Docker daemon is unavailable. Broader build
and platform gates stay open. [Receipt evidence](docs/ITERATION_381.md).

## Implementation status — 2026-10-20

One explicitly authorized Windows lab / Edge Opus/200 ms preview now passes
actual format/Training/Wave negotiation, packet decoding and Worklet rendering,
and the user confirms hearing the fixed remote tone. They also report short
Morse-like interruptions. Frequent source epochs/configurations, buffering
silence and underflows remain; Stage 6 stays IN PROGRESS.
[Audible slice and exact counters](docs/ITERATION_367.md).
Local helpers now preserve numeric native loss/cause receipts and separately
count browser-consumer reset calls/results, preparing the authorized repeat.
No specific cause or quality correction is accepted yet.
[Native collection](docs/ITERATION_368.md),
[consumer accounting](docs/ITERATION_369.md).
The separately authorized repeat reports zero Node consumer reset requests
and 581 skipped native publication intervals / 572 publisher resets. The user
reports much better sound with a few small interruptions. Native scheduling,
callback and graphics stalls remain to be distinguished; no production fix or
uninterrupted-quality pass is claimed. [Repeat evidence](docs/ITERATION_370.md).

The separately authorized corrected Debug preview renders 528 H.264 1080p
frames but receives no RDPSND Formats or audio packets. Fixed-tone input was
dispatched; source execution is unverified. Joined cleanup passes. This run
does not accept the scheduling correction's actual playback or quality;
negotiation/source and remaining Stage 6 gates stay open.
[Debug observation](docs/ITERATION_373.md).

Bounded listening previews now additionally collect one native video pipeline
snapshot using the existing capability/deadline API. Only eight validated
numeric fields are projected; unavailable evidence remains `null`. This local
instrumentation prepares encode/read-cost observations without accepting an
audio stall cause, connected timing, CPU or quality gate.
[Collector evidence](docs/ITERATION_374.md).
The full check passes 818 / 51 skips but retains one failing unchanged
40-worker resource-capacity case; a focused repeat also fails after active
resource queries exceed their unchanged three-second bound. This local
collector block does not close the resource/load limitation or claim a clean
full-suite result. Exact diagnostics remain in the same report.

## Implementation status — 2026-10-18

The user restored access and confirms the target is the Windows RDP lab;
they have cleared the initial desktop wizard. Legacy `test-xrdp-*` names do
not identify the current server OS. [Current scope](docs/LAB_STATUS.md),
[clarification](docs/ITERATION_301.md). Windows actual strict
certificate refusal / approved session-only connection, native and Edge
H.264/JPEG resize/restoration/replay, controlled connection loss and joined
cleanup pass. CLIPRDR and RDPEI inventories are ready. PCM/Opus output still
receives no formats/packets; PCM/Opus AUDIN remains waiting epoch 0 with no
channel/Open negotiation. Audio/recording, application/device and wider gates
remain open; access alone does not accept them. [Current lab evidence](docs/ITERATION_297.md); `9dce875`.
The desktop-ready Windows repeat also receives no RDPSND Formats/packets or
AUDIN Open for PCM/Opus, with heartbeat/frame/cleanup intact; audio and recording
remain unaccepted. [Repeat evidence](docs/ITERATION_302.md).

The user-prepared Windows Notepad now passes fixed Latin/Cyrillic/Japanese/
supplementary Unicode application readback, actual CLIPRDR paste-and-copy
roundtrip, a small physical-key/modifier/reset case, fixed left-button sequence,
empty-offer/revoke ACK and unsaved-window/native cleanup. Full Node passes
Windows 657 / 90 skips and Linux 602 / 148 skips. This is a named private small-text
slice, not complete layout/IME/button/browser/host-clipboard/device acceptance.
[Application evidence](docs/ITERATION_303.md).

The Windows lab now also supplies actual PCM/Opus Formats, Training/Waves and
private packet delivery during a fixed system-sound attempt; PCM samples include
nonzero data. Both preserve heartbeat and joined empty-runtime close. Substantial
epoch/config churn remains; browser/audible quality, reset, latency and resource
acceptance stay open. PCM/Opus AUDIN still waits at epoch 0 without Open.
Future host application/source launches should be requested from the user.
[Source observation and exact scope](docs/ITERATION_305.md).

With a source started by the user, the current Windows lab / Edge PCM and
Opus/200 ms also pass actual Worklet rendering, fresh-token audio recovery and
private ready resets with fresh config/data. Opus replay includes one scheduled
native reset. Frequent epoch/config churn, silence/underflows and skipped
intervals remain observed quality gaps; their cause is unverified.
[Current browser/recovery evidence](docs/ITERATION_307.md).

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
acceptance remains open. [Correction evidence](docs/ITERATION_275.md).

OpenH264's own upstream ASan/UBSan common (17), decoder (50) and processing (10)
cases pass. A test-only initialization correction removes an uninitialized
`SSourcePicture` bool read; the focused reproducer and all 181 encoder tests
then pass. Original UB and 30-second timeout logs are retained. The API category
times out at its original 300-second bound and remains open; no complete
five-category upstream pass is claimed. Release/application code stays unchanged.
[Upstream evidence and test patch](docs/ITERATION_276.md); `9a8a8ab`.

The same GCC 12.4 sanitizer runtime now also uses rebuilt pinned ZLIB 1.3.2.
Upstream CTest 14/14, actual module/codec origins, linked CTest 31/31 and full
Node 633 / 84 skips pass with unchanged worker/Release artifacts. Ordinary
CTest/CMake tools and the instrumented native children have separate loader
ownership; initial tool startup/projection failures are retained. Other private
dependencies/addon, full upstream/platform/CI and actual RDP/device/resource
gates remain open. [ZLIB profile evidence](docs/ITERATION_277.md).

An independent static ZLIB ASan/UBSan output also passes all 19 compile-command
checks, focused static examples/infcover 4/4 and full upstream CTest 16/16,
including nested consumers. The original coverage assertions and source remain
unchanged; matching gcov 12 is used. This adds local static test coverage while
other private dependencies/addon and wider gates remain open.
[Static ZLIB evidence](docs/ITERATION_278.md).

Pinned libspng 0.7.4 now also passes a separate GCC 12.4 ASan/UBSan shared build
and bounded local PNG regression: eight exact RGBA8 roundtrip combinations,
size/truncation refusals and 2,424 upstream read-harness inputs from 202 PNGs.
Unknown harness input is refused by hash; actual private libspng/ZLIB loader
paths are verified. Full comparator/fuzz/platform and remaining dependency/addon
acceptance stay open. Linked CTest 31/31 and full Node 633 / 84 skips pass with
the new library profile and unchanged worker/Release. [PNG evidence](docs/ITERATION_279.md).

The independent pinned libjpeg-turbo 3.2.0 Debug profile now passes upstream
ASan/UBSan CTest 332/332, including API/buffer/PNG and golden codec-output cases.
All 292 C compile commands are instrumented; 27 SIMD assembly commands remain
outside sanitizer instrumentation. Existing port patches are the only source
differences. Release is unchanged. An additional focused C-fallback API control
passes. Actual new JPEG/SPNG/ZLIB
origins, linked native CTest 31/31 and full Node 633 / 84 skips also pass without
new sanitizer diagnostics; the existing worker hash remains unchanged.
[JPEG evidence](docs/ITERATION_280.md).

Pinned OpenSSL 3.6.5 also passes a separate GCC 12.4 C-only static ASan/UBSan
profile: all 1,163 library C commands, focused ASN.1 2/2 recipes and selected
ASN.1/X.509/BIO/buffer 10 recipes / 15 top-level tests. Exact patch/source audit
passes; missing-wrapper and backup-audit failures are retained. This is separate
from shared bridge runtime and full OpenSSL/TLS/platform acceptance; Release
and current bridge loader are unchanged. [Evidence](docs/ITERATION_281.md).
Additional local X.509/verify/store/CSR recipes pass 4 / 220 top-level tests
under the same static instrumentation, with unchanged source/library/CLI
hashes and bounded retained-result diagnostic scans. This is separate from
the bridge's real certificate/transport gate. [Evidence](docs/ITERATION_282.md).
Local SSL context/config and memory-BIO buffer recipes additionally pass 3/3
top-level tests, including all 13 available buffer variants, with unchanged
library/app/source hashes. No socket/TLSProxy or shared bridge acceptance is
claimed. [Evidence](docs/ITERATION_283.md).

A separate experimental OpenSSL shared C-only/no-module ASan/UBSan profile now
passes 4 upstream recipes / 211 top-level tests, exact module/source audit,
actual new SSL/crypto origins, linked CTest 31/31 and full Node 633 / 84 skips.
Pinned Configure permits this without RPATH; the upstream-recommended static
baseline remains separately verified. Worker/Release hashes and dependency
versions are unchanged. Full production features/modules/assembly, remaining
dependencies/addon/platform/CI and RDP gates remain open.
[Evidence](docs/ITERATION_284.md).

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
RDP/device/resource gates remain open. [Linux chain](docs/ITERATION_254.md),
[Windows chain](docs/ITERATION_257.md), [packaging](docs/ITERATION_258.md),
[Ubuntu runtime](docs/ITERATION_259.md).

A complete tracked-source Linux project export now also passes new offline Node
installation/build/full regression, linked CTest 30/30, install/ELF closure,
relocation and production deploy/import without prior build/dist/node_modules.
Its native SDK/dependency/tool inputs remain external and verified. A complete
Windows export also passes offline install, linked CTest 30/30, full Node
663 / 49 skips, relocation and production deploy/import after correcting the
Node physical-path context. New OS/distro, CI and linked/upstream sanitizer
gates remain separate. [Linux evidence](docs/ITERATION_260.md),
[Windows evidence](docs/ITERATION_265.md).

GNU builds now explicitly require GCC 12 and a matching C++20 standard library.
A new actual GCC 12.2 linked consumer passes CTest 31/31, process/TLS 40/40 and
full Node 657 passed / 58 skips; MSVC foundation passes the probe and 15/15.
The local Ubuntu standard PIE ASan/UBSan foundation passes 16/16 with GCC 12.4
and 15/15 with GCC 13. Eleven Clang 18 PIE sanitizer fuzz smokes also pass.
The GNU minimum remains 12; explicit compiler/budget CI profiles are prepared,
not run. [Compiler support](docs/COMPILER_SUPPORT.md),
[policy/build](docs/ITERATION_263.md), [GCC 12 PIE/fuzz](docs/ITERATION_264.md),
[earlier PIE environment](docs/ITERATION_262.md).

A new complete tracked-source Ubuntu GCC 12 export also passes standard PIE
ASan/UBSan CTest 16/16 and full Node 569 / 146 profile/platform skips, including
100 actual sanitizer-worker lifecycles and parent-death cleanup. The parent Node
runs without preload and the addon is OFF. Separate Node-only preload controls
still fail LSan; addon sanitizer acceptance remains open.
[Evidence](docs/ITERATION_267.md).

The linked GCC 12 bridge sanitizer failure exposed lost Opus state in pinned
FreeRDP DSP reset. A hash-checked build-copy correction now retires the preceding
encoder/decoder before replacement, keeping the exact clean checkout/public ABI.
New SDK/consumer builds pass Windows CTest 30/30 and Node 666 / 49 skips, Linux
Release CTest 31/31 and Node 659 / 59 skips, and Ubuntu GCC 12 standard PIE linked
bridge ASan/UBSan CTest 31/31 and Node 633 / 84 skips. The public leak reproducer
now exits cleanly. Addon/upstream instrumentation, connected audio and wider
resource/platform/CI gates remain open. [Retained failure](docs/ITERATION_268.md),
[correction and scoped acceptance](docs/ITERATION_269.md),
[SDK rebuild contract](docs/FREERDP_OVERRIDES.md).

New Windows/Linux native archives also pass artifact-only SPDX generation:
the approved DSP correction and exact packaged recipe/metadata hashes are
recorded without consulting an installed SDK. Historical inventory explicitly
reports absent override metadata. Full Node passes Windows 669 / 49 skips and
Linux 662 / 59 skips, zero failures. Full release/license/vulnerability review
remains open. [Artifact provenance evidence](docs/ITERATION_270.md).

The same corrected Linux native archive passes independent pinned Bookworm and
Ubuntu 24.04 runtime smoke checks: UID1000/read-only/no-network, private module /
codec origins, actual IPC pairing, heartbeat/shutdown and empty runtime. SDK,
workspace and lab files are absent. This adds current artifact evidence while
fresh distro source builds, service/installer/CI and RDP/device/load gates stay
open. [Independent runtime evidence](docs/ITERATION_271.md).

A separate Ubuntu GCC 12.4 SDK now also instruments FreeRDP/WinPR themselves
with ASan/UBSan. All 390 compile commands carry instrumentation; linked bridge
verbose CTest passes 31/31, codec/module probe passes and full Node passes
633 / 84 profile/platform skips, zero failures. Standard PIE/default sanitizer
settings and ordinary parent Node remain; addon OFF. Private codec/crypto
instrumentation, the upstream test/fuzz suite and wider distro/CI/RDP/device /
resource gates remain open. [Instrumented SDK evidence](docs/ITERATION_272.md).

Bundled Linux CI now explicitly selects GCC/G++ 12 for dependencies, SDK and
worker instead of the runner default, with a separate compiler-profile cache
key. Actual local environment-selection/C++20 probing passes; GitHub execution
remains unrun. [Prepared workflow evidence](docs/ITERATION_273.md).

The local GCC 12.4 instrumented SDK profile additionally uses rebuilt ASan/UBSan
Opus 1.6.1. Shared-library origin, bridge CTest 31/31 and full Node 633 / 84 skips
pass. Four own Opus cases pass initially; the 100-million-iteration extensions
case first times out, then passes unchanged with the same seed and a finite
longer deadline. Other dependency/addon/platform/fuzz/CI and connected audio /
resource gates remain open. [Evidence](docs/ITERATION_274.md).

## Implementation status — 2026-10-15

Linux API/private-native service runtime now passes independent non-root /
read-only/no-network HTTP, default authorization refusal and synthetic host /
native lifecycle/cleanup. Production Node deployment retains pinned versions
and excludes source/devDependencies. The final runtime image is built; fresh
source/distro/CI, installers and actual RDP/device/load gates remain open.
[Iteration 211](docs/ITERATION_211.md), [current runtime/SBOM](docs/ITERATION_223.md),
[deployment](docs/CONTAINER_RUNTIME.md).

Current Linux native archive again passes the independent non-root/read-only /
no-network runtime smoke. A bounded private-stdin microphone inventory helper
is available without physical capture or sample submission. The earlier host
TCP timeout/RDP_CONNECT_TIMEOUT is retained in [Iteration 210](docs/ITERATION_210.md).
Restored XRDP now passes twelve actual input/output/carrier combinations with
heartbeat, 1080p JPEG and empty-runtime cleanup. Input remains waiting at epoch
0, so ready AUDIN/recording remains open. [Current evidence](docs/ITERATION_218.md).

Guarded Linux virtual PCM/Opus microphone selection now follows the existing
typed HELLO/CLI/Node/public capability contract. Twelve actual process/TLS cases
cover both IPC carriers and all input/output combinations; focused microphone
tests pass 46/46. This verifies activation/refusal/cleanup without physical
capture; ready AUDIN/recording/LAN acceptance remains open.
[Iteration 209](docs/ITERATION_209.md).

Actual Linux producer / Windows Edge now passes PCM/Opus packet decode and
AudioWorklet sample rendering with the 200 ms native profile, video resize /
restoration and fresh-token replay. Opus replay observes one actual scheduled
native reset and source epoch 8→10. First Opus admission attempt failed; repeats
pass. This is the named E2E smoke, not human audible/latency/quality/soak or all
audio-stage acceptance. [Iteration 208](docs/ITERATION_208.md).

Linux primary idle/assembly deadline separation now has a failing-before /
passing-after socket regression, repeated idle heartbeats and Release/sanitizer
checks. Actual primary XRDP receives PCM/Opus with ready reset/fresh config/data;
one Opus protocol failure remains unexplained. Browser/audio quality, latency and
resource/soak acceptance remain open. [Iteration 207](docs/ITERATION_207.md).

Guarded Linux amd64 PCM/Opus output, native reset and 120/200 ms selection are
activated through the primary and framed priority writers. Eight native/TLS
profile cases and full Node/native/relocation/independent archive checks pass.
Actual XRDP receives Formats but Linux has no samples yet, including one
RDP_PROTOCOL_ERROR; the Windows control receives active Opus. Linux source /
browser/audio acceptance remains open pending negotiation diagnosis.
[Iteration 205](docs/ITERATION_205.md).

Actual Linux producer/API/primary IPC now renders XRDP in Windows Edge through
both H.264/WebCodecs and JPEG/canvas. Nonblank 1080p, public confirmed resize /
restoration with fresh configs/IDRs and fresh-token reattachment replay pass;
joined server/worker cleanup leaves an empty runtime. This adds the named browser
smoke, not a Linux-browser/platform/audio or sustained resource gate.
[Iteration 202](docs/ITERATION_202.md).

Controlled actual Linux/XRDP loss now passes after real media and resize in both
primary and explicit framed IPC: exact RDP_DISCONNECTED, continued heartbeat and
empty-runtime/relay cleanup. This accepts the named private connected loss case;
remote held-input/device release, browser failure state, reconnect and sustained
resource acceptance remain open. [Iteration 203](docs/ITERATION_203.md).

Actual Linux amd64/XRDP now passes strict certificate rejection and the previously
approved session-only fingerprint over automatically selected primary IPC.
1920×1080 JPEG/H.264 IDR, confirmed 1280×720 resize/restoration with fresh IDRs,
heartbeat and empty-runtime cleanup pass. This is private Node/native RDP
integration; browser, audio/devices and sustained resource/soak acceptance remain
open. [Iteration 201](docs/ITERATION_201.md). Earlier Linux build-only statements
below describe their historical evidence and are superseded only for this slice.

Current IPC evidence: Linux automatically selects paired private RWS1
SOCK_SEQPACKET and keeps explicit/legacy framed fallback. Actual Node/native
100-worker lifecycles, parent/worker death, cancellation, independent deadlines,
private settings/secret, descriptor joins and installed/independent archive checks
pass. Full Node: Windows 537 passed / 25 platform skips; Linux 487 passed / 75
platform skips, 562 cases, zero failures. [Iteration 200](docs/ITERATION_200.md).
This completes the named Release transport component, not all Stage 1:
configured-capacity admission, addon sanitizer baseline, broader isolation /
abnormal cleanup and connected-RDP/resource gates remain explicitly open.

Lifecycle and the Stage 2 fake-backend gate are verified on **Windows x64**.
Actual Linux amd64 foundation now passes ASan/UBSan CTest 8/8, seven bounded
libFuzzer smoke targets and Node check (439 passed / 83 skipped / zero failures).
One hundred sequential workers and parent-death cleanup pass on Linux framed
pipes. Windows Node check passes 522/522. The local sanitizer placement workaround,
retained failed PIE runs and platform boundaries are recorded in
[iteration 184](docs/ITERATION_184.md); no linked Linux RDP/device acceptance is claimed.
Linked Linux Release FreeRDP/worker now passes CTest 20/20 and full Node check
(453 passed / 75 skipped / zero failures, 528 total). Private eudev/libusb and
complete staged ELF closure pass; canonical relocation passes 1/1. Windows Node
check passes 528/528. [Current closure evidence](docs/ITERATION_189.md),
[build evidence](docs/ITERATION_187.md). No actual Linux RDP/device
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
[Actual source evidence](docs/ITERATION_175.md).
The user accepts current Opus output quality for local development: the explicit
200 ms profile sounds smoother, with remaining interruptions. A slow tunnel is
the user's hypothesis, not a measured cause. Native 120/200 ms selection, actual
PCM/Opus reception and ready reset pass; uninterrupted quality, measured latency
and the remaining audio gates are not waived. [ADR-012](docs/adr/ADR-012-audio-compatibility-buffer.md),
[current evidence](docs/ITERATION_179.md).

Microphone foundations now include private Windows worker dispatch/reset,
bounded Node ingress and exclusive control/media session ownership. Restored
XRDP private off/PCM/Opus output combinations pass waiting-source inventory;
ready input, native selection/permission/capture and remote microphone acceptance
remain open. [Current session ownership](docs/MICROPHONE_SESSION.md),
[actual XRDP inventory](docs/ITERATION_115.md).
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
[Current viewer](docs/ITERATION_144.md).

- **DONE:** strict pnpm workspace, CMake/Ninja C++20 worker, bounded RWI1 framing, HELLO,
  heartbeat/watchdog, graceful/forced shutdown, crash isolation and private-directory cleanup.
- **DONE:** initial TypeBox configuration contract and recursive redaction; real worker-backed
  build/capability REST endpoints; reusable Node worker API and lifecycle example.
- **Evidence:** [Node integration tests](tests/integration/worker.test.mjs),
  [protocol tests](tests/unit/protocol.test.mjs), [configuration tests](tests/unit/config.test.mjs),
  [native tests](native/ipc/tests.cpp). Latest bundled Windows `pnpm check`:
  **528/528**. Bounded browser fixture ports resolve the random 2049 refusal;
  focused Edge/socket 6/6 and full repeat pass. Earlier failures are preserved in
  [iteration 186](docs/ITERATION_186.md) and [iteration 188](docs/ITERATION_188.md).
  Recorded native assertion baseline: 72 IPC/input/state/audio-codec/output/capture cases / 61,347 assertions, 2 AVC cases / 19 assertions,
  2 cursor conversion cases / 11 assertions, 2 JPEG cases / 26 assertions and
  5 H.264 cases / 224 assertions. Dirty state adds 4 cases / 696 assertions;
  public GDI integration adds 5 cases / 9,199 assertions; GFX public callback fixtures
  add 7 cases / 27,160 assertions (combined GDI/GFX: 12 / 36,359), including
  actual incoming AVC420 decoder callbacks and malformed-command guards.
  [Cursor block evidence](docs/ITERATION_012.md), [dirty tracking evidence](docs/ITERATION_013.md),
  [GFX binding evidence](docs/ITERATION_014.md), [incoming AVC420 evidence](docs/ITERATION_015.md).
  GFX implementation commit: `90285bb`.
  Incoming AVC420 and incremental build corrections: `d5b1a0a`.
  [Quality/FPS profile evidence](docs/ITERATION_016.md): actual XRDP H.264/reset
  and JPEG report a configured 5 FPS cap; direct native capture intervals stay
  above 200 ms independently of Node pacing. Broader performance/soak gates remain open.
  Quality/FPS implementation commit: `bd8659b`.
  [Native Display Control foundation](docs/ITERATION_017.md): 8 cases / 280 assertions
  cover caps, layout bounds, pending/observed state, timeout and teardown. Actual public
  GDI realloc and resized AVC/JPEG decoding pass; public browser requests remain
  open. Windows foundation helper correction: `d295264`.
  Native Display Control/resize implementation commit: `4cc44d2`.
  [Private Display Control IPC evidence](docs/ITERATION_018.md): opt-in/capability,
  bounded request/result correlation, observed display generations and Node supervision pass.
  Actual XRDP negotiated caps, accepted 1920×1080 → 1280×720 → 1920×1080 and delivered
  fresh AVC IDRs plus resized JPEG. Public browser resize/lease/media ownership remains open.
  Private Display Control IPC implementation commit: `098ddab`.
  [Public Display Control/browser evidence](docs/ITERATION_019.md): current control-lease
  resize, typed results, actual display replay, input pause, media epoch/ACK preservation,
  same-size reset and stale unsent-frame rejection pass native/fake/Edge checks.
  Actual XRDP browser resize/restoration passes in H.264 and JPEG; Windows-server,
  resource limits and soak acceptance remain open. Broader display layouts are
  excluded from current scope by ADR-011.
  Public Display Control/browser implementation commit: `78fbb67`.
  [Modifier/focus synchronization evidence](docs/ITERATION_020.md): eight new pure /
  Edge-fake cases verify bounded modifier recovery, observed physical sides,
  lock ordering, composition and reset during a resize pause. Native tracking
  preserves both modifier sides across synchronize calls. Actual remote keyboard /
  layouts remain unverified; no broader input acceptance is claimed.
  Modifier/focus synchronization implementation commit: `236f1a1`.
  [Committed Unicode/IME fallback evidence](docs/ITERATION_021.md): bounded UTF-16BE,
  server capability refusal, old-peer gating, ordered Unicode down/up and release
  retry, text-rate budget and Edge preedit/explicit submission pass fixtures.
  Actual remote text/OS IME and direct canvas IME remain open.
  Committed Unicode/IME fallback implementation commit: `60e3ee4`.
  [Fractional wheel evidence](docs/ITERATION_022.md): bounded per-axis DOM
  pixel/line/page accumulation, gesture context/idle/reset handling and Edge
  ordering pass. Real wheel/trackpad sensitivity acceptance remains open.
  Fractional wheel implementation commit: `c5d9ec3`.
  [Native touch foundation evidence](docs/ITERATION_023.md): ten-contact bounded
  state, correct terminal coordinate ordering, API failure/cleanup ownership and
  public RDPEI projection pass 10 state cases / 13,114 assertions and 9 RDPEI cases /
  370 assertions. Five RDPEI cases use the actual linked addin with fake DVC
  transport; they are not remote touch acceptance. Worker suspension/contact
  cleanup, IPC/control, browser capture and real touch integration remain open.
  Native touch foundation implementation commit: `69e1717`.
- [Observable RDPEI transport evidence](docs/ITERATION_024.md): public-DVC
  SC_READY/CS_READY completion and periodic-frame suspension gate pass native
  tests. RDPEI suite now has 23 cases / 9,789 assertions, including ten actual-addin
  cases with fake transport. Transport resume is separate from contact/lease
  readiness; plugin/worker activation and end-to-end touch remain open.
  RDPEI transport gate implementation commit: `fb8643f`.
- [Public RDPEI ownership evidence](docs/ITERATION_025.md): pinned static addin
  registration, wrapped listener/gate, partial creation cleanup and lifecycle
  tests pass. RDPEI now has 34 cases / 10,127 assertions, including fourteen
  actual-addin/fake-DVC cases. Connection/contact drain, private IPC/browser and
  actual remote/physical touch remain open; no touch capability is advertised.
  Public RDPEI registration implementation commit: `af8b99e`.
- [Terminal contact drain evidence](docs/ITERATION_026.md): ten native/external
  contact pairs remain owned until terminal transport writes. Suspended native
  UP records survive periodic consumption, then drain before input readiness;
  resume-before-pump, reset, write/deadline failure and bounded parser cases pass.
  RDPEI has 51 cases / 12,314 assertions, including twenty-three actual-addin/fake
  transport cases. Timestamp-remoting/v1.0 compatibility and worker/IPC/browser
  activation remain open.
  Terminal contact drain implementation commit: `d38afe1`.
- [Scoped RDPEI provider/lifetime evidence](docs/ITERATION_027.md): Connection binds
  a public provider on the RDP thread after context creation, retires delegated
  resources before joining, and preserves the wrapper for later host termination.
  Other channels retain their previous provider. Touch loading/capability stays
  disabled until IPC/control/browser dispatch; actual remote RDPEI remains open.
  RDPEI: 62 cases / 12,612 assertions; bundled CTest 10/10, foundation 4/4,
  Node 124/124 and actual XRDP H.264 reset/resize/restoration pass.
  Scoped RDPEI provider/lifetime implementation commit: `1072e58`.
- [Bounded touch IPC codec evidence](docs/ITERATION_028.md): separate fixed
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
  ordering `ff5fcdf`. [Current touch evidence](docs/ITERATION_031.md).
- **DONE on Windows:** exact FreeRDP/WinPR 3.32.1, local ZLIB 1.3.2, OpenSSL 3.6.5 and libusb
  1.0.30 build and link. Private native ZIP contains runtime DLLs, release CRT, licenses and
  dependency metadata. Relocation test checks actual loaded ZLIB/FreeRDP paths and static
  channel inventory without dependency PATH. JPEG now also ships privately and is encoded/decoded
  in the relocated runtime probe. OpenH264 encoding, AVCC and FreeRDP AVC420 decoding are verified natively.
  Current native ZIP is approximately 6.0 MiB, 14.9 MiB installed (47 files),
  including the private Opus runtime and excluding Node.js and future hardware
  providers/installers. Measured archive: 6,266,183 bytes; installed files:
  15,621,256 bytes. Earlier footprints remain in their historical reports.
  [Iteration 5](docs/ITERATION_005.md), [iteration 6](docs/ITERATION_006.md).
  Implementation commits: `7757d44`, `b1c779d`; local lab helper: `55e22cc`.
- **Retained acceptance:** Windows RDP access is restored; current endpoint and
  application evidence are summarized in [lab status](docs/LAB_STATUS.md), with
  a current verification limitation in [iteration 332](docs/ITERATION_332.md).
  Historical XRDP results retain their original server scope and include strict
  certificate rejection, approved session-only trust, activation, heartbeat
  and cleanup. [Iteration 4](docs/ITERATION_004.md) records the historical
  absent-Linux scope; primary Linux IPC is implemented and verified in
  [iteration 200](docs/ITERATION_200.md). Actual Linux RDP/device, broader
  platform/resource gates and CI execution remain open; local sanitizer/fuzz
  execution does not establish CI or linked Linux integration acceptance.
  [Documentation correction](docs/ITERATION_336.md).

Wire details: [IPC foundation](docs/IPC_FOUNDATION.md). Audit and iteration report:
[contract audit](docs/CONTRACT_AUDIT.md), [iteration 1](docs/ITERATION_001.md), [iteration 2](docs/ITERATION_002.md).

## Stage 0 — repository and reproducible build

- [x] DONE for current local GCC 12 foundation/Node source regression — Fresh
  complete tracked snapshot of `6415d9c`, frozen offline Node 24.21.0/pnpm
  installation and new GCC 12.4 Debug foundation pass CTest 18/18, framed
  lifecycle 15 / one absent-primary skip and Node 766 / 178 profile/platform
  skips. All 1,320 archived files and lockfile remain unchanged; no worker
  remains. The final Docker receipt-copy error is retained; its stdout receipt
  is recovered with explicit provenance and corrected export passes a separate
  control. Temporary containers are removed. This is not current linked Linux
  FreeRDP/RDP or wider Stage 0 acceptance. [Evidence](docs/ITERATION_389.md).

- [x] DONE for Windows clean-foundation output hashes — New source-only
  receipts bind worker/helper bytes after source/profile/native/lifecycle
  checks, with the existing streamed 64 MiB bound and complete-map publication.
  Known digests, exact/over-limit and missing output controls pass; actual new
  MSVC Debug CTest 17/17, lifecycle 16 / one skip and full Node 813 / 102 skips
  pass. Historical receipts and linked inventories are preserved. Actual Linux
  writer/distro/CI, deterministic outputs and wider gates remain open.
  [Evidence](docs/ITERATION_381.md).

- [x] DONE for current Windows foundation host-resource profile — New offline
  source-only MSVC Debug output has identical native source bytes to linked
  Debug, reports host batching with null FreeRDP and no connect capability,
  and starts no resource policy by default. CTest 17/17, resource integration
  12/12 and full Node 809 / 102 skips pass. SDK codec tests use actual linkage,
  with linked 4/4 controls; prelaunch staging expiry/cancellation passes too.
  Release, pins, other-platform/CI/connected/load and wider gates stay open.
  [Evidence](docs/ITERATION_380.md).

- [x] DONE for current full workspace regression — With Node 24.21.0 correctly first in the child-process PATH, `pnpm check` passes build, lint, format and Node **748 passed / 101 skipped / 0 failed**. Bundled native CTest passes **29/29** through the project's temporary `R:` workspace alias; no CMake reconfiguration or Release change was made. [Evidence](docs/ITERATION_347.md).

- [x] DONE for manual WEB harness source-worker selection — The Windows
  reference harness optionally selects a linked source build by verified
  receipt and worker/helper hashes; no option retains the bundled default.
  Unit/receipt coverage, full Windows `pnpm check` (742 passed / 101
  platform/profile skips) and source-selected headless Edge startup/cleanup
  pass without creating an RDP session. A first full run retained an
  intermittent resource-capacity deadline failure; the standalone control and
  full repeat pass, so broader resource/load acceptance stays open.
  [Evidence](docs/ITERATION_330.md).

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
  [Evidence](docs/ITERATION_313.md).

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
  RDP/device/CI and full stage gates remain open. [Evidence](docs/ITERATION_312.md).

- [x] DONE for clean-native compiler provenance — New receipts bind the actual
  CMake version, compiler ID/version/path, Ninja generator
  and verified build type. Four unit cases and actual Clang/GNU reply probes
  pass. New GCC 13 Debug CTest 16/16, lifecycle 15 / 1 skip, full Node 578 / 147
  skips and new MSVC Debug CTest 15/15, lifecycle 16 / 1 skip pass; full Windows
  Node 632 / 90 skips also passes. Both native receipts bind identical source
  bytes. Release settings, pins and GNU minimum 12 are unchanged; broader gates
  remain open. [Evidence](docs/ITERATION_289.md); `911bb21`.

- [x] DONE for current local Clang 18 Debug source export — Complete tracked
  archive of `3534484`, frozen offline Node installation and fresh native-only
  foundation compilation pass CTest 16/16, framed lifecycle 15 / 1 skip and full
  Node 574 / 147 platform/profile skips / 721 total. All 1,107 archived files
  remain byte-identical; no old objects, SDK or lab files are copied. Prepared
  compiler/Catch2/public caches are reused. GNU minimum 12, Release, dependency
  pins and wider distro/CI/RDP/device gates remain unchanged.
  [Evidence](docs/ITERATION_288.md); `ffa0959`.

- [x] DONE for incremental libusb test-copy preparation — CMake tracks the
  test-only patch as a configure dependency. A private-copy build regression
  fails before the correction and passes patch edit/restore/incremental builds
  with GCC 12 and Clang 18; full standalone CTest 4/4 each and repeated focused
  CTest 1/1 each pass. Original sources, Release and dependency pins stay
  unchanged. This closes one reproducibility detail, not the Stage 0 gate.
  [Evidence](docs/ITERATION_287.md); `3534484`.

- [x] DONE for isolated libusb descriptor cleanup regression — A retained
  40-byte LSan leak reproduces with GCC 12 before correction. Exact test-only
  build-copy cleanup passes GCC/Clang CTest 3/3 each, original-input replay and
  two 100,000-run ASan/UBSan/libFuzzer smokes without new errors. Original
  sources and Release remain unchanged; production libusb still has the known
  cleanup gap. Shared-backend/eudev, production adoption and wider gates stay
  open. [Evidence](docs/ITERATION_286.md); `5427e70`.

- [x] DONE for bounded local GCC 12 libusb descriptor seed replay — Separate
  pinned 1.0.30 device-free parser fixture passes 105 BOS value checks and 150
  deterministic inputs through two unchanged upstream harnesses; standalone
  CTest 2/2, source/hash-refusal audits, linked control CTest 31/31 and full Node
  633 / 84 skips pass. The next Clang fuzz attempt exposes a retained 40-byte
  cleanup leak beyond this corpus; the isolated correction above supersedes
  only this test slice. Full parser/backend/eudev/platform/CI/device acceptance
  remains open. Release is unchanged. [Evidence](docs/ITERATION_285.md).

- [x] DONE for local experimental OpenSSL shared sanitizer runtime slice —
  Separate pinned 3.6.5 C-only/no-module Debug ASan/UBSan profile, without RPATH,
  passes 4 upstream recipes / 211 top-level tests, exact source/shared/static
  hash audit, safe runtime transfer and actual SSL/crypto origins. Linked native
  CTest 31/31 and full Node 633 / 84 skips pass with unchanged worker/Release.
  The recommended static baseline stays separate; full production OpenSSL
  features/modules/assembly, remaining dependencies/addon/platform/CI and RDP
  gates remain open. [Evidence](docs/ITERATION_284.md).

- [x] DONE for selected local GCC 12 OpenSSL static sanitizer cases — Pinned
  3.6.5 follows upstream no-shared/PEDANTIC sanitizer recommendations in a
  separate no-asm Debug output. Focused ASN.1 2 recipes and selected 10 recipes /
  15 top-level tests pass without sanitizer diagnostics; exact source/backup
  audit passes. Four additional X.509 recipes / 220 top-level tests pass with
  unchanged hashes and no sanitizer diagnostics. Prior failed harness/audit
  runs are retained. [Certificate evidence](docs/ITERATION_282.md). Three local
  SSL context/config/memory-BIO recipes and all 13 available buffer variants also
  pass. [Memory SSL evidence](docs/ITERATION_283.md). Full production shared
  OpenSSL selection, full algorithms/TLS/upstream/fuzz/platform/CI and remaining
  dependency/addon acceptance stay open. [Evidence](docs/ITERATION_281.md).

- [x] DONE for local GCC 12 shared JPEG upstream sanitizer profile — Independent
  pinned libjpeg-turbo 3.2.0 Debug build, instrumented private libspng/ZLIB,
  292 instrumented C commands and focused 3/3 / full upstream CTest 332/332 pass.
  Exact commands/dependencies are preserved with native/tool loader separation;
  post-test source audit matches only existing port patches. Focused C fallback,
  actual module origins, linked CTest 31/31 and full Node 633 / 84 skips pass.
  Release is unchanged.
  Assembly instrumentation, longer fuzz, remaining dependencies/addon/platform/CI
  and RDP/resource gates remain open. [Evidence](docs/ITERATION_280.md).

- [x] DONE for local GCC 12 libspng PNG sanitizer slice — Separate pinned 0.7.4
  shared build and both fixture translation units carry ASan/UBSan. Eight
  whole/progressive/Adam7 RGBA8 roundtrips, output/image/truncation bounds and
  202-file / 2,424-input upstream read replay pass standalone CTest 2/2.
  Private instrumented libspng/ZLIB origins and unknown-harness refusal pass.
  Linked CTest 31/31 and full Node 633 / 84 skips pass; Release is unchanged.
  Full libpng comparison, write/long fuzz, remaining
  dependencies/addon/platform/CI and RDP gates stay open.
  [Evidence](docs/ITERATION_279.md).

- [x] DONE for local GCC 12 static ZLIB sanitizer cases — All 19 compile commands,
  including upstream infcover, carry ASan/UBSan with nonrecovering UB checks.
  Four focused static/coverage cases and full CTest 16/16 pass, with matching
  gcov 12, unchanged source/assertions and no new sanitizer diagnostic.
  The prior shared runtime/Release remains unchanged. Broader dependency/addon,
  upstream/fuzz/platform/CI and RDP gates remain open.
  [Evidence](docs/ITERATION_278.md).

- [x] DONE for local GCC 12 instrumented ZLIB runtime profile — Pinned 1.3.2
  source/port correction, all 18 compile commands, actual ASan/UBSan NEEDED entries,
  upstream CTest 14/14 and linked module/codec origins pass. Thirty instrumented
  native executables plus compiler-policy CMake pass 31/31; full Node passes
  633 / 84 profile/platform skips with ordinary parent Node and addon OFF.
  Release is unchanged. Remaining dependency/addon/static/upstream/fuzz/platform/
  CI and actual RDP gates stay open. [Evidence](docs/ITERATION_277.md).

- [x] DONE for local OpenH264 BsFlush correction/instrumented runtime — Exact upstream
  build-copy guard skips the undefined shift in the valid empty state. GCC 12.4
  UBSan fails before and passes 2325 checks after; unknown input is refused and
  original source/diagnostics are preserved. Corrected shared-library origin,
  six codec suites, full native CTest 31/31 and Node 633 / 84 skips pass with
  instrumented FreeRDP/WinPR/Opus. Release remains unchanged. Assembly, remaining
  private dependencies/addon, platform/upstream/CI and actual RDP gates stay open.
  [Evidence](docs/ITERATION_275.md).

- [x] DONE for local GCC 12 instrumented SDK / bridge fixture profile — Separate
  pinned FreeRDP/WinPR + approved DSP correction compiles with ASan/UBSan;
  actual SDK runtime dependencies, bridge PIE, verbose CTest 31/31, codec probe
  and full Node 633 / 84 skips pass under the restricted Ubuntu fixture.
  Private dependency/addon instrumentation, upstream tests/fuzz and actual
  RDP/device/platform/CI gates remain separate. [Evidence](docs/ITERATION_272.md).

- [x] DONE for pinned DSP reset ownership / local linked bridge sanitizer slice —
  Exact-source build-copy correction releases previous Opus state; bounded source
  and SDK provenance guards, failing-before/passing-after public regression,
  Windows/Linux SDK rebuilds, native/Node suites and installed relocation pass.
  Ubuntu GCC 12 default PIE ASan/UBSan covers bridge-owned linked code against
  uninstrumented private FreeRDP/codecs; addon OFF. Upstream/addon sanitizers,
  actual RDP/audio/device and broader resource/CI gates remain separate.
  [Evidence](docs/ITERATION_269.md), [build contract](docs/FREERDP_OVERRIDES.md).

- [x] DONE for Windows native-driver Node path ownership — Physical Node project,
  test and binary paths preserve ESM error identity across SUBST/pnpm junctions;
  CMake/SDK receipt aliases remain bound. Actual new linked consumer passes
  CTest 30/30 and process/TLS/identity 27 / 1 skip. Full Windows 664 / 49 skips
  and Linux GNU 12.2 657 / 59 skips pass. This is a local driver correction;
  actual CI and broader platform/resource acceptance remain open.
  [Evidence](docs/ITERATION_266.md).

- [x] DONE for complete tracked-source Windows project export — New archive
  fixture has no prior build/dist/node_modules/.deps/lab files; frozen offline
  install, new Release build, CTest 30/30, full Node 663 / 49 skips / 712,
  install/relocation 1/1 and production deploy/import pass. Lockfile and external
  source-built SDK/dependency receipts stay unchanged. Prepared tools/Catch2 and
  public caches are reused; fresh OS/distro/CI and linked/upstream sanitizer
  acceptance remain open. Alias-induced duplicate ESM identity and the passing
  physical-path correction are retained. [Evidence](docs/ITERATION_265.md).

- [x] DONE for local GNU 12 compiler baseline — Explicit GNU >=12 admission and
  actual C++20 library probe, policy boundary CTest, new GNU 12.2 linked source
  build (CTest 31/31, process/TLS 40/40, full Node 657 / 58 skips / 715) and MSVC
  probe/foundation 15/15 pass. The user's GCC 12 fallback retains C++20; GCC 8
  requires a separate compatibility port and is unsupported. Explicit GCC 12 CI
  entry is prepared, not executed. [Support](docs/COMPILER_SUPPORT.md),
  [evidence](docs/ITERATION_263.md).

- [x] DONE for local Ubuntu standard PIE sanitizer foundation — GCC 12.4 / GCC 13
  ASan/UBSan CTest 16/16 and 15/15, honest worker CLI and actual PIE ELF identity pass under
  UID1000/read-only/no-network with bounded executable build tmpfs. GCC/Clang
  empty PIE sanitizer programs each pass 100 launches with default options.
  No ASLR/seccomp or non-PIE workaround is used. Eleven Clang 18 seeded PIE fuzz
  targets pass bounded 20-second / 512 MiB smokes; the local external symbolizer
  remains unavailable. The GCC 12 minimum and addon/upstream/exhaustive-fuzz/CI
  boundaries remain; prior Bookworm failures are retained.
  [GCC 12 and fuzz](docs/ITERATION_264.md), [earlier profile](docs/ITERATION_262.md).

- [x] DONE for complete tracked-source Linux project export — New git archive
  fixture begins without build/dist/node_modules/.deps/lab files, performs frozen
  offline Node installation, native CTest 30/30, full Node 656 passed / 58 skips /
  714, install/ELF closure, relocation and production deploy/import. Lockfile and
  external source-built SDK/dependency receipts remain unchanged. Prepared build
  tools/Catch2/public caches are reused; new OS/toolchain/distro, Windows export,
  network checkout/download, CI and sanitizer acceptance remain separate.
  [Evidence](docs/ITERATION_260.md).

- [x] DONE for current source-built native packages — New Linux TGZ and Windows
  ZIP install the exact pinned-source license and generated feature report.
  Windows relocation 1/1 and Linux ELF closure (34 files / 274 edges), independent
  non-root/read-only/no-network Bookworm and Ubuntu 24.04 codec/module/IPC/
  cleanup smokes pass. This is native artifact runtime evidence; Ubuntu source
  compilation, complete fresh checkout/distro/CI, full service images/installers
  and actual RDP/device acceptance remain open.
  [Packaging](docs/ITERATION_258.md), [Ubuntu runtime](docs/ITERATION_259.md).

- [x] DONE for local Windows cached-source native chain — Fourteen dependency
  packages, a new pinned SDK and a new source-only worker consume unchanged bound
  receipts and private package/module origins. SDK CTest 1/1, project 29/29 and
  process/TLS 26 passed / one skip and full Node 662 / 49 skips pass.
  Prepared tools/Catch2/source archives are
  reused. The first MSBuild access failure is retained; the authorized repeat
  passes without disabling FileTracker. Complete clean-machine/checkout/CI and
  remaining acceptance gates stay open. [Dependencies](docs/ITERATION_255.md),
  [SDK](docs/ITERATION_256.md), [consumer](docs/ITERATION_257.md).

- [x] DONE for local Linux cached-source native chain — New source-built private
  dependencies and FreeRDP feed a new source-only worker/addon with both bound
  unchanged receipts and exact CMake/loaded-library origins. SDK CTest 1/1,
  project 30/30, process/TLS 40/40, codec/context probe and full Node 656 passed /
  58 skips / 714 pass. Build tools/Catch2/source archives remain prepared inputs;
  Complete fresh checkout/distro/CI and remaining acceptance
  gates stay open. [Evidence](docs/ITERATION_254.md).

- [x] DONE for local Linux isolated private dependency source rebuild — All 20
  planned packages compile/install with new work/package/installed trees,
  disabled binary caches, no downloads/network and concurrency two. Current
  pinned recipes and 22 installed status records are bound by a checked receipt.
  Compiler/vcpkg tools and cached source archives are reused; complete fresh
  checkout/distro/CI and remaining acceptance gates stay open. The corresponding
  Windows source rebuild is now verified in iteration 255.
  [Evidence and input hashes](docs/ITERATION_252.md).

- [x] DONE for local Windows/Linux fresh project consumer of the rebuilt SDK — Another
  source-only Release worker/addon tree resolves all three CMake packages from
  the new SDK, with a bound unchanged SDK receipt. Windows/Linux CTest 29/29 and
  30/30, actual-process/synthetic-TLS Node 26 passed / one skip and 40/40 pass.
  Current full Windows check passes 660 / 49 skips / 709; Linux 654 / 58 / 712.
  Mixed/incomplete/oversized receipts refuse before build output. Private
  dependencies/toolchain/Catch2 are reused; complete fresh
  dependency/distro/CI and remaining sanitizer/runtime gates stay open.
  [Linux evidence and hashes](docs/ITERATION_248.md),
  [Windows evidence and hashes](docs/ITERATION_250.md).

- [x] DONE for local Windows/Linux isolated FreeRDP source rebuild — A new no-hardlink
  clone of the exact clean pinned checkout compiles and installs into a new SDK
  prefix. Public runtime version/static inventory, three canonical module origins,
  foreign-prefix refusal and consumer CTest 1/1 pass. Existing private dependency /
  toolchain inputs are reused; full fresh
  dependency/distro/CI and remaining sanitizer/runtime gates remain open.
  [Linux evidence and hashes](docs/ITERATION_247.md),
  [Windows evidence and hashes](docs/ITERATION_249.md).

- [x] DONE for isolated Windows/Linux linked project-native source build — New Release
  build reuses the clean pinned SDK and external Catch2/toolchain, with no copied
  project binary/object/cache. Windows/Linux CTest 29/29 and 30/30 and Node
  lifecycle 26 passed / one absent-primary skip and 40/40 pass. Source/feature /
  artifact hashes are retained. Upstream dependency/FreeRDP rebuilds, distro/CI
  and remaining sanitizer/runtime gates stay open.
  [Windows evidence](docs/ITERATION_246.md), [Linux evidence](docs/ITERATION_245.md).

- [x] DONE for isolated Windows/Linux project-native foundation source build — New
  source-only fixture has no copied binary/cache/SDK/Node dependencies or lab
  input. MSVC/GCC CTest 14/14 and 15/15 and Node framed lifecycle 15 passed /
  one absent-primary skip on each pass, with the same unchanged source hash.
  Local Catch2 source is reused; upstream dependencies/FreeRDP, linked fresh
  project build, distro/CI and remaining sanitizer gates stay open.
  [Windows/Linux evidence](docs/ITERATION_244.md), [initial Linux](docs/ITERATION_243.md).

- [x] DONE for current local foundation regression — Refreshed Windows/Linux
  foundation CTest passes 14/14 and 15/15; framed clipboard/worker lifecycle passes
  15 with one platform/absent-primary skip on each. Shared test waits now honor
  finite requested deadlines and browser port retry failures preserve their cause.
  Existing local trees/dependencies are used; fresh-checkout/distro/CI and actual
  remote/device gates remain open. [Evidence](docs/ITERATION_242.md).

- [x] DONE for clean Linux Node workspace — New source-only fixture has no dist /
  node_modules; frozen offline installation, all four TypeScript builds and fresh
  production deployment/import pass with unchanged lockfile. Native fresh-checkout
  and distro matrix remain open. [Evidence](docs/ITERATION_213.md).

- [x] DONE for independent Linux native archive smoke — Pinned Node 24 Bookworm
  verifier uses only TGZ/probe, with no SDK/system FreeRDP/libudev, UID 1000,
  read-only root, no network and bounded tmpfs. Six private loaded modules,
  codec/libudev context roundtrips, exact HELLO/heartbeat/shutdown and worker
  directory cleanup pass. Full Node service image, distro/fresh-build/installer
  gates remain separate. [Evidence](docs/ITERATION_190.md). ELF closure: `8a51dc3`.

- [x] DONE for current Linux native ELF profile — Private eudev 3.2.14 keeps
  libusb udev enabled. Pre-CPack bounded canonical dependency/origin-path checks
  pass 33 ELF files / 268 edges, plus codec/libudev-context/lifecycle relocation
  1/1. Four portable ownership/parser cases pass. Independent clean-runtime,
  fresh-checkout/CI and actual device/platform gates remain separate.
  [Evidence](docs/ITERATION_189.md). Prior linked build: `a825c18`;
  IPC exact allocation: `4152919`; browser port correction: `194562d`.

- [x] DONE for local Linux dependency compilation — Pinned private ZLIB/OpenSSL/
  libusb/JPEG/libspng/OpenH264/Opus build, plus required Linux-only Kerberos 1.22.2
  and ICU 78.3, now CUPS 2.4.20, libfuse 3.18.3 and numactl 2.0.19. Exact
  FreeRDP/worker Release build and CTest 20/20 pass; private discovery, metadata,
  licenses and codec relocation are verified. eudev closure now passes in
  iteration 189; fresh-build and actual remote/device gates remain open.
  [Build evidence](docs/ITERATION_187.md),
  [previous reboot checkpoint](docs/ITERATION_186.md).
- [x] DONE — Create pnpm monorepo layout from `STACK.md` (core packages/apps/native; future component directories are created with their implementations). `9517003`.
- [x] DONE — Add TypeScript strict config, lint/format, CI skeleton. `pnpm check`; `9517003`.
- [x] DONE — Add CMake/Ninja native workspace. MSVC x64 build + CTest; `9517003`, `1672590`.
- [x] DONE on Windows — Pin FreeRDP **3.32.1** source/build and record commit/checksum. Source commit verified as `bf217a504e54cc719880c228e82353382cd7d4fa`; libraries built locally, linked CLI reports 3.32.1, archive SHA-256 generated. [Lock metadata](native/dependencies.json), [verification](docs/ITERATION_002.md). Linux build/fresh-checkout gate remains open.
- [x] DONE for Windows/local Linux build inventory — Required client channels and filtered feature reports agree with actual public static-addin enumeration after relocation: Windows 20, Linux 22. Serial/parallel are compiled on Linux and explicitly OFF on Windows where pinned upstream lacks those clients. Runtime/device support is separately capability gated and remains Stage 8 work. [Relocation and current artifact evidence](docs/ITERATION_222.md).
- [x] DONE — Add `rdp-worker --version --capabilities`. Native CLI and handshake reports agree; absent library reported as null, RDP false. [Integration test](tests/integration/worker.test.mjs); `1672590`, `316cdc0`.
- [x] DONE — Add Node `/v1/build` backed by real worker/build information. Fastify injection + native handshake/CLI comparison; `316cdc0`.
- [x] DONE for portable local Linux verification — Add debug ASan/UBSan job and execute native foundation: CTest 8/8 in the documented non-PIE Docker environment. [Workflow](.github/workflows/ci.yml) remains prepared; actual CI and standard PIE environment acceptance are open. [Evidence](docs/ITERATION_184.md).

**Gate:** clean build from fresh checkout/container; exact FreeRDP version visible; no UI required.

## Stage 1 — native worker process and IPC

- [x] DONE for observed absolute backend startup deadline — One monotonic
  budget now covers invocation staging, pending startup state callbacks and
  completion. Overdue work fails with existing WORKER_START_TIMEOUT; a finished
  startup retires its deadline, preserving later progress and explicit close.
  Four failing-before controls are retained; corrected focus passes 26/26,
  composed native lifecycle 2/2, CTest 17/17 and full Windows Node 827 / 102
  skips pass. Kernel preemption, cleanup deadlines, actual RDP and broader
  platform gates remain open. [Evidence](docs/ITERATION_383.md).

- [x] DONE for host supervisor timer-range admission — Startup, graceful-close
  and forced-termination budgets refuse integer delays beyond Node's supported
  2,147,483,647 ms maximum before timer/worker creation, preserving existing
  defaults and exact-maximum admission. Three failing-before controls and
  actual Node overflow behavior are retained; corrected manager focus passes
  19/19, current native CTest 17/17 and full Windows Node 818 / 102 skips pass.
  Delayed callbacks, actual forced-deadline expiry and uncertain OS retirement
  remain open. [Evidence](docs/ITERATION_382.md).

- [x] DONE for native lifecycle fixture startup cancellation — The test-only
  registry adapter now terminates a still-starting WorkerProcess before joined
  close, matching the production adapter's existing behavior. A failing-before
  control observes an unwanted child PID; corrected Windows/Linux composed
  lifecycle suites pass 3/3 with no child spawn after synchronous startup abort.
  Production startup/Release code is unchanged; broader startup/OS/isolation
  gates remain open. [Evidence](docs/ITERATION_293.md); `876ecea`.

- [x] DONE for unconnected native registry crash isolation — Three actual
  framed worker processes use the explicit lifecycle-only registry adapter.
  Forced exit of one produces WORKER_FAILED, retires its PID/runtime and active
  slot, preserves two sibling heartbeats and permits replacement. Windows/Linux
  focused suites pass; the 40-worker capacity test still passes after fixture
  extraction. Connected RDP, simultaneous parent/worker kill, forced-deadline,
  broader resource/isolation and soak gates remain open.
  [Evidence](docs/ITERATION_292.md); `7574f63`.

- [x] DONE for configured framed native lifecycle capacity — An explicit
  test-only registry adapter composes 40 actual native workers, global limit
  40 / per-principal 20, pre-factory overflow refusal, ten-slot replacement,
  automatic/manual heartbeat and joined PID/runtime cleanup; Linux FD count
  returns to baseline. Windows/Linux focused cases, CTest 15/15 and 16/16 and
  full Node 633 / 90 skips and 579 / 147 skips pass. No RDP connection is made.
  Fixed primary-carrier capacity 32, arbitrary larger policies, connected
  soak/resource and isolation gates remain open. [Evidence](docs/ITERATION_291.md); `fa55758`.

- [x] DONE for local Ubuntu GCC 12 standard PIE sanitized-worker lifecycle — New
  tracked-source fixture, frozen offline Node install, ASan/UBSan CTest 16/16 and
  full Node 569 / 146 profile/platform skips / 715 pass. Actual 100-worker,
  parent-death and bounded-output cleanup run with default sanitizer settings in
  the separate worker. Parent Node is not preloaded; addon/FreeRDP are OFF.
  Node-only preload LSan controls still fail, so addon/linked/upstream/CI and
  connected-RDP/resource gates remain open. [Evidence](docs/ITERATION_267.md).

- [x] DONE for Linux default IPC capacity — 32 concurrent actual native workers,
  automatic/manual heartbeat, refused pre-spawn 33rd owner, sixteen-slot
  replacement and joined process/FD/runtime cleanup pass. This is unconnected
  lifecycle evidence, separate from larger configured limits and 30+ connected
  RDP soak. [Evidence](docs/ITERATION_212.md).

- [x] DONE for Linux worker bounded stream lifecycle slice — Foundation/linked
  stdout now uses fixed priority lanes and finite nonblocking writer ownership.
  Actual paused-parent flood exits natively and cleans runtime; lifecycle 13/13,
  linked CTest 21/21, local non-PIE ASan/UBSan foundation 9/9, full Node 453 pass /
  75 skip and independent restricted TGZ pass. Primary seqpacket, actual connected
  media/release and broader resource/soak remain open. Driver: `9b4618f`.
  [Evidence](docs/ITERATION_192.md).

- [x] DONE for isolated Linux stream writer — Fixed dispatcher lanes, eventfd /
  one-thread nonblocking FIFO/Unix-stream writes, whole-record/drain deadlines,
  flags/SIGPIPE ownership and FD cleanup pass six real descriptor cases / 174
  assertions in Release and local ASan/UBSan. Linked CTest 21/21 passes. Worker
  selection/connected faults, primary seqpacket and broader gates remain open.
  [Contract](docs/LINUX_STREAM_OUTPUT.md), [evidence](docs/ITERATION_191.md).

- [x] DONE — Implement worker process entrypoint with no RDP connection yet. Real C++ executable, not a fake RDP client; `1672590`.
- [x] DONE — Implement versioned `RWI1` IPC envelope. [Native](native/ipc/tests.cpp) and [Node](tests/unit/protocol.test.mjs) boundary/golden/fragmentation tests; `1672590`.
- [x] DONE for Linux amd64 Release IPC lifecycle — Primary `SOCK_SEQPACKET`/RWS1, automatic verified-bundle selection and framed legacy/explicit fallback. Actual 100-worker Node/native runs, parent/worker death, startup cancellation, pre-secret identity/refusal, independent record deadlines, bounded queue/output and joined cleanup pass. Installed RPATH pairing, relocation and independent archive smoke pass. This is transport acceptance; larger configured-capacity admission, addon sanitizer, connected RDP/resource and broader platform gates remain separately tracked. [Contract](docs/LINUX_SEQPACKET.md), [owner](docs/ITERATION_198.md), [explicit activation](docs/ITERATION_199.md), [default/packaging](docs/ITERATION_200.md).
- [x] DONE — HELLO/HELLO_ACK capability negotiation. Real worker capability/CLI checks; incompatible version/required-feature native tests; `1672590`, `316cdc0`.
- [x] DONE — Heartbeat and graceful shutdown. Real-worker and adversarial fake-worker deadline/watchdog tests; `316cdc0`.
- [x] DONE — Length limits and parser unit tests. Header checked before body allocation; malformed/truncated inputs fail without input disclosure. `1672590`.
- [x] DONE for bounded local Linux smoke — libFuzzer IPC target and seeded run: 2,074,807 executions in 21 seconds with ASan/UBSan and zero failure. Six other portable parser targets also pass. Extended/upstream fuzzing and actual CI remain open. [Target](native/ipc/fuzz.cpp), [evidence](docs/ITERATION_184.md).
- [~] IN PROGRESS — Parent-death handling and private runtime directory cleanup. Windows and actual Linux framed-pipe parent-death/cleanup and 100 sequential worker tests pass. Windows private ACL creation/startup is implemented; broader multi-user isolation and simultaneous hard-kill cleanup remain open. [Linux evidence](docs/ITERATION_184.md).

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
[evidence](docs/ITERATION_003.md). Linux and actual RDP acceptance remain open.

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
  [strict refusal](docs/ITERATION_344.md), [activation](docs/ITERATION_346.md),
  [native resize](docs/ITERATION_350.md), [Edge H.264](docs/ITERATION_352.md),
  [Edge JPEG](docs/ITERATION_353.md).
- [x] DONE for selected remote disconnect reasons — Pinned FreeRDP ERRINFO idle/logon timeout and logoff codes map to fixed `RDP_SERVER_TIMEOUT` / `RDP_SERVER_LOGOFF` failures. Unknown codes and all non-disconnect errors preserve their existing classification; no private wire change. Other remote reasons and actual server-profile coverage remain open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_332.md).
- [x] DONE for selected connection authentication failures — Pinned FreeRDP CONNECT credential/account refusal codes map to the existing fixed `RDP_AUTHENTICATION_FAILED`; transport/TLS and unknown codes remain `RDP_CONNECT_FAILED`. No IPC change or diagnostic numeric disclosure. Other auth methods/server profiles remain open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_333.md).
- [x] DONE for selected server ERRINFO refusals — Server-denied and insufficient-privilege reasons map to fixed `RDP_SERVER_REJECTED`; fresh-credentials-required maps to authentication failure. Unknown reasons stay generic. Broader server error history remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_334.md).
- [x] DONE for public RDP failure envelope — Selected terminal reason codes retain fixed HTTP status, message and retryability with no numeric FreeRDP diagnostic leakage. [API contract](docs/SESSION_API.md), [evidence](docs/ITERATION_335.md).
- [x] DONE for native state-to-public failure handoff — Adapter-level event composition confirms selected FreeRDP reasons reach the established fixed failures while transport/protocol classes remain intact. [Evidence](docs/ITERATION_337.md).
- [x] DONE for selected server operational failures — Pinned out-of-memory, driver and Windows session-component ERRINFO values map to fixed `RDP_SERVER_FAILURE`; unknown reasons remain generic. Actual Windows server-reason emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_338.md).
- [x] DONE for pinned licensing ERRINFO classification — All eleven FreeRDP licensing disconnect values map to fixed `RDP_LICENSE_FAILURE`; unknown and non-disconnect values retain their existing classes. Unit, manager and HTTP snapshot coverage passes. Actual server emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_355.md).
- [x] DONE for Connection Broker VM boot timeout classification — The pinned `ERRINFO_CB_SESSION_ONLINE_VM_BOOT_TIMEOUT` is exposed as the existing fixed `RDP_SERVER_TIMEOUT`, with unknown broker reasons unchanged. Native-adapter, manager and HTTP-category regression coverage passes. Actual server emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_356.md).
- [x] DONE for missing Connection Broker destination classification — The pinned `ERRINFO_CB_DESTINATION_NOT_FOUND` maps to the fixed `RDP_SERVER_REJECTED`; other broker destination/pool errors stay generic. Native-adapter and public error propagation regressions pass. Actual broker emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_358.md).
- [x] DONE for Connection Broker cancellation classification — The pinned `ERRINFO_CB_CONNECTION_CANCELLED` maps to the existing fixed `RDP_CONNECT_CANCELLED`; other broker processing failures remain generic. Adapter, manager and HTTP contract coverage passes. Actual broker emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_360.md).
- [x] DONE for selected Connection Broker ERRINFO classification — Destination loading/redirection, VM wake/boot/DNS, pool and session-monitor failures map to fixed `RDP_SERVER_FAILURE`; invalid routing settings map to rejection. Unknown broker codes remain generic. Actual broker emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_361.md).
- [x] DONE for replaced RDP session reason — Pinned `ERRINFO_DISCONNECTED_BY_OTHER_CONNECTION` maps to fixed `RDP_SESSION_REPLACED`; other disconnect reasons retain their own whitelist or generic class. Actual server emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_339.md).
- [x] DONE for session-manager remote failure snapshot — Recognized remote terminal codes preserve their fixed code/message/retryability in the failed session snapshot; unknown worker errors keep the existing fallback. This fake-backend layer does not claim RDP emission. [Evidence](docs/ITERATION_340.md).
- [x] DONE for server-disconnect manager propagation — The fake backend now verifies `RDP_SERVER_DISCONNECT` survives manager failure handling into the public failed snapshot alongside the replaced-session case. No actual server ERRINFO emission is claimed. [Evidence](docs/ITERATION_342.md).
- [x] DONE for server-disconnect HTTP snapshot — An actual local Fastify test server with fake backend returns the failed session through GET with exact `RDP_SERVER_DISCONNECT` code, fixed message and retryability. This does not claim remote RDP emission. [Evidence](docs/ITERATION_343.md).
- [x] DONE for server-initiated disconnect reasons — Pinned generic and user-initiated RPC disconnect ERRINFO codes map to fixed `RDP_SERVER_DISCONNECT`; logoff and replacement reasons stay distinct. Actual server emission remains open. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_341.md).
- [x] DONE for pinned NLA-required connect failure — FreeRDP 3.32.1 `ERRCONNECT_HYBRID_REQUIRED_BY_SERVER` maps to fixed non-retryable `RDP_SECURITY_MODE_REQUIRED`, distinct from credentials and generic transport/TLS failures. Actual server emission remains unverified. [Contract](docs/CONNECTION_CORE.md), [evidence](docs/ITERATION_345.md).
- [x] DONE for NLA-required error propagation — Fake-manager and Fastify HTTP regressions preserve `RDP_SECURITY_MODE_REQUIRED`, its fixed message and non-retryable status in failed session snapshots; the retryable server-disconnect control also remains covered. This does not claim real-server emission. [Evidence](docs/ITERATION_348.md).
- [x] DONE for replaced-session HTTP propagation — The fake-backend HTTP snapshot preserves exact `RDP_SESSION_REPLACED` message and retryability alongside the disconnect and security-mode cases; real-server reason emission remains separate. [Evidence](docs/ITERATION_349.md).
- [x] DONE for selected remote failure HTTP propagation — The fake-backend Fastify snapshot now also preserves the fixed timeout, logoff, refusal and server-failure code/message/retryability. The actual integration test passes 10/10; this verifies public error propagation, not server emission or broader profiles. [Evidence](docs/ITERATION_354.md).
- [x] DONE for connection failure HTTP snapshots — The fake-backend Fastify test also checks fixed connection, authentication, certificate, timeout, cancellation and protocol failures through GET snapshots, including exact messages and retryability. This is API propagation coverage, not real-server emission. [Evidence](docs/ITERATION_357.md).
- [x] DONE for renewed Windows endpoint activation — After explicit one-session approval of the new exact certificate fingerprint, the native helper connects, captures a 1024×768 JPEG, exchanges heartbeat and joins cleanup with an empty runtime directory. This does not accept the broader graphics/input/audio/application/device gates. [Evidence](docs/ITERATION_346.md).
- [~] IN PROGRESS — Stable connect/auth/certificate/timeout/disconnect failures are implemented; remaining remote ERRINFO reasons and broader Windows server/application profiles need actual integration acceptance.
- [~] IN PROGRESS — Graceful disconnect and cancellation verified; reconnect remains unsupported.
- [x] DONE for current connection slice — Password is delivered through a separate private IPC class after HELLO, with transport copies overwritten. No per-session secrets enter argv/env; unsupported hash/PIN modes are rejected.

**Gate:** CLI-less worker connects to Windows and XRDP, reports state, rejects changed certificate correctly.

- [x] DONE on Windows/XRDP — Named active transport-loss case: real decoded
  desktop, controlled loss of only the test connection, `RDP_DISCONNECTED`, failed
  public session, closed viewer and empty runtime after joined cleanup. Broader
  error categories, reconnect and remote input/device release remain open.
  [Evidence](docs/ITERATION_183.md).

## Stage 4 — graphics, cursor and browser video

- [x] DONE for current Windows lab static-desktop H.264 1080p 30-minute
  observation — Linked Debug worker/public API/Edge pass 61 samples over
  1,800,145 ms, sampled empty queues, worker RSS peak 238.1 MiB below the
  explicit 256 MiB fixture cap, confirmed resize/restoration and fresh-token
  display/cursor replay. Joined cleanup leaves no worker or runtime entries.
  Audio/Clipboard are off; moving/interactive/audio and total-session resource
  gates remain open. [Evidence](docs/ITERATION_388.md).

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
  [evidence](docs/ITERATION_204.md).

Current actual soak attempt stopped with `RDP_PROTOCOL_ERROR` after its last
successful sample at 22 minutes 9 seconds. Memory/queue samples were within
bounds. A full repeat now passes; the first failure's cause remains unverified.
[Failure evidence and diagnostics](docs/ITERATION_180.md),
[completed 30-minute repeat](docs/ITERATION_182.md).

- [x] DONE on Windows/XRDP — Named single-viewer H.264 1080p 30-minute observation,
  sampled bounded queues/worker memory, resize/restoration, cursor/attachment replay
  and empty-runtime cleanup. This does not close broader interactive, Windows-server,
  resource or intermittent-failure acceptance. [Evidence](docs/ITERATION_182.md).

- [x] DONE for local Linux producer/Windows Edge — Actual H.264 1080p XRDP
  observation lasts 30 minutes with 61 bounded queue/RSS/credit samples,
  5,163 frames, worker RSS below 256 MiB, confirmed resize/restoration,
  fresh-token replay and clean shutdown. This does not close broader interactive,
  audio/device, total per-session memory, latency, Windows-server or load gates.
  [Evidence](docs/ITERATION_220.md).

- [x] DONE on Windows and local Linux amd64/XRDP — Initialize headless FreeRDP GDI/framebuffer. Native codec tests and real 1080p Edge rendering verified; [Windows evidence](docs/ITERATION_005.md), [Linux producer evidence](docs/ITERATION_202.md). Broader server/platform/resource acceptance remains open.
- [~] IN PROGRESS — Classic BeginPaint/EndPaint/DesktopResize and synchronous public GFX binding wired. Native GFX frame-end/inter-frame pixels, AVC420 IDR/predictive decode, reset, bounded surface/cache/command guards and teardown fixtures pass; actual XRDP browser regression passes. Actual negotiated GFX, AVC444/other compressed codecs, true scaled-output mapping, decoder resource limits and dynamic server resize remain open. [Contract](docs/GFX.md), [binding evidence](docs/ITERATION_014.md), [AVC420 evidence](docs/ITERATION_015.md).
- [~] IN PROGRESS — Native Display Control binds negotiated caps and one bounded layout; private IPC/Node and public control leases expose opt-in, typed results, server-observed generations and deadlines. Actual XRDP browser resize/restoration, display replay, fresh AVC IDRs/JPEG configs, nonfatal input pause and transmitted media ACK preservation pass. The named private native Windows RDP resize/restoration passes with fresh AVC IDRs and JPEG, and public Edge/H.264/JPEG resize/restoration passes with display/cursor replay and reattachment; local fake IPC/media regressions pass 10/10 and 26/26. Broader Windows server profiles, DVC resource audit and soak acceptance remain open. The single-primary layout at 100% scale satisfies ADR-011; automatic viewport policy is optional follow-up and wider layouts are outside current scope. [Contract](docs/DISPLAY_CONTROL.md), [native evidence](docs/ITERATION_017.md), [IPC/XRDP evidence](docs/ITERATION_018.md), [public/browser evidence](docs/ITERATION_019.md), [Windows private-worker evidence](docs/ITERATION_350.md), [local regression](docs/ITERATION_351.md), [H.264 evidence](docs/ITERATION_352.md), [JPEG evidence](docs/ITERATION_353.md).
- [~] IN PROGRESS — Rectangle accumulation uses a fixed 64-region set, conservative union/collapse, clipped revision changes and snapshot consumption after successful encode/send. Native coverage and public GDI/GFX callback tests pass; actual XRDP regression is recorded in [iteration 13](docs/ITERATION_013.md) and [iteration 14](docs/ITERATION_014.md). Partial-region encoding and actual negotiated GFX tracking remain pending; AVC/JPEG continue encoding full frames per ARCHITECTURE §4. [Contract](docs/DIRTY_REGIONS.md).
- [x] DONE on Windows/XRDP — Public pointer callbacks extract bounded RGBA shape, hotspot, position and visibility; native conversion/state/parser tests and actual XRDP shape delivery/replay pass. [Contract](docs/CURSOR.md), [evidence](docs/ITERATION_012.md). Exact mono inversion and broader server/platform cases remain retained gaps.
- [~] IN PROGRESS — JPEG/AVC latest-state scheduling shares one pending capture with render credit. Configurable FPS caps and quality/bitrate profiles reach native encoders; effective ceilings remain 20 JPEG / 30 AVC FPS. Native/fake and actual XRDP cap checks pass. Provider selection and adaptive congestion remain pending. [Contract](docs/VIDEO_QUALITY.md), [evidence](docs/ITERATION_016.md).
- [x] DONE on Windows — H.264 encoder interface and private OpenH264 software provider; real encode/decode, forced IDR, GOP and resize tests pass. [Contract](docs/MEDIA_H264.md), [evidence](docs/ITERATION_006.md). Linux/hardware selection pending.
- [x] DONE on Windows/XRDP — AVCC config/access-unit packetization, IPC/RWB1 bounds and actual browser decode verified; [evidence](docs/ITERATION_007.md).
- [x] DONE on Windows and local Linux amd64/XRDP — Encoded JPEG/AVC worker→Node RWI1 and browser RWB1 forwarding, without raw frames in JS. Linux primary IPC/public API/Windows Edge smoke passes [iteration 202](docs/ITERATION_202.md); sustained resource/platform gates remain open.
- [x] DONE in Edge/Windows — Reference harness checks WebCodecs support, renders actual 1080p AVC/JPEG and closes VideoFrames/ImageBitmaps. Other browsers/platforms remain unverified.
- [x] DONE in Edge/Windows — Independent binary shape stream and transparent overlay; local movement, CSS-scaled hotspot, hide/default and disposal tested. Actual XRDP shape and browser reattachment replay pass. [Evidence](docs/ITERATION_012.md). Full desktop soak remains open.
- [x] DONE on Windows/XRDP — Native JPEG fallback and browser canvas path, private libjpeg-turbo, bounded allocation and relocation verified. [Contract](docs/MEDIA_JPEG.md).
- [~] IN PROGRESS — Single-frame credit, ACK deadline, stale lease/ACK/reset rejection, static/latest revision and dimension config verified. Actual WebCodecs decoder-error recovery forces config/IDR; adaptive bitrate/drop policy remains pending.
- [~] IN PROGRESS — Bounded native encode/read counters, browser decode/draw timings and a deterministic 1080p encoder benchmark implemented. Protected Node capture/write/render-credit histograms, queued frame/byte counters and credit occupancy now distinguish consumer stalls from capture time. Forward timing requires all configuration/image writes to succeed, with partial-failure regression coverage. Full dirty-to-send/queue-delay and performance gates remain open. [Encoder evidence](docs/ITERATION_009.md); `06233ce`, build tracking `be42b9d`. [Node timing evidence](docs/ITERATION_011.md), [write-group correction](docs/ITERATION_366.md).

**Gate:** stable 1080p interactive Windows/XRDP desktop for 30 min, resize safe, cursor smooth, no unbounded queue growth.

## Stage 5 — keyboard, mouse, wheel and touch

- [x] DONE for named Windows public pointer/application slice — Prepared
  offline page confirms left/right/middle button pairs, captured drag, both
  wheel axes/directions, left-button blur release and middle-button release
  across viewer detach/fresh-token reattachment. Fixed scalar readbacks and
  joined cleanup pass. Content scrolling, arbitrary drop targets, physical
  hardware and hard transport-loss-held input remain open.
  [Evidence](docs/ITERATION_396.md).

- [x] DONE for named current Windows public-viewer keyboard/release smoke —
  Actual Notepad readback confirms Shift/number entry, Ctrl/Shift/Alt blur/reset
  and held right Ctrl across viewer detach/fresh-token reattachment on the same
  native session. Alt includes Escape to leave menu mode. Unicode Clipboard,
  permission refusal and joined viewer/native/runtime cleanup also pass.
  Wider layouts/shortcuts, mouse/drag/wheel, hard transport loss and full input
  gates remain open. [Evidence and retained first failure](docs/ITERATION_394.md).

- [x] DONE for named Windows Notepad input/readback smoke — Committed
  Latin/Cyrillic/Japanese/emoji text, physical Shift/number keys, held-left-Ctrl
  reset, extended right-Ctrl copy and fixed left-button/application sequence
  pass exact remote Unicode readback and unsaved-window/native cleanup.
  This does not accept full layouts/IME, wheel/other buttons/touch, physical
  hardware or disconnect-held input. [Evidence](docs/ITERATION_303.md).

Current integration evidence: [private/native touch](docs/ITERATION_029.md),
[public lease/browser](docs/ITERATION_030.md), [actual XRDP readiness/replay](docs/ITERATION_031.md),
[pen placeholder](docs/ITERATION_032.md), [terminal cleanup](docs/ITERATION_033.md),
[international keyboard positions](docs/ITERATION_034.md). The historical foundation
records above do not describe today's activation state. Actual touch/application
and other remote acceptance gates remain open.

Manual local Edge viewing: `test-xrdp-viewer.mjs ... h264 --manual`.
[Launch commands](docs/DEVELOPMENT.md#manual-windowsxrdp-viewer).

- [~] IN PROGRESS — Physical set-1 mapping, extended left/right/numpad and eight international physical positions implemented; native/Node/Edge fixtures pass. Symbols are not used for mapping, composition stays local and reset releases held positions. Remote keyboard-layout/IME/hardware gate remains pending. [Contract](docs/INPUT.md), [initial evidence](docs/ITERATION_008.md), [international positions](docs/ITERATION_034.md).
- [~] IN PROGRESS — Browser modifiers reconcile before focused input; observed left/right sides survive canvas focus/resize pauses, missed releases are repaired, and Caps/Num/Scroll Lock synchronize after physical lock edges. Bounded pure/native and Edge/fake-control fixtures pass; actual remote layouts, AltGraph portability and no-stuck-key acceptance remain open. [Contract](docs/INPUT.md), [evidence](docs/ITERATION_020.md).
- [~] IN PROGRESS — Explicit committed Unicode/IME textarea, bounded UTF-16BE private IPC and FreeRDP Unicode events implemented; native, pure, fake IPC/control and Edge composition fixtures pass. Server Unicode negotiation is required; no automatic retry of partial/uncertain delivery. The named Windows Notepad text/supplementary readback case now passes [iteration 303](docs/ITERATION_303.md); OS IME, line endings, broader application/platform profiles and direct canvas IME remain unverified. [Contract](docs/INPUT.md#committed-unicode-text), [initial evidence](docs/ITERATION_021.md).
- [~] IN PROGRESS — Absolute coordinates and five buttons implemented; Edge captured-drag and native tracking tests pass. Real XRDP motion ACK and the named Windows left-button/application readback sequence pass; other remote button/platform and physical-device acceptance remain open. [Windows evidence](docs/ITERATION_303.md).
- [~] IN PROGRESS — Both wheel axes and bounded fractional DOM pixel/line/page accumulation implemented; pure/Edge/control fixtures pass. Gesture context, focus/reset/resize pauses and idle gaps discard stale fractions; no new timer/queue or wire change. Actual remote wheel sensitivity and physical trackpad acceptance remain open. [Contract](docs/INPUT.md#fractional-wheel-and-trackpad-accumulation), [evidence](docs/ITERATION_022.md).
- [x] DONE in Edge/fake fixture — Only adjacent pointer moves are coalesced; transitions flush preceding motion. Independent remote cursor display now passes XRDP/Edge; measured latency and desktop soak gates remain open.
- [~] IN PROGRESS — Native pressed-state reset and retry, blur/disposal, transport loss and stale lease cancellation verified. Graceful close resets input; actual remote no-stuck-key gate pending.
- [~] IN PROGRESS — Native state, public RDPEI projection/registration and observable handshake gate implemented. Terminal IDs remain owned through transport writes; suspended native UP records drain before readiness in the RDPEI 1.0.1+/disabled-timestamp profile. Scoped public provider/retirement now follows Connection's RDP-thread lifecycle. Pure/public-call and actual-addin/fake-DVC tests pass. Contact dispatch/reset/resize/control wiring, timestamp-remoting/v1.0 compatibility, bounded IPC, browser capture and actual remote/physical touch remain open. Same-plugin DVC reopening is unimplemented. No touch capability is advertised. [Contract](docs/INPUT.md#terminal-contact-ownership-and-drain), [state](docs/ITERATION_023.md), [transport](docs/ITERATION_024.md), [registration](docs/ITERATION_025.md), [drain](docs/ITERATION_026.md), [provider/lifetime](docs/ITERATION_027.md).
- [~] IN PROGRESS — Opt-in worker/private Node touch dispatch, generation/readiness checks, fixed mixed FIFO and reset/resize drain are implemented. Native, codec and fake-worker tests pass; actual XRDP reports RDPEI ready with ten contacts, without sending touch. This supersedes the historical no-capability statement above. Public control/browser wiring, physical/remote acceptance and compatibility/resource audits remain open. [Evidence](docs/ITERATION_029.md), [contract](docs/IPC_FOUNDATION.md#generation-bound-touch-dispatch-iteration-29).
- [~] IN PROGRESS — Public touch control lease, queued readiness/generation checks, metadata replay and bounded browser Pointer Events capture are implemented. Node/control and Edge emulated two-contact fixtures pass; physical and remote application acceptance remain open. [Evidence](docs/ITERATION_030.md). Private dispatch implementation: `6a34e2f`.
- [x] DONE (unsupported placeholder) — `penInput=false` in HELLO decoding, native CLI and capability REST; owned RDPEI does not negotiate multi-pen, and browser pen Pointer Events produce no mouse/touch fallback. Native/public-context, actual-addin/fake-DVC and Edge fixtures pass. This is not pen support; optional future implementation/device acceptance remains. [Evidence](docs/ITERATION_032.md).

**Gate:** keyboard-layout test set, mouse/wheel, touch smoke; no stuck keys after disconnect.

## Stage 6 — audio output and microphone

- [x] DONE for named current Release Windows Opus/200 ms audible MVP scenario —
  Three-minute observation starts at first decoded data and renders 179.54
  seconds. User reports excellent sound; joined PID/runtime cleanup passes.
  Twelve configurations, eleven late intervals, four Worklet underflows and
  one scheduled consumer reset remain measured limitations. Other profiles,
  latency/recording/platform and reset-free continuity stay open.
  [Evidence](docs/ITERATION_393.md).

- [x] DONE for named Windows Opus/200 ms three-minute listening observation —
  User reports steady normal sound; the bounded observation starts at the first
  decoded packet and renders 178.65 seconds of samples. Joined PID/runtime
  cleanup passes. This does not accept reset-free scheduling: 40 configurations,
  64 late intervals and 12 Worklet underflows remain. Other profiles, measured
  latency, recovery, recording and broader platform gates stay open.
  [Evidence](docs/ITERATION_390.md).

- [x] DONE for the named short corrected-worker Windows Opus/200 ms listening
  slice — User reports steady sound with almost no breaks and accepts it.
  Actual counters cover 23.52 rendered seconds, one epoch/configuration, no
  publication skips or Worklet underflow; joined runtime cleanup passes.
  This does not close full multi-minute, other format/profile/platform, latency
  or recording acceptance. [Evidence](docs/ITERATION_387.md).

Current repeat: the newly approved Windows Opus/200 ms browser session renders
1080p H.264 but remains audio-waiting with zero configurations/packets/played
frames. Recovery preconditions fail and joined cleanup passes. A verified
active source is needed before playback or quality conclusions; the earlier
accepted smoke below retains its historical scope.
[Retained observation](docs/ITERATION_362.md). The explicitly approved repeat
with a user-started continuous tone also stays waiting and fails before detach;
the source endpoint/session and current negotiation cause remain unverified.
[Tone repeat](docs/ITERATION_363.md).
The local helpers now collect fragmented native negotiation counters through
joined cleanup; recovery-source failures identify the source-ready phase before
snapshot/detach. This improves diagnosis without accepting audio playback or
identifying the current cause. [Helper evidence](docs/ITERATION_364.md).
The user confirms the tone was started through `mstsc`. The bounded visible
listening preview now reports one fresh scalar Worklet observation and final
native negotiation counters, preparing a source restart inside the active
Bridge viewer. The subsequent explicitly authorized fixed-source preview below
now verifies a short audible output slice; the earlier idle-source results remain.
[Preview evidence](docs/ITERATION_365.md).

- [x] DONE for named Windows lab / Edge audible Opus tone preview — The user
  authorizes a fixed in-memory 45-second tone launched through the active Bridge
  connection and confirms hearing it with short Morse-like interruptions.
  Actual RDPSND negotiation, 2,369 decoded
  packets, 2,014,016 Worklet played frames, 1080p H.264 and joined empty-runtime
  cleanup pass. Frequent epochs/configurations, buffering silence and underflows
  remain; continuous quality, recovery, microphone, LAN latency and sustained
  resource/platform acceptance stay open. [Evidence](docs/ITERATION_367.md).
  Both browser/private lab helpers now preserve the existing native lifetime
  loss/reset and clock/format/Close cause receipts across arbitrary stderr
  chunks, with exact uint64/refusal checks. These diagnostics prepare further
  continuity work; they do not identify the previous run's cause or accept
  uninterrupted quality. [Collector evidence](docs/ITERATION_368.md).
  The browser footer also counts Node consumer reset calls/results without
  altering retries or queue policy. This keeps native lifetime resets separate
  from requested consumer recovery. [Counter evidence](docs/ITERATION_369.md).
  The authorized same-profile repeat now observes zero Node reset requests,
  581 native skipped publication intervals and 572 publisher resets. The user
  reports much better sound with a few short interruptions; publication timing
  remains the next work item, without a complete cause or quality pass.
  [Repeat](docs/ITERATION_370.md).

- [x] DONE for named current Windows lab / Edge PCM/Opus recovery smoke —
  User-started source, actual H.264 1080p, Opus decode/Worklet played frames,
  fresh-token audio replay and one scheduled Opus reset pass with the 200 ms
  profile. Separate private PCM/Opus resets return fresh config/data; heartbeat
  and joined empty-runtime close pass. Frequent churn, buffering silence,
  underflows and publication gaps remain; audible continuity, LAN latency,
  recording and sustained/resource/platform acceptance stay open.
  [Evidence](docs/ITERATION_307.md).

- [x] DONE for Linux amd64 producer / Windows Edge PCM/Opus output smoke —
  Real XRDP packets, Opus decode, Worklet played samples, 200 ms profile, video
  resize/restoration, fresh-token replay and observed native Opus reset/new epoch
  pass. Native source/TLS/IPC, private relocation and cleanup are verified.
  Human audible quality, latency, intermittent protocol-failure diagnosis,
  prolonged resource/soak and remaining platform/microphone gates stay open.
  [Evidence](docs/ITERATION_208.md), [deadline fix](docs/ITERATION_207.md).

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
| PCM normalization/resampling | DONE — bounded native PCM8/PCM16 mono/stereo 8..48 kHz to S16LE 48 kHz stereo, portable fixtures | [36](docs/ITERATION_036.md), [47](docs/ITERATION_047.md) |
| Volume mapping | DONE — independent stereo perceptual gains, mute/full identity, exhaustive and linked fake-SVC fixtures | [44](docs/ITERATION_044.md) |
| Native PCM queue and packetization | DONE — fixed 120 ms ring and 20 ms publication, underflow/overflow/reset fixtures | [37](docs/ITERATION_037.md), [49](docs/ITERATION_049.md), [62](docs/ITERATION_062.md) |
| Native output buffer selection | DONE on Windows — immutable 120/200 ms profiles, bounded queue/configuration, legacy refusal, actual XRDP PCM/Opus selection and reset; not total latency acceptance | [179](docs/ITERATION_179.md), [ADR-012](docs/adr/ADR-012-audio-compatibility-buffer.md) |
| Ready output attachment recovery | DONE on Windows/XRDP — actual PCM/Opus 200 ms browser detach/reattach, fresh Worklet samples and scheduled Opus native reset; not general reconnect or loss/latency acceptance | [181](docs/ITERATION_181.md) |
| Private Opus output codec | DONE on Windows — pinned SDK encode/decode/reset/bounds and DLL relocation | [73](docs/ITERATION_073.md), [75](docs/ITERATION_075.md) |
| PCM/Opus record codecs | DONE — bounded native/Node/browser wire vectors and malformed-record fixtures | [50](docs/ITERATION_050.md), [75](docs/ITERATION_075.md), [76](docs/ITERATION_076.md) |
| Browser PCM playback owner | DONE in Edge synthetic fixtures — queue, Worklet admission ACK, gesture and cleanup | [70](docs/ITERATION_070.md), [71](docs/ITERATION_071.md) |
| Browser Opus decoder owner | DONE in Edge pinned-SDK synthetic fixtures — decode/priming, admission and cleanup | [77](docs/ITERATION_077.md) |
| Output record delivery/credit | DONE in fake-backend/actual loopback-WS fixtures — independent bounded PCM/Opus credit and recovery ownership | [69](docs/ITERATION_069.md), [93](docs/ITERATION_093.md), [94](docs/ITERATION_094.md) |
| Native microphone PCM source | DONE — fixed newest-data queue, silence/underflow, epoch and wipe-on-stop portable fixtures | [95](docs/ITERATION_095.md) |
| Private Opus input codec/compensation | DONE on Windows synthetic SDK composition — strict 20 ms decode, pre-skip and bounded reblocking | [129](docs/ITERATION_129.md), [132](docs/ITERATION_132.md) |
| Browser microphone capture/permission owners | DONE in synthetic Edge fixtures — packetizer, Worklet, denied/late permission and cleanup; no physical capture | [121](docs/ITERATION_121.md), [122](docs/ITERATION_122.md), [126](docs/ITERATION_126.md) |
| Explicit PCM/Opus microphone viewer | DONE in synthetic Edge/WS/fake-RDP fixtures — matching selection, gesture, stop/restart, source/controller loss | [143](docs/ITERATION_143.md), [144](docs/ITERATION_144.md) |
| Protected transport telemetry | DONE — fixed-label output/input counters, credit and timing tested with fake RDP/real sockets | [72](docs/ITERATION_072.md), [145](docs/ITERATION_145.md) |

### Remaining implementation and acceptance

- [~] Custom `rdpsnd-browser` virtual sink: selected Windows worker/native/Node/
  viewer PCM/Opus path and guarded static/dynamic ingress are implemented.
  Real XRDP negotiation and PCM/Opus browser admission pass; Opus is audible and
  the user accepts current 200 ms quality for development. Uninterrupted playback,
  burst quality and broader transport/platform recovery remain open. Private
  ready-source reset and public PCM/Opus 200 ms attachment recovery pass on this lab.
  [181](docs/ITERATION_181.md).
  [175](docs/ITERATION_175.md), [94](docs/ITERATION_094.md),
  [167](docs/ITERATION_167.md), [168](docs/ITERATION_168.md).
- [~] Custom `audin-browser` source, browser microphone capture and packet
  transport: selected Windows/Linux PCM/Opus AUDIN/worker/Node/viewer path is implemented.
  Actual XRDP input remains waiting epoch 0; negotiated ready input, physical
  permission/device capture and remote application recording remain unverified.
  Twelve real Linux carrier/codec combinations pass; bounded negotiation counters
  now distinguish accepted DVC/validated formats/Open from waiting state.
  [144](docs/ITERATION_144.md), [169](docs/ITERATION_169.md),
  [218](docs/ITERATION_218.md), [219](docs/ITERATION_219.md).
- [~] PCM normalization/resampling and Opus compatibility beyond the accepted
  fixed profiles: larger callbacks split within fixed storage and identical
  selected tables can repeat. Wider/higher-rate formats, changed server tables,
  callback CPU/quality and other browser/device sample rates remain open.
  Existing explicit profile refusals do not remove these retained requirements.
- [~] Audio queue/jitter/backpressure metrics: transport metrics exist; native/
  browser underflow, jitter, encode and host-queue export and measured LAN queue/
  latency acceptance remain open. [145](docs/ITERATION_145.md).
- [~] Underflow/silence behavior that does not block the RDP loop: bounded native/
  Worklet/capture fixtures pass. Native PCM/Opus event waits now follow the active
  packet deadline with bounded overdue retries and ordinary polling under output
  blockage; portable virtual-minute and Windows linked ownership/lifecycle controls
  pass. Connected new-worker scheduling, callback CPU/wakeup budgets and real
  transport/audio-quality acceptance remain open. [Deadline correction](docs/ITERATION_371.md).
  The Windows lab viewer can explicitly select the corrected isolated Debug
  worker by its bound native receipt, preserving the bundled default and
  validating worker/helper bytes before lab configuration. Actual new-worker
  audio remains pending its own session. [Helper checks](docs/ITERATION_372.md).
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

- [x] DONE for named owned XRDP 0.10.1/Tk Unicode clipboard slice — Windows
  Release producer and real headed Edge Clipboard API pass Cyrillic/Japanese/
  emoji/multiline text both ways under a 1,024-byte cap. Two new RDP connections
  reuse the prepared Tk process; repeated server-origin Copy/Get also passes
  before any native client write. Actual browser permission refusal, no-format
  revoke, viewer clearing and joined PID/runtime cleanup pass. Full feature
  check: 900 / 61 skips / 961 total. The fixture clears its old CLIPBOARD owner
  before ordinary Copy. Old XRDP 0.9.x conversion, wider Linux producer/server
  profiles, direction/quota/isolation/formats and drives remain separate.
  [Evidence](docs/ITERATION_404.md).

- [x] DONE for named headed Edge/Windows Notepad Unicode clipboard slice —
  Real Browser Clipboard API, public API/control, CLIPRDR and application
  paste/copy readback pass both ways with Cyrillic/Japanese/emoji and three
  lines under a 1,024-byte cap. One prepared-editor focus click is required.
  The current Release repeat also passes actual browser permission refusal,
  accepted no-format revoke, cleared viewer fields and joined PID/runtime close
  in one invocation. Own-document clear keystrokes follow verified readback;
  empty application content is not separately read back. The actual wider
  direction / quota / isolation matrix and full Stage 7 remain open.
  [Current complete run](docs/ITERATION_392.md),
  [earlier evidence and retained failures](docs/ITERATION_385.md).

- [x] DONE for named Windows Notepad Unicode roundtrip — Explicit private
  Node/native bidirectional CLIPRDR selection with 1,024-byte cap passes actual
  application paste and subsequent copied exact readback of fixed Unicode.
  Empty-offer/no-format revoke ACK and joined cleanup pass; no host Clipboard
  API, remote file save or remote clipboard logging occurs. Browser/host OS,
  full quota/direction/resource matrix, other formats and drives remain open.
  [Contract](docs/WINDOWS_APPLICATION_SMOKE.md), [evidence](docs/ITERATION_303.md).

- [x] DONE for isolated native conversion — Allocation-free bounded UTF-8/CF_UNICODETEXT
  conversion, CRLF normalization and atomic refusal pass Windows/Linux native,
  local ASan/UBSan and seeded Clang fuzz checks. This is not channel/browser or
  actual remote acceptance. [Contract](docs/CLIPBOARD_TEXT.md),
  [evidence](docs/ITERATION_224.md).
- [~] IN PROGRESS — CLIPRDR Unicode text both directions: explicit raw schema-10
  selection now maps guarded CLIPRDR
  directions/size limits, serialized command dispatch and RDP-thread retirement.
  Actual Windows/Linux worker strict TLS/cancellation and linked fake-channel
  quota checks pass. HELLO-gated private Node selection/read/write now preserve
  current source/offer authority, one flight and late-result disposal; synthetic
  IPC and actual native TLS checks pass. Explicit reference browser text selection
  and local actions pass Edge/fake-RDP/mocked-Clipboard-API fixtures; actual remote /
  OS clipboard and total-resource acceptance remain open.
  [Browser evidence](docs/ITERATION_238.md), [Native evidence](docs/ITERATION_231.md),
  [typed API and actual XRDP offer/empty-text ACK evidence](docs/ITERATION_232.md).
  Native offer revocation now has a separate content-free schema-2 command and
  checked public send/ACK path; unlike empty text, it removes all offered formats.
  Prepared manager control grants now drain prior work and require native revoke
  completion before replacement; fake/backend and synthetic process composition
  pass. The native adapter now accepts matching numeric item reservations and
  both clipboard HELLO capabilities; legacy refusal precedes settings/secrets.
  Actual remote/browser/OS transfer/revoke acceptance remains open.
  [Native adapter evidence](docs/ITERATION_237.md),
  [Controller contract](docs/CLIPBOARD_SESSION.md),
  [evidence](docs/ITERATION_234.md).
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
  [Off-path evidence](docs/ITERATION_239.md).
  Per-operation browser admission now waits for initial native ACK/owned-offer
  drain, with failing-before/passing-after Edge evidence. Actual Windows/XRDP/Edge
  now passes one Unicode offer ACK, no-format revoke ACK while ready, fresh-token
  replay and joined cleanup, with zero remote reads or host Clipboard API requests.
  The first failed invocation is retained; application consumption/readback and
  OS clipboard acceptance remain open. [Probe/readiness evidence](docs/ITERATION_240.md).
  Actual Linux primary and framed IPC now pass the same fixed Unicode offer /
  no-format revoke ACK, ready-source barrier, heartbeat and empty-runtime cleanup,
  with zero reads. This is private Node/native evidence, separate from browser /
  application/OS acceptance. [Linux carrier evidence](docs/ITERATION_241.md).
  [Control contract](docs/CLIPBOARD_CONTROL.md), [evidence](docs/ITERATION_236.md).
  [Chunk/reservation contract](docs/CLIPBOARD_CHUNKS.md),
  [evidence](docs/ITERATION_235.md).
  [Revocation evidence](docs/ITERATION_233.md).
- [x] DONE for clipboard private transport — Versioned RWI1 class/correlation
  bounds, dedicated latest-state/one-result output and full 16 MiB command delivery
  pass actual Windows/Linux process/carrier tests, native/Node regression and
  local sanitizer/fuzz checks. Unselected workers explicitly return unavailable;
  typed private selection is implemented above. Public session/browser selection and
  actual remote acceptance remain open.
  [Contract](docs/CLIPBOARD_IPC.md), [evidence](docs/ITERATION_228.md).
- [x] DONE for prepared private clipboard payloads — Independent bounded native /
  TypeScript scalar-state and Unicode command/result codecs pass golden, malformed,
  ownership and exact-size tests, local sanitizer/fuzz and full Node regression.
  Public session/browser selection and actual remote acceptance remain open.
  [Contract](docs/CLIPBOARD_IPC.md), [evidence](docs/ITERATION_227.md).
- [x] DONE for native public text owner — Independent direction policies,
  Unicode advertisement/ACK/data callbacks, one outstanding remote request and
  stale-response/timeout/retirement ownership pass actual pinned CLIPRDR with
  simulated SVC on Windows/Linux. Public session/browser activation and actual
  remote acceptance remain open. [Contract](docs/CLIPBOARD_TEXT_SESSION.md),
  [channel evidence](docs/ITERATION_226.md). Serialized IPC/RDP handoff now retains
  one command/result with admitted authority, peer completion and finite dispatch /
  publication deadlines; linked fixtures also verify RDP-thread cleanup before
  root-thread destruction. [Handoff evidence](docs/ITERATION_230.md).
- [x] DONE for prepared CLIPRDR ingress — Header admission before fragmented-body
  allocation, bounded tables/names and public receive routing pass Windows/Linux
  native and actual pinned-channel/fake-SVC checks plus seeded sanitizer fuzz.
  Public session/browser selection and actual clipboard acceptance remain open.
  Valid over-policy data is drained without body allocation and completes only
  the read as refused; the full wire maximum fits classic SVC fragmentation.
  [Contract](docs/CLIPBOARD_INGRESS.md), [initial evidence](docs/ITERATION_225.md),
  [quota/fragment evidence](docs/ITERATION_229.md).
- [~] IN PROGRESS — Explicit text directions/item caps pass native, Node, server
  and Edge fixtures, including full 16 MiB composition. Actual remote direction /
  quota, other required formats and total-resource acceptance remain open.
- [ ] HTML clipboard.
- [ ] Image clipboard where negotiated.
- [ ] Session sandbox and safe path resolver.
- [ ] Streaming file upload/download REST API.
- [ ] RDPDR managed drive redirection.
- [ ] `thinclientDrives` alias mapped to sandbox drive descriptors.
- [ ] Read-only drive enforcement.
- [ ] File clipboard integration or explicit deferred flag.
- [ ] Quota/disk-full handling.

**Gate:** Unicode clipboard + remote file CRUD through redirected drive; traversal/symlink tests pass.

## Stage 8 — printer, smartcard, serial, parallel, USB

- [ ] Capability inventory for CUPS/PCSC/libusb/device nodes.
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
  remain open. [Evidence](docs/ITERATION_327.md).

- [x] DONE for named IP-family WEB controls — Independent capability gates
  default/system/IPv6-first preference and default/IPv4-only/IPv6-only choices;
  defaults omit fields and explicit system order preserves false. Pure cases
  and four Edge/HTTP capability combinations pass 11/11, CLI guards 3/3.
  Actual Windows prefer-6/force-4 form projection, 1080p JPEG, heartbeat and
  Disconnect pass with joined PID/runtime cleanup. Full Node Windows 783 / 51
  skips and Linux 675 / 162 skips pass; native artifacts remain unchanged.
  Broader dual-stack DNS, IPv6 RDP/server and linked Linux gates stay open.
  [Evidence](docs/ITERATION_326.md).

- [x] DONE for named Windows IP-family backend projection — Existing preference
  and force-4/6/null fields use explicit capability and canonical schema 12;
  false/null require support before CONFIGURE/SECRET while omission preserves
  legacy bytes/defaults. Public SDK readback, both loopback IP families and
  opposite-family refusal pass; actual Windows force-4/prefer-6-on-IPv4-literal
  JPEG/heartbeat and joined cleanup pass. New linked/foundation CTest 33/33 and
  17/17, full Node Windows 780 / 51 skips and Linux 674 / 160 skips pass.
  Linked Linux, dual-stack DNS selection/fallback and actual IPv6
  RDP/server acceptance remain open. [Contract](docs/IP_SETTINGS.md),
  [evidence](docs/ITERATION_325.md).

- [x] DONE for manual custom quality profile — The WEB form exposes the existing
  custom profile without injecting appearance booleans when inherited. All four
  profiles agree with strict schema; Edge/synthetic HTTP verifies balanced to
  custom selection on capable and old backends, with unchanged secret/ownership
  behavior. Focus passes 8/8; full Node Windows 766 / 51 skips and Linux
  666 / 154 skips pass. Native code/artifacts remain unchanged; broader actual
  profile/server effects and resource gates stay open.
  [Evidence](docs/ITERATION_324.md).

- [x] DONE for named Windows JPEG appearance-form smoke — Manual form passes
  six explicit booleans through the real API/native adapter, exact approved
  session certificate, nonblank 1920×1080 / 5 FPS Edge canvas, heartbeat and form
  Disconnect with joined PID/runtime cleanup. The first blank-frame test failure
  is retained; waiting for nonblank output within the original deadline passes.
  Windows/Linux CLI guards 2/2 each and lint/format pass; production/native
  artifacts remain unchanged from iteration 322. Server visual/policy effects,
  other profiles and wider acceptance stay open. [Evidence](docs/ITERATION_323.md).

- [x] DONE for manual WEB appearance controls — Six inherited/enabled/disabled
  selects preserve omitted fields and explicit false. Actual capability gates
  controls and submission; legacy profiles retain video-only behavior. Pure
  builder/ownership and two Edge/synthetic HTTP cases pass 8/8; full Node passes
  Windows 765 / 51 skips and Linux 665 / 154 skips, unchanged native CTest 32/32
  and 17/17. The named actual Windows form chain is separately verified above;
  server visual/policy and broader integration remain open.
  [Evidence](docs/ITERATION_322.md).

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
  [Contract](docs/RDP_PERFORMANCE_SETTINGS.md), [evidence](docs/ITERATION_321.md).

- [ ] RDP Gateway with same/separate credentials.
- [ ] Proxy support.
- [~] IPv4/IPv6 preference/force options — Typed API/private/native mapping,
  Windows loopback IPv4/IPv6 transport and named actual IPv4 Windows RDP cases
  pass the backend slice above; manual controls pass their named gate.
  The named localhost dual-family case passes; linked Linux, broader DNS
  preference/fallback history and actual IPv6 RDP/server profiles remain open.
- [ ] Timeouts/reconnect policy and auto-reconnect cookie where supported.
- [~] IN PROGRESS — Opt-in single-primary DisplayControl at 100% scale satisfies ADR-011 and works through native/private IPC, public control leases and actual XRDP browser H.264/JPEG resize/restoration. The named private native Windows RDP resize and public Edge H.264/JPEG browser resize/restoration also pass; broader Windows-server settings, DVC resource audit and soak acceptance remain open. [XRDP evidence](docs/ITERATION_019.md), [Windows private-worker evidence](docs/ITERATION_350.md), [Windows H.264 browser evidence](docs/ITERATION_352.md), [Windows JPEG browser evidence](docs/ITERATION_353.md).
- OUT OF CURRENT SCOPE — Multimonitor policy: explicitly excluded by the user, ADR-011; not an unimplemented release requirement.
- [~] IN PROGRESS — Selected quality profiles and six explicit appearance
  booleans now map through capability-gated schema 11 to checked public FreeRDP
  settings. New Windows SDK/worker and Linux portable source builds, synthetic
  compatibility/wire cases and four actual Windows RDP configuration smokes pass;
  full Node regression passes. Server visual/policy behavior, Linux linked/
  wider profiles and broader browser-to-RDP appearance acceptance remain open;
  the manual controls and named Windows JPEG/form chain pass their separate
  gates above.
  [Contract](docs/RDP_PERFORMANCE_SETTINGS.md), [evidence](docs/ITERATION_321.md).
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
  [Contract](docs/PROCESS_RESOURCE_BATCH.md), [evidence](docs/ITERATION_378.md).
  Controlled actual child timeout, partial/all-member cancellation and missing
  executable integration now also passes; full Node is 857 / 51 skips / 908,
  zero failures, on the same unchanged native output. This is simulated helper
  process failure, not actual Windows query API failure acceptance.
  [Additional evidence](docs/ITERATION_379.md).

- [x] DONE for phase-aware capacity diagnostics — Lifecycle-only fixtures retain
  startup/active/retiring failure categories, fixed maximum query timings and
  event-loop delay; failed sampling waits stop on the actual known error.
  Synthetic notification / actual native ownership control and 40-slot resource
  cases pass Windows/Linux 2/2 each, lint/format and CTest 33/33 / 17/17.
  A new run classifies five IPC timeouts as retiring; later focus has none but
  still observes active queries beyond nominal three seconds. No production
  policy or timeout is changed; original spike, absolute-deadline behavior,
  connected/OS/load/soak gates remain open. [Evidence](docs/ITERATION_328.md).

- [x] DONE for named connected Windows public CPU failure — Actual public
  1080p JPEG precedes the first global/connected CPU baseline; bounded valid
  16-flight IPC load produces growing OS counters and exact WORKER_CPU_LIMIT
  through the native adapter/manager/control WS. Both channels close 1000,
  HTTP snapshot/token statuses and pre-factory overflow refusal pass, with
  joined native/query/PID/runtime retirement. The original public RSS mode
  also passes again. Full Node Windows 756 / 51 skips and Linux 657 / 153 skips,
  CTest 31/31 and 17/17 pass. Linux is common foundation evidence; browser
  terminal display, connected siblings, complete budgets, hard OS/CI/deployment
  and soak gates remain open. [Evidence](docs/ITERATION_320.md).

- [x] DONE for named connected Windows public RSS failure — Actual source-
  receipt-selected Release worker produces 1080p JPEG over media WS before the
  first connected RSS sample. Exact WORKER_MEMORY_LIMIT reaches control once,
  both channels close 1000, GET retains HTTP 200 failed snapshot, new tokens
  refuse 409 and an unused token upgrade refuses 401. Pre-factory overflow and
  joined native/query/PID/runtime retirement pass. Full Node Windows
  755 / 51 skips and Linux 656 / 153 skips, CTest 31/31 and 17/17 pass.
  Linux is common/foundation evidence only; the helper is Windows-only. Browser
  rendering/terminal display, CPU failure, connected siblings, complete budgets,
  hard OS failures and soak remain open. [Evidence](docs/ITERATION_319.md).

- [x] DONE for native RSS failure over public HTTP/WS at certificate wait —
  Actual linked Windows worker/OS sampling with a local synthetic TLS peer
  delivers one fixed WORKER_MEMORY_LIMIT control error, closes control/media
  with 1000, retains HTTP 200 failed snapshot, refuses new token issuance with
  409 and an unused old token upgrade with 401. Joined native PID/runtime
  cleanup and known-value diagnostic regression pass. Full Node Windows
  754 / 51 skips and Linux 655 / 153 skips pass; Linux foundation explicitly
  skips linked integration. This does not accept a connected desktop/public
  failure, connected siblings, CPU composition or sustained budgets.
  [Evidence](docs/ITERATION_318.md).

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
  open. [Evidence and exact chronology](docs/ITERATION_317.md).

- [x] DONE for named Windows connected RSS-limit breach — Actual connected
  1080p JPEG and heartbeat precede sampling; the first global/connected RSS
  sample exceeds a one-byte fixture cap and produces exact WORKER_MEMORY_LIMIT.
  Joined PID/runtime cleanup and both healthy/CPU-breach repeats pass without
  remote application actions or artificial memory load. Full Node Windows
  751 / 51 skips and Linux 654 / 151 skips pass. This is private single-worker
  failure acceptance; registry/sibling isolation, total-session/startup budgets,
  hard OS failures, production deployment and soak remain open.
  [Contract](docs/RDP_RESOURCE_SMOKE.md), [evidence](docs/ITERATION_316.md).

- [x] DONE for named Windows connected CPU-limit breach — Actual connected
  1080p JPEG and heartbeat precede the first real CPU baseline. Bounded local
  16-flight IPC load then produces increasing platform counters and exact
  WORKER_CPU_LIMIT under an explicit 1% fixture cap; joined PID/runtime cleanup
  and an ordinary healthy-policy repeat pass. Full Node Windows 749 / 51 skips
  and Linux 652 / 151 skips pass. This is private single-worker acceptance;
  connected registry/sibling isolation, RSS breach, production budgets and
  sustained/OS-failure gates remain open.
  [Contract](docs/RDP_RESOURCE_SMOKE.md), [evidence](docs/ITERATION_315.md).

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
  [Contract](docs/RDP_RESOURCE_SMOKE.md), [evidence](docs/ITERATION_314.md).

- [x] DONE for native resource-policy crash/retirement composition — One actual
  framed worker exits while a synthetic barrier holds completion of an actual
  OS resource read. Its registry slot/runtime remain owned until completion;
  two siblings keep CPU/RSS sampling and heartbeat, and one replacement starts
  after joined retirement. Windows shared CPU/RSS and Linux separate CPU-owner
  cases pass. Full Node Windows 694 / 92 skips and Linux 639 / 150 skips,
  CTest 16/16 and 17/17 pass. This does not accept an OS-stalled helper,
  forced-deadline expiry, simultaneous parent/worker kill or connected RDP
  failure. Production code, Release and pins are unchanged.
  [Evidence](docs/ITERATION_311.md).

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
  unchanged. [Evidence and changed files](docs/ITERATION_310.md).

- [x] DONE for actual unconnected native CPU-limit breach — Fixed 16-flight
  heartbeat load and genuine platform counter growth trigger WORKER_CPU_LIMIT
  at an explicit 1% fixture cap on Windows/Linux. The owned PID/runtime retire,
  all requests join and a sibling keeps heartbeat. CPU focus passes 17/17 each;
  full Node Windows 680 / 92 skips and Linux 627 / 148 skips, CTest 16/16 and
  17/17 pass. This is real C++ lifecycle load, not a production budget or
  connected RDP/media/concurrency/soak acceptance. Release and dependencies
  remain unchanged. [Evidence](docs/ITERATION_309.md).

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
  [Contract](docs/PROCESS_CPU.md), [evidence](docs/ITERATION_308.md).

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
  [evidence](docs/ITERATION_306.md).

- [x] DONE for typed Windows CPU-query prerequisite — Strict bounded schema-1
  parsing, validated PID, optional cancellation and joined query-helper close
  return cumulative CPU microseconds without raw OS output/reasons. Actual
  unconnected native-worker samples and eight cancellations preserve heartbeat
  and normal cleanup. Windows focused 10/10, full Node 662 / 90 skips and
  Linux 605 / 150 skips, CTest 16/16 and 17/17 pass. Linux validates common
  parser/refusals only; the separately verified sampled Windows policy above
  and Linux query extension above do not close Release helper adoption or actual
  overload/connected CPU gates. [Contract](docs/PROCESS_CPU.md),
  [evidence](docs/ITERATION_304.md); `df40276`.

- [x] DONE for native Windows CPU-counter prerequisite — The existing host
  helper reports bounded cumulative kernel+user microseconds through limited
  query access with RAII handle retirement and exact scalar/overflow checks.
  Actual owned-process CPU growth/grammar controls and portable 2-case/12-assertion
  conversion tests pass. Debug CTest Windows 16/16 and Linux 17/17, full Node
  654 / 90 skips and 599 / 148 skips pass. This native-only block does not claim
  the separately verified Node reader above, CPU watchdog or Linux process
  query; complete CPU/connected resource gates remain open.
  [Contract](docs/PROCESS_CPU.md), [evidence](docs/ITERATION_300.md); `059c866`.

- [x] DONE for cancellable shared RSS queries — Optional AbortSignal stops
  pre-aborted work before resource acquisition, joins proc-file/helper-process
  retirement and returns only a fixed cancellation error. Eight actual query
  cancellations preserve target-worker heartbeat and a subsequent sample;
  Linux parent FD count returns to baseline. Focus passes Windows 11/11 and
  Linux 12/12; full Node 640 / 90 skips and 586 / 147 skips, CTest 15/15 and
  16/16 pass. Watchdog enforcement and complete kernel/OS-failure/connected
  resource gates remain open. [Evidence](docs/ITERATION_295.md); `61ec364`.

- [x] DONE for bounded shared host RSS sampling — Existing Linux proc and
  Windows colocated-helper readers now share strict TypeScript, typed fixed
  errors and scalar-only output; lab wrappers preserve their existing errors.
  Focused compatibility/actual-owned-worker samples pass Windows 9 / 1 skip and
  Linux 10/10; full Node 638 / 90 skips and 584 / 147 skips, native CTest 15/15
  and 16/16 pass. This is a sampler prerequisite, not watchdog enforcement or
  CPU/private/total-session memory acceptance. [Contract](docs/PROCESS_RESIDENT.md),
  [evidence](docs/ITERATION_294.md); `f9ff66d`.

- [x] DONE for Linux foundation runtime smoke — Ordinary GCC CTest 8/8 and
  actual worker suite 12 passed / one Windows skip under UID 1000, read-only
  root, bounded runtime tmpfs, dropped capabilities/default seccomp and Docker
  init. No-init orphan zombie failure is retained; init/reaping is an explicit
  deployment requirement. This is separate from the production service image,
  linked Linux RDP/devices and resource/soak acceptance. [Evidence](docs/ITERATION_185.md).
- [x] DONE — Linux amd64 non-root multi-stage API/native artifact runtime.
  UID1000, production JS/dependency closure, private worker, actual HTTP/build /
  auth refusal and synthetic host/native lifecycle pass with primary IPC.
  Upstream source/fresh-checkout/distro builds and CI execution remain separate
  open gates. [Deployment](docs/CONTAINER_RUNTIME.md), [evidence](docs/ITERATION_211.md).
- [x] DONE — Read-only-root/init/cap-drop/no-new-privileges deployment example
  with bounded private runtime tmpfs passes the actual service fixture. Additional
  device mappings and broader load/resource acceptance remain open. [Evidence](docs/ITERATION_211.md).
- [x] DONE for documentation — Optional USB/DRI/serial/PCSC mapping reference
  records explicit nodes/socket directory, host permissions, numeric groups,
  retained non-root runtime restrictions and current public-device refusal.
  All 31 local links and reference-shell syntax pass; no device mapping is
  executed or accepted as supported. Stage 8/device/hotplug/isolation gates
  remain open. [Reference](docs/CONTAINER_DEVICE_MAPPINGS.md),
  [verification](docs/ITERATION_290.md); `63b980e`.
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
  its bounds. [Measured phases](docs/ITERATION_375.md).
  The full repeat still fails this load case (821 passed / 51 skips / one
  failure): twelve active resource-deadline failures, up to 149 ms synchronous
  invocation and 1,466 ms admission/continuation. No load correction is claimed.
  Invocation staging now yields between successive launches while preserving
  sixteen concurrent permit owners, cancellation and the original absolute
  admission/query deadlines. Controlled observer/expiry checks and the first
  unchanged Windows capacity control pass; the 2,949 ms maximum query remains
  near its 3,000 ms bound. Wider load/retirement stability remains open.
  [Scheduling evidence](docs/ITERATION_376.md).
  Full check still fails that resource sampling case: 825 passed / 51 skips /
  one failure, two active query expiries at up to 3,057 ms despite event-loop
  delay reduced to 372 ms. Helper launch volume/query headroom remains open.
  A prepared Windows sixteen-PID helper command and strict bounded positional
  codec now pass new linked Debug CTest 34/34 and actual helper/codec checks
  14/14. Current watchdogs remain scalar; automatic coalescing, individual
  cancellation/shared retirement, shared 16/128 admission and native-support
  gating remain required before adoption or any load-fix acceptance.
  [Prepared batch evidence](docs/ITERATION_377.md).
  The new profile's full check passes 832 / 51 skips and retains one failing
  scalar-watchdog capacity case, with two active deadline failures. Batch
  command availability alone is not a throughput/adoption acceptance result.
  [Contract](docs/WORKER_MEMORY_POLICY.md), [evidence](docs/ITERATION_296.md); `6752257`.
  A subsequent short Windows actual RDP 1080p healthy-policy smoke passes
  26 connected samples below the explicit 256 MiB cap, heartbeat/JPEG and joined
  empty-runtime close. This does not accept total-session/CPU, connected faults,
  Linux connected or sustained budgets. [Evidence](docs/ITERATION_298.md).
  Connected smoke helper commit: `be3ee69`.
  A separate optional Windows CPU policy now passes healthy unconnected native
  sampling and synthetic limit/fault/lifetime compositions. Actual overload,
  connected/total-session CPU, Linux CPU and production-helper adoption remain
  open. [Scoped CPU evidence](docs/ITERATION_306.md).
  Local Linux CPU queries and the same sampled policy also pass native/Node
  lifecycle and Debug-install checks. Actual overload, production helper,
  connected/total-session, OS-failure and broader platform/soak acceptance remain
  separate. [Linux CPU extension](docs/ITERATION_308.md).
  Genuine Windows/Linux CPU-counter breach under bounded native heartbeat load
  now also verifies owned-process cleanup and sibling survival. Connected
  RDP/application/media loads and configured resource-policy concurrency remain
  separate. [Actual native CPU control](docs/ITERATION_309.md).
  A later full-suite capacity run has an unexplained resource-query latency
  spike and worker failures; an unchanged standalone control and full repeat
  pass, but the repeat still records unclassified IPC timeouts. Original logs
  and thresholds are preserved. A subsequent phase-aware run identifies retiring
  timeouts and longer active query observations; no original root cause or
  production correction is claimed. A separate failing-before/passing-after
  control now proves RSS/CPU samples that return after a three-second deadline
  during a 3.1-second event-loop stall fail closed across separate and paired
  Windows queries; the original capacity-failure cause and wider load/OS timing
  acceptance remain open. [Original evidence](docs/ITERATION_327.md),
  [diagnostics](docs/ITERATION_328.md).
- [x] DONE for worker resource-query deadline enforcement under event-loop
  stalls — Absolute monotonic expiry checks prevent late RSS/CPU values from
  reviving an expired query for separate policies, paired Windows policies and
  the shared Windows helper. The actual-worker stall controls fail before and
  pass after; Windows resource focus 25/25, full Node 740 passed / 101
  platform/profile skips and CTest 33/33 pass. This does not identify the
  earlier capacity spike's root cause or prove hard OS close, Linux, connected
  fault, total-session or soak bounds. [Evidence](docs/ITERATION_329.md).
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
  [Log evidence](docs/ITERATION_216.md), [Linux scope/evidence](docs/ITERATION_217.md),
  [Windows scope/evidence](docs/ITERATION_221.md).
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
  [Contract](docs/SBOM.md), [Linux evidence](docs/ITERATION_214.md),
  [Windows native evidence](docs/ITERATION_221.md).
  New corrected Windows/Linux artifacts additionally bind the approved DSP
  correction to two exact metadata/recipe files and GENERATED_FROM edges;
  independent artifact-only generation and full platform Node suites pass.
  [Correction provenance](docs/ITERATION_270.md).
- [ ] Performance report against `PERFORMANCE.md` metrics.
- [x] DONE for a fresh local synthetic 1080p H.264 encode sample — Three
  existing-binary runs record total/convert/compress p95 and encoded bytes at
  1/2/4 threads. Four-thread encode p95 is 33.730–39.882 ms in these samples;
  forwarding, queue, browser, CPU/RSS and soak measurements remain outside this
  result, so the full report item above stays open. [Evidence](docs/ITERATION_331.md).
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
  fuzz/soak gates remain open. [Iteration 169](docs/ITERATION_169.md).

- [~] IN PROGRESS — Exact audio DVC name now selects 64 KiB message/output /
  128 KiB encoded admission before host assembly/decompression and complete
  RDPSND validation before pool copying. Eight public/actual-linked-fake-SVC
  cases / 120 assertions, linked DVC 143 cases / 7,879 assertions and bundled
  CTest 21/21 pass. Pool/RSS/core/remote/platform/fuzz/soak remain open.
  [Iteration 168](docs/ITERATION_168.md).

- [~] IN PROGRESS — Production static RDPSND receive placement now checks
  complete bounded records before SDK pool/assembly/parser, including audio-off
  fake fallback. Eight public/actual-linked-fake-SVC cases / 189 assertions,
  linked DVC 135 cases / 7,759 assertions and bundled CTest 21/21 pass. Dynamic
  audio, core/pool/RSS/remote/platform/fuzz/soak gates remain open.
  [Iteration 167](docs/ITERATION_167.md).

- [~] IN PROGRESS — Isolated complete RDPSND owner composes fixed 64 KiB /
  4,096-fragment assembly and bounded PDU validation with one nonrenewing deadline
  over fragments and legacy WaveInfo/Wave. Nine portable cases / 8,358 assertions,
  foundation CTest 9/9 and bundled 21/21 pass. Automatic audio-off fake fallback
  placement, core/pool/remote/platform/fuzz/soak gates remain open; no worker
  callback is installed by this block. [Iteration 166](docs/ITERATION_166.md).

- [~] IN PROGRESS — Production Graphics completion now owns bounded decoded
  batch inspection before original metadata parsing, preserves pending-close
  borrows and consumes zero-output messages before the pinned null-buffer
  assertion. Public binding and actual rdpgfx/drdynvc/fake-SVC counter/lifetime
  cases pass. Large literal CPU, total RSS, multiple-channel/remote/platform /
  allocator/fuzzer/soak remain open. [Iteration 165](docs/ITERATION_165.md).

- [~] IN PROGRESS — Isolated owner now decodes bounded ZGFX through public APIs,
  inspects each PDU before target metadata parsing and forwards only inspected
  literal segments with independent dictionary/borrow/retirement ownership.
  Nine native cases and actual SDK AVC/large-literal cost measurements pass;
  production placement, large-batch CPU, codec/RSS/remote/platform/soak remain
  open. [Iteration 164](docs/ITERATION_164.md).

- [~] IN PROGRESS — Scoped DVC selection now distinguishes bare dynamic plugin
  requests from subsystem/type backend ABIs sharing the DYNAMIC flag. This fixes
  actual XRDP `rdpsnd,sys:fake` Open refusal with browser audio off, preserving
  previous backend policy and strict DVC admission. Six provider cases and
  restored H.264 resize/reattachment pass; fake-backend resource, actual audio,
  remote GFX/platform/soak gates remain open. [Iteration 163](docs/ITERATION_163.md).

- [~] IN PROGRESS — Portable decoded GFX batch inspection bounds each PDU before
  array/bitmap count checks, refusing cross-PDU borrowing and excessive AVC420
  metadata. Five portable and one public ZGFX-output cases pass; production
  decoded-message ownership/placement before metadata allocation remains open,
  together with codec/RSS/remote/platform/fuzzer/soak gates.
  [Iteration 162](docs/ITERATION_162.md).

- [~] IN PROGRESS — Allocation-free complete Annex-B SPS/subset-SPS inspection
  now bounds coded dimensions to the public GFX surface before AVC420 decoder
  creation/dispatch. Profiles/scaling/POC/escape/UE and byte/NAL boundaries plus
  actual private SDK prediction/refusal/recovery fixtures cover the new path.
  Total reference/working memory, aggregate surfaces/RSS, remote GFX, platforms,
  sanitizer/fuzzer and soak gates remain open. [Iteration 161](docs/ITERATION_161.md).

- [~] IN PROGRESS — Exact public graphics DVC name selects nested ZGFX inspection
  before the codec callback; malformed/excessive output/count claims are refused
  without decode, with complete-message reservation release and owned close.
  Six public/codec, one required identity-API and two actual rdpgfx/drdynvc/fake-SVC
  cases pass, including 12 MiB codec output and valid CapsConfirm. Dictionary/
  metadata/codec working memory, pool/total RSS and actual remote/platform/soak
  gates remain open. [Iteration 160](docs/ITERATION_160.md).

- [~] IN PROGRESS — Production synchronous scoped DVC provider now selects the
  bounded public entry/plugin/shared-manager/listener/channel ownership chain.
  Worker reserves up to 32 known logical declarations / 64 MiB before host
  allocation, polls own faults/deadlines and retires callbacks before SDK plugin
  teardown. Five provider fixtures and one actual drdynvc/fake-SVC fixture pass;
  total RSS/pool/nested codec, remote/Windows-server and platform/soak gates remain
  open. [Iteration 159](docs/ITERATION_159.md).

- [~] IN PROGRESS — Bounded public DVC entry-point registry captures one pinned
  plugin per entry, publishes stable proxy/name storage after entry success,
  projects GetPlugin back to original objects and shares one bounded manager.
  Failed publication retains an inert late-callback proxy. Seven public/generic
  fixtures and one actual drdynvc/fake-SVC fixture pass; scoped provider/worker,
  allocator-fault and remote aggregate/cached/nested resource gates remain open.
  [Iteration 158](docs/ITERATION_158.md).

- [~] IN PROGRESS — Public DVC plugin lifecycle proxy resolves a shared manager,
  preserves original delegate identity and cleanup notifications, and terminates
  a self-deleting/throwing plugin once without uncertain retry. Six public cases
  and one actual drdynvc/fake-SVC case pass. Production registration/provider,
  shared manager/worker lifetime and remote resource acceptance remain open.
  [Iteration 157](docs/ITERATION_157.md).

- [~] IN PROGRESS — Bounded public DVC listener manager installs accepted callback
  proxies, rejects live duplicate names and slot overflow, defers destruction
  during factory calls and retains uncertain native handles until explicit final
  host unpublication. Actual pinned generic acceptance default is preserved.
  Six public fixtures and one actual drdynvc/fake-SVC fixture pass; production
  addin/plugin/worker and aggregate/cached/nested/remote resource gates remain open.
  [Iteration 156](docs/ITERATION_156.md).

- [~] IN PROGRESS — Public listener factory proxy transfers only explicitly
  accepted live callbacks, preserves ordinary factory refusal, prevents late
  publication on close and keeps uncertain cleanup visible. Seven public-ABI and
  two actual drdynvc/fake-SVC cases pass; production provider/host lifetime,
  aggregate/cached/nested/remote resource acceptance remain open.
  [Iteration 155](docs/ITERATION_155.md).

- [~] IN PROGRESS — Accepted DVC callback handoff closes rejected new targets once,
  preserves separate uncertain cleanup status and refuses shared live callback
  aliases without closing the existing owner. Five fixtures and two actual
  drdynvc/fake-SVC cases pass; production listener/provider handoff and aggregate/
  cached/nested/remote resource acceptance remain open. [Iteration 154](docs/ITERATION_154.md).

- [~] IN PROGRESS — Pinned public manager facade normalizes failed CreateListener
  output to stable fallback without touching a potentially freed native pointer;
  actual generic addin and successful drdynvc/fake-SVC fixtures pass. Production
  provider placement, partial/failed handoff and actual allocator-failure resource
  acceptance remain open. [Iteration 153](docs/ITERATION_153.md).

- [~] IN PROGRESS — Fixed public DVC ID/callback registry reserves DATA_FIRST only
  for registered live channels, retains rejected-target caller ownership and joins
  callback retirement. Seven public-ABI and five actual drdynvc/fake-SVC cases
  pass; production addin/listener handoff, aggregate admission and pool/nested
  memory/resource acceptance remain open. [Iteration 152](docs/ITERATION_152.md).

- [~] IN PROGRESS — Public DVC completion/close proxy preserves callback borrow,
  defers nested close, joins retirement and releases DATA_FIRST reservations only
  after actual callback return or host close. Eight public-ABI and five actual
  drdynvc/fake-SVC cases pass. Production registration, cumulative admission and
  pool/nested memory acceptance remain open. [Iteration 151](docs/ITERATION_151.md).

- [~] IN PROGRESS — Allocation-free cumulative DATA_FIRST reservation foundation
  has fixed 32 slots / 64 MiB aggregate / 16 MiB individual hard caps, original
  deadlines and observed release. Five portable cases and two public WinPR pool
  fixtures pass. Not active in worker: public completion/close wiring, host
  retirement, channel and retained-pool/nested memory limits remain open.
  [Iteration 150](docs/ITERATION_150.md).

- [~] IN PROGRESS — Worker public receive admission now bounds individual outer
  SVC, DATA_FIRST and compressed-DVC claims before pinned host dispatch. Six
  actual-linked drdynvc/fake-SVC cases include compressed decoding, 12 MiB input,
  two logical channels and partial shutdown; RDP-thread polling and callback
  restoration are implemented. Cumulative/pool/nested resource and actual
  hostile/lost-transport acceptance remain open. [Iteration 149](docs/ITERATION_149.md).

- [~] IN PROGRESS — Public ReceiveChannelData adapter normalizes only complete
  inspected drdynvc input, preserves other SVC arguments and validates raw flags,
  notifications, channel-ID lifetime and callback retirement. Seven linked public
  ABI fixture cases pass; actual host/worker activation and remote resource
  acceptance remain open. [Iteration 148](docs/ITERATION_148.md).

- [~] IN PROGRESS — One bounded outer drdynvc SVC message owner now validates
  total before staging allocation and inner claims before synchronous forwarding.
  Whole packets borrow without a copy; exact abandonment/framing/clock/reentrant
  cleanup checks pass portable and linked-codec regression. No production receive
  callback is installed yet; actual host placement, raw flags, cumulative/channel
  budgets, nested GFX/control/codec and hostile/lost-transport/platform/fuzz/soak
  gates remain open. [Evidence](docs/ITERATION_147.md). Headers: `6744bff`.
- [~] IN PROGRESS — Allocation-free DVC DATA_FIRST/ZGFX declared-size/count
  inspection and linked public-codec/large-payload fixtures are implemented.
  Limits are independent of touch size and include SDK output padding. This
  foundation is not installed before the actual host yet; outer/cumulative
  admission, public callback/lifetime placement, nested GFX/control/codec
  allocations, concurrent budgets, actual hostile/lost transport, platforms and
  sanitizer/fuzz/soak acceptance remain open. [Evidence](docs/ITERATION_146.md).
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
  [Iteration 170](docs/ITERATION_170.md); `8aaa379`.
- [x] DONE on Windows (component) — Colocated helper packaging/discovery:
  three actual process cases and explicit relocated execution with minimal PATH.
  [Iteration 171](docs/ITERATION_171.md); `5c75f26`.
- [~] IN PROGRESS — Windows runtime ACL/multi-user isolation acceptance:
  Node now selects the helper before marker/worker spawn and joins normal startup
  cancellation/confirmed cleanup. Trusted root/parent validation, uncertain
  bootstrap outcome reclamation, other filesystems and actual second-account/
  service isolation remain open. Traces to ARCHITECTURE §2 and SECURITY §2/6.
  [Startup contract](docs/WINDOWS_DIRECTORY_STARTUP.md),
  [iteration 172](docs/ITERATION_172.md); `2e30d14`.
- [ ] TODO — Reclaim directories after simultaneous parent/worker hard kill, including stale ownership records. Normal close, worker-only crash and parent-only death are verified; simultaneous hard kill is not. Traces to SPECIFICATION §3.1 and Stage 10 watchdog cleanup.
- [~] IN PROGRESS — Registry retains capacity through native forced-termination completion with a separate bounded deadline; filesystem/HELLO cancellation guards prevent late spawn/readiness. Unconfirmed cleanup now keeps global/per-principal capacity after logical close and wait expiry, releasing only on trusted graceful/forced completion. Synthetic fault cases and an actual unconnected native delayed-completion/replacement case pass; Windows foundation Node 835 / 102 skips and CTest 17/17 pass. Physical uncertain-resource reclamation, legacy backend adoption, OS/filesystem failures, connected faults and orphan acceptance remain open. [Current evidence](docs/ITERATION_384.md), [earlier completion contract](docs/ITERATION_056.md). Observed race: [iteration 55](docs/ITERATION_055.md), `46245b2`.
- [~] IN PROGRESS — Package worker + exact FreeRDP/WinPR/runtime dependencies for Windows x64 and Linux x64 without requiring a system FreeRDP install. Windows native ZIP and relocation are verified; [manual bundled CI](.github/workflows/bundled-native.yml) is prepared, not run. Linux, Node.js distribution, MSI/EXE/DEB/RPM installer integration and clean-machine tests remain open.
