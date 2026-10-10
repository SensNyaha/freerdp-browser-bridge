# Preparatory Opus payload schema

Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §6 after the
[private encoder](AUDIO_OPUS.md). Payload schema **1** is independent of activation:
current worker selection, source state, output queue and browser media remain PCM.
No public Opus capability is implied by these parser functions.

RWI1 prepares **AUDIO_OPUS kind 36**, with request ID zero and body length
26..1,299 checked in both envelope parsers before body allocation. AUDIO_CONFIG
keeps kind 33 / exact length 20. No HELLO bit or connection-settings flag is added;
the current worker and typed Node adapter neither select nor emit Opus. The
PCM-only output queue refuses both an Opus config and packet without retaining
them. Existing media negotiation/PCM receiver behavior is unchanged.

Config is exactly **20 bytes**, with integers in network byte order:

| Offset | Bytes | Value |
|---|---|---|
| 0 | 1 | schema 1 |
| 1 | 1 | codec 1, Opus |
| 2 | 1 | two channels |
| 3 | 1 | 0, encoded/raw Opus profile |
| 4 | 4 | decoded sample rate 48,000 Hz |
| 8 | 2 | 960 decoded frames / 20 ms |
| 10 | 2 | queried encoder lookahead, 0..960 frames |
| 12 | 8 | nonzero stream epoch |

This reuses the fixed AUDIO_CONFIG size without changing PCM's codec-2 layout.
Each mode's decoder refuses the other's config. Lookahead is descriptive here;
it is not a hardcoded pre-skip or a timestamp adjustment. Future playback must
choose and test its priming/scheduling policy.

Private packet metadata is **24 bytes** followed by **2..1,275 encoded bytes**;
total size is **26..1,299 bytes**:

| Offset | Bytes | Value |
|---|---|---|
| 0 | 1 | schema 1 |
| 1 | 1 | flags 0 or 2 (discontinuity) |
| 2 | 2 | source sample frames, 0..960 |
| 4 | 2 | underflow silence frames, 0..960; sum with source frames is 960 |
| 6 | 2 | reserved zero |
| 8 | 8 | nonzero stream epoch |
| 16 | 8 | unchanged worker capture PTS in µs, at most UINT64_MAX − 20,000 |
| 24 | variable | one complete encoded Opus packet |

The payload profile accepts only stereo, frame-count code 0 and a 20 ms TOC
configuration: 1, 5, 9, 13, 15, 19, 23, 27 or 31. These modes follow
[RFC 6716 §3.1/3.2.2](https://datatracker.ietf.org/doc/html/rfc6716#section-3.1).
Empty/DTX-only frames, mono, aggregate packets, other durations, padding modes and
self-delimiting framing are explicitly refused in this bridge profile. This is a
restricted packet policy rather than a general Opus validator. Compressed entropy
still belongs to the decoder SDK; syntactic acceptance cannot attest sound content.

The encoder owner must validate source PCM and its zero-filled underflow tail
before encoding. A parser cannot verify silence sample bytes from lossy compressed
data. Source epoch/PTS order, reset/drop ownership, decoder output limits and
capability negotiation remain responsibilities of later owners. Raw bytes and
timestamps must not enter logs or metrics.

Decoding returns spans/Buffers borrowing the supplied packet. Encoding validates
profile, length, metadata and integer bounds before copying/writing bounded output.
Native encoding owns a fixed 1,299-byte array; TypeScript allocates the validated
exact size. No parser retains a sample queue or decoder state.

The libFuzzer target is extended with both Opus payload parsers before the
PCM-only queue rejects them. This prepares fuzz coverage, but Clang/Linux fuzz and
sanitizer runs are not available locally and are not counted as passed gates.
