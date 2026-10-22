# node:http integration — development target 0.2.3

Implemented on separate `feature/node-http-0.2.3`, after accepted NestJS 0.2.2.
Implements SPECIFICATION §2.1/2.11/2.12 and §3.1/3.2 with ADR-001/005/007/008.
This is an unreleased adapter: source manifests remain at the last stable
product version until separate release preparation. It is not a published
`@freerdp-bridge/http@0.2.2` package. Prior tags/archives are immutable.

## Public interface

`@freerdp-bridge/http` exports
`createRdpBridgeHttp(server, options): Promise<RdpBridgeHttpHandle>`,
`RdpBridgeHttpOptions`, `RdpBridgeHttpHandle` and `BridgeHttpServer`, plus the
existing native runtime resolver and worker/session types. The `./browser`
export provides installed `referenceBrowserDirectory`.

The server must be a real Node `http.Server` or `https.Server` for HTTP/1.1.
HTTP/2 is refused. Node.js 24 is required; initial tests use 24.21.0. Options
require an explicit absolute `prefix`, worker options and verified
`authenticate(IncomingMessage)` callback. There is no default principal. Existing
Origin/cookie/certificate/ownership and target policy remain in the shared core.
The host application need not use Fastify, but the internal bounded router
uses pinned Fastify 5.12.5 and the existing bridge plugin/session/media engine.

The returned handle provides:

- `handleRequest(request, response): boolean`: true transfers exclusive ownership;
- `handleUpgrade(request, socket, head): boolean`: false leaves foreign data untouched;
- `diagnostics()`: the existing fixed bounded lifecycle snapshot;
- `close(): Promise<void>`: idempotently joins bridge-owned resources.

## Composition and bounds

Prepare the handle before listen. The host's **one request dispatcher** calls
`handleRequest` before body parsing and returns after true. The factory does
not add a competing `request` listener and never rewrites URLs, listens on
another port, changes host limits or installs global host error/not-found rules.
Foreign requests are not authenticated, parsed or answered by the adapter.
The same raw IncomingMessage/ServerResponse reaches the bridge router.

Prefix limits remain 128 ASCII characters, 16 components and 16 non-overlapping
mounts per host server. The bounded mount pool shares one host-close observer
and one automatic upgrade dispatcher; it does not change maxListeners. Closing
one mount preserves the others. Release is idempotent and verifies pool identity
before removing a reservation. Failed admission removes acquired observers and
resources. A host close during admission joins initialization before retirement
and refuses the new handle.

Bridge JSON remains limited to 64 KiB, including chunked requests. A previously
consumed body or custom `request.body` refuses with `BRIDGE_RAW_BODY_REQUIRED`.
Reserializing an already allocated host body is not a substitute for the raw
parser bound. Host routes retain their own parsers/limits. Frame/control/audio
queues, token lifetimes, native parser bounds and public wire records are unchanged.

`upgradeMode: 'automatic'` uses the selective shared listener. Other host
listeners must also select only their paths. A catch-all WS router uses
`upgradeMode: 'manual'` and delegates first to `handleUpgrade`; true must never
reach a second consumer. Keep a closed manual handle in the dispatcher until
host shutdown so late owned upgrades receive refusal. Independent close removes
only the adapter's automatic registration.

## Shutdown ownership

The adapter does not own the host listener or foreign WS. Await `bridge.close()`
to drain workers/control/media, then close the host listener and its own WS.
Alternatively initiate server close, join bridge/foreign WS and only then await
the server close callback. Awaiting that callback first can wait indefinitely
for upgraded sockets. `closeAllConnections()` is not a WebSocket drain.

The host-close event observer is a fallback for cases where the server close
event can occur; it cannot make that event happen while owned/foreign upgraded
sockets are still open. EventEmitter does not await async cleanup. The host must
await the same public close promise, including its fixed cleanup error. Existing
in-flight handlers, host signals and global process lifetime remain host-owned.
Dynamic remount on an already listening host is not an accepted profile here.

These boundaries follow the official Node 24
[HTTP upgrade](https://nodejs.org/docs/latest-v24.x/api/http.html#event-upgrade)
and [server close](https://nodejs.org/docs/latest-v24.x/api/http.html#serverclosecallback)
contracts; they do not add protocol multiplexing or native code inside Node.

## Verification boundary

Initial focused Windows and Linux matrices pass 9/9: automatic/manual same-port
HTTP/WS, strict JSON admission, fixed/chunked limits, independent host body
survival, identity/Origin/cookie refusal, fake binary media/diagnostics/log
canaries, coordinated close with live control, preparsed refusal, bounded 16
mounts/listener preservation, invalid HTTP2/options, failed/closed admission,
actual native strict TLS refusal and verified host HTTPS/WSS.

The first test incorrectly awaited host close before closing its live upgraded
socket. That test hangs and is retained as a failure; the corrected joined
shutdown follows the explicit public contract above. No production timeout or
assertion is relaxed. Initial combined README headings also fail the mandatory
README guard; the package now has separate required sections.

Fresh external Windows/Linux tarball projects pass strict TypeScript and all
10 installed-package cases, including browser assets and actual native TLS.
Full linked checks pass Windows 941 / 61 skips and Linux 918 / 87 skips, zero
failures. Unchanged 0.2.2 native CTest repeats pass MSVC 36/36 and GCC 8.3 37/37.
Clean offline Linux source build discovers seven publishable packages and
passes production deploy/import with unchanged lockfile.

Actual installed-package Astra Linux 1.7.5 and RED OS 7.3 desktop profiles pass
through automatic and manual upgrades with H.264 and JPEG: nonuniform output,
confirmed resize/restoration, fresh-token reattach, host HTTP/diagnostics and
joined cleanup. These use the accepted local native 0.2.2 archive, not a newly
published runtime. [Evidence and retained failures](ITERATION_431.md).

Aligned 0.2.3 artifacts/tag and npm publication remain required. Fake media and
native certificate fixtures remain distinct from actual desktop/device support.
Original full V1/installer gates remain in TODO.
