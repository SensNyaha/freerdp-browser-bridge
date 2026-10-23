# Isolated browser Opus playback owner

Iteration 77 implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6/8 using the
prepared RWB1 profile. The reference viewer does not activate or import this owner
yet; public/native Opus selection remains explicitly unsupported.

`createOpusPlayback` takes exclusive ownership of an already activated, running
48 kHz AudioContext, checks actual WebCodecs configuration support, and prepares
the existing bounded PCM Worklet. Failure closes the supplied context. No socket,
microphone permission or implicit browser activation is introduced.

The decoder configuration is `opus`, 48 kHz, two channels, without description.
Chunks use the raw encoded packet and type `key`. The queried encoder lookahead
remains descriptive: this profile performs no OpusHead pre-skip, removes no frames
and does not rewrite capture PTS. The retained codec delay must be considered in
future A/V scheduling. This follows the current
[WebCodecs Opus registration draft](https://www.w3.org/TR/webcodecs-opus-codec-registration/),
which does not guarantee codec support in every browser.

The owner validates source status/revision/epoch, shared nonwrapping sequence,
config-before-packet, clock progress and boundary flags before submitting decode.
Exactly one record can await decode/Worklet admission. It stores scalar metadata;
EncodedAudioChunk copies the bounded input and no encoded history is retained.
A decoder callback must produce exactly 960 frames of stereo 48 kHz audio. Its
timestamp must be a safe integer within **1 microsecond** of the input PTS; actual
Edge exhibited this rounding difference at 260,000 µs. PCM forwarding preserves
the original wire PTS. Greater mismatch, invalid sample shape, nonfinite samples,
duplicate callbacks and unsafe Number timestamp ranges fail closed.

Two fixed 960-float planes are copied, clipped and converted to one 3,840-byte
S16LE packet. AudioData is closed before Worklet admission. The existing PCM
source/record-credit owner then performs reset/config/packet dispatch. Wire ACK
is emitted only after the matching accepted Worklet command, never on decoder
submission/output alone. Decode and admission have a bounded 2-second deadline
(configurable 10..5,000 ms for tests/owners), independent of stats requests.

Status retires the old decoder; a discontinuous packet after an ordinary packet
recreates decoder prediction. Late old-generation output is closed and ignored.
Close/error/stall retires decoder, port, Worklet and owned AudioContext. Recreating
prediction after dropped Opus packets can alter sound fidelity; this is not a
video-IDR guarantee. All listeners and credits remain bounded.

Actual Edge tests decode fixed synthetic stereo tones produced by the pinned
private libopus encoder, check 20 full packets, queried-delay correlation and
20 Worklet admissions plus source/config/Close ACKs. The test executable is built
only with bundled testing enabled and is not installed. These are synthetic SDK /
browser fixtures, not audible XRDP, public Opus, microphone or LAN-latency
acceptance. Decoder internals, CPU budgets, loss recovery fidelity, platforms,
A/V synchronization and soak gates remain open.
