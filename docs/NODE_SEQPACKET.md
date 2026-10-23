# Prepared Node packet IPC adapter

Current readiness — iteration 197 adds `watch(handle, callback)`,
`interest(handle, mask)` and `closed(handle)`. Masks are 0 pause, 1 read,
2 write, 3 both. Each pair can bind one callback `(status, events)`; its async
resource stays owned through callback return. Watched close immediately removes
authority/refs/pending bytes, then preserves descriptor and capacity through
actual uv_close completion. `closed` reports that completion, including stale
handles; it does not close a replacement. Unwatched close stays synchronous.
Async environment cleanup joins watched handles before disposing its context.
Callback faults seal the pair and discard pending storage without forwarding
exception contents. Poll handles are unreferenced, so they do not keep an empty
environment alive. [Readiness evidence](ITERATION_197.md).

Hosts must enable write interest only for a pending send and pause read interest
when they cannot admit data. These level-triggered readiness calls add no
native message queue and do not themselves enforce an independent timeout when
the host is paused; bounded stream/timer/supervisor composition remains required.

Iteration 196 adds Linux `rdp-ipc.node`, an IPC-only N-API schema-1 module built
with public Node.js 24 headers. It links bridge framing/configuration utilities
and C++/OS runtime only. It must never link/include/call FreeRDP or WinPR; all RDP
work remains in the separate worker. Actual loaded-parent maps and artifact ELF
closure are checked independently of the child worker.

CMake `BRIDGE_NODE_IPC=ON` requires Linux, Node 24 and matching public headers.
The linked Linux bundled helper selects it and installs the module beside the
worker. Windows and default portable foundation do not select it. The ordinary
WorkerProcess/API still use framed pipes; this is a prepared transport primitive,
not an activated primary supervisor or public feature.

The private module exports `schemaVersion=1` and seven trusted-host functions:

| Function | Contract |
| --- | --- |
| create() | Creates one CLOEXEC AF_UNIX SOCK_SEQPACKET pair and returns a monotonically increasing handle |
| childFd(handle) | Returns the child endpoint solely for spawn stdio inheritance as FD3 |
| closeChild(handle) | Closes the parent's copy after spawn; repeated calls preserve ownership |
| write(handle, Buffer) | Validates one complete RWI1 record, pins its Buffer and attempts bounded nonblocking RWS1 send; true means complete, false means pending |
| flush(handle) | Attempts the same pending record, without duplicate encoding/write; true means complete |
| read(handle) | One validated/copied RWI1 chunk Buffer, null for would-block, undefined for clean EOF |
| close(handle) | Wipes pending data and scratch, drops references and closes both owned endpoints; stale handle cannot close a replacement |

There are at most 32 pairs per Node environment, one pinned encoded record per
pair, fixed 16,400-byte receive scratch and no native full-frame copy or second
pending-write queue. IDs never wrap/reuse in an environment. This prepared cap
matches the manager's default 32 sessions; integration must account explicitly
for larger configured limits rather than silently reducing them.

Only the addon closes its descriptors; callers must never close/reuse the numeric
child FD themselves. Callers transfer exclusive write ownership of the Buffer
until completion/close and must not mutate it. Detached backing storage is
rechecked before every send operation. Uncertain replacement, malformed profile,
timeout and peer errors are terminal. Completed write releases its reference;
the existing parent secret-write owner remains responsible for wiping completed
credential buffers. Refused/closed pending storage is wiped by the addon.

Every JS call uses nonblocking sendmsg/recvmsg, with at most 32 send datagrams
(512 KiB record data) or one receive datagram. No socket wait runs in Node.
Oversize/ancillary data and partial EOF are refused. A pending write or partial
receive has an original one-second deadline checked on subsequent adapter calls.
Independent timer/OS readiness wakeups, paused-reader ownership, finite close
completion and supervisor wiring are required before primary activation; this
primitive alone does not enforce a deadline when its host stops calling it.
The synthetic integration helper polls only in tests and is not a production
timer policy.

The environment cleanup hook opens an explicit N-API handle scope before wiping
and releasing active Buffer references, then closes all owned sockets. Normal
callbacks have their own scope. Per-environment exit is tested with a still-pinned
maximum record; allocator/handle-scope failure and resource/soak acceptance remain.
Errors expose only `IPC_ADAPTER_FAILURE`, without record/credential contents.

Evidence: [iteration 196](ITERATION_196.md). This does not establish ready audio,
connected Linux RDP, remote input release, public API primary selection or CI
execution.
