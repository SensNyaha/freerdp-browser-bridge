# Practical MVP acceptance

2026-10-21. This is the current delivery subset of SPECIFICATION and TODO, under
the user's revised priority: working browser desktop, clipboard and audio first.
The full v1 requirements and historical evidence remain in [TODO](../TODO.md).
One primary monitor, orientation 0 and 100% scale follow
[ADR-011](adr/ADR-011-single-display-100-percent.md).

**The named practical MVP gates pass.** The joint Windows 30-minute result and
explicit user listening assessment are [403](history/iterations/401-450.md#iteration-403); active owned
XRDP 30-minute acceptance is [401](history/iterations/401-450.md#iteration-401). This accepts the stated
profiles and bounded tests, not every V1 platform/device/profile or error-free
operation. [Run the tested build](MVP_RUNBOOK.md).

| Required behavior                                                                        | Current evidence and remaining acceptance                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API and browser Windows desktop, H.264/JPEG, cursor, resize and attachment replay | Named Windows browser checks pass [352](history/iterations/351-400.md#iteration-352), [353](history/iterations/351-400.md#iteration-353). The combined current Release H.264 1080p/audio/input/Clipboard observation additionally passes resize/restoration, cursor/display/audio replay and cleanup [403](history/iterations/401-450.md#iteration-403). |
| XRDP desktop through the same architecture                                               | Current user-requested owned Linux/XRDP stand passes public Edge/current Windows Release producer JPEG/H.264 1080p, cursor, resize/restoration and viewer replay [397](history/iterations/351-400.md#iteration-397). Historical Linux-producer observations retain their scope. Actual owned Linux drag/drop, content scrolling and blur/detach button release pass through X11 scalar readback [398](history/iterations/351-400.md#iteration-398), separately from the still-unaccepted Linux CLIPRDR path.                                                                                                                                                                                                                                                       |
| Keyboard, mouse and safe release                                                         | Current public viewer/Notepad exact readback verifies Shift/number entry, Ctrl/Shift/Alt blur release (Alt includes Escape) and held right Ctrl across detach/fresh-token reattachment [394](history/iterations/351-400.md#iteration-394). Earlier private Unicode/left-button evidence [303](history/iterations/301-350.md#iteration-303) retains its scope. Actual prepared Windows page additionally passes left/right/middle buttons, captured drag, both wheel axes/directions and held-button blur/detach release [396](history/iterations/351-400.md#iteration-396). Owned Linux canvas additionally passes real object drop and both-axis content scrolling [398](history/iterations/351-400.md#iteration-398). Hard TCP loss retains a remote button; fresh-controller clearing now passes actual owned-XRDP/public-viewer readback and a previous-worker negative control [399](history/iterations/351-400.md#iteration-399). Immediate broken-TCP release is not guaranteed. Arbitrary drop targets and broader handoff remain separate. |
| **P0: Browser Clipboard API ↔ public control ↔ CLIPRDR ↔ Notepad** | The current combined Release/Edge/Windows joint run passes both actual Unicode/multiline OS Clipboard API directions, 61 reads with periodic physical edit/readback, permission refusal, revoke, viewer clearing and joined cleanup [403](history/iterations/401-450.md#iteration-403). Earlier [392](history/iterations/351-400.md#iteration-392) keeps its scope. One prepared-editor focus click is used; post-clear empty application content is not separately observed. Wider direction/quota/isolation fixtures retain their scope. |
| **P0: stable audible output without regular interruptions** | **Accepted for the named combined Release Windows Opus/200 ms scenario** [403](history/iterations/401-450.md#iteration-403): 30-minute joint gate, 1,796.923 rendered seconds, explicit user report of steady sound without regular interruptions. Measured deltas remain: 101 configurations, 22 underflows / 1,664 frames, 151,296 buffering-silence and 66,176 reset-discarded frames; overflow zero. No reset-free/zero-drop/latency or wider-profile claim. Earlier [393](history/iterations/351-400.md#iteration-393) and Debug [390](history/iterations/351-400.md#iteration-390) retain their scope. |
| Lifecycle and bounded resource ownership                                                 | Current startup/deadline [383](history/iterations/351-400.md#iteration-383) and unconfirmed-cleanup capacity [384](history/iterations/351-400.md#iteration-384) checks pass, including actual unconnected native controls. Current owned-XRDP public CPU/RSS failures additionally pass exact errors, terminal channels, denied/retired tokens and joined query/PID/runtime cleanup [397](history/iterations/351-400.md#iteration-397). Total-session budgets and broader connected profiles remain separate.                                                                                                                                                                                                                     |
| 1080p, 30-minute active observation after fixes | The combined-correction worker passes active owned-XRDP H.264 1080p for 30 minutes / 61 observations, bounded queues/RSS, resize/replay and cleanup [401](history/iterations/401-450.md#iteration-401), with audio/Clipboard off. The separate actual Windows joint H.264/Opus/input/Clipboard gate passes 30 minutes / 59 observations and cleanup [403](history/iterations/401-450.md#iteration-403). The earlier static Windows [388](history/iterations/351-400.md#iteration-388), incomplete 26.14-minute attempt [398](history/iterations/351-400.md#iteration-398), short two-account coexistence [398](history/iterations/351-400.md#iteration-398), and historical XRDP [182](history/iterations/151-200.md#iteration-182), [220](history/iterations/201-250.md#iteration-220) retain their scopes. |
| Reproducible supported builds | Combined Windows linked Release CTest 34/34 passes [401](history/iterations/401-450.md#iteration-401); Windows Node 891 / 61 skips and Linux GCC 12 linked Release + IPC addon CTest 35/35, Node 870 / 82 skips pass [402](history/iterations/401-450.md#iteration-402), with exact scope/outer-tool discrepancy retained. Native source matches all 353 tested files [403](history/iterations/401-450.md#iteration-403). Original Release outputs/settings and pins stay unchanged. Earlier [391](history/iterations/351-400.md#iteration-391), [395](history/iterations/351-400.md#iteration-395) retain their evidence. Wider build matrices remain V1 work. |

After stable MVP `v0.1.0`, a separate feature branch accepts the named owned
XRDP 0.10.1 / Windows Release producer / headed Edge Clipboard API ↔ Tk
Unicode/emoji/multiline chain: two new RDP connections, repeated Copy/Get,
actual permission refusal, revoke and PID/runtime cleanup. Full `pnpm check`
passes 900 / 61 skips / 961 total. The Tk fixture explicitly releases its
old CLIPBOARD owner before ordinary Copy. This does not repair old XRDP 0.9.x
surrogate conversion or accept every Linux producer/server/profile.
[Current evidence](history/iterations/401-450.md#iteration-404); the earlier single-read and failed
fresh-connection control remain in [400](history/iterations/351-400.md#iteration-400).

Connection-error evidence includes actual strict certificate refusal
[344](history/iterations/301-350.md#iteration-344), approved session-only activation [346](history/iterations/301-350.md#iteration-346)
and the named controlled transport-loss case [183](history/iterations/151-200.md#iteration-183).
Other public reason mappings and their unit/integration boundaries remain in
[Session API](SESSION_API.md); they are not all remote-server acceptance.

Actual connected Windows CPU/RSS failures, public terminal error/token refusal
and joined PID/runtime cleanup pass their named [RSS](history/iterations/301-350.md#iteration-319) and
[CPU](history/iterations/301-350.md#iteration-320) scenarios. Current linked regression [387](history/iterations/351-400.md#iteration-387)
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
retained. [Exact scope](history/iterations/401-450.md#iteration-402).

The latest joint Windows observation now passes [403](history/iterations/401-450.md#iteration-403). The
preceding attempt stops on a Get after 21 periodic checks / 625,142 ms; its
terminal read status was not retained and its cause remains unknown
[402](history/iterations/401-450.md#iteration-402). The passing repeat does not claim that cause was fixed;
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
