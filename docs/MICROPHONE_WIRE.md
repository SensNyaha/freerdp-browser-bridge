# Preparatory browser PCM microphone record

Iteration 112 implements the versioned binary foundation of SPECIFICATION §2.6 /
PROTOCOL §6 / MEDIA_PIPELINE §7. No public session selection, socket dispatch,
permission prompt or browser capture is activated by this codec.

RWB1 **MIC_PACKET type 7**, client→server **stream 4**, is exactly **3,876 bytes**.
The existing 28-byte network-order header has version 1, flags 0 or 2
(DISCONTINUITY), a nonzero u32 sequence, captured browser timestampUs (u64,
at most u64 max minus 20,000), and payloadLength **3,848**. The payload starts
with a nonzero big-endian u64 input epoch, followed by exactly **3,840 bytes**
of interleaved S16LE 48 kHz stereo (960 frames / 20 ms). No padding, other codec,
output silence-accounting metadata or additional body fields are permitted.

The profile will require explicit PCM input negotiation and current source /
control authority. The epoch is the worker's input authority; timestamp is the
capture timeline, not worker status observation time. Node preserves both when
projecting into private RWI1 kind 39. Sequence/epoch progress, first discontinuity,
single-flight credit, permission and lease ownership belong to the future
consumer; a valid binary record does not establish permission or delivery.
Sequence zero/wrap is refused; future sender must stop before u32 exhaustion.

Node and browser codecs reject exact length, magic/version/type, direction's
fixed stream, flags, payload length, zero epoch/sequence and exhausted timestamp
before large allocation/copy. Encoding allocates one fixed record after validation
and preserves caller-owned PCM. Decoding borrows the validated samples, with no
retained queue/history; a consumer must copy into its one bounded admission slot
before releasing borrowed input. Errors do not echo samples or metadata.

Independent vectors establish network-order header/epoch and little-endian sample
values. Tests compare Node/browser encoding/parsing and private PCM projection,
exercise every truncation, malformed header/profile/clock/type values, u64/u32
boundaries, borrowed ownership and unchanged caller bytes. These are portable
codec fixtures, not socket, permission, physical microphone or remote application
acceptance. The browser module is not imported into viewer activation yet.

Public readiness/lease/reset ordering, bounded ingress and ACK, permission /
capture/resampling, Opus input, actual remote/physical/LAN/platform acceptance
and earlier native core/lost-write limits remain open.
