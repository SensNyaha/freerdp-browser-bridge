# @freerdp-bridge/express

## Purpose

Embed the FreeRDP browser bridge in an existing Express 5 application on its
HTTP/HTTPS and WebSocket port. Each RDP session runs in a separate native worker.
The adapter delegates bounded routing and lifecycle to `@freerdp-bridge/http`.

## Installation

```sh
npm install express@5.3.0 @freerdp-bridge/express@0.4.0 @freerdp-bridge/runtime-linux-x64-gnu@0.4.0
```

For an unpublished source snapshot, use complete local tarballs instead; a
source version number alone does not establish registry availability.
Windows x64 selects `@freerdp-bridge/runtime-win32-x64` of the same version
instead. Install the runtime explicitly; it is not downloaded by the resolver.
Shared JS packages (http/api/node/config/protocol) install automatically as
transitive dependencies and do not need separate commands.

## Requirements

Node.js 24, ESM, Express 5 (initial test profile 5.3.0), HTTP/1.1 with WebSocket
upgrades, and a linked native runtime for Windows x64 or Linux x64 glibc. Use
`resolveNativeRuntime` to select the matching installed native package, or supply
an explicitly built worker through `worker`. Production installs do not need
CMake, a compiler, global FreeRDP or a second bridge listener.

## Usage

```js
import express from 'express';
import { createServer } from 'node:http';
import { createRdpBridgeExpress, resolveNativeRuntime } from '@freerdp-bridge/express';

const app = express();
const server = createServer(app);
const bridge = await createRdpBridgeExpress(server, {
  prefix: '/rdp',
  worker: await resolveNativeRuntime({ runtimeRoot: '/private/bridge-run' }),
  authenticate: request => verifiedHostIdentity(request),
  allowedOrigins: ['https://app.example'],
});
app.use(bridge.middleware); // Root mount, before parsing or rewriting URLs.
app.use(express.json({ limit: '1mb' })); // Independent host routes.
app.get('/host', (_request, response) => response.json({ ok: true }));
server.listen(8080, '127.0.0.1');

// In the host shutdown hook, close bridge sessions before waiting on server.close.
await bridge.close();
await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
```

`verifiedHostIdentity` belongs to the host application: verify a bearer token or
mTLS identity and return `{ id: stableUserId }`, otherwise `undefined`. Merely
checking that a header exists is not authentication. Bridge callbacks receive
raw Node requests; later Express guards or parsed `request.user` are not used.
TLS termination belongs to the host/proxy. Use `createServer` from `node:https`
with the host's TLS configuration for same-port HTTPS/WSS.

`handleUpgrade` selectively dispatches bridge paths in `upgradeMode: 'manual'`;
false leaves other sockets untouched. Automatic mode adds a shared selective
listener to the supplied server. `diagnostics()` exposes bounded counters;
`close()` joins only bridge resources and is idempotent.

Browser assets are exported as `referenceBrowserDirectory` from
`@freerdp-bridge/express/browser`. Copy or serve an explicit static allowlist;
the package does not automatically expose arbitrary filesystem paths.

## HTML clipboard in 0.4.0

The matched native/runtime and reference browser assets support explicit HTML
clipboard selection alongside Unicode. Enable `clipboard.html: true`, select
a direction and a finite item maximum, and require native `clipboardHtml: true`.
The reference UI uses separate Paste/Send/Get/Copy actions with browser permission
and bounded safe static formatting; it never reads a clipboard on an offer.
Custom worker factories must preserve the whole frozen session limits object.
Image/file clipboard remains unavailable. See the
[HTML integration guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.4.0/docs/WEB_CONNECTION_EXAMPLE.md#html-development-workflow)
for API policy and limitations. Until publication, use complete verified local
0.4.0 archives; a source version does not prove npm availability.

## Limitations

Use `app.use(bridge.middleware)` at the root, including inside an existing app.
The explicit prefix already selects the bridge namespace. Mounting with
`app.use('/rdp', ...)` or a mounted Router strips the URL and is refused with
`EXPRESS_BRIDGE_ROOT_REQUIRED`. Put the middleware before body parsers; consumed
bodies are refused with `BRIDGE_RAW_BODY_REQUIRED`. The bridge owns a 64 KiB JSON
limit without changing host parser limits. HTTP/2 is not accepted.

REST and WebSocket authentication reject Cookie headers. Scope host cookies
away from the bridge prefix or use a cookie-free API origin with host-managed
CORS/preflight. Origin allowlisting alone is not CORS. Keep application bearer
tokens separate from RDP credentials and short-lived attach tokens.

This adapter does not implement application accounts, persistent profiles,
cross-user authorization, target network allowlists, or unaccepted device/full
V1 capabilities. Configure trusted host orchestration and egress policy. Use
capability reports and the main project's acceptance evidence for RDP support.

## License

MIT for this JavaScript adapter. Native runtime packages include the pinned
FreeRDP/WinPR, codec libraries, notices and corresponding source material with
their respective licenses.
