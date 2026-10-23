# Iteration 119 — explicit PCM microphone media negotiation

Date: 2026-10-11. Implements SPECIFICATION §2.6 / PROTOCOL §6 /
MEDIA_PIPELINE §7 after bounded adapter `72003cd`.

An additive explicit PCM microphone selector activates the bounded media adapter.
Ready confirms fixed profile/deadlines; source/grant state and explicit start/stop
are independent of video/output audio credit. Legacy media omits all microphone
records. Existing WSS 4 KiB preallocation and outgoing limits stay unchanged.
Only selected microphone media gets 160 total messages/s with 16 microphone
commands/s checked before mutation. Neither hello nor source readiness grants input.

Six actual loopback WebSocket cases with explicit fake RDP backends pass; combined
socket/adapter focus passes **13/13**. They cover explicit grant/no-controller,
native-barrier projection, controller replacement/late ACK, video credit,
selection/legacy refusal, 4,097-byte preallocation refusal and 160/s flood bounds.
PCM and opaque JPEG are synthetic; no actual RDP desktop, rendering, browser
permission or physical microphone is involved. This burst budget test does not
establish simultaneous 50 Hz input/output plus video or LAN latency acceptance.
Normal native microphone creation remains refused before spawning.
Full bundled `pnpm check` passes **346/346**, without skips. Unchanged bundled
CTest passes **17/17**, foundation **6/6**. Formatting and diff checks pass.

Native selection, viewer permission/capture/resampling/Opus input, real ready-source
reset, remote/physical/LAN/platform and upstream core/lost-write gates remain open.
[Current contract](MICROPHONE_SOCKET.md).
