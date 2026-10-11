# Native audio session codec ownership

Iteration 80 (2026-10-11) implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6
within the existing serialized `AudioSession` lifecycle. A final optional native
constructor argument selects `OutputAudioCodec::pcm` (default) or `opus` once.
Unknown values are rejected before provider binding.

One RDPSND sink, static gate and provider remain shared. Exactly one heap-owned
publisher is created: PCM or the bounded Opus owner. Default PCM does not create
an Opus encoder object. The channel still negotiates only guarded supported PCM
source formats; Opus compresses the already normalized browser output and does
not widen upstream RDPSND codec/DSP exposure. One fixed output queue/dispatcher
must be selected to the matching profile before callbacks publish records.

Pump and retirement use the same thread/reentrancy, monotonic clock, finite
deadline, source-stop, unsent-discard and completion-drain rules for both codecs.
Common PublisherStats remain available; native diagnostics additionally expose
only selected codec, saturating encoded packet count and bounded retry byte count.
No PCM or compressed bytes, PTS, identifiers or secrets are added to diagnostics.
The wrapper and source still outlive delayed host TERMINATED and final context
teardown after resources retire.

The worker continues using the default PCM constructor. It now links the private
codec provider, whose DLL is already in the native bundle, but no HELLO flag,
settings schema, private Node selection or public Opus mode is activated here.
Packaging relocation verifies startup with the dependency PATH removed.

Actual pinned static RDPSND / simulated SVC fixtures feed Wave2 into the selected
Opus owner, verify codec-1 source/config, a stereo 960-frame packet, matching epoch /
PTS/accounting, and Close while cancelled confirmations drain. Repeated terminal
retirement stays idempotent, provider restoration passes, and caches remain
cleared. Unknown mode and default PCM zero-codec counters are checked separately.
These are actual linked channel fixtures, not audible remote RDP acceptance.

Production codec selection through IPC, typed Node forwarding and public browser
negotiation remain open, alongside microphone, audible RDP, loss fidelity,
resource/platform/latency, A/V scheduling and soak gates.

## Native worker profile wiring (Iteration 84)

On guarded Windows builds, raw private CONFIGURE schema 6 now selects the
output dispatcher once before configuration acknowledgement and selects the
matching AudioSession publisher on the RDP thread. The bounded startup selection
waits at most 50 ms for producer mutex contention; duplicate configuration cannot
switch an active profile. Unsupported builds refuse either audio output mode.

Both modes declare the same guarded static RDPSND descriptor and accept only
the existing bounded PCM source formats. Opus does not enable an upstream
compressed RDPSND format or host audio device. Existing audio-first pump,
20-ms event wait, finite retirement and provider lifetime apply unchanged.

HELLO/CLI and high-level Node/public Opus selection are deliberately unchanged
in this block. Raw native tests cover configuration selection and strict local
TLS refusal, with a codec-1 Close record and healthy control after retirement.
This is native lifecycle integration against a synthetic TLS endpoint, not
audible RDP or public Opus acceptance.
