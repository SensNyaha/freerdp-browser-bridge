# @freerdp-bridge/express

## Purpose

Embed the FreeRDP browser bridge in an existing Express 5 application on its
HTTP/HTTPS and WebSocket port. Each RDP session runs in a separate native worker.
The adapter delegates bounded routing and lifecycle to `@freerdp-bridge/http`.

## Installation

```sh
npm install express@5.3.0 @freerdp-bridge/express@0.6.0 @freerdp-bridge/runtime-linux-x64-gnu@0.6.0
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

## HTML clipboard

The matched native/runtime and reference browser assets support explicit HTML
clipboard selection alongside Unicode. Enable `clipboard.html: true`, select
a direction and a finite item maximum, and require native `clipboardHtml: true`.
The reference UI uses separate Paste/Send/Get/Copy actions with browser permission
and bounded safe static formatting; it never reads a clipboard on an offer.
Custom worker factories must preserve the whole frozen session limits object.
File clipboard remains separate. See the
[HTML integration guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/WEB_CONNECTION_EXAMPLE.md#html-development-workflow)
for API policy and limitations. Until publication, use complete verified local
0.5.0 archives; a source version does not prove npm availability.

## Image clipboard in 0.5.0

Image clipboard was introduced in the accepted 0.5.0 release. Keep JS and
native runtime versions matched when using it in later releases.

Version 0.5.0 adds `clipboard.images: true` with a direction, `text: true`
and finite `maxItemBytes`. Require native `clipboardImage`, `clipboardText` and
`clipboardRevoke`; custom worker factories must preserve the frozen limits.
The reference browser provides separate PNG Paste/Send/Get/Copy/Clear actions.
Images share text/HTML authority, one transfer flight and revoke; offers never
read the OS clipboard automatically. RGBA8 pixels and the complete native DIBV5
write must fit the item quota, with a 16 MiB ceiling. File clipboard is separate.
Published 0.4.0 does not contain this feature: use matching verified 0.5.0
JS/native artifacts. See the
[application guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/CLIPBOARD_SESSION.md#application-integration-for-the-developing-image-feature)
for session JSON, readiness, typed control methods, buffer wiping and exact
browser/RDP acceptance limits.

## Managed files in 0.6.0

Enable trusted server-side `sessions.files` limits to expose authenticated
streaming file routes and select session-sandbox drives in session JSON.
`thinclientDrives` is an alias for those descriptors, including read-only
shares. Use matching 0.6.0 JS/native packages; published 0.5.0 does not
provide these file APIs. Session input cannot select an arbitrary host path.

OS file-manager Ctrl+C/Ctrl+V remains deferred (`clipboardFiles: false`).
See the [file policy, routes, framework examples and tested scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.6.0/docs/FILES.md).

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
