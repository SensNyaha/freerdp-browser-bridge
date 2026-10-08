# Browser API and native IPC protocol

## 1. API versioning

All public endpoints use `/v1`. Protocol version is independent of application semantic version. Breaking changes require `/v2` or an explicit negotiated protocol version.

## 2. REST API

Minimum endpoints:

```text
GET    /healthz
GET    /readyz
GET    /v1/build
GET    /v1/capabilities
POST   /v1/sessions
GET    /v1/sessions/:id
DELETE /v1/sessions/:id
POST   /v1/sessions/:id/attach-token
POST   /v1/sessions/:id/files            # streaming upload into sandbox
GET    /v1/sessions/:id/files/:fileId    # streaming download
GET    /v1/sessions/:id/print-jobs/:jobId
```

`POST /v1/sessions` returns only runtime identifiers and non-secret normalized capability data. It never echoes passwords/tokens.

## 3. Control WebSocket

Endpoint:

```text
wss://host/v1/sessions/:id/control?token=<short-lived-attach-token>
```

After upgrade the token is immediately considered consumed or bound to that connection. Prefer Authorization header when the hosting environment permits it; query token is supported only when securely redacted from access logs.

### Message envelope

```json
{
  "v": 1,
  "type": "input.key",
  "seq": 481,
  "ts": 1791400000123,
  "data": {}
}
```

Required server events include:

- `session.state`
- `session.error`
- `auth.prompt`
- `certificate.prompt`
- `display.info`
- `display.resize`
- `cursor.position`
- `cursor.visibility`
- `clipboard.offer`
- `clipboard.data`
- `printer.job.ready`
- `device.status`
- `stats.update`

Required client commands include:

- `input.key`
- `input.text`
- `input.pointer`
- `input.wheel`
- `input.touch`
- `display.resize.request`
- `clipboard.set`
- `clipboard.request`
- `auth.response`
- `certificate.response`
- `media.request-keyframe`
- `session.detach`

Every command has a size limit. Unknown `type` is rejected with a protocol error but must not crash the session.

## 4. Media WebSocket

Endpoint:

```text
wss://host/v1/sessions/:id/media?token=<attach-token>
```

Use binary messages only after initial JSON negotiation. The browser announces codecs it can decode; server chooses one supported by worker/build policy.

### Binary record header

Network byte order, 28 bytes:

```text
0   4   magic = "RWB1"
4   1   protocolVersion = 1
5   1   recordType
6   2   flags
8   4   streamId
12  4   sequence
16  8   timestampUs
24  4   payloadLength
28  N   payload
```

Record types:

```text
0x01 VIDEO_CONFIG
0x02 VIDEO_ACCESS_UNIT
0x03 AUDIO_CONFIG
0x04 AUDIO_PACKET
0x05 CURSOR_SHAPE
0x06 FILE_CHUNK_RESERVED
0x07 MIC_PACKET              # client -> server
0x08 STATS_BINARY_RESERVED
```

Video flags include `KEYFRAME`, `DISCONTINUITY`, `END_OF_STREAM`. Audio flags include `DISCONTINUITY`.

### H.264 payload

Define one format and do not mix Annex-B/AVCC silently. Recommendation: `VIDEO_CONFIG` carries AVCDecoderConfigurationRecord; access units use AVCC length-prefixed NAL units because this maps cleanly to WebCodecs `VideoDecoderConfig.description`. The native encoder adapter is responsible for conversion from provider output.

### Audio payload

Opus mode uses complete Opus packets with timestamps. PCM mode uses interleaved signed 16-bit little-endian frames and explicit sample-rate/channel config.

## 5. Attach semantics

One session may support multiple read-only viewers later, but v1 has one controlling browser attachment by default. A second attachment is rejected or marked view-only according to policy. Input authority is explicit.

On attach:

1. send display/media configs;
2. send current cursor shape/position;
3. request an IDR/keyframe;
4. start audio at the next packet boundary;
5. reset browser-side sequence expectations.

## 6. Worker IPC

Worker IPC is not exposed to browser clients. It uses a binary envelope:

```text
magic      4 bytes "RWI1"
version    u16
kind       u16
flags      u32
requestId  u64
length     u32
payload    length bytes
```

Classes:

- lifecycle/config;
- secret material;
- state/prompt;
- input;
- display/cursor;
- encoded video/audio;
- clipboard;
- file/device/printer events;
- stats/heartbeat.

All `length` values are checked against message-class maxima before allocation. IPC parser has fuzz tests.

## 7. Error model

Public error structure:

```json
{
  "code": "RDP_CERTIFICATE_CHANGED",
  "message": "Remote certificate differs from trusted fingerprint",
  "retryable": false,
  "details": {
    "host": "rdp.example.internal",
    "port": 3389,
    "fingerprint": "sha256:..."
  }
}
```

Never include password, gateway password, smart-card PIN, access token, pass-the-hash material or complete command lines in `details`.
