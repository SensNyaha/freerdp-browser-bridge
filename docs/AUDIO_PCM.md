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
