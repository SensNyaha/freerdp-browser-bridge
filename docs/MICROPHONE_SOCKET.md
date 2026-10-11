# Prepared PCM microphone media adapter

Current update — iteration 119: the adapter is now selected by the additive
`media.hello.data.microphone: {codec: "pcm", sourceStatus: true}` extension.
`media.ready.data.microphone` confirms codec, sourceStatus, streamId 4, sampleRate
48,000, channels 2, frames 960, maxPayloadBytes 3,876, maxInFlight 1,
packetTimeoutMs 2,000 and stopTimeoutMs 4,000. The server sends initial status
after ready; no grant is obtained by negotiation. All commands, states and ACKs
below are now routed on the selected media socket. Clients omitting the selector
receive no microphone extension/state and binary input remains refused.

Only this negotiated route gets a total budget of 160 incoming messages/s,
including binary samples and JSON ACKs/commands. It leaves headroom for 50 input
packets, 50 output audio ACKs and up to 30 video ACKs. Microphone start/stop commands
have an additional 16/s cap, checked before mutation. Legacy media retains 32/s
and audio-only 128/s. Existing WSS maxPayload remains 4,096 bytes before assembly;
exact record validation still requires 3,876 bytes. Outgoing backlog remains
bounded. Input ACKs cannot release video or output audio credit.

Actual loopback WebSocket tests use explicit fake RDP backends and synthetic PCM /
opaque JPEG records. They establish routing, dual-lease revocation and parser/rate
bounds, not capture or decoding acceptance. Normal NativeSessionWorker creation
still refuses non-off microphone before spawn; reference-viewer permission /
capture and actual microphone/RDP acceptance remain open. Historical no-selection
statements below describe iteration 118.

Iteration 118 implements the isolated adapter for SPECIFICATION §2.6 /
PROTOCOL §6 / MEDIA_PIPELINE §7. It is **not yet selected by media.hello or
the viewer**. Native high-level microphone creation remains gated. The message
shapes below are prepared, not an advertised usable public feature.

After an enclosing explicit PCM negotiation, `start()` publishes initial status
without obtaining a grant. Prepared v1 commands are `microphone.start` and
`microphone.stop`, with exact `data: {requestSeq}` (nonzero, increasing u32).
Responses `microphone.result` correlate requestSeq with started/busy/stopped.
Start must follow explicit browser permission in the future capture owner;
negotiation and source readiness never implicitly enable capture.

`microphone.state` has granted/retiring booleans and source null or a fixed scalar
object: enabled, availability, revision, epoch and timestampUs. The three u64
fields are decimal strings. Source timestamp is worker observation time, not
the captured PCM timestamp. Grants belong to the current media/control leases;
the adapter cannot inherit a preexisting grant. Source/grant callbacks maintain
one latest scalar snapshot, validate progress and clear local admission on revoke.

Prepared binary input is the exact RWB1 type-7/stream-4 record in
[MICROPHONE_WIRE.md](MICROPHONE_WIRE.md). Packet sequence increases across starts
and stops on the same adapter, independently of JSON requests and video ACKs.
Valid inactive/waiting/old-epoch packets receive unavailable/stale without private
dispatch. A second in-flight packet consumes its sequence and receives busy,
with no retained queue. One validated PCM request reaches the lease. Its exact
correlation/result and current grant/epoch/readiness are rechecked on completion.
`microphone.ack` carries sequence, decimal epoch and accepted/stale/unavailable/
busy/invalid. Acceptance is private source admission, not remote delivery.

One sample deadline (2 s) and one stop deadline (4 s) bound outstanding operations.
Stop revokes immediately and awaits the host's native retirement barrier;
additional commands receive busy instead of accumulating promises. Deadline,
malformed/replayed input, invalid completion/source, send exception or backlog
failure closes admission once and requests stop. Late completions grant no ACK.
Deadline values are copied at construction (test ranges 20..2,000 / 20..4,000 ms).

Replies contain bounded scalar data; the adapter reserves 1 KiB per wrapped reply
within the shared 64 KiB outgoing backlog. It retains no PCM copy/history, does
not retry packets or reset timers on receiver inactivity, and never grants video
credit. It owns one source subscription and close hook, disposed on stop/fault/
socket close. Unregistration and explicit stop preserve the native privacy barrier.
The enclosing media router must enforce existing 4 KiB input preallocation and
bounded command/message rates when activating this adapter.

Seven pure fake-socket/lease cases cover explicit grant, packet/stop single-flight,
epoch/lease changes, replay, bad completions, immutable deadlines, backlog,
socket close, partial registration and late callbacks. These are not actual
WebSocket negotiation, permission, browser/physical capture or RDP acceptance.
Public routing/status/ACK integration, permission/capture/resampling/Opus input,
real ready-source reset, remote/physical/LAN/platform and upstream limits remain open.
