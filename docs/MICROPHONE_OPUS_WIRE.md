# Prepared microphone Opus packet codecs

Iteration 131 prepares bounded input codecs for SPECIFICATION §2.6 and
MEDIA_PIPELINE §7. They activate no capture, lease, socket route, RWI1 kind,
settings or capability. Current sessions still reject Opus microphone selection.
PCM input and output-audio packet formats remain unchanged.

The restricted profile is one stereo 20 ms Opus frame at 48 kHz, 2..1,275 encoded
bytes. TOC validation checks stereo, frame-count code 0 and the nine 20 ms
configurations; entropy decoding belongs to libopus. Each packet carries a
nonzero u64 source epoch, capture PTS at most UINT64_MAX−20,000, discontinuity and
measured encoder lookahead 0..960 frames. The codec neither trims delay nor
changes clocks. A future admission owner must enforce first discontinuity,
sequence/PTS progression, stable delay within predictive continuity, permission,
current lease/readiness and decode/retirement barriers.

The prepared client-to-server RWB1 record uses version 1, type **0x0a**, stream
**4**, flags 0 or DISCONTINUITY (2), nonzero u32 sequence and capture timestamp.
The payload is 14..1,287 bytes and total record 42..1,315 bytes:

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 28 | Existing RWB1 header; payloadLength equals totalLength−28 |
| 28 | 8 | Source epoch, big endian |
| 36 | 2 | Measured lookahead frames, big endian |
| 38 | 2 | Reserved, zero |
| 40 | 2..1,275 | Complete compressed packet |

Node/browser encoders validate bounds before output allocation. Decoders check
whole-record bounds before reading fields; compressed spans borrow input. They
retain no history/queue. JS shared storage is refused; producer bytes are not
modified. Direction is client-to-server only; existing PCM type 7 is unchanged.
No current media adapter selects type 10, so it cannot bypass PCM admission.

The standalone private payload is 26..1,299 bytes. It has no assigned RWI1 kind:

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 1 | Input-specific schema 1 |
| 1 | 1 | Flags 0 or 2 |
| 2 | 2 | Frame count 960, big endian |
| 4 | 2 | Reserved, zero; no output silence accounting |
| 6 | 2 | Measured lookahead frames, big endian |
| 8 | 8 | Source epoch, big endian |
| 16 | 8 | Capture PTS, big endian |
| 24 | 2..1,275 | Complete compressed packet |

This schema is distinct from output Opus: offset 6 is input lookahead rather
than reserved output metadata. Existing output codecs must not decode it.
With zero lookahead, its bytes can coincide with an output packet; future
activation must assign and enforce a separate input kind/direction rather than
infer authority from body bytes alone.
C++ uses a fixed 1,299-byte output array after validation; no SDK is required
for this parser. The native payload and Node projection share independent
golden vectors. The RWI1 envelope still rejects unassigned kind 44.

Tests establish parser/profile agreement and borrowed storage, not microphone
recording or network/worker dispatch. Delay compensation, bounded admission,
native/browser codec composition, worker selection, actual AUDIN/device/LAN,
platform, sanitizer/fuzz and resource acceptance remain open.

[Browser encoder](MICROPHONE_OPUS_ENCODER.md),
[native decoder](AUDIO_OPUS_INPUT_DECODER.md), [PCM wire](MICROPHONE_WIRE.md).
