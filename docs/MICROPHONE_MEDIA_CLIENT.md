# Negotiated browser PCM microphone media client

Iteration 124 implements the command/ACK owner for SPECIFICATION §2.6 /
PROTOCOL §6 / MEDIA_PIPELINE §7. It composes the bounded sender with the existing
PCM media adapter, without acquiring a device, preparing an AudioContext or
selecting the viewer/native backend.

The exact negotiated profile is codec pcm, sourceStatus true, streamId 4,
48,000 Hz/stereo, 960 frames, 3,876 record bytes, one in-flight packet and
2,000/4,000 ms packet/stop deadlines. Missing/extra/mismatched fields are refused.
Incoming microphone events use the existing five-field server JSON envelope
`{v, type, seq, ts, data}`. Global seq/ts are bounded metadata, independent of
microphone request/sample correlation. Outgoing commands remain exact
`{v: 1, type, data: {requestSeq}}` as accepted by the existing adapter.

One issued start and one issued stop may coexist so stop can cancel a pending
start. Request ids increase without wrapping. Duplicate stop joins one promise;
cancelled start resolves false while retaining its issued result correlation.
Started admission requires observed current ready/granted metadata at the
requested epoch. Stop revokes its local token synchronously and completes only
on exact stopped correlation with observed grant/retirement cleared. It cannot
inherit an unsolicited grant or use an old token after source/lease changes.

The host calls start only after explicit browser permission. After started
admission, authorize yields one local sender token; the graph receives a sender
facade and host authorized predicate. It cannot acquire a token through that
facade. Scalar source/statistics are copied. Host changed callbacks must stop the
track/graph owner on source/lease changes. No device is implicitly acquired by
negotiation, metadata or construction.

A single 20 ms media-owner poll remains alive through graph stop, preserving
issued packet ACK/deadline handling until the server barrier completes. Start
and stop deadlines are enforced before accepting a late reply, not only by the
poll. Protocol/correlation/source/clock/transport/observer failure closes once,
settles pending operations and invokes the enclosing owner's failed hook. That
hook must close device/socket resources so server attachment cleanup owns the
native privacy barrier. Close alone owns no WebSocket and sends no new commands.
Transport write must synchronously consume/copy a record; false guarantees no
write. Reentrant command replies/writes cannot commit a grant before write returns.

Seven pure synthetic cases and one new actual loopback WebSocket/fake RDP case
pass; with six existing media socket cases the focused set is 14/14. The new
case uses this browser module under Node with synthetic PCM, holds private
admission, sends only latest replacement, observes stop/reset and restarts at a
fresh epoch while keeping video credit separate. It is not actual Edge socket /
permission/graph composition or negotiated RDP microphone acceptance.

Startup context/permission cleanup, full Edge socket/capture composition,
reference-viewer/native selection, physical/remote/LAN/platform microphone,
native resampling and Opus input remain open.

Iteration 125 verifies this client with permission/graph/Worklet over actual
Edge WebSockets and fake RDP worker API admission. Held completion during
controller loss stops the local track/context before fake worker reset, then
observes fresh source epoch. This is browser/socket composition, not private
RWI1 or actual AUDIN acceptance. [Evidence](ITERATION_125.md).

Iteration 126 replaces fixture startup orchestration with the production
[startup/permission/graph owner](MICROPHONE_OWNER.md), including an Edge
permission-denial case. Viewer/native activation remains open.

Iteration 127 wires the client into the reference viewer. Microphone JSON
replies continue during finite detach cleanup; video and output-audio credits
remain separate. [Viewer contract](MICROPHONE_VIEWER.md).
