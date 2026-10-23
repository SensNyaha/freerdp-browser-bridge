# Iteration 90 — isolated Opus delivery and native recovery authority

Date: 2026-10-11. Implements SPECIFICATION §2.6, MEDIA_PIPELINE §6 and ADR-008 after
private reset capability `376ed90`.

The preparatory sender shares one audio sequence/credit across metadata and
compressed data, owns at most one 1275-byte packet and preserves original encoded
bytes, PTS and flags. Ready snapshot or occupied unsent packet requests native
epoch recovery, drops skipped predictive history and preserves issued ACK credit.
A new source epoch clears recovery; config/native-marked data resumes thereafter.
Finite recovery/ACK deadlines, strict source/parser and cleanup/reentry rules pass.
No public activation, new wire schema, native codec or PCM behavior is changed.

Seven new unit cases and one fake-private worker handoff pass; narrow sender/PCM
checks total **15/15**. The handoff covers issued old status ACK through a real
private IPC reset request/result and subsequent fake source epoch/config/data.
These are framing/lifecycle fixtures with a logical receiver clock, not Opus
entropy, WebSocket/browser or actual audible RDP acceptance. Initial test import
was corrected to use the existing state payload decoder.

Full `pnpm check` passes **254/254** with no skipped tests; strict TypeScript,
lint, format and `git diff --check` pass. Native code is unchanged; rerunning the
existing binaries gives bundled CTest **16/16** and foundation **6/6**, without
rebuilding/replacing DLLs during Node verification. Actual XRDP idle PCM/Opus
evidence remains Iteration 89.
Public compressed negotiation/lease/recovery/browser activation, actual ready-source
reset and audible sound/microphone, resources/platforms/LAN/A/V/soak remain open.
[Contract](AUDIO_OPUS_DELIVERY.md).
