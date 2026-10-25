# Prepared bounded Node packet owner

Iteration 198 composes the schema-1 IPC-only addon/readiness module with one
typed EventEmitter owner. It remains private and is not selected by ordinary
WorkerProcess/API yet. [Primitive](NODE_SEQPACKET.md).

`SeqpacketOwner.open` creates/binds one socket pair. Failed binding closes and
joins native retirement before rejecting; failed allocation/profile errors are
replaced with static codes. The trusted host uses childFd only for FD3 spawn
inheritance and closeChild immediately after spawn. The owner emits validated
RWI1 byte chunks as data, complete EOF as end, static faults as error and observed
native retirement as close. It assembles no encoded frame; the existing
PacketDecoder remains the only full-record parser/body allocator.

Writes borrow one immutable whole RWI1 Buffer through completion. Header/length
is checked before retaining the record. One active native send and a FIFO share
explicit record/byte budgets: defaults 32 records and 65,536 bytes. Refused writes
invoke only their own completion with a static error and perform no native write.
Only completion releases credit; callback reentry cannot bypass FIFO. Each service
turn dispatches at most 32 completed records or reads at most 32 bounded native
chunks. Further queued work yields through one setImmediate. Read pause removes
read interest without discarding an accepted partial record. Write interest is
enabled only for an unfinished native send; permanent writable polling is avoided.

Independent monotonic timers cover an active write or partial read, including a
paused consumer; new chunks do not extend a partial record deadline. Record timeout
is 20..1,000 ms, default 1,000, within the addon's fixed one-second deadline.
Destroy revokes readiness, clears queued work/timers, wipes active/unsent private
bytes and completes each accepted write once. Clean EOF is accepted only at a
record boundary. Consumer exceptions produce static owner failure, without
disclosing callback/record contents.

Native close completion has its own timer, distinct from message scheduling.
Retirement deadline is 20..5,000 ms, default 1,000. `retired` resolves only after
the addon reports its UV handle/descriptors released. Deadline/API failure rejects
that promise; it never reports observed retirement or permits resource transfer.
Host session cleanup must await this barrier alongside child completion before
releasing capacity/runtime ownership. The native addon retains uncertain slots;
broader OS/allocator/host failure recovery remains an acceptance gate.

The copied scalar snapshot reports bytes/records, partial-read count, pause,
destroy/retire state and a pending close timer. It exposes no payload or secret
and is not a public metrics/schema change. Successful secret writes still use
the parent's existing credential-buffer wipe policy; destroy handles unsent data.

Evidence distinguishes pure fake-adapter tests from actual Node/addon/kernel /
linked-worker lifecycle. No actual connected Linux RDP/audio/device or primary
WorkerProcess selection is claimed. [Iteration 198](history/iterations/151-200.md#iteration-198).
