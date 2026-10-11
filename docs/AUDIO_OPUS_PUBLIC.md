# Explicit public Opus audio output

Iteration 94 (2026-10-11) implements SPECIFICATION §2.6 / MEDIA_PIPELINE §6.
Public session config may choose `media.audioOutput: 'opus'`; off remains the
default, PCM remains selectable, microphone is still unsupported. Codec is fixed
for that session. A trusted backend must provide source events and epoch reset;
the native adapter checks audioReset after HELLO and WorkerProcess checks Opus
before secret delivery/connect. Missing support returns the existing explicit
RDP_SETTING_NOT_IMPLEMENTED, with bounded worker cleanup.

The additive v1 media hello audio extension is exactly
`{"codec":"opus","sourceStatus":true}` (or the unchanged PCM extension).
It must match the session's fixed source codec. Omitted audio preserves the
legacy video/cursor stream and sends no audio. A mismatch returns
MEDIA_NOT_IMPLEMENTED and closes media, preserving the session/control owner.
The ready audio object confirms `codec`, `sourceStatus:true`, `streamId:3`,
`maxInFlight:1`, `ackTimeoutMs:2000`. Existing exact `audio.ack` consumes only
audio credit; video ACK and cursor sequence remain independent. Negotiated audio
retains the bounded 128-command/sec limit.

Ordered stream-3 Opus state/config/packet records use the previously documented
68-byte state, 48-byte configuration and 30..1,303-byte encoded sample layouts.
Node preserves worker capture timestamps and encoded bytes. One copied pending
encoded packet is at most 1,275 bytes, one transmitted record owns receiver
credit. Active-source attachment or skipped prediction schedules native epoch
recovery instead of modifying a dependent packet's discontinuity flag. One reset
promise, bounded retries and a two-second recovery/ACK deadline follow
[the socket contract](AUDIO_OPUS_SOCKET.md). Old transmitted ACK survives source
recovery. Fresh waiting epoch may remain idle indefinitely; no sound is generated
to manufacture acceptance.

The harness accepts `audioOutput:'opus'`, activates its AudioContext only through
the existing user gesture and checks WebCodecs AudioDecoder support before opening
sockets. It uses the existing raw Opus decoder and bounded PCM Worklet sink.
Decoded AudioData closes before Worklet admission credit reaches the media socket.
Preparation cancellation closes the context and cannot consume attach tokens;
negotiation mismatch, decoder/Worklet loss and detach retire owned resources.
Playback stats expose the shared source/Worklet metadata plus Opus decode counters.
No automatic codec fallback or mid-session renegotiation is introduced.

Protected audio metrics now have exactly two fixed codec profiles, PCM and Opus.
Existing record/byte, receiver-credit, pending/in-flight storage, discard/failure
and forwarding/ACK timing series remain bounded. The profile objects share metric
instances; attaching a new consumer does not zero other consumers' gauges.
Counters describe local admission, never audible completion. No target/session/
credential/epoch/PTS or payload is a metric label.

Evidence distinguishes fake backend/real socket recovery and replacement, fake
private IPC reset, actual linked native strict TLS refusal, Edge harness decoding
actual pinned SDK tones and Worklet admission, and actual XRDP idle-source/video
regression. Actual audible XRDP/Windows audio and ready-source native reset,
microphone, platform/core-resource limits, LAN latency/A/V and soak remain open.
