# Raw native Opus microphone dispatch

Current update — iteration 140: NativeSessionWorker and matching explicit
SessionCreate/media Opus input are enabled behind the negotiated worker
capability/reset gate. Browser Opus permission/encoder/graph selection remains
uncomposed. Historical private-only statements below describe earlier blocks.
[Public media contract](MICROPHONE_OPUS_MEDIA.md).

Current update — iteration 137: guarded Windows/AUDIN advertises private
`opusInput` through HELLO schema-1 extension bit 1 and matching CLI/build REST
inventory. It requires microphoneReset (bit 0), base pcmInput and connectCore.
Old peers without the suffix report false. Typed WorkerProcess accepts explicit
Opus input, sends CONFIGURE schema 8 before private credentials, and exposes
`sendMicrophoneOpus`. The normalized input source descriptor stays PCM: Opus is
decoded before the AUDIN source. One immutable codec shares one in-flight
send/reset reservation; wrong codec is unavailable, stale epochs are refused,
scheduled reset pauses its old epoch and encoded transport copies are wiped.
No packet is retried. NativeSessionWorker/public media/browser selection remains
unsupported pending its own permission/lease/credit integration. The historical
iteration-136 activation record below predates this typed capability.

Iteration 136 activates raw private CONFIGURE schema 8 / Opus input bit 32 on
guarded Windows builds for SPECIFICATION §2.6 / ARCHITECTURE §5 / MEDIA_PIPELINE
§7. It does not advertise a HELLO/CLI/REST Opus input capability or activate
WorkerProcess/NativeSessionWorker/public/browser Opus selection yet. Those
typed settings remain explicitly unsupported. Foundation/non-guarded builds
still refuse configuration and reply unavailable to kind 44.

Selection is immutable for one connection. CONFIGURE allocates exactly one
selected PCM 3,840-byte or Opus 1,275-byte handoff slot before secret/connect;
input/output codec choices remain independent. The previous empty default
slot is destroyed; there is no second queue. Payload grammar is validated even
for unselected input, then wrong/off profile returns unavailable without
copying/admitting or silently substituting another codec. Producer body copies
are wiped after selected slot admission. Slot arrival expiry remains 20 ms.

On Connection's RDP thread, microphone opt-in binds the existing guarded
MicrophoneSession; Opus mode additionally constructs the borrowing Opus owner.
SDK allocation stays lazy until current ready input. Producer never invokes
SDK/FreeRDP. Service uses actual negotiated/open/admitted source epoch, source
synchronization and the matching typed handoff callback. Result kind 40 remains
correlated and distinct from video/output credit. Priming may accept encoded
input with no complete PCM yet; it is not remote recording acknowledgement.

After a successful native capture reset, codec prediction/partial PCM is
invalidated before reset completion. New source publication gates further input;
old queued data is refused by actual epoch checks. Source/transport loss also
clears codec state before admission. On ending, pending input drains unavailable,
the codec owner retires on the RDP thread, and the handoff retires before joining.
MicrophoneSession still retires its provider/delegates before context Free.
The Opus wrapper remains alive until after context teardown and its destructor
never accesses the borrowed session.

Failed SDK/uncertain downstream ownership completes its correlated result before
terminal connection failure; it cannot continue predictive input silently.
The isolated owner failure latch is checked after service. Actual injected SDK
failure/transport faults and whole-worker deadline/resource acceptance remain
open; this block establishes the explicit propagation path, not fault-injection
evidence. Permission/lease ownership and source reset remain the enclosing host's
responsibility; raw input itself grants no browser/device permission.

Eleven actual native lifecycle/TLS cases pass: raw configuration/inactive input,
three existing public PCM combinations, and six raw PCM/Opus inputs with output
off/PCM/Opus. Wrong input profile cannot dispatch; strict untrusted certificate
rejection yields closed input epoch 0 before failed state, no application bytes
or audio packet, then heartbeat/shutdown and bounded cleanup. These are real
native processes and local TLS fixtures, not successful remote AUDIN or physical
capture. Ready sample/SDK/public-AUDIN composition retains the iteration-135
actual-addin/fake-DVC evidence rather than claiming it ran through a remote worker.

HELLO/typed Node/browser selection, input permission/lease/credit, real ready
AUDIN/server/device/LAN/soak, resampling, SDK/transport/resource fault injection,
Linux/sanitizers/fuzz and upstream acceptance remain open.

[Private envelope](MICROPHONE_OPUS_IPC.md), [owner](MICROPHONE_OPUS_OWNER.md).
