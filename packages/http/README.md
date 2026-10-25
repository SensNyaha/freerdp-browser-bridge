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
npm install @freerdp-bridge/http@0.3.0 @freerdp-bridge/runtime-linux-x64-gnu@0.3.0
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
