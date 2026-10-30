# @freerdp-bridge/runtime-linux-x64-gnu

## Purpose

Ready native runtime for FreeRDP Browser Bridge on Linux x64/glibc: compiled
C++ worker, IPC-only Node addon, process-query helper, FreeRDP 3.32.1 and private
native libraries. One worker runs per session, outside Node.js. The addon
transports IPC; it does not run FreeRDP.

## Installation

Install explicitly alongside a bridge adapter of the same product version:

```sh
npm install fastify@5.12.5 @freerdp-bridge/fastify @freerdp-bridge/runtime-linux-x64-gnu
```

Pin all bridge packages to the same version in deployment. This package has no
install scripts or installation-time download/compilation. The adapter does
not automatically install it.

## Requirements

Linux x64/glibc and Node.js 24 on the application server. A compatible system
loader/libc is still required; this is not a full OS image. Consumers need no
GCC, CMake or system FreeRDP. Node.js, Fastify and a browser are separate
installations. The remote RDP machine needs a reachable, authorized RDP server,
not this package.

Source support targets GCC 8.3 for Astra Linux 1.7.5 and retains RED OS 7.3/GCC
11. Compiler checks, runtime relocation and actual RDP acceptance remain
separate evidence; this does not promise every Linux/security profile.

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
  runtimeRoot: '/private/run/rdp-bridge',
});
// Pass worker to rdpBridgePlugin with verified host authentication.
```

Use an absolute, private, writable runtimeRoot. Resolution checks platform,
version, pinned FreeRDP, inventory/hashes, executable permissions and worker/
addon pairing. Keep the complete tree intact; do not replace the addon or add
global library-path overrides. Credentials reach workers only over private IPC,
never argv/environment. Certificates are strict by default. Use the adapter
lifecycle for joined worker cleanup.

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

This is a platform payload, not an HTTP server or standalone UI. Its only JS
export is `./package.json`; executable bin entries preserve permissions and
are not a general RDP CLI. musl/Alpine, ARM, macOS and Windows are outside this
profile. A compiled channel does not establish usable device redirection.
Inspect actual capabilities and policy. Inventory hashes are not a publisher
signature.

## License

Project-owned bridge code is MIT (LICENSE). Read THIRD_PARTY_NOTICES.md,
runtime/share/freerdp-bridge/licenses/ and SBOM metadata for dependency terms.
corresponding-source/ contains pinned libusb, eudev, libfuse and numactl sources
and exact recipes/patches. Its README.md and manifest.json describe rebuilding
the relevant libraries. Sources are not extracted/executed during npm install.
MIT does not relicense third-party components.
