# @freerdp-bridge/nestjs

## Purpose

NestJS module for mounting FreeRDP Browser Bridge HTTP/WebSocket routes on the
application's existing port. Uses the existing session/media engine and one
native C++ worker per session; FreeRDP runs outside Node.js.

NestJS integration introduced in **0.2.2**, with Express and FastifyAdapter
profiles. All bridge packages and the native runtime use one product version.

## Installation

Install the matching release on Linux x64/glibc:

```sh
npm install @freerdp-bridge/nestjs@0.6.0 @freerdp-bridge/runtime-linux-x64-gnu@0.6.0
```

During release preparation use complete verified local archives; a source
version alone does not establish registry availability.

On Windows x64 select `@freerdp-bridge/runtime-win32-x64` instead. All bridge
packages and the runtime must share the same product version. The runtime is
an explicit dependency and includes ready binaries/private libraries; consumers
need no GCC, CMake or system FreeRDP.

## Requirements

Node.js 24, ESM and NestJS 12.2 with its Express or Fastify HTTP/1.1 adapter.
Install the usual Nest common/core, selected platform adapter, reflect-metadata
and RxJS dependencies in the host application. Node.js and a browser are not
bundled. macOS, ARM and musl runtime packages are not provided here.

## Usage

```ts
import { Module } from '@nestjs/common';
import { RdpBridgeModule, resolveNativeRuntime } from '@freerdp-bridge/nestjs';

@Module({
  imports: [RdpBridgeModule.forRootAsync({
    useFactory: async () => ({
      prefix: '/rdp',
      worker: await resolveNativeRuntime({ runtimeRoot: '/private/run/rdp-bridge' }),
      allowedOrigins: ['https://app.example'],
      authenticate: request => verifyApplicationIdentity(request),
    }),
  })],
})
export class AppModule {}
```

Provide verified host bearer/mTLS authentication returning `{ id: verifiedId }`
or undefined; `verifyApplicationIdentity` is application-owned. Cookies require
a separate CSRF/Origin adapter and are refused. Use an absolute Windows path
for runtimeRoot on Windows. `forRoot` accepts ready options; `forRootAsync`
supports imports/inject/useFactory for configuration through Nest DI.

After `app.init()` or `app.listen()`, get `RdpBridgeService` for `diagnostics()`, independent
`close()` and manual `handleUpgrade(request, socket, head)` dispatch. Set
`upgradeMode: 'manual'` when the host owns a catch-all WebSocket router. False
leaves foreign upgrades untouched. Retain the closed service in that dispatcher
until host shutdown. Nest shutdown joins bridge-owned resources.
The provider installs Express routing before the default body parser, while
worker admission and resource allocation wait for Nest initialization. A close
during startup joins that work and then retires its resources.

The optional `./browser` export provides `referenceBrowserDirectory`. Serve
those assets through the host static router and set client `basePath: '/rdp'`.

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
import { discoverHostDevices, resolveNativeRuntime } from '@freerdp-bridge/nestjs';

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

The prefix is explicit and independent of Nest's global controller prefix.
Bridge authentication/validation/lifecycle are owned by the bridge; Nest
controller guards/pipes/interceptors are not implicitly applied to these raw
HTTP/WS routes. The host owns external TLS, destination policy and access-log
redaction. Bodies are limited to 64 KiB before bridge parsing. Default Express
body-parser ordering is handled by the provider factory; custom middleware
that has already consumed a bridge body is refused, not reparsed. RDP server
certificates remain strict by default. Capabilities/device policy and named
RDP acceptance remain separate from framework integration tests.

## License

Project-owned code is MIT (LICENSE). Native dependencies retain their own terms
in the separate runtime's THIRD_PARTY_NOTICES.md, licenses and corresponding-source/.
