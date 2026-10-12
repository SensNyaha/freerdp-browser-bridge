# Selected Opus microphone admission

Iteration 138 implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after typed
private worker activation `d7e0ee7`. This block does not enable public session/media/browser
capture. The existing PCM admission contract remains the default.

One ingress chooses PCM or Opus at construction and owns exactly one sample
slot: 3,840 bytes for PCM or 1,275 compressed bytes for Opus. The matching
RWB1 grammar is checked before copying. Valid wire attempts consume sequence
even when busy/refused. One backend operation borrows only owned storage until
settlement, then the entire slot is wiped. Closing revokes synchronously and
joins that operation before native reset/termination by the enclosing owner.

Opus requires a first discontinuity, exact 20 ms predictive PTS continuity and
unchanged lookahead until another discontinuity. Discontinuous timestamps must
still advance relative to accepted input. A valid new attempt that is busy or
otherwise refused, or a skipped sequence, interrupts prediction: subsequent predictive input cannot
silently continue. An accepted discontinuity repairs continuity only if no
newer interruption occurred while it was in flight. Replayed sequences never
become fresh input and no refused packet is retried.

Permission/control/media authorization and normalized PCM source authority are
checked before submission and again after completion. Source/epoch changes
suppress late acceptance; metadata/backend faults close admission without
exposing diagnostic/sample data. Capture acceptance remains private source
admission rather than remote recording acknowledgement. SDK entropy decoding
is native; Node carries only compressed samples in Opus mode.

Nineteen portable PCM/Opus/ownership cases and one synthetic process/private
IPC projection case pass. The Opus cases cover min/max copied storage, immutable
profile/callback selection, frozen metadata, wipe after drain, busy during a
pending discontinuity, sequence/PTS/lookahead boundaries, typed refusals,
new epoch suppression, malformed/wrong records, reentrant close and backend
faults. Synthetic IPC confirms drain/reset/fresh epoch before replacement input.
They do not establish actual ready AUDIN, permission or remote recording.
Public lease/WS/encoder/capture selection, actual AUDIN/device/LAN/platform /
resource/failure injection and soak acceptance remain open.
