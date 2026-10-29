# @freerdp-bridge/http

## Purpose

Mount FreeRDP Browser Bridge in a Node.js 24 `node:http` or `node:https`
application on its existing port. One native C++ worker runs outside Node per
session. The bounded session/media engine uses an internal Fastify router;
your application does not need to use Fastify as its server framework.

HTTP/HTTPS integration introduced in **0.2.3**. All bridge packages and the
native runtime use one product version.

## Installation

Install the published release with the matching native runtime:

```sh
npm install @freerdp-bridge/http@0.6.0 @freerdp-bridge/runtime-linux-x64-gnu@0.6.0
```

Windows x64 uses `runtime-win32-x64` instead. All bridge versions must match.
For an unpublished development snapshot use a complete local tarball graph.

## Requirements

Node.js 24 and a browser are prerequisites. Native packages contain compiled worker/private libraries;
consumers need no compiler, CMake or system FreeRDP. macOS/ARM/musl packages
are not supplied. Only HTTP/1.1 is in the intended initial profile.

## Usage

```ts
import { createServer } from 'node:http';
import { createRdpBridgeHttp, resolveNativeRuntime } from '@freerdp-bridge/http';

const server = createServer((request, response) => {
  if (bridge.handleRequest(request, response)) return;
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end('{"host":true}');
});
const bridge = await createRdpBridgeHttp(server, {
  prefix: '/rdp',
  worker: await resolveNativeRuntime({ runtimeRoot: '/private/run/rdp-bridge' }),
  allowedOrigins: ['https://app.example'],
  authenticate: request => verifyApplicationIdentity(request),
});
server.listen(8080, '127.0.0.1');
```

`verifyApplicationIdentity` belongs to the host and returns `{ id: verifiedId }`
or undefined after actual bearer/mTLS verification. Cookies are refused. Use an
absolute Windows runtimeRoot on Windows. The host must delegate owned requests
before body parsing and must not send a second response after a true return.
Foreign requests/sockets are untouched. There is no extra HTTP listener.

Automatic upgrades are prefix-selective. With a catch-all host WS dispatcher,
set `upgradeMode: 'manual'`, then first call
`bridge.handleUpgrade(request, socket, head)` and return if true. Delegate a
false result to the application's own WS router. Do not register competing
catch-all request or upgrade listeners.

Await `bridge.close()` to join its workers/WS without closing the host server.
Close the bridge before awaiting the host listener's close callback; upgraded
WS can keep that callback pending. The host closes foreign WS separately. The host-close
observer is a cleanup fallback; awaiting close is still required for joined
shutdown and cleanup errors. `diagnostics()` is bounded local telemetry.
`./browser` exports `referenceBrowserDirectory`; serve only those assets and
configure the browser client with the same `basePath: '/rdp'` for attach/reattach.

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

The host owns TLS, identity, destination policy, safe access logging and its
request/WS dispatcher. RDP certificates remain strict by default. Bridge JSON
is limited to 64 KiB, including chunked requests. Already consumed/preparsed
bodies are refused. Device/audio capabilities and actual platform acceptance
remain separate from HTTP adapter tests. No profile/credential persistence or
arbitrary FreeRDP argv is added.

## License

Project-owned code is MIT (LICENSE). Native dependencies retain their own terms
in the runtime's notices, licenses and corresponding-source directory.
