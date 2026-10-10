# Native PCM foundation

Implements the first isolated part of SPECIFICATION §2.6, ARCHITECTURE §5 and
Stage 6. The worker does not yet register an audio backend or advertise playback.
No audio IPC or public wire layout changes in this block.

`native/audio/pcm.hpp` accepts unsigned PCM8 or signed little-endian PCM16,
one or two channels, and integer rates from 8,000 through 48,000 Hz. It emits
interleaved signed S16LE stereo at 48,000 Hz. Mono is duplicated; stereo order
and signed PCM16 extremes are preserved. Float, wider samples, more channels and
rates above 48 kHz are explicitly rejected. Higher-rate conversion requires an
antialiasing downsampler and remains open; this is not complete format coverage.

Upsampling uses linear interpolation with an integer rational phase carried
between aligned packets. The first source sample is emitted immediately. An
interval is emitted only once its next source endpoint is known; no synthetic
end-of-stream tail is appended. With N source frames, the total output is
`1 + floor((N - 1) * 48000 / inputRate)`. Splitting source frames between packets
does not change output bytes. Interpolation division truncates toward zero.
This is a baseline correctness path; production quality/Opus integration remain.

The normalizer allocates one fixed 19,200-byte output buffer at construction.
Processing allocates no memory. Input is bounded to 65,536 bytes and must contain
whole source frames. A call may emit at most 4,800 stereo frames (100 ms). Complete
output size and cumulative frame count are checked before reading source samples
or changing phase/history. Invalid or over-capacity packets return an empty result
and preserve stream state. Callers must handle rejection without blocking the RDP
loop; no implicit slicing, queue or retry exists here.

One serialized owner operates the instance. Returned bytes borrow the fixed
buffer until the next process, reset, successful configure or destruction; a
consumer must copy into bounded storage before another call. Invalid configure
preserves the previous format/state. Successful configure and explicit reset
discard interpolation history and reset the frame counter. Reset keeps the format.
Reconnect, format changes and loss require explicit discontinuity handling in the
future pipeline. There is no thread synchronization or host audio-device access.

Portable tests cover independent sample vectors, signed extremes, packet
fragmentation, a ten-second rational clock, bounds, rejection atomicity and reset.
See [iteration 36](ITERATION_036.md). These tests do not prove RDPSND negotiation,
remote audible output, browser playback, microphone support or LAN queue latency.

## Bounded PCM handoff queue

`native/audio/queue.hpp` stores normalized S16LE stereo in one fixed 23,040-byte
ring: 5,760 frames, exactly 120 ms at 48 kHz. Push/read calls accept only nonempty
whole frames and at most 4,800 frames each. Storage is allocated once. Calls have
no waits, synchronization or allocations; one serialized owner must operate the
queue. This is a local handoff primitive, not an end-to-end jitter/latency guarantee.

Push copies borrowed normalizer output into owned storage. A full queue rejects
the entire incoming packet, preserves prior samples and increments dropped packet
and frame counters. Invalid input does not change the backlog. The future pipeline
must explicitly handle this loss, including a discontinuity/reset policy; queue
overflow does not silently splice timestamps or claim delivery. The queue carries
no timestamps, sequence numbers, network retry or codec state.

Read copies available FIFO frames into caller-owned storage and zero-fills a
shortage. It reports actual frames and silence separately. Invalid destinations
are unchanged. Silence never consumes source frames. The first nonempty read after
construction/reset reports discontinuity; empty silence reads preserve this marker.
An underflow alone does not reset interpolation or the queue. Reset discards queued
frames, clears storage and restores the marker. Lifetime counters and high water
are retained, with saturating 64-bit counters to avoid rollover.

Local snapshots expose accepted/consumed/silence frames, discarded packets/frames,
reset discards, invalid calls, underflow count, queued frames and high water. No
public session metrics are yet published. [Iteration 37](ITERATION_037.md) verifies
ring wrap, atomic overflow, silence, reset, randomized FIFO equivalence and copying
the normalizer's borrowed output before reuse.

## Public RDPSND device adapter

`native/audio/rdpsnd_sink.hpp` implements the pinned public
`rdpsndDevicePlugin` callback ABI over the normalizer and queue. It is compiled
only with FreeRDP and is not yet registered by the worker. `AudioPlayback` remains
disabled and no browser/host playback capability is advertised. Nothing routes
audio through a host sound server or physical audio device.

FormatSupported/Open require consistent PCM tag, rate, channels, width, block
alignment and average byte rate, without extra format data. Open resets the
pipeline; failed Open leaves its existing state intact. DefaultFormat constructs
PCM16 at the desired source rate/layout with no borrowed extra data. This tests
the conversion descriptor only; compressed codec decoding/negotiation is not
verified. Actual registration must enforce supported format negotiation and audit
upstream buffers before enabling audio.

The adapter uses legacy Play, interpreting bytes in the format supplied to Open.
Pinned rdpsnd passes its original server format to PlayEx even after DSP decode;
PlayEx is deliberately absent to avoid interpreting decoded bytes using compressed
sample widths. Play's return value is queued latency in milliseconds, rounded up,
bounded to 120 ms. It is not a Win32 status or evidence of audible delivery.

Packed 16-bit left/right volume gains are applied to normalized signed samples
before enqueue, using 64-bit multiplication and division by 65,535. Full gain is
identity; zero is silence. This adds one fixed 19,200-byte scratch buffer to the
pipeline. No callback allocates. Malformed/over-capacity input counts a rejection
and resets interpolation/backlog. Queue overflow counts the drop, resets the
pipeline and marks recovery as discontinuous. The adapter reports these events
through local snapshots, not wire errors or public metrics.

Callbacks and reads require the construction/RDP thread. Foreign-thread calls
refuse without accessing the mutable pipeline. Registration must request
synchronous static/dynamic channels as appropriate; this adapter does not configure
an upstream channel itself. Close resets the stream and permits reopening. Retire
must run on the owner before joining, frees all pipeline storage and atomically
publishes a terminal state. The small device wrapper must outlive the host's Free;
Free retires on the owner, or becomes an idempotent no-op after retirement on any
thread. Concurrent destruction/callbacks are forbidden. A premature foreign Free
cannot retire live owner resources.

[Iteration 38](ITERATION_038.md) exercises callbacks through public API pointers.
These are native ABI/lifecycle fixtures, not actual RDPSND channel, server or
browser integration. Worker registration, IPC scheduling and end-to-end audio
remain open.

## Scoped RDPSND backend loading

`native/audio/rdpsnd_provider.hpp` scopes the exact `rdpsnd` / `browser` device
entry ABI. It accepts the pinned static ENTRYEX or dynamic device entry selector,
refuses other ABI/type requests with a non-null rejection entry, and delegates
other addins to the previously installed provider. This is not an allowlist for
all channel classes or a general plugin security policy. The worker does not yet
select this backend or enable audio.

Bind requires an existing context, the sink owner thread, synchronous static and
dynamic channels, and disabled async channels/update. Create contexts before
binding: the pinned client context constructor replaces the process-wide provider.
One audio provider scope is allowed per process, with no concurrent provider/context
changes. If composed over another scoped provider, close in reverse binding order.

Entry resolves the actual opaque plugin's context through public
`freerdp_rdpsnd_get_context`, requires the bound context, and calls public device
registration once. The host registration callback returns void. The adapter checks
the assigned public device `rdpsnd` pointer but cannot prove arbitrary host behavior.
An uncertain/refused/throwing registration is never retried. No private plugin
layout is inspected. The scope closes by retiring sink resources before restoring
the previous loader. A foreign replacement is preserved and reported as a broken
scope contract. Sink/context lifetimes must cover the host's final callbacks.

[Iteration 39](ITERATION_039.md) uses the actual pinned static RDPSND entry with a
fake public SVC transport. It negotiates PCM, dispatches Wave2 through upstream to
the sink, checks exact PCM and wave confirmations, and exercises teardown. This is
actual linked channel integration with simulated transport, not actual remote RDP
or browser audio. Dynamic RDPSND dispatch remains unverified.

Two pinned upstream boundaries remain open before worker audio activation:

- Static channel fragment reassembly uses StreamPool/stream growth before backend
  Play limits; compressed decode can allocate before Play too. A backend size cap
  does not protect those allocations. No oversized malicious allocation test is
  run and no dependency source/pin is changed in this block.
- SNDC_CLOSE only logs in the pinned implementation; it does not invoke device
  Close. Play has no server timestamp argument. The actual-channel fixture records
  that queued PCM remains after this PDU. Packet-clock/discontinuity handling must
  cover gaps/close explicitly before claiming reset behavior for remote streams.

These gaps, compressed format negotiation, attach/reconnect, end-to-end queue
budget and audible playback are not resolved by a successful PCM callback fixture.

## Bounded audio ingress foundation

`native/audio/ingress.hpp` assembles an SVC record into one fixed 65,536-byte
buffer. Advertised total size is checked before copying any fragment. It validates
first/continuation ordering, identical totals, remaining capacity, exact last
completion and at most 4,096 fragments (including empty ones). Empty final fragments
are allowed when the record is already complete. Invalid input poisons assembly
until explicit connection reset; no ambiguous record is retried. Completed bytes
borrow storage until the next operation. One serialized owner maps transport flags;
the primitive does not interpret suspend/compression/other SVC flags itself.

The allocation-free PDU validator checks complete bounded records before upstream
format allocation: at most 64 descriptors, each with at most 1,024 extra bytes,
complete descriptor/extra bounds and no trailing bytes. It accepts baseline
Formats, Training, SetVolume, Close, legacy WaveInfo/raw Wave pairs and Wave2.
Other PDU types are explicitly unsupported; encrypted variants/pitch and further
negotiated extensions remain open. It checks exact body length except legacy
WaveInfo, where BodySize also describes the following raw Wave. A pending raw Wave
must have exactly the declared size and arrives before another PDU.

Metadata exposes format count/index, block, raw sample size and the original
16-bit Wave or 32-bit Wave2 timestamp field. It does not unwrap clocks, interpret
decoded sample widths, check negotiated format-index membership or reset the sink
on Close. Invalid records poison validation until reset. No per-record allocation,
codec decode, IPC or timestamp scheduling occurs here.

[Iteration 40](ITERATION_040.md) places these primitives ahead of the actual
linked RDPSND plugin in the fake SVC host. Normal fragmented Wave2 and legacy Wave
dispatch pass; giant advertised record/count values are refused without calling
upstream. This proves the primitives and test-host placement. A production public
SVC callback adapter is still needed: the worker does not install this guard, and
earlier RDP/core or compressed DSP allocations are not protected by it. The audit
gaps above remain open until placement/format policy and real integration pass.

## Public static-channel callback adapter

`native/audio/static_gate.hpp` wraps the pinned public static channel entry points
and event callbacks. It translates opaque init handles and callback user data;
only its own wrapper pointers are cast, never an upstream private struct. The
public context/magic/size, complete host functions, synchronous static profile and
single owner are checked before installation. The native library is not selected
by the worker or the process-wide provider's top-level RDPSND entry yet.

Incoming DATA events are assembled/validated within the limits above before
calling the actual RDPSND callback, as one bounded complete record. FIRST/LAST and
SHOW_PROTOCOL are supported; other raw flags are refused. Suspend/resume must be
isolated empty transitions at a complete record boundary, with no legacy raw Wave
pending. A split-record/pair transition fails explicitly rather than desynchronizing
the downstream parser. Accepted transitions reset PCM history/backlog while keeping
an open sink usable. Validated SNDC_CLOSE similarly resets the sink before upstream
sees the PDU. This resolves the previously observed no-Close-callback boundary for
this adapter, not for unwrapped channels or timestamp gaps without Close.

Unknown/malformed records and reentrant data/lifecycle calls fail the channel with
a fixed diagnostic. No bytes/identity are logged. Known native write completions
can be processed during dispatch; nested data or retirement cannot replace borrowed
buffers or destroy active delegates. Foreign-thread data is ignored. Callback
ownership is serialized; concurrent destruction/callbacks are forbidden.

The adapter tracks at most 64 outgoing opaque write-completion tokens. The host
owns those streams until its completion/cancellation callback. Unknown tokens or
wrong handles are rejected without forwarding/dereferencing them. A host write
failure after an already-delivered completion is reported without returning a
second-free status to upstream. A failed write before completion removes its token
so upstream can free its rejected stream. No host-owned stream is freed directly.

Retire requests upstream disconnect/close on the owner. Outstanding completions
return `ERROR_IO_PENDING`; the future worker must keep pumping within a bounded
deadline, then retry or terminate the session process on unresolved host failure.
An unclosed host handle cannot imply detachment or successful retirement. After
the host has completed its bounded writes, retirement terminates delegated resources
on the owner and publishes a terminal state. The wrapper must remain alive until
the host's eventual Terminated event; after owner retirement/join that callback is
an atomic no-op and may arrive on the context-free thread. Premature wrapper
destruction is a lifecycle violation and terminates rather than leaving callbacks
pointing into freed memory.

[Iteration 41](ITERATION_041.md) tests actual linked RDPSND through this public
adapter: fragmented PCM, Close/recovery, pre-parser limits/flags, transition
boundaries, bounded deferred confirmations, unknown tokens, reentrancy and delayed
Terminated. Production entry selection/worker loop integration, close-fault handling,
earlier RDP/core allocation audit, compressed format policy, packet-clock gaps and
actual remote/browser audio remain open. The adapter is static-only; dynamic RDPSND
requires a separate public DVC boundary and is not activated.

## Guarded top-level loader selection

`RdpsndProvider::bind` can now take a matching, unused `AudioStaticGate`. In this
profile the general public addin loader resolves the prior linked static RDPSND
entry and returns the guarded ENTRYEX wrapper. The actual opaque context/device
checks above still apply. One top-level channel attempt is allowed, and cached
entries cannot replay registration. Dynamic top-level RDPSND, its dynamic device
entry, legacy static ABI, invalid type/flags and foreign threads receive explicit
non-null rejection entries, preventing an unguarded dynamic-library fallback for
those intercepted requests. Other channel names keep prior provider behavior.

The static adapter supplies only internal fixed arguments: `rdpsnd`, `sys:browser`,
`format:1` (PCM tag). It does not forward a caller-supplied backend, device or argv
to RDPSND. The pinned parser accepts these internal options, selects the explicit
browser subsystem and fails loading errors without trying a host sound backend.
Only PCM-tag negotiation is constrained here; PCM widths/rates/layout consistency
still need a supported-offer policy before activation. The upstream DSP-supported
format branch must not reinterpret unsupported PCM widths as PCM16.

Closing a guarded provider retires its SVC adapter first. Outstanding native
completions leave the provider bound and return ERROR_IO_PENDING; after completions
drain, retry restores the previous loader. Gate/context/sink must outlive this
scope and all final host callbacks. Backend-only scopes without a gate retain their
previous ABI fixture behavior and do not claim guarded ingress.

[Iteration 42](ITERATION_042.md) exercises the general loader, actual pinned static
channel, wrapper and PCM sink together with a fake SVC host, including a supplied
`sys:fake` argument replaced by the fixed browser selection. No Node/worker runtime
links this provider yet; AudioPlayback and audioOutput capability remain disabled.
