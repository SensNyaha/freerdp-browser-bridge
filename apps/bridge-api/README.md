# @freerdp-bridge/api

## Purpose

Shared HTTP/WebSocket session API and reference browser assets for FreeRDP
Browser Bridge. The `./fastify` export mounts the bridge on an existing server.
Most applications should install `@freerdp-bridge/fastify`, which re-exports
this integration.

## Installation

```sh
# Linux x64 / glibc application server
npm install fastify@5.12.5 @freerdp-bridge/api @freerdp-bridge/runtime-linux-x64-gnu

# Windows x64 application server
npm install fastify@5.12.5 @freerdp-bridge/api @freerdp-bridge/runtime-win32-x64
```

## Requirements

Node.js 24, ESM, Fastify 5 and an explicitly installed native runtime of the
same product version as the JS packages. Ready binaries and private FreeRDP
libraries are in the runtime; consumers need no compiler or system FreeRDP.
Node.js and a browser are not bundled.

## Usage

```js
import Fastify from 'fastify';
import { rdpBridgePlugin, resolveNativeRuntime } from '@freerdp-bridge/api/fastify';

const app = Fastify();
const worker = await resolveNativeRuntime({ runtimeRoot: '/private/run/rdp-bridge' });
app.register(rdpBridgePlugin, {
  prefix: '/rdp',
  worker,
  allowedOrigins: ['https://app.example'],
  authenticate: request => verifyApplicationIdentity(request),
});
await app.listen({ host: '127.0.0.1', port: 8080 });
```

Implement `verifyApplicationIdentity` using verified host bearer/mTLS identity,
returning `{ id: verifiedUserId }` or `undefined`. It is not supplied here. Use
an absolute Windows runtimeRoot on Windows. The host owns external TLS and
logging policy: exclude credentials and attach URL tokens. Cookie identity
needs a separate CSRF/Origin adapter and is currently refused.

Routes share the host port under the required prefix. If the host has a
catch-all WebSocket dispatcher, use `upgradeMode: 'manual'` and the handle from
`onReady`. `handle.handleUpgrade(request, socket, head)` returns false for
foreign routes. Retain a closed manual handle to refuse late bridge upgrades.
`await app.close()` joins bridge cleanup; `await handle.close()` retires only
the bridge and preserves the host.

`@freerdp-bridge/api/browser` exports `referenceBrowserDirectory`. Serve its
optional HTML/JS through your static router and set client `basePath: '/rdp'`.
The package exports `./fastify` and `./browser`, with no root API import.

## HTML clipboard in 0.4.0

Select HTML explicitly in an authenticated session-create request:

```json
{"clipboard":{"mode":"bidirectional","text":true,"html":true,"maxItemBytes":1048576}}
```

This is only the clipboard portion; the host also supplies authorized target
and credentials. Require `clipboardHtml: true` in native capabilities. The
matched reference assets provide separate Paste/Send/Get/Copy actions and a
bounded safe static formatting profile. Offers do not read either clipboard.
HTML and Unicode share one item/flight/quota; unsupported HTML is refused
without an automatic text fallback. Image/file clipboard remains unavailable.
See the [HTML guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.4.0/docs/WEB_CONNECTION_EXAMPLE.md#html-development-workflow)
for integration, selected ranges and browser permission requirements. Before
publication, use complete verified local 0.4.0 archives; a source version does
not establish registry availability.

## Limitations

Bodies are strictly validated within 64 KiB. Session ownership, single-use
attach tokens and strict RDP certificate verification remain enforced. Inspect
`/rdp/v1/build` and `/rdp/v1/capabilities` for the native profile. Installation
does not accept all original V1 device capabilities. This is not a standalone
production identity service or deployment policy.

## License

Project-owned code and browser assets are MIT; see LICENSE. Native dependencies
retain their own terms in the separate runtime's THIRD_PARTY_NOTICES.md,
licenses and corresponding-source/.
