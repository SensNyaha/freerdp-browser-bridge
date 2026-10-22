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

## Limitations

A codec export does not establish usable devices or channels on a native build
or permission under deployment policy. This package provides no HTTP server,
browser UI, RDP executable or authentication. Private worker IPC must not be
sent directly over a public WebSocket.

## License

Project-owned code is MIT; see LICENSE. Native runtime packages carry separate
third-party notices. No native dependencies are bundled here.
