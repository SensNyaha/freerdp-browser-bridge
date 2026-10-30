# @freerdp-bridge/node

## Purpose

Worker lifecycle, private IPC, session management and bounded media delivery
for FreeRDP Browser Bridge. Each RDP session uses its own native C++ worker;
FreeRDP runs outside Node.js. For HTTP/WebSocket embedding, applications
normally use `@freerdp-bridge/fastify`.

## Installation

Install this package and one matching runtime for the application server:

```sh
# Linux x64 / glibc
npm install @freerdp-bridge/node @freerdp-bridge/runtime-linux-x64-gnu

# Windows x64
npm install @freerdp-bridge/node @freerdp-bridge/runtime-win32-x64
```

## Requirements

Node.js 24, ESM, and matching product versions across bridge/runtime packages.
The runtime is an explicit application dependency, not automatically installed.
Ready runtime packages contain compiled workers, IPC helpers and private native
libraries. Consumers need no GCC, CMake or system FreeRDP. Node.js is not bundled.

## Usage

This probe starts and joins a native worker without an RDP connection:

```js
import {
  resolveNativeRuntime,
  recoverRuntimeSessions,
  probeWorkerBuild,
} from '@freerdp-bridge/node';

const worker = await resolveNativeRuntime({
  runtimeRoot: '/private/run/rdp-bridge',
});
const recovery = await recoverRuntimeSessions({ ...worker, timeoutMs: 10000 });
if (!recovery.supported || !recovery.complete) {
  throw new Error('RDP_RUNTIME_RECOVERY_INCOMPLETE');
}
const build = await probeWorkerBuild(worker);
console.log(build.bridgeVersion);
```

Choose an absolute, private, writable runtimeRoot; use a Windows path on Windows.
Resolution validates version, inventory, hashes and worker/IPC compatibility.
Do not strip returned Windows namespace prefixes. A custom `packageDirectory`
must reference the complete installed runtime and come from trusted host config.

## Image clipboard in 0.5.0

Image clipboard was introduced in the accepted 0.5.0 release. Keep JS and
native runtime versions matched when using it in later releases.

Version 0.5.0 adds typed `ClipboardImageItem`, image read/write results
and shared session control methods. Explicitly select `clipboard.images: true`
and require `clipboardImage`, `clipboardText` and `clipboardRevoke`. Custom
worker factories must pass the whole frozen limits object, including
`clipboardImage` and `clipboardItemBytes`, to `NativeSessionWorker`.
Wait for the clipboard-ready snapshot and acquire the current control grant;
connection alone is insufficient. Returned RGBA8 buffers belong to the consumer
and must be wiped after use. One text/HTML/image transfer and revoke owner is
shared; canonical DIBV5 header overhead counts toward native write admission.
Published 0.4.0 does not contain this feature. Use matching verified 0.5.0
JS/native artifacts and the
[application guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/CLIPBOARD_SESSION.md#application-integration-for-the-developing-image-feature)
for readiness, exact control API examples, quotas and named acceptance scope.

## Managed files in 0.6.0

Use matching 0.6.0 JS/native packages for managed-file IPC and redirected
sandbox drives. The adapter/session manager supplies frozen file limits,
verified ownership and joined cleanup. This lower-level library does not
create an authenticated HTTP file service by itself.

OS file-manager Ctrl+C/Ctrl+V remains deferred (`clipboardFiles: false`).
See the [file policy, routes, framework examples and tested scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.6.0/docs/FILES.md).

## Host-device inventory (planned 0.7.0)

This development API is absent from public 0.6.0. Use matching JS/native
artifacts from the inventory release. It lists metadata on the application
server; it does not list devices on the browser computer or redirect a device.

```js
import { resolve } from 'node:path';
import { discoverHostDevices, resolveNativeRuntime } from '@freerdp-bridge/node';

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

0.4.0 adds opt-in negotiated HTML clipboard alongside Unicode. Use the public
session policy and require the actual `clipboardHtml` capability. A custom
`workerFactory` must pass the entire frozen session limits object, including
`clipboardHtml`, to `NativeSessionWorker`. Both formats share one operation and
revoke owner; buffers returned to custom consumers must be wiped after use.
See the [HTML contract](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/CLIPBOARD_IPC.md#private-worker-html-negotiation-and-handoff-in-development).
HTML selection does not enable image/file clipboard or OS clipboard access automatically.

Version 0.3.0 adds explicit `recoverRuntimeSessions` before application listener
startup. It preserves active sessions, legacy/unknown contents and uncertain
ownership; it never recursively clears a runtime root or kills session processes.
Ready native packages must include the matching worker/helper cohort. During
release preparation use complete verified local archives; a source version alone
does not establish registry availability. Published 0.2.5 lacks this API. See the
[runtime recovery guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.3.0/docs/RUNTIME_RECOVERY.md)
for startup, bounded cancellation, permissions and retention.

This lower-level library has no HTTP listener or default authentication. Use
the session/adapter lifecycle for verified identity, policy, bounded queues,
certificate decisions and joined cleanup. Credentials belong only in private
worker IPC, never argv, environment, logs or files. Certificates are strict by
default. Exported types or compiled channels alone do not prove device support.
Ready runtime profiles are Windows x64 and Linux x64/glibc; macOS, ARM and musl
are not supported here.

## License

Project-owned code is MIT; see LICENSE. Read THIRD_PARTY_NOTICES.md, licenses
and corresponding-source/ in the separate native runtime before redistributing.
