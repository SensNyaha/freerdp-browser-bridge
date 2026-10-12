# Preparatory microphone admission owner

Current update — iteration 138: MicrophoneIngress additionally supports an
explicit immutable Opus backend with one 1,275-byte compressed slot and the
matching prepared RWB1 type 10 parser. PCM remains the default. Opus enforces
stable lookahead and interrupts prediction after fresh sequence gaps/refusals,
including refusal during a pending discontinuity. Public Opus session/WS/capture
activation stays disabled. [Selected Opus contract](MICROPHONE_OPUS_INGRESS.md).

Iteration 113 implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 / ADR-008
between the fixed [browser record](MICROPHONE_WIRE.md) and private worker PCM.
It does not enable public session selection, WebSocket dispatch or capture.

`MicrophoneIngress` owns one 3,840-byte sample slot and one backend operation.
It validates the exact record before copying, consumes every valid sequence
including refused/busy attempts, rejects replay, requires discontinuity at a
fresh input epoch, and requires exact 20 ms continuity without discontinuity.
Capture timestamps must advance even when discontinuity is set. No retry,
packet history, catch-up queue or local timer is introduced.

Authorization is bound to this owner and checked before submission and after
completion. Revocation closes the owner permanently. Source metadata is copied
as scalar authority and checked for revision/epoch/clock progress, including
mutation at the same revision. A changed epoch suppresses a late accepted
result. Backend exceptions or unknown results fail closed without disclosing
the exception. Acceptance means private source admission, not remote playback.

The owned slot protects asynchronous submission against mutation/release of
borrowed wire input. The backend borrows samples until its bounded supervisor
operation settles. Completion wipes the slot; synchronous revocation joins that
one operation before wiping. Reservation precedes external callbacks so a
reentrant close joins the same drain. Counters saturate and snapshots contain
only scalar fields.

`close()` revokes admission and drains the Node slot. It does **not** clear native
queued/interpolated audio. The host must use `drainEpoch` to reset/terminate
native input before transferring capture ownership. The backend must settle
within its supervisor deadline; this isolated class does not terminate a hung
backend. Public finite retirement/reset barriers remain required.

Seven portable cases cover ownership, reentrancy, sequence/continuity, late
results, revocation, metadata progression and backend faults. A synthetic Node
IPC process test projects RWB1 into private PCM, drains the old owner, resets
the worker epoch and admits a fresh owner only after new authority. It does not
establish browser permission, actual RDP/AUDIN capture or physical microphone
acceptance. Separate real-native TLS fixtures still verify native refusal and
cleanup. Public lease/reset/ACK, permission/capture/resampling/Opus input and
real remote/physical/LAN/platform/core-limit gates remain open.
