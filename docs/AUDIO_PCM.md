# Native PCM foundation

Current activation: Windows bundled workers select the guarded static PCM path
through opt-in private/public settings and typed listeners. Public media socket
negotiation and the reference harness gesture/Worklet admission route are implemented;
actual audible RDP acceptance is open. Historical foundation sections below describe
their original scope. [Private worker](ITERATION_066.md), [public viewer](ITERATION_071.md).

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

## Node PCM record-credit preparation

`PcmMediaSender` owns one receiver credit for ordered RWB1 stream 3 status,
configuration and PCM records. One copied latest sample packet (3,840 bytes) and
scalar pending metadata are the only unsent storage. Replacement forces
discontinuity; source stop/reset clears unsent samples/configuration. Admitted
records cannot be retracted and keep their credit until exact acknowledgement.
Configuration waits for the first pending sample and uses its captured PTS;
source observation timestamps do not rewrite sample time.

Construction from a media lease snapshot replays only copied metadata. The first
future sample is discontinuous even when joining an existing native source epoch.
Each record has an independent sequence, with no wrap. A nonblocking consumer
must copy an admitted record into bounded ordered storage; temporary refusal must
retain nothing. The caller supplies monotonic integer milliseconds and progress.
Wrong/duplicate/expired ACK, uncertain write and source protocol errors retire the
owner. Deadline policy is 20..2,000 ms. Close clears owned samples and credit.
No socket/timer or public selection is installed yet. Local snapshots expose
bounded storage and saturating counters; no public audio metrics are added.
[Pure evidence](ITERATION_068.md).

## Browser record-credit admission

`PcmPortSender` / `createPcmPlayback` optionally select `recordCredit: true` with
`sourceStatus: true` and `onRecordAck(sequence)`. Only one unacknowledged RWB1
record is admitted; another record before its reply retires the owner. Status,
config and samples map to reset, config and packet commands. The exact accepted
Worklet reply invokes the wire callback; merely parsing or posting does not.
Stats commands have no wire sequence and cannot release a pending record credit.
The callback may synchronously admit its next record. A throwing callback retires
the owner with no automatic retry. Bad/rejected replies and bounded command
deadlines close the port and exclusive AudioContext. Context loss/explicit close
does not acknowledge abandoned records. Default coalescing mode is unchanged.
The outer media consumer must send `audio.ack` from this callback and negotiate
the matching socket extension; the isolated factory does not select a socket.
[Pure and actual Edge evidence](ITERATION_070.md).

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

## Paced PCM packets and worker-clock timeline

`native/audio/packetizer.*` reads the handoff ring into fixed 3,840-byte storage:
960 S16LE stereo frames at 48 kHz, exactly 20 ms. It starts only when real frames
are available. After starting, short reads pad silence and preserve the queue's
separate real/silence counters. No sleep, allocation or queue is introduced.
Results borrow storage until the next ready read, reset or destruction. Use one
consumer mode: paced packets or the low-level diagnostic read, not both together.

The caller supplies the same monotonic worker microsecond clock used for video.
The first packet anchors to that clock; subsequent due timestamps advance by
20,000 µs without floating-point drift. Early reads are idle and consume nothing.
Late reads emit at most one packet: each wholly missed interval skips 960 old FIFO
frames, bounded by the current backlog, and marks the packet discontinuous. Large
stalls do not loop or emit a catch-up burst. Subinterval jitter keeps the existing
sample clock. This is local presentation timing, not synchronization to a remote
server's boot clock or an end-to-end A/V latency guarantee.

Backward clocks and next-timestamp overflow fail before queue consumption. Reset
starts a new anchor but preserves monotonic checks and lifetime counters; an epoch
cannot replay an already emitted timestamp. Sink Open/Close/loss/source reset also
reset packetization. A fresh source starts at the next real packet boundary.

The RDP owner now bounds its event wait by the active packetizer's read-only
next deadline, shared by PCM and Opus. Microseconds round upward to milliseconds
without overflow, preserving any shorter media/input/microphone wait. An overdue
audio deadline permits a bounded 1 ms retry. Before first samples, after reset/
Close, during retirement, from foreign/reentrant ownership or after failed/
blocked publication, no active deadline is exposed; the ordinary bounded poll
remains. This adds no packet queue, catch-up burst, timer or thread and preserves
the existing late-discard policy. A controlled coarse-wait model reproduces
cumulative loss with the former relative 20 ms wait and avoids it with anchored
waits; actual OS/graphics/callback stalls and audible quality remain separate
acceptance. [Implementation and scoped evidence](ITERATION_371.md).

Queue `discard` removes up to a bounded frame request, preserves the remaining
FIFO including wrap, and counts `playback_skipped_frames` separately from consumed,
overflow-dropped and reset-discarded frames. Packet snapshots count output packets,
missed intervals, discontinuities and invalid clocks. These counters remain native;
no public metrics or audio wire path is activated by this block.

[Iteration 49](ITERATION_049.md) checks independent PCM/timestamp vectors, silence,
missed intervals, wrap, monotonic/overflow rejection, reset and a virtual-minute
drift test, plus actual linked RDPSND with simulated SVC feeding the packetizer.
Audible browser/server audio, microphone and <150 ms LAN acceptance remain open.

## PCM IPC/RWB1 codec foundation

`native/ipc/audio.*` and `packages/protocol/src/audio.ts` define the same bounded
schema. Integers are network order except raw interleaved S16LE samples. This is
codec preparation: no new HELLO capability, configuration flag, worker dispatch,
public server streaming or harness playback is enabled. Current workers reject
these incoming worker-to-parent classes and do not emit them. Future activation
must explicitly negotiate support; older peers cannot receive unadvertised audio.

RWI1 AUDIO_CONFIG (kind 33) is exactly 20 bytes:

| Offset | Bytes | Value |
| --- | --- | --- |
| 0 | 1 | schema 1 |
| 1 | 1 | codec 2, PCM; codec 1 reserved for Opus |
| 2 | 1 | channels 2 |
| 3 | 1 | sample format 1, S16LE |
| 4 | 4 | sample rate 48,000 |
| 8 | 2 | frames per packet 960 |
| 10 | 2 | reserved zero |
| 12 | 8 | nonzero stream epoch |

RWI1 AUDIO_PCM (kind 34) is exactly 3,864 bytes:

| Offset | Bytes | Value |
| --- | --- | --- |
| 0 | 1 | schema 1 |
| 1 | 1 | flags 0 or 2 (discontinuity) |
| 2 | 2 | real frames 0..960 |
| 4 | 2 | silence frames 0..960; sum with real frames exactly 960 |
| 6 | 2 | reserved zero |
| 8 | 8 | nonzero stream epoch matching the current config |
| 16 | 8 | worker timestampUs, at most UINT64_MAX − 20,000 |
| 24 | 3,840 | stereo S16LE, real frames followed by exactly zero silence |

Exact class lengths are checked in native/Node envelope parsers before body
allocation. Body decoders reject profile/version/reserved/epoch/count/clock and
silence-tail inconsistencies, borrow validated PCM storage and allocate no sample
conversion buffer. Encoders validate before copying into fixed-size output.

RWB1 AUDIO_CONFIG type 3 uses the same 20-byte config payload, streamId 3,
DISCONTINUITY flag 2 and the next packet's worker timestamp. AUDIO_PACKET type 4
uses only the 3,840 sample bytes, streamId 3 and flags 0/2. Sequences are unsigned
32-bit, independent of video/cursor; a config+packet pair requires room for both.
TypeScript encoding checks matching epochs before creating any records, copies
borrowed bytes and preserves timestamps. Attachment adds discontinuity even when
the source stream remains continuous. Future sending must drop old unsent epochs
and preserve WebSocket order; browser config/attachment resets must clear scheduled
old PCM. No implemented delivery/ACK/backpressure ownership is claimed yet.

[Iteration 50](ITERATION_050.md) checks independent identical native/TypeScript
vectors, all truncations, parser allocation limits, signed sample byte order,
silence accounting, epoch mismatch, RWB1 sequences and owned output copies.
The fuzz dispatcher/corpus includes these classes; local Clang/sanitizer/fuzzer
execution remains unavailable and is not counted as acceptance.

## PCM source status codec preparation

Private `AUDIO_STATE` (RWI1 kind 35) schema 1 is exactly 40 bytes:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | 2 | schema 1, big endian |
| 2 | 1 | immutable session output opt-in, 0/1 |
| 3 | 1 | availability: 0 unavailable, 1 waiting, 2 ready, 3 suspended, 4 closed, 5 failed |
| 4 | 8 | nonzero status revision |
| 12 | 8 | stream epoch, zero permitted before a stream; ready requires nonzero |
| 20 | 8 | monotonic worker timestampUs, at most u64 max minus 20,000 |
| 28 | 1 | codec 2 PCM when enabled, otherwise zero |
| 29 | 1 | channels 2 when enabled, otherwise zero |
| 30 | 1 | S16LE format 1 when enabled, otherwise zero |
| 31 | 1 | zero reserved byte |
| 32 | 4 | normalized rate 48,000 when enabled, otherwise zero |
| 36 | 2 | 960-frame interval when enabled, otherwise zero |
| 38 | 2 | zero reserved bytes |

Multibyte fields use network order. Disabled requires unavailable/epoch zero and
zero normalized descriptor. Enabled describes the requested fixed output profile,
not proof of server/device acceptance. Waiting/suspended/closed/failed can be
reported without sample bytes. Revision must increase, epoch/time cannot decrease
and opt-in remains immutable within one connection; a new session gets new state.
The pure TypeScript progress helper enforces these refusal rules. The native queue
validates body/request ID 0 before ownership allocation and uses control priority.

Current worker does not publish status or activate audio. An incoming status is
not a command. No new HELLO bit/config selector/public control event is introduced.
The isolated [source owner](#source-status-and-epoch-ownership) now reserves matching
epochs and clears unsent native data before status while preserving already taken
record order. Worker selection and Node/browser flush even without fresh PCM
remain next steps.
[Iteration 60](ITERATION_060.md) records codec, parser and queue evidence.

## Isolated browser PCM queue and AudioWorklet

`apps/reference-harness/pcm-queue.js` copies fixed 960-frame S16LE stereo packets
into one 5,760-frame / 23,040-byte ring. A 1,920-frame (40 ms) prebuffer starts
playback. Rendering converts signed samples to planar float with division by
32,768; short reads produce counted zero silence and return to prebuffering.
Render calls use the provided channel lengths, bounded to 1..4,800 equal frames.
Overflow skips enough old complete 960-frame intervals to retain the newest
bounded FIFO; counters separate playback, startup silence, underflow, overflow
skips and reset discards. Safe integer counters saturate instead of wrapping.

Configuration requires a nonzero unsigned 64-bit epoch; an active configuration
refuses an older epoch. Packet storage is exactly one 3,840-byte ArrayBuffer,
timestamp is bounded unsigned 64-bit microseconds, and continuous timestamps
advance exactly 20,000 µs. Explicit discontinuity permits a forward reanchor,
clears old queued samples and starts prebuffering. Duplicate/backward PTS, wrong
epoch/length/types and unsupported render shapes fail without consuming samples.

`pcm-worklet.js` registers `bridge-pcm-s16le`, requires an actual 48 kHz context
and two output channels, and processes the engine-supplied block size. Its optional
initial handoff has at most two validated packets. Private config/packet/reset/
stats/dispose commands receive one bounded acknowledgment; invalid data closes
the processor with silence. No process-loop telemetry timer or automatic message
stream is introduced. Node/port disconnect, port close and context close remain
the browser owner's responsibility.

The render contract follows [AudioWorklet process](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process):
output block lengths are read per callback, and a stopped source returns false.
A future live owner must verify the [requested context rate](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext)
and use explicit user activation. Other device/browser rates remain unsupported
in this isolated baseline, rather than silently interpreting 48 kHz as 44.1 kHz.

[Iteration 51](ITERATION_051.md) checks pure FIFO/samples/reset/refusal and actual
Edge OfflineAudioContext output plus live AudioWorklet port acknowledgments.
Fixtures keep one command in flight. This block is not attached to the production
viewer or server: a bounded production MessagePort owner, RWB1 browser parser,
worker/Node delivery and actual audible RDP/microphone/latency gates remain open.

## Bounded browser port owner and RWB1 parsing

`pcm-playback.js` now provides the isolated production-shaped owner, superseding
iteration 51's missing port/parser foundation. RWB1 records must be exactly 48
bytes (config) or 3,868 bytes (packet), with the fixed schema/rate/layout, stream
ID 3, flags, payload lengths, nonzero config epoch and bounded microsecond PTS.
Per-attachment sequence starts at zero without wrap. Config precedes a marked
first packet; packet timestamps are strictly increasing and advance 20 ms unless
explicitly discontinuous. New configs cannot retreat behind an active epoch/PTS.
PCM is copied only after validation, so retaining/transferring it cannot depend
on subsequent mutation of the incoming record.

`PcmPortSender` owns at most one posted command, one pending config, one owned
3,840-byte pending PCM packet and one stats-request flag. New PCM replaces an
unsent pending packet and forces discontinuity; new configuration discards old
pending PCM. Config/control precede the next audio command. Acknowledgments must
match the single outstanding ID and succeed; snapshots have a fixed bounded
counter shape. A single bounded deadline retires missing/faulted commands. No
Promise list or arbitrary MessagePort backlog is created.

`createPcmPlayback` accepts an already user-activated, running 48 kHz AudioContext
and takes exclusive ownership of its worklet node, port and context. Context loss,
processor error, invalid records/ACKs or explicit close clear pending PCM/timer,
close the port, disconnect the node and close the context. Cleanup is idempotent;
late ACKs cannot revive the sender. External callers must not reuse the transferred
context. The factory is not called by today's reference viewer or public API.

[Iteration 52](ITERATION_052.md) covers parser limits, a 100-packet burst with one
posted command/one latest packet, config ordering, stale ACK/PTS/sequence refusal,
deadlines, fixed statistics and cleanup faults. Actual Edge exercises TypeScript
RWB1 bytes through the owner and real AudioWorklet, checks bounded credits/epoch
discard, then suspends the context and verifies automatic resource closure. This
is synthetic PCM processing, not audible RDP output or <150 ms LAN acceptance.

## Native PCM publisher preparation

`native/audio/publisher.*` joins the sink packetizer to the private audio codec.
One serialized RDP-thread owner keeps one fixed 3,864-byte pending packet plus
one 20-byte config. A `TrySend` callback must return without blocking: true means
the consumer copied bytes into its own bounded storage; false leaves one pending
record for a later attempt. This is not connected to today's blocking stdout
writer or advertised as worker audio support.

Capture runs before retrying an unsent packet, so fresh PCM replaces stale pending
samples and forces discontinuity. At most one config and one PCM packet are offered
per pump; accepted config is not replayed during packet backpressure. The first
real packet or source discontinuity starts a fresh nonzero epoch; config precedes
PCM. Sink source revision increments on successful Open and every queue/interpolator
reset, including Close, ingress loss, malformed packet and overflow. The publisher
checks revision before capture/send, so a source reset discards prepared IPC even
when no fresh PCM exists and the pinned device remains Open.

Source Close/retirement clears pending data. Explicit publisher reset also clears
source history. Backward/overflow clocks, foreign/reentrant calls and empty send
callbacks do not consume queued samples. Callback exceptions retire publisher
data with a fixed failed status; source/channel retirement is still the connection
owner's job. Epoch/source revision exhaustion never wraps or replays identifiers.
Lifetime counters report captures/sends, accepted configs, replacement/reset
discards, blocked calls and invalid clocks; spans remain borrowed only for the
callback duration.

[Iteration 53](ITERATION_053.md) covers credit, config ordering, exact IPC samples,
source reset before fresh PCM, owner/clock/callback/exhaustion faults and actual
linked RDPSND with simulated SVC Close/restart. Remaining activation work includes
worker configuration/capability/
scheduling/shutdown and Node/browser integration. Actual audible RDP/microphone,
larger source bursts, earlier core allocations and latency acceptance remain open.
Windows workers now have bounded priority output ownership in
[iteration 58](ITERATION_058.md); the publisher is not wired to it yet.

### Source-to-consumer discard barrier

The publisher constructor requires `TryDiscard`, a nonblocking callback whose
target outlives the publisher. Initial ownership, source revision changes and
explicit reset mark consumer discard pending. Pump retries that callback before
reading samples or offering any config/PCM; false preserves the barrier and the
source queue. Accepted discard clears unsent consumer audio config/PCM and counts
one consumer reset. Source Close/no fresh samples still drives this barrier,
while ordinary idle calls do not repeatedly clear the consumer.

The callback shares the RDP-thread/reentry guard; absent binding is refused and
exceptions fail with fixed state. Stats add `reset_pending`/`consumer_resets`.
`reset()` schedules the barrier for the next valid pump; it is not a synchronous
pipe/browser flush. No callback can retract an in-flight record. Fatal callback
or exhaustion still requires outer connection/output retirement. Browser buffer
reset when a source stops without fresh PCM remains an activation prerequisite.
[Iteration 59](ITERATION_059.md) combines this barrier with actual linked RDPSND /
simulated SVC and the bounded output queue. Worker selection remains disabled.

### Source status and epoch ownership

[Iteration 62](ITERATION_062.md) extends the same serialized publisher with an
optional previous status revision. Omission preserves the packet-only foundation
mode; supplying zero enables the immutable enabled-PCM status profile. No worker
selects this mode yet. It adds one fixed 40-byte status buffer (total publisher
payload storage 3,924 bytes), not another sample queue. Callback targets must not
mutate the source or publisher while borrowed records are offered.

After a successful consumer discard, the owner compares source availability,
source revision and epoch with its last accepted status. Changed metadata is
offered as AUDIO_STATE before any config/PCM. The initial waiting source reserves
epoch 1; a reset after epoch N reserves N+1 without consuming it. Repeated resets
without samples keep that epoch and advance accepted status revisions. The next
fresh capture consumes the reserved epoch exactly once. Ready status can describe
queued samples before a config is accepted; it is not acknowledgement of audible
delivery. Metadata-only pump returns `sent`; unchanged metadata remains idle.

Status refusal retains one latest desired state and prevents config/PCM offers.
Unaccepted replacements retain the next revision; only accepted status increments
it. Source changes discard the owner's prepared samples and clear old unsent
consumer audio before the next status, even when Close yields no samples.
Packetizer skips also require consumer discard before a new epoch's status,
because control priority could otherwise overtake old queued PCM. Refused discard
retains its barrier and stops further capture; already taken records keep the
one-writer order and cannot be retracted.

Stats add accepted `sent_states` and local `state_pending`. Status revision,
epoch/source revision and clock exhaustion never wrap; callback exceptions fail
the publisher and require outer connection/output retirement. Fixed control FIFO
capacity still applies; no unbounded status backlog or sample replay is introduced.
Public media status framing, Node listeners/replay, browser reset, negotiated
worker selection and audible remote acceptance remain open.

### Ordered public source status codec

[Iteration 63](ITERATION_063.md) prepares RWB1 AUDIO_STATE type **0x09** on audio
stream 3. Type 0x05 remains cursor shape. The header is the existing 28-byte v1
layout, flags exactly DISCONTINUITY 0x0002, payload exactly the 40-byte private
source status schema; total 68 bytes. Header and payload worker timestamps must
match. Sequence uses the same per-attachment audio counter as config/PCM and
refuses values outside uint32; no wrap is permitted. Config/PCM bytes are unchanged.

TypeScript encoder/decoder and the isolated browser parser validate exact storage,
header, descriptor, reserved bytes and all mode/range rules before reading fields.
This can carry a stop with no samples. It is designed for the same ordered media
WebSocket as PCM; an independent control socket cannot establish flush ordering.
The fixed descriptor describes the requested normalized profile, not negotiated
server format or audible delivery. Current worker/API emit no public status and
the default packet-only browser owner explicitly refuses it. The opt-in source
playback mode below implements bounded reset ownership; negotiated worker/API
selection/listeners/replay and actual audio remain open.

### Browser source status ownership

[Iteration 64](ITERATION_064.md) adds immutable `sourceStatus: true` to the isolated
PCM sender/factory. Default false preserves packet-only fixtures and refuses
status. This is preparation for media negotiation, not an active harness feature.
Opt-in requires initial status before config/samples, increasing source revisions,
nondecreasing source epoch/clock and immutable enabled state. Config requires
enabled `ready` status and its exact epoch. Samples additionally require a fresh
config and the existing discontinuity/monotonic PCM timestamp rules.

Every accepted state clears local pending config/PCM, establishes a fresh-config
boundary and schedules reset ahead of future config/PCM. One already posted
command retains MessagePort order; reset clears actual Worklet storage after that
command. The sender owns only one posted command, one coalesced pending reset,
one config, one latest 3,840-byte sample copy and one stats flag. No metadata burst
creates a MessagePort backlog. Close/suspend/failure/unavailable can reset without
samples; later ready state and matching fresh config permit recovery. The existing
ACK deadline also bounds reset completion; invalid progress closes the exclusively
owned AudioContext/port and releases pending storage.

State time describes observation and may follow the captured PCM timestamp;
source-state progress and PCM progress have separate monotonic checks. All records
share ordered audio sequence; state does not rewrite the media timestamp. Snapshots
add `sourceStates`, successfully posted `resetCommands`, `pendingReset` and small
source metadata with decimal revision/epoch. Existing Worklet stats remain fixed.
An actual Edge fixture confirms Close discards a 960-frame prebuffer with no new
samples and verifies suspend/wait/ready recovery plus replay cleanup. This is real
Worklet integration with synthetic PCM, not audible RDP/browser or microphone
acceptance. Worker selection, Node listeners/media negotiation and LAN latency
remain open.

## Public RDPSND device adapter

### Serialized session and retirement owner

The historical foundation below was activated for PCM in later iterations.
[Iteration 80](AUDIO_SESSION_CODECS.md) adds explicit native PCM/Opus publisher
selection with the same owner/retirement contract. The production worker still
uses default PCM; Opus private/public selection remains open.

[Iteration 65](ITERATION_065.md) adds isolated `AudioSession`: one RDP-thread sink,
static gate, scoped provider and status-aware publisher, with no additional sample
queue. Construct after context creation, before addin loading; fixed backend/PCM
policy and nested scope rules still apply. Output/discard targets and context must
outlive the owner. Its small wrappers must outlive final host TERMINATED, including
when context teardown runs on a later thread. No worker selects it yet.

Pump uses one monotonic worker clock and existing nonblocking publication credit.
Retirement closes source metadata/backlog immediately, attempts provider close once
per owner call, and may pump native completions once per call. Default drain uses
the public pinned `freerdp_channels_process_pending_messages`; a false/error or
exception is counted, then ownership is rechecked on the next call. Closed-handle
cancellation can free confirmations before that API reports failure. Publication
failure does not prevent remaining native ownership from draining.

Retirement window is fixed at construction, 20..1,000 ms (default 1,000 ms).
Backward/overflow clocks, foreign/reentrant calls and invalid policy are refused.
At the deadline the owner refuses further close/drain/publication attempts and
reports expired; it never claims released resources when callbacks still own them.
Native resource retirement proceeds even if stop output lacks credit. Completion
requires retired resources plus accepted stop state, or reports publication failure
after resources retire. Done/failed/expired policy results are sticky. External
callbacks must not block; the policy cannot interrupt them or OS transport calls.
An expired owner with live callback resources requires an outer process failure,
not detach/free of its wrapper. Existing provider/gate destructors retain that
fail-closed lifetime rule; no hidden retry loop or sleeping thread is introduced.

Actual core lifetime checks found that public disconnect, not ContextFree alone,
emits final TERMINATED. Stop an activated RDP transport before retirement; an
unactivated registration may retire first, but public disconnect is still required
before freeing its context. [Pinned source audit](RDPSND_UPSTREAM_AUDIT.md) distinguishes
static pre-assembler placement and completion semantics from unverified broader
transport/resource acceptance. Actual remote audio and worker selection remain open.

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
bounded to the selected native capacity: 120 ms ordinarily or 200 ms under
ADR-012. It is not a Win32 status or evidence of audible delivery.

Packed 16-bit left/right volume settings are applied to normalized signed samples
before enqueue. Iteration 38's linear amplitude conversion is superseded by
[perceptual volume](#perceptual-volume) below. Full gain is identity; zero is
silence. This adds one fixed 19,200-byte scratch buffer to the pipeline. No
callback allocates. Malformed/over-capacity input counts a rejection
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

## Source availability snapshots

[Iteration 61](ITERATION_061.md) adds owner-thread `SinkStats.availability` without
changing device ownership. Initial/successfully opened sources are `waiting`;
only accepted, nonempty normalized samples mark `ready`. Queue underflow silence
does not establish or change source availability. A failed Open preserves the
previous snapshot and queued data. Rejected Play clears history/backlog and marks
`failed`; bounded overflow clears it and returns to `waiting`. Valid subsequent
Play may recover either state. Device Close and owner retirement mark `closed`.

The guarded static adapter marks raw SUSPEND `suspended`, RESUME `waiting`,
SNDC_CLOSE/disconnect `closed`, invalid channel records/lifecycle `failed`, and a
negotiated empty supported-format set `unavailable`. These resets increment the
source revision even without fresh samples. Existing `ready()` describes usable
open-device ownership, not server playback: pinned SNDC_CLOSE leaves that device
open while the source snapshot is `closed`. Only fresh accepted Play restores
source `ready`. This snapshot is not yet published to Node or browser; worker
audio remains disabled. Availability is descriptive, not an additional transport
gate: existing validated channel dispatch and owner lifecycle still govern calls.

`reset_stream(next)` accepts only the five non-ready source states; invalid enum
values/attempted ready resets are refused without mutation. Foreign-thread calls
are refused before mutable source access. Snapshot queries after retirement retain
terminal `closed` metadata. Availability changes on Play can occur without a new
source revision, so a future status owner must compare both fields.

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
changes. Known bridge providers compose through `native/channels/addin_scope.*`:
one context and owner, at most eight fixed scope records, unique callbacks and
reverse binding order for close. RDPEI and RDPSND each retain their single-instance
restriction. Cached entries remain valid beneath a known active child provider;
an unknown replacement disables dispatch and is preserved during teardown.
Out-of-order close fails before retiring any sink/gate resources. Outstanding audio
completions keep the inner scope attached and prevent outer retirement.

[Iteration 48](ITERATION_048.md) verifies both RDPEI/RDPSND binding orders with the
actual linked addins and simulated public transports. This is provider composition,
not remote touch or audible audio acceptance; worker audio remains disabled.

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
An unclosed host handle cannot imply detachment or successful retirement. Following
an unsuccessful host close, the gate retains the original handle and status.
Once outstanding confirmations drain, each later owner retirement attempts one
host close. Success re-enters the pinned public Disconnected callback to finish
its skipped cleanup: pinned rdpsnd cleared its own handle before the failed
CloseEx and returned before freeing formats/device. No private plugin fields are
read or changed. Duplicate host Disconnected events are ignored; only this owner
recovery path may replay cleanup. Failed/throwing close cannot retire the sink or
restore the provider. The original channel error remains after successful cleanup;
cleanup does not turn a failed session into a healthy audio stream.

After the host has completed its bounded writes, retirement terminates delegated resources
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

[Iteration 45](ITERATION_045.md) adds actual linked channel/fake-SVC close-status,
exception, repeated failure, duplicate event, completion-drain and owner recovery
fixtures. Real transport failure/cancellation behavior and a worker's bounded
shutdown deadline remain unverified and must precede activation.

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

## Supported PCM offer policy

The guarded static path now filters a validated server Formats record before
upstream sees it. `native/audio/pcm_offer.hpp` retains only PCM tag 1, unsigned
8-bit/signed 16-bit, mono/stereo, 8..48 kHz, consistent block alignment and average
byte rate, and zero extra data. The original metadata and supported descriptors
stay in stable order; count/body length are rewritten. The original record is not
modified. One fixed 1,176-byte destination covers 64 supported descriptors; complete
input and output capacity are checked before writing. The helper allocates nothing
and borrows caller output; source/destination must not overlap.

This policy is necessary because the pinned DSP support predicate accepts PCM tag
without constraining widths/rates/layouts, and its PCM decode path copies source
bytes rather than converting them to the fallback Open format. Unsupported PCM24
must not be interpreted as PCM16. Compressed formats are excluded before negotiation
and the fixed internal channel policy also selects PCM tag; the wrapped baseline
path therefore does not rely on the compressed DSP fallback. Broader codecs/formats
remain future work, explicitly unadvertised.

All retained descriptors match the sink's support predicate. The negotiated client
table has this stable order; Wave/Wave2 indices are checked against its selected
count before dispatch. An empty supported list is a valid no-common-format exchange
and never opens the sink. The bridge does not imply usable audio in that case.
Other RDP channels can continue; a Wave sent with an invalid/no negotiated index
is an explicit channel failure.

The pinned parser requires 30 remaining bytes even though the fixed Formats body
is 20 bytes. For a zero-count offer only, the adapter appends ten zero bytes to
internal dispatch storage; the original wire record, body length and count remain
unchanged. The actual client reply is exactly 24 bytes with no descriptors. No
synthetic format is negotiated and the pinned dependency source is unchanged.
The fixed layout follows the Microsoft
[server](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpea/53e45199-5629-4352-8617-3dd0347964ee)
and [client Formats](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpea/d58d4d57-cb36-453a-866f-86beacc6d79b)
definitions.

[Iteration 43](ITERATION_043.md) checks independent offer vectors, output rejection
atomicity, mixed PCM24/PCM16, client-index dispatch and zero-common-format behavior
through the actual linked guarded RDPSND path with fake SVC transport. No remote or
browser playback acceptance is inferred. Earlier RDP/core allocations, close
faults, stream clocks/gaps and worker/browser transport remain open.

## Perceptual volume

The RDPSND volume field has left in its low word and right in its high word,
with full volume at 0xffff and silence at zero. Equal nonzero code increments
must give equal perceptual increments, rather than equal amplitude increments.
See Microsoft's [RDPSND volume definition](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpea/d58d4d57-cb36-453a-866f-86beacc6d79b)
and [waveOutSetVolume contract](https://learn.microsoft.com/en-us/windows/win32/api/mmeapi/nf-mmeapi-waveoutsetvolume).

The protocol does not specify a device attenuation range. This virtual sink
chooses -60..0 dB for codes 1..65,535; code zero is exact mute. The amplitude gain
is `10^(-3 * (65535 - code) / 65534)` for nonzero codes. This is a bridge policy,
not a mandated Microsoft range. The midpoint code 0x8000 has -30 dB gain.
`PcmVolume::set` computes two Q30 coefficients once per volume change. Play uses
bounded signed 64-bit multiply/divide only, truncating toward zero; no per-sample
transcendental operation or allocation. Full gain preserves all S16 samples;
independent stereo controls also apply after mono normalization. GetVolume retains
the exact packed code. Already queued samples retain their previous gain.

[Iteration 44](ITERATION_044.md) covers exhaustive identity and monotonicity,
independent golden attenuation vectors, equal dB steps, mute and actual linked
RDPSND Volume PDU dispatch using fake SVC transport. It does not demonstrate
audible remote/browser volume or activate worker audio.

## Packet continuity

The guarded PCM path checks whole source frames and the fixed 64 KiB ingress
budget before upstream device Open/Play. Selected descriptors are kept
in a fixed 64-entry table. A bounded `AudioClock` receives source rate/frame count,
negotiated index, block number, timestamp width/value and owner monotonic arrival
milliseconds. Invalid metadata leaves history unchanged and fails the channel.
The sink splits larger callbacks into at most 100 ms conversion spans, reusing
the fixed normalizer arena. Interpolation persists across spans. The selected ring
retains the newest samples for large callbacks and counts discarded old frames;
ordinary callbacks preserve packet-atomic overflow rejection. No growing storage
or additional publication is introduced inside Play. A 186 ms server burst still
exceeds the default 120 ms ring; the opt-in 200 ms ring can retain it. Packet acceptance is not smooth
audio or measured latency acceptance. [Actual XRDP correction](ITERATION_175.md).

The first packet requests a sink reset. Subsequent packets reset interpolation and
queued PCM on a format/rate/clock-type change, a missing/repeated block, backward
clock epoch, or a source/arrival interval greater than the previous packet's rounded
duration plus 120 ms. Both accepted decisions establish the next baseline. These
are bridge continuity heuristics; normal source timestamp and 8-bit block wraps
remain continuous. Serial deltas at or above half the timestamp range are ambiguous
and start a new epoch. Arrival subtraction is overflow safe; equal source timestamps
and batched arrivals are allowed when blocks are consecutive. No wait/allocation.

WaveInfo establishes continuity once, before Open; its following raw Wave does not
advance history again. Wave2 uses its 32-bit source timestamp in milliseconds, as
specified by [Microsoft](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpea/25cebccb-d679-4302-8dd0-df7fb9a4f9b5).
Legacy Wave's 16-bit build-time stamp is a continuity hint; it is not treated as an
equivalent source presentation timestamp. This helper detects epochs/gaps without
mapping server time to browser PTS or claiming AV sync. Formats, Close, accepted
suspend/resume and retirement clear clock history. Queue reset markers carry loss
to a future consumer; counters retain discarded PCM frame totals.

Native continuity diagnostics retain fixed saturating lifetime counters for
first packets after reset, profile changes, nonconsecutive blocks, backward/
excessive arrival and source timestamp gaps. Reasons can overlap on one packet;
their sum is not a unique reset count. Invalid metadata leaves these counters
and the baseline unchanged. Explicit reset preserves the counters. The static
gate separately counts admitted Formats and Close records. Owner-thread copied
AudioSession snapshots and one bounded retirement summary expose them to local
tests; no RWI1/RWB1 field, public metric, raw data or growing history is added.

[Iteration 46](ITERATION_046.md) checks pure clocks and actual linked RDPSND with
fake SVC. Server format-table replacement is explicitly refused by the baseline
policy below, preventing upstream reuse of an incompatible already-open index.
Native overrun heuristics, callback CPU budgets,
earlier RDP core allocation bounds, browser PTS/playback and
actual audio/microphone acceptance remain open.

## Connection format-table policy

The guarded baseline fixes the supported PCM table for one connection, including
a zero-common-format response. An identical selected table and protocol version
may be reannounced: a fixed candidate buffer verifies count, descriptor order and
all descriptor bytes before upstream dispatch. Identical reannouncement preserves
the active queue, resampler phase, clock baseline and stream revision while
permitting the pinned channel to resend its negotiation reply. Other header metadata
does not redefine descriptor identity. Changed supported tables or protocol versions
fail with `ERROR_NOT_SUPPORTED`, reset queued PCM and never reach upstream or mutate
selected descriptors. Close and suspend/resume keep the initial
negotiated table. A new connection gets a fresh gate. This is an explicit bridge
profile restriction; broader server renegotiation support remains future work.
It prevents the pinned channel from keeping the old Open format at an unchanged
index while interpreting a replacement descriptor differently.

Switching `wFormatNo` among entries in the original table remains supported. The
gate detects the source change and upstream opens the selected descriptor; the
normalizer starts a fresh phase and old PCM is discarded. Microsoft's
[format-list contract](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpea/7df64d93-7594-4035-978d-229f2b15f1bc)
defines client indices into the exchanged list. [Iteration 47](ITERATION_047.md)
checks 48 kHz stereo PCM16 to 8 kHz mono PCM8/PCM16 conversion through actual linked
RDPSND/fake SVC, plus replacement rejection before and after Open. Queue and source
packet budgets are unchanged. This is not actual remote/browser audible acceptance.

## Optional native compatibility storage

Accepted [ADR-012](adr/ADR-012-audio-compatibility-buffer.md) adds explicit
`media.audioOutputBufferMs: 200` for PCM/Opus. The immutable native ring uses
9600 stereo 48 kHz frames instead of the default 5760; backing storage is a
fixed 38,400-byte maximum, with active capacity used for wrap/full/discard logic.
Reset wipes the full allocation. The normalizer still uses 100 ms spans, and
RWI1/RWB1 packets remain 20 ms. Browser Worklet and microphone capacities do not
change. This is not a total latency guarantee. Standard LAN target remains
<150 ms; the compatibility native 200 ms exception is explicit.

Trimming unencoded/unstamped source PCM counts every skipped frame but does not
by itself invalidate already delivered Opus history. Existing reset markers are
preserved. Timestamped interval skips, source/format changes and dropped encoded
prediction retain the existing discontinuity/reset barriers. No lost compressed
packet is treated as continuous. This avoids an unnecessary browser prebuffer
restart after each native raw trim while keeping loss visible.
