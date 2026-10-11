# Preparatory microphone input status and publication

Current update — iteration 108: guarded Windows workers emit input status for
experimental raw schema-7 selection. Normal Node/public capability, permission
and capture remain pending. [Worker contract](MICROPHONE_WORKER.md).

Iteration 105 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7. RWI1 kind 41 MICROPHONE_STATE is a fixed 40-byte schema-1
worker→Node event with request ID zero. Both header parsers reject other lengths
or nonzero correlation before allocation. No worker emission, HELLO microphone
bit, public status/permission/capture or session activation is added.

The body reuses [PCM source status](AUDIO_PCM.md) layout and validation, with
different direction/meaning: enabled is fixed session microphone selection;
availability is unavailable/waiting/ready/suspended/closed/failed; revision is
nonzero; epoch is the input authority; timestamp is the monotonic worker status
observation time. Ready requires a nonzero epoch. Enabled profile fields specify
normalized browser input: PCM codec 2, S16LE stereo 48 kHz, 960 frames/20 ms.
They do not describe the negotiated server mono/stereo callback projection.
Disabled status has unavailable/zero epoch and zero profile fields. This is not
playback readiness or browser microphone permission. Opus input remains pending.

| Offset | Bytes | Field (integers big-endian) |
| --- | --- | --- |
| 0 | 2 | schema = 1 |
| 2 | 1 | enabled = 0/1 |
| 3 | 1 | availability = 0..5 in the order above |
| 4 | 8 | nonzero revision |
| 12 | 8 | input epoch |
| 20 | 8 | worker observation microseconds, at most u64 max minus 20,000 |
| 28 | 1 | codec = 2 when enabled, otherwise 0 |
| 29 | 1 | channels = 2 when enabled, otherwise 0 |
| 30 | 1 | sample format = 1 (S16LE) when enabled, otherwise 0 |
| 31 | 1 | reserved = 0 |
| 32 | 4 | sample rate = 48,000 when enabled, otherwise 0 |
| 36 | 2 | packet frames = 960 when enabled, otherwise 0 |
| 38 | 2 | reserved = 0 |

Native/TypeScript state codecs preserve exact reserved/profile/clock/epoch bounds.
Consumer progress requires increasing revision, nondecreasing epoch and worker
time, and immutable enabled selection. State uses the existing control FIFO and
does not select/lock/reset output audio's codec or samples. Fuzz dispatch and a
valid synthetic seed are prepared; local Clang/sanitizer execution remains open.

CaptureStatePublisher is externally serialized by its RDP caller. It keeps one
latest desired state and one last transport-admitted state, not a change FIFO.
Unchanged observations do not emit/revise metadata; they still check monotonic
owner time. New valid availability/epoch advances revision. Invalid/regressing
observations leave the candidate untouched. Revisions may skip at the receiver
when backpressure replaces candidates. Revision exhaustion is guarded, but was
not reached through u64 repeated observations in fixtures.

Publish borrows a fixed 40-byte body to a nonblocking TrySend. False must mean
no admission and retains the previous published authority; a later candidate
replaces the pending one. True commits the exact candidate. Exception/missing
sender is terminal uncertain publication: no retry and no published authority
getter. Caller must stop/retire the source on this fault. Nested observe/retire
refuse and nested publish is busy while the body is borrowed. Counters saturate
and contain no source identities or payload. Retire clears authority.

Future IPC producer uses the admitted snapshot under the worker mutex. RDP
handoff service additionally rechecks the actual source epoch/readiness; old
admitted metadata cannot authorize a packet across a native capture reset.
Publication and producer snapshot update must share serialization so a newly
delivered event cannot race an old admission snapshot. Queue admission does not
prove delivery to Node/browser or remote microphone consumption.

Portable and Node fixtures verify golden/profile/framing/progression boundaries,
backpressure, candidate replacement, invalid history, reentrancy and uncertain
send behavior. An actual linked AUDIN/fake-DVC fixture distinguishes backend
readiness from admitted status, refuses early input and reset races, then admits
fresh synthetic PCM after replacement publication. Worker snapshot/mutex/wakeup,
publication deadlines, permission/lease/Node/browser/Opus input and real remote /
LAN acceptance remain open. Current microphone dispatch stays unavailable.
