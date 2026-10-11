# Private audio reset IPC

Iteration 87 (2026-10-11) prepares bounded recovery messages for SPECIFICATION
§2.6 and MEDIA_PIPELINE §6. RWI1 envelope version remains 1; both new kinds require
a nonzero requestId, echoed by the result. Exact body length is checked before
allocation in native and TypeScript framing.

| Kind | Value | Body |
|---|---:|---|
| AUDIO_RESET | 37 | exactly 12 bytes: u8 schema=1, three reserved zero bytes, u64 BE expected source epoch (nonzero) |
| AUDIO_RESET_RESULT | 38 | exactly 4 bytes: u8 schema=1, u8 result, two reserved zero bytes |

Result codes are scheduled=0, stale=1, unavailable=2 and busy=3. Scheduled denotes
source reset scheduling, not pipe delivery, browser admission or audible playback.
Consumers must observe subsequent source status/config and fresh marked data.
The maximum u64 epoch is representable; implementations must refuse exhaustion
rather than wrap. Reserved bytes and unknown schema/result values are rejected.

In this preparatory block every valid HELLO-ready worker returns unavailable and
keeps heartbeat/shutdown healthy. No reset capability or high-level API is enabled.
Worker dispatch validates the body even when unavailable. Native output stores
typed results in the existing 64-record control FIFO, copies their bounded body,
preserves correlation and does not lock the startup audio profile. Requests are
never retained in output storage. No extra queue or timer is introduced.

Portable codec, header and output tests, TypeScript golden/boundary/fragmentation
tests and raw native lifecycle tests cover this contract. The fuzz target includes
both decoders, but local libFuzzer execution remains unverified. RDP-thread reset
dispatch, private Node correlation and compressed public recovery remain open.

## RDP-thread scheduling (Iteration 88)

Raw private requests now reach Connection's single fixed request slot. A request
can queue only while connected, non-stopping and the last accepted output status
is enabled/ready with matching epoch. Before admission, missing/inactive status
returns unavailable and an epoch mismatch returns stale. A second pending request
returns busy. The one-second service deadline is checked on the RDP thread;
expired/backward clocks return busy without calling the source.

The audio publication wrapper observes a status only after output accepts it.
The service rechecks epoch/readiness and current sink readiness before calling
AudioSession::reset on its owner thread, before the next audio pump. Success
reserves that epoch as already scheduled: duplicates return busy until a fresh
epoch appears. This prevents repeated resets against status that has not yet
crossed the discard barrier. Status revision/epoch/clock cannot regress. Epoch
exhaustion and deadline overflow do not wrap.

Control admission/accepted-status observation/service share a small serialized
metadata owner. Replies are sent after releasing its mutex. Cancellation drains
the pending request as unavailable before audio retirement and terminal connection
state. Reset failure/exception yields unavailable; it does not claim recovery.
The scheduled result precedes later barrier/status/config/data publication and
continues to mean scheduling only. Foundation still returns unavailable.

HELLO reset capability and high-level Node/public selectors remain disabled in
this raw native wiring block. Linked channel tests use simulated SVC; they do not
establish actual transport, audible playback or the public recovery gate.

## Private Node selection (Iteration 89)

HELLO bit 16384 and CLI/build/capability `audioReset` now report experimental
private scheduling on guarded Windows RDPSND builds. The bit requires connectCore
and at least one PCM/Opus output bit; old peers decode false and unknown bits still
fail. Foundation reports false. This flag describes implementation, not remote
readiness, public attachment authority or audible acceptance.

WorkerProcess.resetAudio(expectedEpoch) accepts a nonzero u64 bigint and returns
the typed result. Missing capability throws AUDIO_RESET_NOT_IMPLEMENTED before
wire dispatch. Disconnected/inactive audio returns unavailable, a local epoch
mismatch returns stale and a concurrent request or already scheduled same epoch
returns busy. One existing bounded request-map entry/timer provides correlation;
no second reset queue or source packet copy is added. Its reply timeout is at least
1500 ms (or the configured longer request timeout), allowing the native one-second
service window. Timeout/malformed/duplicate/mismatched replies follow existing
private IPC failure and cleanup rules.

Scheduled does not establish the new epoch by itself: ordered source status/config
and marked data do. PCM/Opus event parsing and payload ownership stay unchanged.
Closing rejects any still pending request and clears its request timer. Public
NativeSessionWorker/SessionManager still refuse Opus startup until public delivery
and compressed recovery ownership are implemented.
