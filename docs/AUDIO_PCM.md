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
