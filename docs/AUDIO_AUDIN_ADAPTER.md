# Public virtual microphone device adapter

Current update — iteration 102: guarded registration/cadence and native capture
reset are implemented. Reset advances the input epoch without replacing the
open callback. Worker/browser activation remains pending.
[Reset contract](AUDIO_CAPTURE_RESET.md).

Iteration 96 (2026-10-11) targets the exact public FreeRDP 3.32.1 IAudinDevice /
AudinReceive ABI for SPECIFICATION §2.6, ARCHITECTURE §5 and MEDIA_PIPELINE §7.
AudinSource wraps the [bounded capture source](AUDIO_CAPTURE.md); it is not yet
registered with AUDIN or linked into the worker. Microphone remains unsupported.

Only consistent PCM16 48 kHz mono/stereo without extra-format data is accepted.
SetFormat copies the descriptor, accepts 1..4,800 frames per callback and refuses
changes while open. Open requires a configured source and non-null receiver/user
data; every successful open reserves a strictly newer nonzero input epoch.
Close clears receiver ownership and wipes queued/scratch samples. Old epoch input
cannot be replayed after reopening. Output audio epochs remain independent.

The serialized RDP owner supplies normalized capture packets and calls pump at
the negotiated cadence. There is no host microphone, background thread, timer,
wait or automatic catch-up burst. Each pump borrows one bounded capture block,
including exact-length silence when buffering/underflow requires it. The receiver
must consume/copy those bytes before returning; callback duration and upstream
channel writes are not bounded by this device alone.

Mutation/reentrant pump is refused during the receiver callback, so nested Close,
Free, Open, SetFormat, submit or retire cannot invalidate borrowed sample bytes.
Receiver failure/exception is converted to a checked error, clears the receiver
and wipes samples after the callback returns. It is not retried automatically.
Lifetime counters saturate and retain metadata only.

Device calls before retirement require the constructing owner thread. Retire
must run there before joining it, destroys capture resources and keeps the ABI
wrapper alive. Later host Close/Free can run on another thread and are idempotent.
The external owner must keep the wrapper alive until host termination finishes;
this is not a concurrently mutable device or a self-deleting callback object.

Six public-ABI callback fixtures cover supported/invalid formats, copied format
ownership, mono samples, silence, reopen/stale epochs, callback reentrancy/errors
and delayed foreign-thread Free. They use synthetic PCM and a fake receiver, not
the actual linked AUDIN channel, browser capture, hardware or remote microphone.
Guarded provider/DVC negotiation, earlier format/DSP allocation limits, worker
scheduling/IPC, browser permission/resampling and real LAN acceptance remain open.

Pinned source audit: audin_open_device's fallback recomputes block alignment but
does not recompute average bytes/second when changing sample rate/channel count.
This strict device can refuse that inconsistent fallback. The future channel
guard must negotiate consistent supported PCM directly; compressed format/DSP
fallback is not established by these fixtures. audin_receive_wave_data returns
success while detached, so real delivery requires separate transport readiness.
