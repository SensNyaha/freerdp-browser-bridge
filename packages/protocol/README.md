# @freerdp-bridge/protocol

## Purpose

Binary protocol codecs and TypeScript types for FreeRDP Browser Bridge: bounded
worker IPC framing, media, input, cursor, display, audio and clipboard records.
Most applications should use `@freerdp-bridge/fastify` rather than handle private
worker messages themselves.

## Installation

```sh
npm install @freerdp-bridge/protocol
```

## Requirements

Node.js 24 and ESM. This package contains JavaScript and type declarations, with
no native worker. No compiler or system FreeRDP is required for these codecs.
Keep bridge packages and native runtime on the same product version. Product
versions and wire protocol versions are separate values.

## Usage

This local codec example does not open a connection or start a worker:

```js
import {
  Kind, PacketDecoder, encodePacket, helloPayload,
} from '@freerdp-bridge/protocol';

const encoded = encodePacket({
  kind: Kind.Hello, requestId: 1n, payload: helloPayload(),
});
const decoder = new PacketDecoder();
decoder.push(encoded, packet => console.log(packet.kind === Kind.Hello));
decoder.finish();
```

Use exported declarations for record shapes and limits. Let the session layer
handle handshake, ownership, timeouts and shutdown. Never log packet payloads:
connection records may contain sensitive data.

## Image clipboard in 0.5.0

Image clipboard was introduced in the accepted 0.5.0 release. Keep JS and
native runtime versions matched when using it in later releases.

Version 0.5.0 adds a bounded RGBA8 inner image record and optional
`clipboardImage` worker negotiation. Geometry, exact byte length and complete
native DIBV5 write admission are checked against the finite item maximum.
These private records are distinct from the public RWC1 image control transfer;
use the managed session owner for authority, readiness, revisions and cleanup.
The codecs grant no OS clipboard access and do not enable file clipboard.
Published 0.4.0 does not contain this extension. Use matching 0.5.0
JS/native artifacts and the
[private handoff contract](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/CLIPBOARD_IPC.md#private-image-handoff-in-development).

## Managed files in 0.6.0

Version 0.6.0 adds bounded session-sandbox drive descriptors and file-policy
types. Applications enable storage through their adapter or standalone
configuration; session JSON cannot choose an arbitrary host directory.

OS file-manager Ctrl+C/Ctrl+V remains deferred (`clipboardFiles: false`).
See the [file policy, routes, framework examples and tested scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.6.0/docs/FILES.md).

## Limitations

0.4.0 adds the bounded HTML inner item and optional `clipboardHtml` negotiation.
Unsupported workers omit that optional property. HTML selection and byte-range
validation do not execute markup or grant OS clipboard access; use the public
session layer rather than sending private IPC records through a browser socket.

A codec export does not establish usable devices or channels on a native build
or permission under deployment policy. This package provides no HTTP server,
browser UI, RDP executable or authentication. Private worker IPC must not be
sent directly over a public WebSocket.

## License

Project-owned code is MIT; see LICENSE. Native runtime packages carry separate
third-party notices. No native dependencies are bundled here.
