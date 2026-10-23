# Iteration 130 — isolated browser microphone Opus encoder

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after native
decoder `f196d8a`. No production microphone codec/capability/wire selection changes.

The isolated codec owns one unfinished input, fixed planar/encoded scratch and
finite processing/authority polling. AudioData closes immediately; output is
borrowed only during synchronous consumption. Discontinuity creates a new codec
generation. There is no flush/retry/packet history/device/socket. OpusHead and
packet profile/time are checked before delivery. Invalid/uncertain delivery or
resource/progress faults close the scope and report only fixed failure.

Focused **8/8** pass: seven pure cases and one actual Edge AudioEncoder/AudioData
case with synthetic PCM. Cases cover conversion, one-input credit, metadata /
time/size/profile refusal, old generation, authority versus error, deadline,
reentrancy, late resources and scratch lifetime. The real case serially encodes
five 20 ms frames with matching PTS, valid stereo packets and explicit final
discontinuity; close emits no extra delivered packet. Physical getUserMedia is
replaced with a rejecting sentinel and never used.

An earlier isolated real Edge probe confirmed configuration support and measured
312-frame pre-skip. Flush after four synthetic inputs produced five packets,
including a tail at 80,000 µs; the production codec owner therefore closes without
flush and ignores old/closed generation callbacks. Probe data is local ignored
`build/iteration-130-opus-probe.log`, not remote/device acceptance.

Worklet/permission/network/native Opus composition, provider fallback, codec delay
and resource audits, resampling, platforms/LAN/soak and actual recording remain
open. [Current contract](MICROPHONE_OPUS_ENCODER.md).

Full `pnpm check`: **414/414** pass. No native source changed in this block.
Native CTest: bundled **17/17** and foundation **6/6** pass.
