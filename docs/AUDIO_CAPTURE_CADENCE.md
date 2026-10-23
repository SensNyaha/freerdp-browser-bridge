# Bounded AUDIN capture cadence

Current update — iteration 107: MicrophoneSession selects 480..4,800-frame
callbacks, refuses smaller Open requests with a checked HRESULT and allows a
compatible retry. Native compatibility fixtures still retain 1-frame support.
Worker wakeup/CPU integration remains open. [Profile contract](AUDIO_AUDIN_PROFILE.md).

Current update — iteration 102: native capture reset preserves the negotiated
receiver with a fresh epoch, and deadline snapshots require matching source /
cadence epochs. [Reset contract](AUDIO_CAPTURE_RESET.md).

Iteration 101 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7. CaptureCadence is a portable, serialized 48 kHz callback
clock; AudinDvcGate.tick applies it to the actual public AUDIN path. No worker
activation, wire change, timer, thread or host/browser capture is added.

Start requires a fresh nonzero input epoch and 1..4,800 frames. The first poll
may emit immediately; subsequent deadlines retain exact sixth-microsecond phase
(125/6 microseconds per sample frame), rounded upward only for an integer-clock
poll. Both fractional and integer periods preserve the original cadence without
accumulating rounding drift. The caller uses a monotonic microsecond clock on
the RDP owner; backward observations fail instead of replaying samples.

Each due poll produces at most one callback opportunity, with constant arithmetic
work and no catch-up loop. It advances directly to the earliest future deadline
and reports missed sample frames. Division precedes multiplication across the
full u64 clock range. Unrepresentable future deadlines exhaust the clock without
wrapping or emitting another callback. Lifetime counters saturate; callbacks
counts due opportunities, not successful writes or remote consumption.

The gate starts a new cadence when successful Open/FormatChange advances the
source epoch. Waiting polls do not touch PCM or call upstream. Due polls discard
up to the missed frame count from the bounded queue, then invoke exactly one
checked Incoming/Data pair. Discard is capped to queue capacity and does not
read/count silence. Emptying the queue returns to prebuffering; stale input
epoch/time validation is unchanged. This conservative stall policy can discard
fresh queued input after a long pause; capture-to-worker clock/latency acceptance
remains open. Backward/exhausted clocks and transport failures stop capture.

Foreign and reentrant ticks are inactive without modifying cadence or queue.
Owner-only deadline/counter snapshots contain no payload. Close/retire removes
the deadline. Manual pump remains available for native ABI fixtures; production
must use scheduled polling and supply a finite callback/CPU policy. In particular,
the foundation's 1-frame format compatibility does not establish a sustainable
48,000-callback/s worker profile. Production negotiation/polling budgets, wakeup
integration and earlier core lost-write/resource limits remain pending.

Portable tests compare rational and delayed deadlines to independent absolute
timelines, cover all integer boundaries used by this profile and prevent bursts.
Linked AUDIN/fake-DVC fixtures cover exact fresh PCM after a stall, changed mono
format/fresh epoch, failed writes, backward clocks and foreign/reentrant calls.
They use synthetic samples/silence. Worker/IPC/browser permission/capture,
resampling/Opus input and actual microphone/LAN acceptance remain open.
