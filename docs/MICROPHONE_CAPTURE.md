# Isolated browser PCM capture Worklet

Iteration 121 implements the capture packetizer/Worklet foundation for
SPECIFICATION §2.6 / MEDIA_PIPELINE §7. No getUserMedia, physical device,
permission owner, viewer selection or native public activation is added.

`MicrophoneCapture` accepts only finite Float32 mono/stereo quanta of 1..2,048
frames at 48 kHz. It clips to signed S16LE and duplicates mono. It owns one fixed
960-frame collector and one latest complete 3,840-byte block. Caller input is not
modified. Complete blocks replace pending blocks instead of entering a FIFO.
Only one transferred block may wait for MessagePort ACK. Capture timestamps use
the first sample's absolute AudioWorklet frame counter, multiplied/divided in
BigInt, so 20 ms intervals do not accumulate rounding drift. This browser capture
clock is separate from worker observation timestamps.

Pending blocks expire when their first captured sample reaches 5,760 frames /
120 ms of age. Packet credit has a 96,000-frame / 2 s deadline checked on render,
poll and ACK. A paused/suspended graph cannot enforce wall-clock deadlines alone;
the future main-thread owner must independently poll a finite deadline and stop
the device/context. Total microphone/LAN latency acceptance remains unverified.

Missing input, forward frame gaps, pause and fresh epoch configuration wipe
partial/latest PCM. New epochs strictly increase and cannot wrap. A fresh epoch
preserves only an already issued old packet's credit until its exact ACK; its old
unsent bytes are discarded. Timestamp gaps allow the existing sender to mark a
discontinuity. Overlapping/regressing clocks, malformed samples/epoch/ACK,
sequence exhaustion, post failures and reentrant processing fail closed. Private
fields keep ownership state internal; copied lifetime counters saturate.

`microphone-worklet.js` registers `bridge-microphone-s16le`. Initial
processorOptions are exactly `{epoch: nonzeroBigInt}` and sampleRate must be
48,000. It emits `{type: "ready", accepted}` once. Capture packets are
`{type: "packet", id, epoch, timestampUs, pcm}` with one transferred ArrayBuffer
of exactly 3,840 bytes. The owner replies with exact `{type: "ack", id}`;
packet ACKs do not themselves generate responses. The id is a nonwrapping u32
and is independent of public microphone packet sequence and command ids.

Exact commands are `{type: "config", id, epoch}`, `{type: "pause", id}` and
`{type: "dispose", id}` with increasing nonzero u32 command ids. Replies are
`{type: "result", id, accepted}`. Invalid commands close admission and emit at
most one fixed `{type: "fault"}`; clean disposal emits no fault. The owner must
bound command issuance/port lifetime. A connected silent output keeps the graph
pulled without local microphone monitoring.

Six pure packetizer cases, two simulated processor/parser cases and one actual
Edge synthetic offline/live Worklet case pass. The Edge fixture refuses any
getUserMedia call, checks exact stereo bytes and silent output, held/latest port
credit, new epoch while old credit is held, pause/dispose and refusal at 44.1 kHz.
These are synthetic browser graph checks, not physical capture, permission,
socket/native composition, ready AUDIN or remote/audible/LAN acceptance.

The current native profile remains PCM16 mono/stereo 48 kHz. Other rates require
the retained native resampling work; this Worklet refuses them and implements no
resampler. Permission/track/context ownership, sender integration, viewer/native
selection, Opus input and platform/upstream resource gates remain open.
