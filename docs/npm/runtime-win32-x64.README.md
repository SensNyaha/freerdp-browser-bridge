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

## HTML clipboard in 0.4.0

The matching runtime advertises `clipboardHtml` when its CLIPRDR support is
available. HTML remains opt-in per session, with shared HTML/Unicode item limits
and explicit browser actions. Runtime installation alone does not access the
host clipboard or enable file/image clipboard. See the
[HTML profile and acceptance](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.4.0/docs/CLIPBOARD_BROWSER.md#html-source-feature-acceptance).
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
