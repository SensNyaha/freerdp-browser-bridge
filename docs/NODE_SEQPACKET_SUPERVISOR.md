# Explicit packet transport in the Node supervisor

Iteration 199 exposes trusted-host `WorkerOptions.ipcTransport` with two exact
values: `framed-pipes` (current default) and `unix-seqpacket-rws1` (Linux only).
This is not a browser/session RDP setting and never maps to arbitrary FreeRDP
argv. The primary selector uses only `--ipc-seqpacket-fd=3`; credentials continue
to follow HELLO through separate private RWI1 settings/secret messages.

Before spawn, startup creates the private runtime marker, loads the colocated
schema-1 IPC-only addon and asynchronously binds the bounded packet owner. Current
startup authority is rechecked after binding, so cancellation cannot spawn a late
child. Windows/unknown transport values fail explicitly; a missing/invalid addon
does not silently downgrade an explicit packet request. Capacity is the addon's
documented fixed 32 pairs/environment; larger host policies remain an integration
gate, not a reduced public maxSessions setting.

Spawn inherits the child endpoint as FD3 and closes the parent's copy after child
supervision is registered. The existing bounded request map, parser, secrets wipe,
heartbeat and lifecycle use the packet owner instead of stdin/stdout. Unused
stdout and all stderr are drained without forwarding upstream text. HELLO must
report `unix-seqpacket-rws1` before ready/configure/secret; a mismatched peer is
refused. The default framed path and explicit fake-peer seams remain unchanged.

Failure revokes native IPC immediately. Child completion and observed native
socket retirement both precede runtime cleanup. Uncertain native retirement
keeps its owner and causes close rejection; a complete child alone is not taken
as released socket ownership. Normal close/force/crash/parent-death/startup
cancellation retain bounded deadlines and no stale reuse of pair handles.

`probeWorkerBuild` and build REST report the selected transport from the actual
handshake. Standalone CLI/default invocation still report framed pipes; when
comparing CLI to an explicitly selected primary handshake, transport is the
expected differing field. No public RWI1/browser fields change.

Verification distinguishes actual kernel/native lifecycle/private connection
refusal from fake legacy peers and synthetic metadata mutation. No connected
Linux remote desktop/audio/device or changed-certificate integration is claimed.
[Evidence](ITERATION_199.md).

STACK's preferred Linux primary remains required. Automatic default selection /
matching-bundle and old-peer fallback policy, including larger capacity handling,
is the next activation step; current explicit selection does not complete that
preference gate or the entire Stage 1.
