# Iteration 133 — one selected PCM/Opus owner-thread handoff

Date: 2026-10-12. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after compensation `45cd044`. CaptureHandoff now selects one
immutable PCM/default or Opus profile and allocates exactly one corresponding
heap slot. Typed callbacks share arrival deadlines, source checks, correlated
completion and borrow/retirement rules. No SDK or FreeRDP call runs on producer.

Focused portable handoff tests pass **8 cases / 8,323 assertions**, including
four new Opus cases. A new actual native-SDK/PCM-source case passes **33
assertions**, covering initial priming, exact queue PCM, reset versus queued
old input, fresh epoch and shutdown drain. The source is synthetic and no RDP
channel or microphone is accessed. Native /analyze /WX and formatting pass.

Full `pnpm check`: **420/420** pass; CTest bundled **17/17**, foundation **6/6**
pass. Combined native Opus tests pass **14 cases / 79,901 assertions**.

Restored authorized XRDP/API/Edge H.264 regression passes: **50 frames at
1920×1080**, shape/motion/replay, reattachment and graceful cleanup. Explicit
PCM microphone selection replays waiting source revision 1 / epoch 0. Owner
permission requests, graph/physical capture and offered/sent PCM remain zero.
The existing lab guard sends only one motion and one reset; no keys/buttons/
wheel/touch, remote application or sound generation occurs. This is desktop /
waiting-source regression, not ready AUDIN or remote recording acceptance.
Local ignored evidence: `build/iteration-133-xrdp-viewer.log`.

PCM
worker behavior is retained; no Opus microphone kind, config, capability,
permission or public selection is activated. Worker dispatch and all actual
AUDIN/device/resource/platform/LAN/soak acceptance remain open.

[Handoff contract](AUDIO_CAPTURE_HANDOFF.md),
[compensation](MICROPHONE_OPUS_CAPTURE.md).
