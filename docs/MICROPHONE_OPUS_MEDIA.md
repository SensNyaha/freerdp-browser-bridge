# Explicit Opus microphone media selection

Iteration 140 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after selected ownership `3f52594`. SessionCreate explicitly
chooses media.microphone off/PCM/Opus. Input/output choices remain independent;
Opus never silently becomes PCM. SessionManager requires source, selected codec
submit and native reset methods before backend startup. NativeSessionWorker
requires opusInput and microphoneReset after HELLO, before private configure /
credentials/connect. Legacy/unsupported workers refuse selection and reclaim
their private runtime.

The current media lease exposes immutable microphoneCodec alongside normalized
PCM source metadata and the same control/media-bound grant/reset barrier.
Only the current media attachment can read it. Control loss revokes immediately;
old ingress drains before reset/fresh source publication permits replacement.
Device permission remains local to the client and is not implied by a grant.

Media hello explicitly offers microphone `{codec: "opus", sourceStatus: true}`.
Off/mismatched selected session refuses with MEDIA_NOT_IMPLEMENTED. Ready keeps
the existing ten fields: codec opus, sourceStatus true, streamId 4, sampleRate
48000, channels 2, frames 960, maxPayloadBytes **1315**, maxInFlight 1,
packetTimeoutMs 2000 and stopTimeoutMs 4000. PCM remains unchanged at 3876 bytes.
The optional codec extends v1 negotiation; legacy viewers receive no capture
route/status and cannot send either record. No new JSON message shape is added.

RWB1 type 10/stream 4 uses the existing bounded Opus input payload. Matching
record validation precedes backend submission; mixed PCM/invalid/oversized
profiles close only media. One packet and one stop correlation, 64 KiB shared
backlog, 16 microphone commands/s, selected combined 160 messages/s and 4 KiB
WebSocket preallocation are retained. Audio/video credit remains independent.
Every valid socket attempt consumes its sequence, including unavailable/busy;
ingress sees sequence gaps and requires a fresh predictive discontinuity.
Backend uncertainty is not retried. Acceptance is private admission, not remote
recording acknowledgement.

Actual loopback WebSocket/fake-RDP tests cover exact profile, no automatic
grant, Opus-only backend dispatch, mixed mode/malformed refusal, independent
video credit, first discontinuity after reset, controller-loss late ACK and
fresh-source transfer. Real native/session-manager TLS fixtures select input
PCM/Opus with output off/PCM/Opus, reject the untrusted certificate and publish
closed epoch 0 without RDP application bytes or capture. They are not ready
AUDIN/device/remote recording evidence.

The reference viewer still selects PCM input only; its isolated Opus encoder
has not yet been composed with permission/graph/network ownership. This server
route does not activate browser microphone permission or automatic capture.
Browser selection, actual ready AUDIN/recording/LAN/platform/resource/failure
injection and soak acceptance remain open.
