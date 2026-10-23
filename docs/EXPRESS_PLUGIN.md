# Express adapter contract

Target delivery: **0.2.4**, `@freerdp-bridge/express`. Feature `3c13ff6` is
accepted; [aligned release preparation](ITERATION_436.md) is in progress.
This document describes the implemented interface; release/publication
acceptance is recorded separately in TODO.

`createRdpBridgeExpress(server, options)` prepares the bridge against an existing
Node.js 24 HTTP/1.1 `http.Server` or `https.Server`. It returns a Promise of:

```ts
interface RdpBridgeExpressHandle {
  readonly middleware: import('express').RequestHandler;
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  diagnostics(): ReturnType<BridgeHandle['diagnostics']>;
  close(): Promise<void>;
}
```

Options are the [HTTP adapter options](NODE_HTTP_PLUGIN.md): mandatory explicit
non-root `prefix`, verified `authenticate`, worker/runtime configuration,
`allowedOrigins`, session policies, logging destination and
`upgradeMode: 'automatic' | 'manual'`. The adapter delegates to the same HTTP
implementation; it does not create another listener, worker model or wire
protocol. Initialization must finish before the host calls `listen()`.

## Middleware ownership

Use **`app.use(bridge.middleware)` before body parsers and URL rewrites**.
The configured prefix, for example `/rdp`, owns only `/rdp`, `/rdp/...` and
`/rdp?...`; `/rdp-other` remains foreign. Owned requests terminate inside the
bridge. Foreign requests call `next()` without accessing their body, headers
or response. A root-mounted `express.Router()` also works when its effective
`baseUrl` is empty. The accepted framework profile is Express 5.3.0.

Express path mounts strip `req.url`, while `req.originalUrl` retains the
external URL ([official request API](https://expressjs.com/en/5x/api/request/)).
This adapter uses the original URL to determine ownership. For an owned request,
a nonempty `baseUrl` or changed URL produces HTTP 500
`EXPRESS_BRIDGE_ROOT_REQUIRED`, without echoing request/query data. Therefore
`app.use('/rdp', bridge.middleware)` and a Router mounted at `/rdp` are incorrect.
The middleware neither restores nor rewrites URLs. A foreign external request
rewritten to `/rdp/...` remains foreign to this middleware.

An already parsed body produces HTTP 400 `BRIDGE_RAW_BODY_REQUIRED`. Body
reserialization would defeat strict schema validation and allocation limits;
it is deliberately refused. The bridge's 64-KiB JSON limit includes fixed and
chunked input. Host routes retain their independent parser and body limits.
Framework errors occurring before the bridge remain the host's responsibility.

## WebSocket and lifecycle

Automatic mode shares the HTTP core's selective server upgrade listener. Manual
mode requires the host's single dispatcher to call `handleUpgrade()` first and
return immediately when it returns true. False leaves foreign request/socket/
head untouched. HTTP middleware and ordinary Express authentication middleware
do not run for WebSocket upgrades; verified identity belongs in the bridge's
raw-request callback. The host remains responsible for rejecting wholly
unclaimed upgrades and closing its other WebSocket services.

At most 16 non-overlapping bridge prefixes share one host-close observer and
one automatic upgrade listener. Closing one handle preserves other prefixes,
host HTTP and host WebSockets. `close()` is idempotent, returns the same promise
and joins bridge sessions, workers, sockets and private runtime cleanup. The
host must await it; a server close observer cannot make Node wait for asynchronous
cleanup. Close the bridge and other application WebSockets before awaiting the
host's `server.close()` completion, because upgraded sockets can keep that
completion pending. Failed initialization retires resources before rejecting.

Authentication, Cookie refusal, origin checks, principal ownership, target
policy limits and bearer/attach-token distinctions follow
[HOST_AUTHENTICATION.md](HOST_AUTHENTICATION.md). No Express session/account
store, CSRF implementation, target allowlist or HTTP CORS policy is supplied.
Diagnostics remain bounded and contain no credentials. The host must keep its
own access/error logging from recording bridge query tokens or RDP bodies.

## Runtime and boundaries

Exports include native runtime resolution and common bridge types. Reference
browser assets resolve from `@freerdp-bridge/express/browser`; no checkout path
is required. Native packages provide their own inventory, notices and source
companions. FreeRDP 3.32.1 runs in one separate C++ worker per session, never
inside Express/Node. The shared codec/session/device capability boundaries
remain unchanged. HTTP/2 and unaccepted native OS/architecture/device profiles
are not implied by an Express peer dependency range.

[Real project guide](EXPRESS_USAGE.md). Verification distinguishes fake media,
native TLS/lifecycle and actual Astra/RED OS desktop integration; acceptance
evidence is added only after the corresponding checks pass.
