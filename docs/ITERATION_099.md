# Iteration 99 — guarded AUDIN DVC callback

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after negotiation ingress `b94a3a4`.

AudinDvcGate now places limits before the actual linked AUDIN parser, checks
ordered negotiation replies and requires one exact checked Incoming/Data pair
per PCM pump. Readiness follows both Open replies and a fresh capture epoch.
No-common-format is handled without upstream zero-table parsing. Failed/missing /
throwing writes and malformed ingress stop capture; reentrant teardown cannot
destroy borrowed bytes/callbacks. Owner retirement preserves the wrapper for
delayed host OnClose.

Nine new actual linked AUDIN/fake-DVC cases pass **449 assertions**, including
maximum 4,800-frame/19,201-byte PCM and exact partial silence padding. AUDIN now
has **23 cases / 2,761 assertions**. Initial compilation exposed a missing public
rdpContext definition include; it was added and the rebuild passed. Final bundled
CTest passes **17/17**, foundation **6/6**, /W4 /WX, MSVC /analyze and clang-format
pass. Full bundled `pnpm check` passes **276/276** Node cases without skips.

The plugin/listener owner and top-level provider selection remain pending; the
worker continues to reject microphone activation. No host/browser/remote capture
was used. Earlier drdynvc allocation/lost-write behavior, same-plugin reopening,
cadence/resource limits, IPC/control/browser permission/capture and actual LAN /
microphone acceptance remain open. [Contract](AUDIO_AUDIN_DVC.md).
