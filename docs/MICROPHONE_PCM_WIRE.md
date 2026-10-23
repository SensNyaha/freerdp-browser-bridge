# Preparatory private microphone PCM wire

Current update — iteration 108: raw schema-7 input opt-in activates one-slot
dispatch on guarded Windows workers. Normal WorkerProcess/public selection and
HELLO microphone negotiation remain pending. [Worker contract](MICROPHONE_WORKER.md).

Current update — iteration 104: one fixed PCM handoff slot now rechecks owner
epoch/readiness and a 20 ms dispatch deadline before source admission in native
fixtures. Worker/public activation remains pending.
[Handoff contract](AUDIO_CAPTURE_HANDOFF.md).

Iteration 103 implements the codec boundary for SPECIFICATION §2.6 /
ARCHITECTURE §5 / MEDIA_PIPELINE §7. It does not activate microphone settings,
AUDIN in the worker, browser permission/capture or public RWB1 MIC_PACKET.

RWI1 remains envelope version 1. Additive kind 39 MICROPHONE_PCM is Node→worker,
with exactly 3,864 payload bytes and a nonzero u64 request ID. Kind 40
MICROPHONE_RESULT is worker→Node, exactly four bytes with the matching nonzero
request ID. Header parsing validates exact lengths/correlation before body
allocation. Old workers do not understand these kinds; callers must not send
them without a future negotiated microphone capability. No such capability is
advertised and current session creation continues to reject microphone modes.

PCM payload schema 1 reuses the existing 24-byte audio PCM metadata layout,
restricted to captured input rather than output silence accounting:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | 1 | schema = 1 |
| 1 | 1 | flags = 0 or 2 (discontinuity) |
| 2 | 2 | big-endian real frames = 960 |
| 4 | 2 | big-endian silence frames = 0 |
| 6 | 2 | reserved = 0 |
| 8 | 8 | big-endian nonzero input epoch |
| 16 | 8 | big-endian capture timestamp, microseconds |
| 24 | 3,840 | exactly 20 ms S16LE 48 kHz interleaved stereo |

Timestamp fits u64 minus 20,000 microseconds. PCM may itself contain zeros;
output silence-accounting metadata is forbidden. The codec checks structure,
not stream authority/history. First discontinuity, exact epoch and ordinary
20 ms timestamp progression are [capture-source](AUDIO_CAPTURE.md) admission
rules for future worker dispatch. Native and TypeScript decoders borrow their
validated input storage; encoders copy only after validation. No codec queue,
payload logging, sample conversion or wire capture is introduced.

Result schema is `{u8 schema=1, u8 result, u16 reserved=0}`. Codes 0..4 are
accepted, stale, unavailable, busy and invalid; all others are refused. Accepted
will mean bounded native queue admission, never RDP transmission or audible
consumption. Busy permits caller-specific fresh-data handling, not blind packet
replay. Those admission paths remain unimplemented: current real workers always
decode valid PCM and reply unavailable without accessing AUDIN. Heartbeat and
shutdown remain usable. Malformed PCM is an IPC protocol error.

Responses use the existing fixed 64-record control FIFO without locking output
audio codec selection. Input PCM requests are never retained in that output
queue. Future production requires a bounded input handoff, request/deadline /
rate limits, input epoch metadata, current control lease and explicit browser
permission. Opus input, resampling, real microphone/server and LAN acceptance
remain open. Fuzzer/corpus coverage is prepared; local Clang/sanitizer execution
remains unavailable and is not counted as passing verification.
