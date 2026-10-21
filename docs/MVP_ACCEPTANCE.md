# Practical MVP acceptance

2026-10-21. This is the current delivery subset of SPECIFICATION and TODO, under
the user's revised priority: working browser desktop, clipboard and audio first.
The full v1 requirements and historical evidence remain in [TODO](../TODO.md).
One primary monitor, orientation 0 and 100% scale follow
[ADR-011](adr/ADR-011-single-display-100-percent.md).

**The named practical MVP gates pass.** The joint Windows 30-minute result and
explicit user listening assessment are [403](ITERATION_403.md); active owned
XRDP 30-minute acceptance is [401](ITERATION_401.md). This accepts the stated
profiles and bounded tests, not every V1 platform/device/profile or error-free
operation. [Run the tested build](MVP_RUNBOOK.md).

| Required behavior                                                                        | Current evidence and remaining acceptance                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API and browser Windows desktop, H.264/JPEG, cursor, resize and attachment replay | Named Windows browser checks pass [352](ITERATION_352.md), [353](ITERATION_353.md). The combined current Release H.264 1080p/audio/input/Clipboard observation additionally passes resize/restoration, cursor/display/audio replay and cleanup [403](ITERATION_403.md). |
| XRDP desktop through the same architecture                                               | Current user-requested owned Linux/XRDP stand passes public Edge/current Windows Release producer JPEG/H.264 1080p, cursor, resize/restoration and viewer replay [397](ITERATION_397.md). Historical Linux-producer observations retain their scope. Actual owned Linux drag/drop, content scrolling and blur/detach button release pass through X11 scalar readback [398](ITERATION_398.md), separately from the still-unaccepted Linux CLIPRDR path.                                                                                                                                                                                                                                                       |
| Keyboard, mouse and safe release                                                         | Current public viewer/Notepad exact readback verifies Shift/number entry, Ctrl/Shift/Alt blur release (Alt includes Escape) and held right Ctrl across detach/fresh-token reattachment [394](ITERATION_394.md). Earlier private Unicode/left-button evidence [303](ITERATION_303.md) retains its scope. Actual prepared Windows page additionally passes left/right/middle buttons, captured drag, both wheel axes/directions and held-button blur/detach release [396](ITERATION_396.md). Owned Linux canvas additionally passes real object drop and both-axis content scrolling [398](ITERATION_398.md). Hard TCP loss retains a remote button; fresh-controller clearing now passes actual owned-XRDP/public-viewer readback and a previous-worker negative control [399](ITERATION_399.md). Immediate broken-TCP release is not guaranteed. Arbitrary drop targets and broader handoff remain separate. |
| **P0: Browser Clipboard API ↔ public control ↔ CLIPRDR ↔ Notepad** | The current combined Release/Edge/Windows joint run passes both actual Unicode/multiline OS Clipboard API directions, 61 reads with periodic physical edit/readback, permission refusal, revoke, viewer clearing and joined cleanup [403](ITERATION_403.md). Earlier [392](ITERATION_392.md) keeps its scope. One prepared-editor focus click is used; post-clear empty application content is not separately observed. Wider direction/quota/isolation fixtures retain their scope. |
| **P0: stable audible output without regular interruptions** | **Accepted for the named combined Release Windows Opus/200 ms scenario** [403](ITERATION_403.md): 30-minute joint gate, 1,796.923 rendered seconds, explicit user report of steady sound without regular interruptions. Measured deltas remain: 101 configurations, 22 underflows / 1,664 frames, 151,296 buffering-silence and 66,176 reset-discarded frames; overflow zero. No reset-free/zero-drop/latency or wider-profile claim. Earlier [393](ITERATION_393.md) and Debug [390](ITERATION_390.md) retain their scope. |
| Lifecycle and bounded resource ownership                                                 | Current startup/deadline [383](ITERATION_383.md) and unconfirmed-cleanup capacity [384](ITERATION_384.md) checks pass, including actual unconnected native controls. Current owned-XRDP public CPU/RSS failures additionally pass exact errors, terminal channels, denied/retired tokens and joined query/PID/runtime cleanup [397](ITERATION_397.md). Total-session budgets and broader connected profiles remain separate.                                                                                                                                                                                                                     |
| 1080p, 30-minute active observation after fixes | The combined-correction worker passes active owned-XRDP H.264 1080p for 30 minutes / 61 observations, bounded queues/RSS, resize/replay and cleanup [401](ITERATION_401.md), with audio/Clipboard off. The separate actual Windows joint H.264/Opus/input/Clipboard gate passes 30 minutes / 59 observations and cleanup [403](ITERATION_403.md). The earlier static Windows [388](ITERATION_388.md), incomplete 26.14-minute attempt [398](ITERATION_398.md), short two-account coexistence [398](ITERATION_398.md), and historical XRDP [182](ITERATION_182.md), [220](ITERATION_220.md) retain their scopes. |
| Reproducible supported builds | Combined Windows linked Release CTest 34/34 passes [401](ITERATION_401.md); Windows Node 891 / 61 skips and Linux GCC 12 linked Release + IPC addon CTest 35/35, Node 870 / 82 skips pass [402](ITERATION_402.md), with exact scope/outer-tool discrepancy retained. Native source matches all 353 tested files [403](ITERATION_403.md). Original Release outputs/settings and pins stay unchanged. Earlier [391](ITERATION_391.md), [395](ITERATION_395.md) retain their evidence. Wider build matrices remain V1 work. |

Owned XRDP CLIPRDR now reaches ready after bounded zero-trailer normalization.
One prepared Tk → CLIPRDR → public Edge Get read passes; a subsequent
fresh-connection re-offer does not produce a new offer and remains open.
This does not replace the accepted Windows bidirectional chain or establish
repeatable XRDP clipboard ownership across sessions. [Exact evidence](ITERATION_400.md).

Connection-error evidence includes actual strict certificate refusal
[344](ITERATION_344.md), approved session-only activation [346](ITERATION_346.md)
and the named controlled transport-loss case [183](ITERATION_183.md).
Other public reason mappings and their unit/integration boundaries remain in
[Session API](SESSION_API.md); they are not all remote-server acceptance.

Actual connected Windows CPU/RSS failures, public terminal error/token refusal
and joined PID/runtime cleanup pass their named [RSS](ITERATION_319.md) and
[CPU](ITERATION_320.md) scenarios. Current linked regression [387](ITERATION_387.md)
adds current-code local coverage; startup/total-session memory, hard kernel
deadlines and broader connected/platform failure profiles remain open.

Reproducible interactive launch and capability-gated supported/unsupported
choices are documented in the [WEB connection example](WEB_CONNECTION_EXAMPLE.md).
It supports explicit verified linked native receipts and typed credentials;
audio activation and clipboard actions remain separate user controls. The
[development guide](DEVELOPMENT.md) records the bounded actual lab scenarios.

Current Linux regression of both production corrections passes CTest 35/35,
focused process/TLS 7/7 and full Node 870 / 82 skips / 952 total. Source/native
hashes and checked cleanup receipt pass; the outer tool status discrepancy is
retained. [Exact scope](ITERATION_402.md).

The latest joint Windows observation now passes [403](ITERATION_403.md). The
preceding attempt stops on a Get after 21 periodic checks / 625,142 ms; its
terminal read status was not retained and its cause remains unknown
[402](ITERATION_402.md). The passing repeat does not claim that cause was fixed;
it adds fixed status/revision evidence for a recurrence, without automatic
retries or deadline extensions. Preserve the audible acceptance and visible
numeric discontinuities. This is bounded MVP evidence, not a guarantee against
future operation refusal or intermittent failure.
Only explicitly prepared lab actions are permitted. Comparison results contain
no clipboard text, credentials or arbitrary remote application content.

The existing [clipboard UI](CLIPBOARD_BROWSER.md) deliberately separates local
paste, send, remote get and local copy. Opt-in directions, item limits,
16 MiB chunking, revoke, ownership and permission lifetime remain required;
fixture coverage must not be described as real OS/application acceptance.
[ADR-012](adr/ADR-012-audio-compatibility-buffer.md) preserves PCM/Opus and
120/200 ms profiles without waiving audible quality or measured queue targets.

Drives, other clipboard formats, devices, Gateway/proxy/RemoteApp, general RDP
reconnect, complete hardware/platform matrices and large connected-session load
remain full v1 work. They are not blockers for this MVP, and are not removed or
marked accepted. No new diagnostic subsystem, broad security investigation,
dependency change or Release reconfiguration is part of this delivery.

MVP expansion stops here. The separate [full V1 plan](V1_NEXT_STEPS.md) preserves
the remaining original stages and their actual acceptance gates.
