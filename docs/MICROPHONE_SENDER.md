# Browser PCM microphone sender

Current update — iteration 141: an optional paired preparation/cancellation
contract reserves one unissued Opus job before the existing issued ACK phase.
It extends 120 ms freshness through preparation, validates bounded completion
correlation and cancels only unissued work without synthetic ACKs. Default PCM
behavior remains; reference Opus encoder/permission/graph selection is not yet
composed. [Preparation contract](MICROPHONE_PREPARATION.md).

Iteration 120 implements an isolated sender for SPECIFICATION §2.6 and
MEDIA_PIPELINE §7. It does not acquire a device, own a WebSocket, create timers
or activate the reference viewer. Its host must explicitly acquire permission,
obtain the current server grant, and poll deadlines even when capture is paused.

`MicrophoneSender` requires current granted/ready source metadata before issuing
a local opaque permission token. Capture callbacks must retain that exact token
and the actual source epoch. Revocation invalidates the token synchronously and
wipes pending PCM before invoking host cleanup. An unrelated ready update cannot
reauthorize a locally revoked owner: a server grant removal must be observed
before a new grant and explicit permission can create a new token. Old callbacks
cannot submit or revoke a replacement owner.

Iteration 121 adds the separate [capture Worklet](MICROPHONE_CAPTURE.md).
Permission/device ownership and composition with this sender remain open.

The sender owns one 3,840-byte latest unsent slot and one issued packet's scalar
ACK correlation. It copies caller PCM, replaces rather than queues pending
samples, and expires unsent candidates after 120 ms. The encoded record is the
fixed 3,876-byte RWB1 record described in [MICROPHONE_WIRE.md](MICROPHONE_WIRE.md).
The transport callback must consume/copy it synchronously; `true` means locally
written, while `false` guarantees no write and permits retaining only the latest
unsent candidate. Unknown results or exceptions fail closed. This local write
result is separate from private source admission and remote delivery.

Exactly one packet waits for its sequence/epoch ACK, with a copied 20..2,000 ms
deadline. Sequence never wraps. Issued/refused samples are never retried. Drops,
gaps, refusal and epoch changes force discontinuity on the next fresh packet.
Stale/unavailable ACKs clear pending samples and wait for fresh source metadata.
If a newer source epoch was already observed, an old epoch's refusal cannot
pause that new source or discard its latest candidate.
Epoch changes discard old unsent bytes while preserving an issued packet's ACK
correlation. A late accepted ACK cannot establish acceptance for a revoked token
or a different current epoch. Video/output-audio credit remains separate.

Canonical bounded decimal metadata is validated before BigInt conversion;
source revision/epoch/observation time cannot regress or mutate at the same
revision. Malformed or replayed ACKs, deadline expiry, clock regression and
sequence exhaustion close admission and request host cleanup once. Private
instance fields prevent callers from replacing ownership state; statistics are
copied and saturate. Reentrant transport/capture/cleanup callbacks cannot erase
the latest replacement slot or restore old authority. Socket ACKs must arrive
after the synchronous local send returns.

Eight pure synthetic cases verify these bounds and transitions. They do not
establish browser permission, physical capture, AudioWorklet behavior, actual
WebSocket composition, ready AUDIN or audible/remote/LAN acceptance. Device
ownership, capture, viewer/native selection and Opus input remain open.
