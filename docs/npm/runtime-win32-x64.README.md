# @freerdp-bridge/runtime-win32-x64

## Purpose

Ready native runtime for FreeRDP Browser Bridge on Windows x64: compiled C++
worker, private runtime-directory/IPC helpers, FreeRDP 3.32.1 and private DLLs.
Each RDP session has its own worker; FreeRDP runs outside Node.js.

## Installation

Install explicitly alongside a bridge adapter of the same product version:

```sh
npm install fastify@5.12.5 @freerdp-bridge/fastify @freerdp-bridge/runtime-win32-x64
```

Pin all bridge packages to the same version in deployment. This package has no
install scripts or installation-time download/compilation. The adapter does
not automatically install it.

## Requirements

Windows x64 and Node.js 24 on the application server. Consumers need no GCC,
CMake, system FreeRDP or global DLL path override. Native DLLs, including
applicable Microsoft runtime DLLs, are supplied app-locally. Node.js, Fastify
and a browser are separate installations. The remote RDP machine needs a
reachable, authorized RDP server, not this npm package.

## HTML clipboard

The matching runtime advertises `clipboardHtml` when its CLIPRDR support is
available. HTML remains opt-in per session, with shared HTML/Unicode item limits
and explicit browser actions. Runtime installation alone does not access the
host clipboard or automatically enable file/image clipboard. See the
[HTML profile and acceptance](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/CLIPBOARD_BROWSER.md#html-source-feature-acceptance).
Versioned runtime/installer acceptance is separate from compiler/source results.

## Usage

```js
import { resolveNativeRuntime } from '@freerdp-bridge/fastify';

const worker = await resolveNativeRuntime({
  runtimeRoot: 'C:\\ProgramData\\MyApp\\rdp-runtime',
});
// Pass worker to rdpBridgePlugin with verified host authentication.
```

Use an absolute, private, writable runtimeRoot. The resolver checks platform,
version, pinned FreeRDP, inventory and hashes. Keep namespace path prefixes,
the complete runtime tree and its DLLs intact. Do not load FreeRDP into Node.
Session credentials reach workers only over private IPC, never argv/environment.
RDP certificate verification is strict by default.

## Image clipboard in 0.5.0

Image clipboard was introduced in the accepted 0.5.0 release. Keep JS and
native runtime versions matched when using it in later releases.

Version 0.5.0 advertises `clipboardImage` only with its native image hooks.
It remains opt-in per session through matching JS packages, with negotiated
DIB/DIBV5 conversion, RGBA8 handoff, finite encoded/decoded item limits and
shared text/HTML/image revoke. Installation does not read the OS clipboard.
Published 0.4.0 does not include this image runtime. Use verified matching
0.5.0 artifacts and inspect concrete capabilities; file clipboard and
arbitrary image formats remain separate. See the
[application profiles and limits](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/CLIPBOARD_BROWSER.md#actual-image-rdp-application-checkpoint).

## Managed files in 0.6.0

Use this runtime with matching JS product versions for managed files and
selected sandbox drives. The trusted server must explicitly enable a file
policy; compiled channels do not grant arbitrary host-file access. On the
tested Windows profile, audio-off drive sessions use guarded zero-format
RDPSND without a host sound backend or audio publication.

OS file-manager Ctrl+C/Ctrl+V remains deferred (`clipboardFiles: false`).
See the [file policy, routes, framework examples and tested scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.6.0/docs/FILES.md).

## Host-device inventory in 0.7.0

The matching 0.7.0 SDK exposes `discoverHostDevices` for bounded
bridge-host printer, PC/SC reader, port and USB metadata. Public 0.6.0 lacks
this capability; upgrade the JS packages and runtime together. Use the SDK or
framework adapter, not executable arguments or raw private IPC. Discovery
performs no RDP connection or device/card open, and does not enable physical
redirection. Availability depends on this host's libraries, daemons and account
permissions; an explicit `limit` status is a partial snapshot. [SDK usage and
tested provider scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/main/DEVICE_REDIRECTION.md#host-inventory-in-the-development-branch).

## Limitations

This is a platform payload, not an HTTP server, JS RDP client or standalone UI.
The only JS export is `./package.json`. Windows ARM, macOS and Linux are outside
this package's profile. A compiled channel does not establish usable device
redirection: inspect capabilities and policy. Inventory hashes establish
compatibility/integrity, not a publisher signature. Protect deployed files from
writes and use a trusted source.

## License

Project-owned bridge code is MIT (LICENSE). Dependencies retain their own terms:
read THIRD_PARTY_NOTICES.md, runtime/share/freerdp-bridge/licenses/ and SBOM
metadata. Microsoft DLLs retain Microsoft's terms. corresponding-source/
contains pinned libusb source and exact recipes/patches; its README.md and
manifest.json describe rebuilding the relevant libraries. Sources are not
extracted or executed during npm install. MIT does not relicense dependencies.
