# Practical MVP acceptance

2026-10-21. This is the current delivery subset of SPECIFICATION and TODO, under
the user's revised priority: working browser desktop, clipboard and audio first.
The full v1 requirements and historical evidence remain in [TODO](../TODO.md).
One primary monitor, orientation 0 and 100% scale follow
[ADR-011](adr/ADR-011-single-display-100-percent.md).

| Required behavior                                                                        | Current evidence and remaining acceptance                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API and browser Windows desktop, H.264/JPEG, cursor, resize and attachment replay | Named Windows browser checks pass [352](ITERATION_352.md), [353](ITERATION_353.md). Current combined MVP regression remains to run.                                                                                                                                                                                                                                                                                                                                     |
| XRDP desktop through the same architecture                                               | Current user-requested owned Linux/XRDP stand passes public Edge/current Windows Release producer JPEG/H.264 1080p, cursor, resize/restoration and viewer replay [397](ITERATION_397.md). Historical Linux-producer observations retain their scope. Actual owned Linux drag/drop, content scrolling and blur/detach button release pass through X11 scalar readback [398](ITERATION_398.md), separately from the still-unaccepted Linux CLIPRDR path.                                                                                                                                                                                                                                                       |
| Keyboard, mouse and safe release                                                         | Current public viewer/Notepad exact readback verifies Shift/number entry, Ctrl/Shift/Alt blur release (Alt includes Escape) and held right Ctrl across detach/fresh-token reattachment [394](ITERATION_394.md). Earlier private Unicode/left-button evidence [303](ITERATION_303.md) retains its scope. Actual prepared Windows page additionally passes left/right/middle buttons, captured drag, both wheel axes/directions and held-button blur/detach release [396](ITERATION_396.md). Owned Linux canvas additionally passes real object drop and both-axis content scrolling [398](ITERATION_398.md). Hard TCP loss retains a remote button; fresh-controller clearing now passes actual owned-XRDP/public-viewer readback and a previous-worker negative control [399](ITERATION_399.md). Immediate broken-TCP release is not guaranteed. Arbitrary drop targets and broader handoff remain separate. |
| **P0: Browser Clipboard API ↔ public control ↔ CLIPRDR ↔ Notepad**                    | Named actual headed Edge/current Release/Windows small Unicode/multiline exchange passes both directions, real local Clipboard API, application readback, permission refusal, revoke, viewer-field and joined PID/runtime cleanup in one invocation [392](ITERATION_392.md). One prepared-editor focus click is used. Own-document clear keystrokes follow readback; empty application content is not separately observed. Wider direction/quota/isolation fixtures retain their stated scope. |
| **P0: stable audible output without regular interruptions**                              | **Accepted for the named current Release Windows Opus/200 ms scenario** [393](ITERATION_393.md): three-minute observation, 179.54 rendered seconds, user reports excellent sound. Numeric loss remains: 12 configurations, 11 late intervals, four Worklet underflows and one scheduled consumer reset. No reset-free/zero-drop/latency or wider-profile claim. The Debug comparison [390](ITERATION_390.md) and earlier failures keep their scope. |
| Lifecycle and bounded resource ownership                                                 | Current startup/deadline [383](ITERATION_383.md) and unconfirmed-cleanup capacity [384](ITERATION_384.md) checks pass, including actual unconnected native controls. Current owned-XRDP public CPU/RSS failures additionally pass exact errors, terminal channels, denied/retired tokens and joined query/PID/runtime cleanup [397](ITERATION_397.md). Total-session budgets and broader connected profiles remain separate.                                                                                                                                                                                                                     |
| 1080p, 30-minute active observation after fixes                                        | Current Windows static-desktop H.264 1080p observation passes 30 minutes / 61 samples, resize/replay and cleanup [388](ITERATION_388.md). Audio/Clipboard are off; the initial active owned-XRDP attempt ends without a completion receipt at 26.14 minutes [398](ITERATION_398.md), so no active 30-minute pass is claimed. Two-account short native RDP coexistence/cleanup passes separately. Historical XRDP observations [182](ITERATION_182.md), [220](ITERATION_220.md) keep their scope.                                                                                                                                            |
| Reproducible supported builds                                                            | Current Windows linked Release CTest 34/34 and Node 890 / 51 skips pass [391](ITERATION_391.md); original Release settings/artifacts and dependency pins stay unchanged. Fresh Linux GCC 12 linked Release + IPC addon CTest 35/35 and Node 863 / 81 skips pass [395](ITERATION_395.md), using bound reused native inputs with the original missing test-CLI failure retained. Actual current Linux/XRDP desktop and wider build matrices remain separate. |

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

Next: current XRDP desktop/content-scroll evidence and an active 30-minute
observation. Preserve the accepted audible scenario and its visible numeric
discontinuity limitations.
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
