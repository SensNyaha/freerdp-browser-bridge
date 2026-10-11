# Bounded virtual microphone PCM source

Current update — iteration 101: scheduled public AUDIN polling now drops bounded
old queued PCM after missed callbacks without reading silence. Public device,
provider and guarded plugin foundations are implemented; worker/browser capture
remains pending. [Cadence contract](AUDIO_CAPTURE_CADENCE.md).

Iteration 95 (2026-10-11) implements the isolated source foundation for
SPECIFICATION §2.6 / ARCHITECTURE §5 / MEDIA_PIPELINE §7. It does not access a host
microphone, register AUDIN, expose wire input or advertise microphone support.
The public FreeRDP 3.32.1 IAudinDevice/AudinReceive contract is the target adapter
ABI; adapter, guarded DVC registration, worker/IPC/control/browser capture and
permission ownership remain future work.

Browser-normalized input is exactly 960 S16LE stereo 48 kHz frames (3,840 bytes).
PcmCaptureSource copies into the existing fixed 5,760-frame/120 ms PCM queue.
Overflow skips exactly the oldest excess frames before admitting fresh input;
there is no seconds-long FIFO and no per-call allocation. Its output projection
supports only PCM16 48 kHz mono/stereo with 1..4,800 frames/callback (100 ms max).
Mono averages signed stereo in 32-bit arithmetic, truncating toward zero. Rates
requiring resampling, wider formats and larger callback budgets are unsupported.

Configure is refused while active. Start requires configured projection and a
strictly increasing nonzero u64 input epoch; exhaustion cannot wrap. Every packet
must match that epoch, fit the exact input size and have a bounded timestamp.
First input must mark discontinuity. Subsequent capture times strictly increase;
ordinary packets advance exactly 20 ms, while an explicit discontinuity permits
a forward gap and clears old queue history. Stale/malformed/replayed packets
leave sample ownership and the accepted capture clock unchanged. A new epoch
reserves a fresh browser capture-clock domain; old packets remain stale.

Reads never wait. Prebuffer is max(40 ms, configured callback frames), at most
100 ms. Before prebuffer completion, callbacks receive exact-length silence while
queued fresh frames remain intact. Active underflow pads exactly the missing
frames, counts it and starts rebuffering; the next real block has a discontinuity
boundary. Buffering silence is counted separately from active underflow. Capture
caller determines polling/cadence; this foundation adds no thread or timer.
Returned bytes borrow fixed heap scratch. Stop wipes scratch and queue, retires
the epoch and makes reads/submits inactive. Lifetime counters saturate and do not
contain payloads, credentials or target labels.

Six pure native cases cover format/size/generation boundaries, atomic refusal,
prebuffer/gap/underflow/reset, signed mono extrema, partial callback padding and
an independent newest-data FIFO model through sustained burst/wrap. These are
synthetic capture samples, not public AUDIN, hardware/browser microphone or remote
acceptance. Worker/provider/core-DVC/DSP limits, Opus input, browser permission /
resampling, real microphone and LAN latency remain open.

Pinned source audit: audin_main allocates a server-format table (up to 1,000)
before device FormatSupported; SetFormat runs before DSP reset/Open, and
AudinReceive may resize an upstream stream or encode through DSP. A future
public backend alone cannot establish bounds on earlier channel allocations or
compressed server formats. Negotiation/ingress and DSP allocation audits are
required before claiming a guarded microphone capability.
