# Iteration 93 — bounded Opus socket reset orchestration

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §6 after fixed
managed profiles `4d22aa8`.

Preparatory installOpusMedia connects compressed sender recovery to the current
media lease's native reset. One pending promise and a 100 ms retry floor remain
within the sender's two-second deadline. Scheduled replies grant no invented media;
actual new-epoch events are required. Existing in-flight ACK is preserved. Close,
late completion and invalid backend results retire bounded route ownership.

Seven new socket-owner cases and the existing PCM cases pass **10/10** narrow
checks. Full bundled `pnpm check` passes **271/271** Node cases without skips;
existing native bundled CTest passes **16/16**, foundation **6/6**. Native wire /
implementation is unchanged. Public Opus selection /
negotiation remains gated. No actual WebSocket/browser/audio acceptance is claimed
by these synthetic socket fixtures. [Contract](AUDIO_OPUS_SOCKET.md).
