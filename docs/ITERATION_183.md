# Iteration 183 — actual active XRDP transport loss and cleanup

2026-10-14. Verifies the named SPECIFICATION §3.1 / Stage 3/10 active-transport
failure case. An explicit local helper mode uses one loopback TCP relay to the
authorized lab IP. It forwards bytes without inspection or payload history,
refuses additional/replacement peers, uses stream backpressure and finite
connect/listen/close deadlines. No FreeRDP runs in Node. The actual native client
still performs TLS and the exact previously approved certificate check.

After successful RDP activation and five real 1920×1080 decoded frames with
nonblank pixels, the helper destroys only its own relay sockets. The actual
worker reports `RDP_DISCONNECTED`, the public session becomes failed and the
browser closes. Worker/server/relay cleanup completes, the private runtime is
empty and the helper exits 0. A worker crash or IPC failure does not satisfy the
expected RDP error check. Browser, server and relay cleanup are joined through
nested finally blocks. No remote application/input, sound-generation command,
device permission or microphone capture is sent.

Local echo-socket fixtures separately verify bidirectional forwarding, one
upstream peer, extra-peer refusal, copied scalar state, idempotent close and
target rejection before binding. They are TCP fixtures, not RDP evidence.
Combined proxy/diagnostic/mode/soak checks pass 11/11; ESLint, Prettier and diff
checks pass. Latest full Node baseline remains 520/520 (iteration 180); the two
new relay checks are recorded separately. No foundation code changes here.

This accepts the named active XRDP loss/cleanup case. It does not explain the
earlier intermittent `RDP_PROTOCOL_ERROR`, establish remote held-key/contact
release, lost-device/audio recovery, general reconnect, OS failure/allocator
fault handling, Windows-server/Linux behavior or the broader resource matrix.
The controlled loss reported disconnect rather than reproducing that protocol
failure. [Completed desktop repeat](ITERATION_182.md).
