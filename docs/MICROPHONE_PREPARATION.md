# Browser microphone preparation before transport

Iteration 141 prepares SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after public Opus
transport `e39b1eb`. The existing MicrophoneSender optionally accepts paired
`prepare(packet, sequence, complete)` / `cancelPreparation()` callbacks. Without
them, PCM sending and scalar statistics retain existing behavior. The reference
viewer does not select preparation yet; no new permission/device/codec is opened.

One reservation covers unissued preparation or issued network input. Preparation
receives frozen scalar metadata and a synchronous borrowed 3,840-byte PCM copy;
it must copy into its bounded provider before returning exactly true. The
borrowed copy is wiped on return. While preparing/issued, only one latest unsent
PCM slot is retained; replacement happens before encoding and forces a future
discontinuity. No encoder/packet/history queue or timer is added to this sender.

Completion supplies a bounded validated RWB1 Opus record plus current monotonic
time. Sequence, epoch, capture PTS and discontinuity must match the reserved job.
No write happens before current token/grant/source checks. `sent` counts actual
successful transport writes; `preparing` distinguishes the unissued phase.
Early ACK, synchronous output reentry, duplicate/current malformed completion or
uncertain send closes the sender without retries. Stale retired-job callbacks
cannot write or affect a new job.

The original 120 ms freshness budget extends across codec preparation. Expiry,
epoch/source loss or permission revoke cancels only unissued work synchronously,
without manufacturing a remote ACK. Cancellation must return undefined/true
after retirement; asynchronous/failed cancellation closes admission. Closing /
revoking the enclosing owner remains responsible for all provider/device/socket
resources, including a codec that already completed an issued record.

Issued old-epoch input stays owned by its actual socket ACK. Explicit no-write
drops the prepared packet, retires prediction and permits only a latest fresh
discontinuous input; the old packet is not restored/re-encoded. An uncertain
write never becomes a definite no-write. Existing 2 s issued-input timeout and
source/sequence/permission checks remain. No native reset/ownership-transfer
barrier is replaced by local preparation cancellation.

Seven pure preparation cases and existing sender/media/graph cases pass 28/28.
Real Edge/Worklet plus loopback-WS fake-RDP PCM regression passes 4/4 with synthetic
input, no physical capture. Actual Opus encoder composition, client/viewer
selection, ready AUDIN/recording/LAN/platform/resource/failure injection and soak
remain open. [Sender](MICROPHONE_SENDER.md), [encoder](MICROPHONE_OPUS_ENCODER.md).
