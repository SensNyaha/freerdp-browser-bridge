# Iteration 199 — explicit primary packet supervisor activation

2026-10-14. Continues Stage 1 / ARCHITECTURE startup and isolation by selecting
the tested `b548a36` packet owner in WorkerProcess with a trusted-host option.
[Supervisor contract](NODE_SEQPACKET_SUPERVISOR.md). Ordinary default remains
framed pipes until matching-bundle/default/legacy preference gates are complete.

The supervisor binds before spawn, rechecks startup authority, inherits only
FD3, replaces bounded request/response I/O and gates ready on actual transport
identity before credentials. Failure revokes IPC; cleanup joins both native socket
retirement and the child. Native close uncertainty is retained and propagates a
stable close failure. No FreeRDP code moves into Node and no session secrets enter
argv/env/files or output.

Eight focused packet-supervisor cases pass: 100 sequential actual Node/native
workers with heartbeat/shutdown/no FD or directory leak; hard-killed worker;
hard-killed Node parent; cancellation while owner creation is held with zero late
spawns; explicit packet refusal of a fake legacy framed peer; synthetic wrong
transport HELLO refusing before config/secret; real handshake-backed REST; and
synthetic credentials via private settings/secret into a local refused native
connection with healthy heartbeat and no argv/env credentials.

The packet and existing framed/fake supervisor files pass together **21/21**.
Full Linux check **483 passed / 75 skipped / zero failures**, 558 cases;
linked Linux CTest **24/24**. Windows check **536 passed / 22 Linux-packet skipped /
zero failures**, 558 cases.
This is
native lifecycle/private-IPC evidence, not connected remote RDP or physical input
release. The addon sanitizer
runtime baseline from iteration 196, actual CI, Linux remote audio/input/platform /
resource/soak and Stage 1's broader isolation/abnormal cleanup gates remain open.

The next block implements default Linux preference without guessing support from
an untrusted peer or silently retrying an uncertain credential operation.
Local logs: `build/iteration-199-*`.
