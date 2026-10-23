# Isolated native microphone Opus decoder

Current update — iteration 132: an isolated epoch-bound composition removes
reported pre-skip and reblocks fixed PCM with the original capture timeline.
Actual Edge/native synthetic codec composition passes; worker/AUDIN selection
and recording remain open. [Contract](MICROPHONE_OPUS_CAPTURE.md).

Iteration 129 implements the native decode foundation for SPECIFICATION §2.6 /
MEDIA_PIPELINE §7 with the existing private Opus 1.6.1 dependency. This provider
is not selected by worker settings, private/public transport or browser capture;
Opus input remains explicitly unsupported. It adds no capability or wire shape.

`SoftwareOpusDecoder` accepts one stereo Opus frame representing 960 frames at
48 kHz / 20 ms, with 2..1,275 encoded bytes. These are bridge profile limits, not
universal Opus limits. It refuses mono, multiple frames, other durations, empty
DTX/PLC, inconsistent or replayed clocks and PTS above UINT64_MAX-20,000 before
SDK decoding. Ordinary PTS advances exactly 20,000 µs; discontinuity requires a
strictly forward time and resets prediction. Explicit reset permits a new clock
origin. The caller remains responsible for epoch, readiness, capture permission
and admission ownership. No FEC/PLC, resampling or automatic retry is added.

The provider allocates two SDK decoder states at construction, after checking
the public get_size result is positive and at most 256 KiB each. Fixed 1,920
sample / 3,840-byte output scratch is heap owned. It allocates no bridge packet
buffer/queue during decode. The public pinned OpusDecoder header declares state
position independent and shallow-copyable. Each attempt copies active state
into the preallocated candidate; successful exact-960 decode serializes S16LE
and swaps states. Refused packet/clock input preserves active prediction, PTS,
counter and borrowed output. PCM output borrows storage until successful decode,
reset or destruction. The owner must consume it before that point.

SDK packet rejection discards the candidate; unexpected SDK/control failure
retires the provider with a fixed diagnostic and clears scratch. Lifetime count
survives reset and fails before overflow. Reset clears borrowed PCM and marks the
next decoded unit discontinuous. Samples/output are overwritten on reset and
destruction; this is not a guarantee about compiler or SDK internal memory.
The provider does not guess pre-skip/lookahead, trim decoded samples or rewrite
capture PTS. Codec delay, downstream AUDIN cadence/queue and browser timestamps
remain the future integration owner's responsibility.

Four actual pinned-SDK cases pass: predictive encode/decode agrees sample-for-
sample with the public SDK, unaligned packet access is valid, all incompatible
TOC profiles and size/clock boundaries refuse atomically, forward reset/ceiling
behavior preserves lifetime ownership, and a bounded 128-body entropy corpus
checks output/reset invariants. The corpus permits SDK-valid payloads rather than
pretending every arbitrary byte string is malformed. There is no external fuzz,
SDK failure injection, sanitizer, Linux, CPU/internal-allocation, worker/wire,
browser encoder or actual remote microphone acceptance from these tests.

The existing encoder remains the output provider. [Opus output](AUDIO_OPUS_PUBLIC.md),
[native capture](AUDIO_CAPTURE.md), [browser PCM ownership](MICROPHONE_OWNER.md).
