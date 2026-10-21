# Practical MVP acceptance

2026-10-21. This is the current delivery subset of SPECIFICATION and TODO, under
the user's revised priority: working browser desktop, clipboard and audio first.
The full v1 requirements and historical evidence remain in [TODO](../TODO.md).
One primary monitor, orientation 0 and 100% scale follow
[ADR-011](adr/ADR-011-single-display-100-percent.md).

| Required behavior                                                                        | Current evidence and remaining acceptance                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API and browser Windows desktop, H.264/JPEG, cursor, resize and attachment replay | Named Windows browser checks pass [352](ITERATION_352.md), [353](ITERATION_353.md). Current combined MVP regression remains to run.                                                                                                                                                                                                                                                                                                                                     |
| XRDP desktop through the same architecture                                               | Historical actual browser checks [202](ITERATION_202.md) and Linux producer observation [220](ITERATION_220.md) pass. The current endpoint is Windows; a current XRDP repeat needs a separate available endpoint.                                                                                                                                                                                                                                                       |
| Keyboard, mouse and safe release                                                         | Named private Notepad Unicode/physical-key/left-button checks pass [303](ITERATION_303.md). Public browser application input, wheel/drag and held-input disconnect still need actual acceptance.                                                                                                                                                                                                                                                                        |
| **P0: Browser Clipboard API ↔ public control ↔ CLIPRDR ↔ Notepad**                    | Named actual headed Edge/current Release/Windows small Unicode/multiline exchange passes both directions, real local Clipboard API, application readback, permission refusal, revoke, viewer-field and joined PID/runtime cleanup in one invocation [392](ITERATION_392.md). One prepared-editor focus click is used. Own-document clear keystrokes follow readback; empty application content is not separately observed. Wider direction/quota/isolation fixtures retain their stated scope. |
| **P0: stable audible output without regular interruptions**                              | **Accepted for the named current Release Windows Opus/200 ms scenario** [393](ITERATION_393.md): three-minute observation, 179.54 rendered seconds, user reports excellent sound. Numeric loss remains: 12 configurations, 11 late intervals, four Worklet underflows and one scheduled consumer reset. No reset-free/zero-drop/latency or wider-profile claim. The Debug comparison [390](ITERATION_390.md) and earlier failures keep their scope. |
| Lifecycle and bounded resource ownership                                                 | Current startup/deadline [383](ITERATION_383.md) and unconfirmed-cleanup capacity [384](ITERATION_384.md) checks pass, including actual unconnected native controls. Connected failure cleanup and combined MVP resource behavior remain to verify.                                                                                                                                                                                                                     |
| 1080p, 30-minute combined observation after fixes                                        | Current Windows static-desktop H.264 1080p observation passes 30 minutes / 61 samples, resize/replay and cleanup [388](ITERATION_388.md). Audio/Clipboard are off; a combined interactive/audio/clipboard gate remains open. Historical XRDP observations [182](ITERATION_182.md), [220](ITERATION_220.md) keep their scope.                                                                                                                                            |
| Reproducible supported builds                                                            | Current linked Debug output is receipt-bound [378](ITERATION_378.md); current linked CTest 34/34 and Node 890 / 51 skips pass [387](ITERATION_387.md). Release and dependency pins stay unchanged. Docker access is restored. Fresh Linux GCC 12 foundation CTest 18/18 and Node 766 / 178 skips pass [389](ITERATION_389.md), with the separate receipt-export failure/control retained. Current linked Linux and RDP remain separate from this base-platform pass.    |

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

Next: real basic input/release checks; current platform evidence and one combined
30-minute observation. Preserve the accepted audible scenario and its visible
numeric discontinuity limitations.
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
