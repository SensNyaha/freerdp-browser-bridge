# Isolated native Opus microphone compensation

Iteration 132 composes the prepared input packet and native decoder for
SPECIFICATION §2.6 / ARCHITECTURE §5 / MEDIA_PIPELINE §7. It remains isolated:
no worker input selection, RWI1 kind, AUDIN admission, capture permission or
public Opus microphone capability is enabled.

`OpusCaptureDecoder` binds one nonzero source epoch. Each successful input decodes
one stereo 20 ms packet with the existing bounded libopus provider. First input
must be discontinuous; ordinary PTS increments exactly 20,000 µs and preserves
lookahead. Discontinuity requires forward capture time and may change delay;
it resets prediction, discards partial PCM and starts a new capture boundary.
Explicit reset requires a strictly newer epoch and permits a fresh clock origin.
Stale epoch, changed ordinary delay, invalid packet/profile/time and refused
reset preserve prediction, carry, counters and borrowed output.

The decoder removes exactly the reported 0..960 leading stereo frames after
each discontinuity. A fixed 3,840-byte carry buffer reblocks the remainder into
960-frame S16LE stereo packets. Retained carry is always below 960 frames;
there is no packet history or per-decode bridge allocation. A second fixed
3,840-byte buffer holds one borrowed output, valid until the next successful
decode/reset/destruction. Existing SDK states/scratch remain heap bounded.

Zero delay yields immediate output. Nonzero delay makes the first input priming
with no output; the next input completes one full PCM block. For delay 312, first
input retains 648 frames, and the next contributes 312 frames to output. Its PTS
is the first captured block's PTS, then advances 20,000 µs per complete output.
Thus output represents the original capture timeline after removal of codec
padding, rather than labeling delayed samples with the later packet arrival.
The composition neither synthesizes a tail nor flushes after ownership ends.
Reset/destruction discards incomplete captured tail; this intentionally avoids
late microphone delivery. SDK/control failure retires the scope with fixed
diagnostics and clears scratch; failure injection remains unverified.

Stats expose epoch, processed/output packets, skipped delay and reset-discarded
frames, current partial frames, lookahead, priming and failure. Frame counters
saturate; existing SDK lifetime packet exhaustion fails before overflow. These
are isolated scalar counters, not production metrics or latency acceptance.

Three native cases / 689 assertions compare reblocking with an independent
linear decoded-PCM model for delays 0/1/312/959/960, verify atomic refusal and
prediction continuation, then exercise forward discontinuity, new epoch,
borrowed storage wiping and u64 time/epoch ceilings. Combined pinned Opus tests
pass 13 cases / 79,868 assertions.

One actual Edge/native synthetic test sends eight real AudioEncoder packets
through the browser RWB1 codec, Node private projection and a bounded native
stdin probe. Both encoder generations prime once and yield six PCM packets with
expected capture times/discontinuities. Separate stereo tones correlate above
0.95 with the original capture timeline after measured delay compensation.
Physical getUserMedia is replaced by a rejecting sentinel and never called.
The probe reads at most 16 bounded records, uses no RDP/device/files/arguments
and emits only fixture PCM. It is not production transport or remote recording.

Worker owner-thread handoff, packet credit/drop policy, permission/lease/reset,
AUDIN integration, resampling, provider/resource failures, Linux/sanitizers/fuzz,
actual hardware/server and measured LAN/soak acceptance remain open.

[Packet contract](MICROPHONE_OPUS_WIRE.md),
[native decode provider](AUDIO_OPUS_INPUT_DECODER.md).
