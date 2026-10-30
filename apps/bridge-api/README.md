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

## HTML clipboard

Select HTML explicitly in an authenticated session-create request:

```json
{"clipboard":{"mode":"bidirectional","text":true,"html":true,"maxItemBytes":1048576}}
```

This is only the clipboard portion; the host also supplies authorized target
and credentials. Require `clipboardHtml: true` in native capabilities. The
matched reference assets provide separate Paste/Send/Get/Copy actions and a
bounded safe static formatting profile. Offers do not read either clipboard.
HTML and Unicode share one item/flight/quota; unsupported HTML is refused
without an automatic text fallback. File clipboard remains separate.
See the [HTML guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/WEB_CONNECTION_EXAMPLE.md#html-development-workflow)
for integration, selected ranges and browser permission requirements. Before
publication, use complete verified local 0.5.0 archives; a source version does
not establish registry availability.

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
shares. Use matching JS/native product versions; published 0.5.0 does not
provide these file APIs. Session input cannot select an arbitrary host path.

OS file-manager Ctrl+C/Ctrl+V remains deferred (`clipboardFiles: false`).
See the [file policy, routes, framework examples and tested scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.6.0/docs/FILES.md).

## Host-device inventory in 0.7.0

Version 0.7.0 adds this API; public 0.6.0 does not contain it. Keep JS/native
versions matched. Until publication, use the complete verified local archives. It lists metadata on the application
server; it does not list devices on the browser computer or redirect a device.

```js
import { resolve } from 'node:path';
import { discoverHostDevices, resolveNativeRuntime } from '@freerdp-bridge/api/fastify';

const worker = await resolveNativeRuntime({
  runtimeRoot: resolve('.runtime/operator-inventory'),
});
const report = await discoverHostDevices(worker, {
  classes: ['printers', 'smartcards', 'serial', 'parallel', 'usb'],
  maxDevices: 16,
});
for (const group of report.classes)
  console.log(group.kind, group.status, group.devices.length);
```

Use a private writable runtime directory and trusted operator access; no HTTP
inventory route is added automatically. Each call creates and joins one fresh
native worker without an RDP connection or credentials. The maximum is global
across selected classes (1–128); `limit` means an incomplete snapshot and
`available` may be empty. Handle `unavailable`, `denied`, `unsupported` and
`failure` explicitly. IDs are snapshot metadata, not device-open authority;
avoid exposing names/IDs in public logs. [Providers, bounds and tested scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/main/DEVICE_REDIRECTION.md#host-inventory-in-the-development-branch).

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
