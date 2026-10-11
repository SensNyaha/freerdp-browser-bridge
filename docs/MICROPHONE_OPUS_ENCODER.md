# Isolated browser microphone Opus encoder

Iteration 130 implements the browser encode foundation for SPECIFICATION §2.6 /
MEDIA_PIPELINE §7. It is not connected to permission/Worklet capture, media
selection, native transport or AUDIN. Opus microphone settings remain unsupported.
This module obtains no device, creates no AudioContext and opens no socket.

`MicrophoneOpusEncoder` owns one AudioEncoder and one scalar input awaiting output.
There is no input/output history, pending-frame queue or automatic retry. The
caller must hold current source/permission authority and network credit before
submitting. Busy input is refused before sample allocation; dropping/coalescing
unencoded frames and choosing discontinuity remain the enclosing owner's job.

Input is fixed 3,840-byte S16LE, 48 kHz stereo / 960 frames, bound to one nonzero
epoch. Conversion uses fixed 1,920-float planar scratch. AudioData owns a copy and
is closed immediately after encode; producer PCM is untouched. Capture PTS is a
BigInt but must fit Number.MAX_SAFE_INTEGER-20,000 before WebCodecs conversion.
First input requires discontinuity; ordinary PTS increments exactly 20,000 µs.
Replay/backward/unsafe PTS and non-discontinuous gaps fail the scope.

The fixed codec configuration requests Opus 48 kHz stereo, 64 kbit/s, complexity
5 and 20 ms frames. Actual output must have matching PTS, one stereo 20 ms frame
and 2..1,275 bytes; bitrate is a target, not a packet-size guarantee. Initial
OpusHead is exactly validated, including stereo/version, 48 kHz rate, zero gain /
mapping and queried pre-skip 0..960. Repeated metadata must preserve that delay.
The encoder exposes the measured delay; it does not trim samples or rewrite PTS.
Current Edge's synthetic probe reports 312 frames.

Output copies into a fixed 1,275-byte buffer. The receiver borrows its span only
for the synchronous receive call and must consume/copy it before returning true;
storage is wiped on return. Unknown/false delivery fails and closes rather than
continuing predictive encoding after an unissued packet. Future network ACK,
codec-delay handling, queueing and source readiness belong to the integration
owner. One processing deadline is 2 s; a fixed 20 ms poll also watches authority /
clock even when the producer stops. Authority loss closes normally; API, profile,
clock, progress or cleanup faults report one fixed failure callback.

Discontinuity closes the old codec and constructs a fresh generation before
input; late old callbacks cannot grant current delivery. No flush is used on
stop: the real Edge probe's flush produced an additional codec tail after four
inputs, which must not become a new captured packet after permission ends.
Close drops pending work and wipes scratch. Late factory/AudioData objects are
closed after reentrant cancellation; a packet copy that closes ownership cannot
call the receiver. Cleanup failure remains failed admission; the enclosing owner
must enforce its device/session retirement policy.

Seven pure API cases and one actual Edge/AudioEncoder/AudioData case pass.
The Edge case never calls getUserMedia: it verifies one input at a time produces
five matching packets across discontinuity, valid headers/delay, no extra tail
after close and no codec fault. This is synthetic codec evidence, not Worklet /
permission/socket/native decode composition or remote/physical microphone.
Browser/provider fallback, native/public Opus dispatch, capture integration,
resampling, codec CPU limits, platforms/LAN/soak and actual AUDIN remain open.

[Native decoder](AUDIO_OPUS_INPUT_DECODER.md), [PCM startup owner](MICROPHONE_OWNER.md).
