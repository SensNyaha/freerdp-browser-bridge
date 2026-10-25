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
npm install @freerdp-bridge/nestjs@0.3.0 @freerdp-bridge/runtime-linux-x64-gnu@0.3.0
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
