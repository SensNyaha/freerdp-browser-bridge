# Browser microphone graph and sender composition

Iteration 123 implements the graph activation scope for SPECIFICATION §2.6 /
MEDIA_PIPELINE §7, composing the capture Worklet with the bounded sender.

`MicrophoneGraph` takes an explicitly prepared/running 48 kHz AudioContext,
permitted borrowed stream, current source epoch/local sender token and host
backend. The caller must prepare/resume the context in its explicit user gesture
and close it if permission fails before graph construction. The permission owner
retains tracks. Backend `authorized(token, epoch)` must reflect the current
local token and control/media/source grant; `retire()` must revoke admission
synchronously and resolve void only after its finite native/server barrier.
`failed()` must synchronously stop the enclosing permission/track owner.
This scope does not itself implement media negotiation or server grant commands.

Iteration 124 adds the [media command/ACK owner](MICROPHONE_MEDIA_CLIENT.md).
Actual Edge graph/socket and startup context composition remain open.

The graph loads only the fixed capture Worklet module. It connects the silent
output before waiting for exact ready confirmation, then connects the stream
source. Exact monotonically increasing port packet ids, epoch, capture time and
3,840-byte buffers are checked before offering to the sender. The sender copies
or replaces its single latest slot synchronously; the graph wipes its transferred
sample buffer and returns port ACK independently of the packet's network ACK.
No sample FIFO, extra capture thread or local microphone monitoring is added.

One 20 ms main-thread poll checks authority, monotonic time, sender ACK deadline
and a 2 s port/module/first-packet stall deadline even if the audio graph is
suspended. Context state loss, processor error, bad/replayed records or sender
failure closes local admission and notifies the permission owner once. Epoch
changes require the enclosing host to revoke this graph and use a fresh scope;
this graph never adopts another token/epoch automatically.

Close reserves one shared promise before callbacks, clears poll/listeners,
revokes the local sender token, disconnects source/node, disposes/closes the port
and joins context close, host retirement and initialization. A copied 20..5,000 ms
overall deadline (4 s default) rejects unknown/failed/hung cleanup with a fixed
error. Late module/node/source creation cannot reconnect after cancellation;
late resources are explicitly disconnected. The host must latch cleanup failure
and preserve any issued network ACK correlation through its server barrier.
The enclosing media owner must continue to handle that ACK/deadline while stopped.

Six pure cases and one actual Edge synthetic graph case pass. Edge combines
fake getUserMedia, an actual synthetic MediaStreamDestination, permission/track
owner, actual Worklet and actual RWB1 encoder. Its ACK backend is simulated, not
a WebSocket or RDP worker. It verifies held network credit/latest replacement,
signal bytes, quiet local output by Worklet contract and complete context/track
retirement with no late records. Physical capture and real negotiated AUDIN
remain unverified.

Public WebSocket/command ownership, startup context cleanup before permission,
viewer/native selection, physical/remote/LAN/platform acceptance, native
resampling and Opus input remain open.
