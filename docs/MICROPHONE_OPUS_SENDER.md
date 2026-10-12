# Selected browser microphone Opus sender

Iteration 142 implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after preparation
`b606e46`. MicrophoneOpusSender composes that reservation with the isolated
MicrophoneOpusEncoder and bounded RWB1 Opus record. It acquires no device, creates
no graph/socket and does not select Opus in the viewer yet.

The encoder is created lazily only for a current explicit permission token and
ready granted source. One reservation covers codec preparation or issued input;
one latest unencoded 3,840-byte PCM block may replace an older pending block.
Actual synchronous output is copied into the validated record before borrowed
codec storage is wiped. Preparation keeps the original 120 ms freshness budget;
only actual transport writes count as sent. Real socket ACK releases issued
credit. Replacing unsent PCM or definite no-write forces a fresh discontinuity;
prepared output is never restored/re-encoded or retried after uncertainty.

Expiry, source/epoch loss and revoke close the encoder synchronously, invalidate
its callbacks and discard unissued output. Epoch change also retires an encoder
whose output was issued, while preserving the old network correlation until its
real ACK. A cancelled late factory result is closed before AudioData submission.
Codec failure, uncertain write and a new retirement failure close admission and
revoke once. A failure already reported by the codec is not counted a second time
during normal cleanup. Stop uses close, never flush or an encoded tail packet.

Seven portable cases and actual Edge AudioEncoder/AudioData composition verify
these boundaries. The Edge fixture uses synthetic PCM, held ACK, latest-block
replacement and epoch reset, with five bounded packets and all codec resources
closed. Physical getUserMedia is forbidden. This is codec/sender evidence, not
permission/Worklet/socket/native/AUDIN or audible/recording/LAN acceptance.
Client/viewer selection, devices/platforms/resource/failure injection and soak
remain open. [Preparation](MICROPHONE_PREPARATION.md),
[encoder](MICROPHONE_OPUS_ENCODER.md), [transport](MICROPHONE_OPUS_MEDIA.md).
