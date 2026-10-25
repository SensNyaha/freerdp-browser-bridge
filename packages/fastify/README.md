# FreeRDP Browser Bridge — Fastify

## Purpose

Mount RDP HTTP and WebSocket routes inside an existing Fastify 5 application,
on its existing port. Each session runs a separate native worker; FreeRDP does
not run inside Node.js. Package name: `@freerdp-bridge/fastify`.

## Installation

Install the adapter and the matching native runtime version for your server:

```sh
# Linux x64 / glibc
npm install fastify@5.12.5 @freerdp-bridge/fastify@0.3.0 @freerdp-bridge/runtime-linux-x64-gnu@0.3.0

# Windows x64
npm install fastify@5.12.5 @freerdp-bridge/fastify@0.3.0 @freerdp-bridge/runtime-win32-x64@0.3.0
```

For an unreleased source checkout, use locally built tarballs instead;
a source version number alone does not establish registry availability.
## Requirements

Requires Node.js 24, ESM, Fastify 5 and a native runtime of the same product
version as all JS bridge packages. Install the runtime explicitly.
Runtime packages include their private native libraries, helpers and notices.
This adapter contains JavaScript/declarations; the compiled C++ worker and
native IPC components are supplied by the separate platform runtime, not by
the adapter. The runtime also carries its third-party source companions.
They require no compiler or network installation script. Node/browser binaries
are separate prerequisites. macOS, ARM and musl are not supported by this set.

## Usage

```ts
import Fastify from 'fastify';
import { rdpBridgePlugin, resolveNativeRuntime } from '@freerdp-bridge/fastify';

const app = Fastify();
const worker = await resolveNativeRuntime({
  runtimeRoot: '/private/run/rdp-bridge', // Absolute, private, writable host path.
});

app.register(rdpBridgePlugin, {
  prefix: '/rdp',
  worker,
  allowedOrigins: ['https://app.example'],
  authenticate: request => verifyApplicationIdentity(request),
});
await app.listen({ host: '127.0.0.1', port: 8080 });
```

`verifyApplicationIdentity` is your host application's bearer/mTLS verification,
returning `{ id: verifiedUserId }` or `undefined`. There is no default identity.
Cookie-based identity needs a separate CSRF/Origin adapter and is currently
refused. On Windows, use an absolute Windows path for runtimeRoot. The host
owns external TLS and access logging; exclude credentials and attach URL tokens.

## Limitations

The plugin validates bodies strictly within 64 KiB, preserves session ownership,
uses single-use control/media tokens, and verifies RDP certificates strictly by
default. Inspect `/rdp/v1/build` and `/rdp/v1/capabilities` for the actual native
profile. A package install does not imply all original V1 device capabilities.

If your application already owns a catch-all WebSocket router, register with
`upgradeMode: 'manual'`, retain the bridge handle from `onReady(handle)`, and
call `handle.handleUpgrade(request, socket, head)` in that router. A true return
means bridge owns the request; false leaves it untouched for host routing.
Automatic mode requires other upgrade listeners to select only their own paths.

`await app.close()` joins bridge cleanup. `await handle.close()` independently
retires bridge sockets/workers while preserving the host HTTP/WS application.
Retain a closed manual handle until host shutdown to refuse late bridge upgrades.

`handle.diagnostics()` and authenticated `/rdp/v1/diagnostics` return bounded
aggregate lifecycle telemetry. Optional session diagnostics use the existing
control protocol and its rate/size budget; they never include remote contents.

`@freerdp-bridge/fastify/browser` exports `referenceBrowserDirectory` with the
optional reference HTML/JS. Serve those assets through your static router, then
configure the client with `basePath: '/rdp'`. Keep that prefix on reattachment.
The host owns presentation, identity and browser permission policy.

Complete source-tree guides are `docs/FASTIFY_USAGE.md` and
`docs/NATIVE_NPM_RUNTIME.md`; the public `.d.ts` files describe the options.
## License

Project-owned code uses MIT (LICENSE). Native dependencies retain their own licenses in
the platform runtime package's THIRD_PARTY_NOTICES.md and bundled notices.
