# Target architecture

## 1. Component model

```text
Browser / future Web UI
        |
        | HTTPS + WSS
        v
+---------------------------+
| Node.js Bridge API        |
| - auth hook/token check   |
| - config validation       |
| - session registry        |
| - attach tokens           |
| - control WS              |
| - media WS forwarding     |
| - browser file API        |
| - metrics/audit           |
+-------------+-------------+
              |
              | per-session UDS / binary IPC
              v
+---------------------------+
| rdp-worker (one/session)  |
| - FreeRDP/WinPR           |
| - GDI/framebuffer         |
| - cursor extraction       |
| - video encoder           |
| - rdpsnd virtual sink     |
| - audin virtual source    |
| - RDPDR + device plugins  |
| - reconnect state         |
+-------------+-------------+
              |
              | RDP/TLS/NLA/Gateway
              v
         RDP / XRDP server
```

Optional physical/browser-host device path:

```text
Browser UI <--WSS--> Node Bridge <--mutual-auth tunnel--> Local Companion Agent
                                                         | USB/PCSC/serial
                                                         v
                                                   local devices
```

The companion is a separate later product slice. The core bridge must work without it.

## 2. Session isolation

Every RDP session has:

- worker process PID;
- UDS endpoint inherited or created under a private runtime directory;
- random 128-bit session identifier not derived from host/user;
- temporary directory `runtime/sessions/<id>/` mode 0700;
- sandboxed drive root;
- printer spool directory;
- bounded IPC queues;
- independent logs/metrics labels without credentials;
- cleanup deadline.

The Node parent launches workers using `spawn` with an argument containing only a config descriptor path or inherited fd. Credentials are delivered after spawn through IPC or an inherited anonymous pipe, never as command-line arguments or environment variables that could leak through process inspection.

## 3. Worker lifecycle

1. Node validates and normalizes session config.
2. Node creates private runtime directory and IPC pair.
3. Node spawns `rdp-worker` with inherited IPC descriptor.
4. Node sends `HELLO` with protocol version and non-secret config.
5. Worker responds with build/capability set.
6. Node sends secret auth material over IPC.
7. Worker initializes FreeRDP settings and addins.
8. Worker enters RDP connect loop and emits state changes.
9. On certificate/auth prompt, worker pauses connection and sends a typed prompt to Node.
10. After connect, worker publishes display/audio/cursor metadata and encoded media.
11. Browser control messages are validated by Node and translated to IPC.
12. On close, Node requests graceful disconnect, waits a deadline, then terminates worker if necessary.

## 4. Graphics architecture

Use FreeRDP GDI and update callbacks to maintain a canonical BGRA framebuffer in the worker. The worker records dirty rectangles between `BeginPaint`/`EndPaint` or equivalent GFX frame boundaries.

`FrameScheduler` behavior:

- coalesce overlapping dirty rects;
- emit at most `maxFps`;
- if dirty area is small, still encode from the same full-frame backing buffer so the browser receives a normal H.264 stream;
- do not encode on remote cursor-only movement;
- force IDR after attach, decoder reset, resize and severe queue drop;
- permit a future tile codec transport behind `IVideoEncoder` but do not fork session logic.

Do not send raw BGRA full frames through Node in production.

## 5. Audio architecture

Implement a custom FreeRDP `rdpsnd` device backend that receives decoded/mixed PCM from the RDP channel and feeds `AudioPipeline`. The pipeline normalizes to a selected rate/channel layout and either:

- packetizes PCM for baseline mode; or
- encodes Opus frames for production mode.

Implement a custom `audin` backend whose capture callback reads from a bounded ring populated by browser microphone packets.

Do not route browser audio through host PulseAudio/PipeWire. Host audio backends may exist only as a diagnostic option.

## 6. Cursor architecture

FreeRDP pointer callbacks update a `CursorState` object. The worker sends shape updates only when the shape changes and position/visibility events separately. Browser draws the cursor in a DOM/canvas overlay using hotspot metadata. This removes cursor-only invalidations from the video encoder and substantially reduces perceived latency.

## 7. Input architecture

The browser reports physical key `code`, modifier state and logical key where needed. Node validates the message and sends a normalized input event to the worker. The worker maintains a pressed-key set and emits corresponding FreeRDP scancode/Unicode input. On browser detach or focus loss, it synthesizes releases for all pressed keys/buttons.

Mouse move events are coalesced in Node/worker; clicks and key transitions are never coalesced or reordered.

## 8. File and drive architecture

Browser file upload is not sent through clipboard as one giant payload. Node writes uploads into a per-session sandbox using streaming I/O. The native worker exposes explicitly configured subdirectories as RDPDR drives. Browser downloads from that sandbox use a separate authenticated HTTP streaming endpoint.

For the managed-file implementation, Node owns the HTTP stream and forwards
bounded binary chunks through the existing private IPC to the session worker.
That worker is the sole owner of filesystem mutation and quota accounting for
both HTTP and RDPDR. Node does not perform parallel pathname writes beside it.
This refines the streaming-I/O description above; it does not move FreeRDP into
Node or introduce another worker. The private file service is in development;
its implementation does not by itself establish the HTTP/RDPDR acceptance gate.

A drive config never contains an arbitrary host path from a non-admin browser request. Logical names map to policy-approved roots.

The native drive backend uses `ScopedSandbox` pins over that same owner.
Share roots and immutable read-only policy are checked under the owner's mutex
for each final operation; a previously resolved key cannot bypass subtree
membership after a namespace change. `DriveSession` shares one bounded handle
and delete-pending registry across all drive aliases. Connection setup obtains
scopes before channel producers start, serialized with file-service setup;
subsequent scoped operations synchronize with HTTP through the sandbox owner.
Channel producers and their views/pins must join before owner cleanup. This
backend does not yet establish the FreeRDP device/IRP or real RDP acceptance.

Managed file timestamps and DOS attributes belong to the session VFS owner.
They are common to HTTP file views and every drive alias, initialized at entry
creation and checked/updated under the same namespace mutex. They do not
rewrite host permissions, POSIX ctime or OS file attributes. RDP file handles
keep independent automatic-time suppression state; that state cannot suppress
updates made through another handle. Read-only file attributes constrain
existing writers, replacement, rename and deletion, while owner cleanup keeps
its separate verified reclamation authority. Download pins also block metadata
changes.

`MAXIMUM_ALLOWED` is a separate internal open selector, expanded after resolving
the entry's share and virtual read-only attributes. Explicit forbidden rights
still refuse the open. Sharing and subsequent operations use the fixed granted
mask; clearing an attribute cannot upgrade a handle. This neither grants host
ACL/security rights nor changes the existing RDPDR/private IPC wire layouts.
The metadata is live session state, not persistent profile storage;
the dead-owner cleanup implementation uses a separate native declaration bound
to the runtime/container directory identities. It owns only the private fixed
`.data`/`.uploads` trees and requires complete bounded preflight, an absent owner
endpoint and joined worker leases before deletion. Unknown runtime siblings
retain all content. It does not reconstruct the VFS or introduce a profile
store. Automatic retirement while Node remains alive joins the worker, IPC and
probes, closes that session's endpoint, revalidates the startup cohort and runs
the helper for only that owned directory. Registry capacity follows confirmed
cleanup, including completion after public waiting deadlines; uncertain cleanup
retains files and capacity. Full recovery/product acceptance remains separate.
[Recovery contract](docs/RUNTIME_RECOVERY.md#claimed-managed-file-trees-unreleased).

Trusted file policy may opt into XRDP legacy deletion before the connection
starts. The default retains strict requested-access semantics. The optional
adapter recognizes an exact metadata-only unlink selector and grants only
disposition after ordinary root, read-only, sharing and pin checks. It also
joins never-used handles from the same device's exact XRDP mkdir selector
only after an authorized legacy disposition for that entry. Any attempted use
of such a creator makes it an ordinary live handle; alias and other live
handles retain last-close ownership. This peer compatibility rule changes no
host ACL, native sandbox membership, quota or cleanup authority.

## 9. Printer architecture

Two modes:

- `host`: redirect an explicitly allowlisted bridge-host printer/CUPS queue;
- `spool`: a virtual redirected printer backend captures spool jobs into the session spool directory and emits `printer.job.ready` so the future web client can download or route the job.

The spool mode requires server-side-compatible printer driver behavior and must be tested against target Windows versions. It is not acceptable to claim generic driver compatibility without integration tests.

## 10. Smartcard / USB / serial architecture

Bridge-host device redirection uses FreeRDP's native channel implementations and OS libraries (`pcsc-lite`, `libusb`, device nodes). Browser-host physical devices require a companion agent. The server API capability model must expose `origin: bridge-host | browser-virtual | companion` for every device.

## 11. Backpressure and congestion

There must be bounded queues at each boundary:

- FreeRDP update → frame scheduler: one current framebuffer + dirty region set, not frame queue;
- encoder output: maximum N access units / milliseconds;
- worker → Node IPC: priority lanes; control/audio ahead of video;
- Node → browser WebSocket: inspect `bufferedAmount`; when threshold exceeded, drop pending non-key video and request a fresh keyframe.

Never let TCP backpressure cause an unbounded in-memory queue.

## 12. Process supervision

Node tracks worker heartbeat and last media/control timestamps. Policies:

- no heartbeat for configured interval → `unresponsive`, request dump/log marker, terminate after grace;
- worker exits unexpectedly → session `failed`, preserve bounded diagnostic tail, clean temp resources;
- Node exits → worker receives parent-death signal on Linux or loses inherited control fd and self-terminates;
- only explicit reconnect logic may create a new worker for an existing logical session.

## 13. Stateless core

The bridge does not own user connection profiles. A future web product stores profiles. The bridge accepts one normalized session config and returns runtime state. Persistent local state is limited to optional trusted-certificate fingerprints, host policy and audit configuration.
