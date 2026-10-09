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
- `display.resize.result` (implemented experimental Display Control slice)
- `input.paused` (nonfatal display transition)
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

### Experimental committed Unicode text (v1 additive extension)

`input.text` has exactly `data: { "text": "Ж中😀" }`, with 1..256 UTF-16 code
units, well-formed surrogate pairs and no NUL/C0/C1 controls except tab, LF and CR.
Text is transmitted exactly without normalization or layout translation. The
4096-byte control envelope remains. Text counts towards both the 256 total messages
and the shared 32 text/non-input commands per second. Invalid text/schema closes
the control attachment with a fixed error, without echoing input.

Only the current connected control lease can enqueue text. Each batch occupies one
of the existing 64 input queue slots; stale queued leases cannot send it. It resets
tracked physical input before Unicode units, and requires compiled `unicodeInput`
plus the server's negotiated Unicode Input capability. Resize pauses text without
replay. The additive server event `input.text.result` carries only
`{ "requestSeq": 481, "status": "sent" }`; status is `sent`, `unavailable`,
`paused` or `failed`. Sent confirms the worker input API returned success for the
whole batch, not consumption by the remote application. Unavailable/paused leave
the attachment and session alive. Other failures may close the attachment/session;
partial delivery is possible and text must never be automatically retried.

The reference harness exposes an explicit Unicode/IME text field with one pending
submission and a seven-second result deadline. Preedit stays local; submit is
disabled during composition, disconnect and display transition. The draft clears
only on sent or detach, remains on unavailable/paused, and is never echoed in events,
logs or metrics. A timed-out viewer detaches; its outcome is uncertain. Physical
canvas input remains available for shortcuts. See [input contract](docs/INPUT.md).

### Experimental Display Control (v1 additive extension)

Session creation must explicitly set `display.dynamicResolution=true`. A compiled
`displayControl` capability alone does not establish remote negotiation. Current
requests support one primary monitor, orientation 0 and scale 100%:

```json
{
  "v": 1,
  "type": "display.resize.request",
  "seq": 482,
  "ts": 1791400000124,
  "data": { "width": 1280, "height": 720, "deviceScale": 1 }
}
```

The control envelope retains its 4096-byte maximum and command rate limit.
No additional request fields are accepted. Width/height must be even integers
within 200..3840 / 200..2160, also subject to negotiated server area. Request
`deviceScale` is a ratio; values other than 1 are explicitly invalid for this
provider. Unknown rotation/multimonitor settings are not silently ignored.

Only the current control lease may request a layout. One request is reserved per
session, including while previously accepted input drains. Tracked input is reset
before dispatch. New non-reset input is paused, not replayed; `input.paused` carries
the fixed `INPUT_DISPLAY_TRANSITION` failure and does not close the connection.
Reset and detach remain available. Dispatch and result delivery recheck authority;
detaching before dispatch cancels it. A sent layout can still change the remote
desktop after detachment and its observation goes to the current attachment.

`display.resize.result` uses the server event envelope and data
`{ "requestSeq": 482, "status": "applied" }`. Status is one of `applied`,
`unchanged`, `unavailable`, `invalid`, `busy`, `send-failed`, `timeout`,
`disconnected`; a rejected command may also carry a fixed `error` object.
Applied requires a newer server-observed generation matching requested dimensions.
Timeout retains actual geometry; a later server observation remains authoritative.
The native confirmation deadline is 5 seconds, private IPC 6.5 seconds, and the
trusted SessionWorker boundary 7 seconds. A hung backend fails the session before
its reservation is freed; no overlapping retry is dispatched.

`display.info` replays the latest actual state on control attachment and on media
attachment after explicit `media.hello.data.display=true` negotiation;
`display.resize` announces a newer framebuffer generation. Their data contains
decimal-string u64 `generation` and `framebufferRevision`, actual `width`/`height`,
boolean `dynamicResolution`, `negotiated` and `resizing`, negotiated `maxWidth`,
`maxHeight`, `maxArea`, plus `pixelFormat: "BGRA8"`, `orientation: 0`,
`desktopScale: 100`, `deviceScale: 100`. Event scale values are percentages.
When negotiation is unavailable the three maxima are zero. Generation also
advances for a same-size framebuffer reset; caps/pending-state updates reuse it.
The revision is the generation's native dirty floor, not an encoded-frame counter.
Geometry/floor cannot change within an epoch. No request optimistically changes
actual dimensions or canvas size. See [Display Control](docs/DISPLAY_CONTROL.md).

## 4. Media WebSocket

Endpoint:

```text
wss://host/v1/sessions/:id/media?token=<attach-token>
```

Use binary messages only after initial JSON negotiation. The browser announces codecs it can decode; server chooses one supported by worker/build policy.

The experimental display extension is explicitly negotiated with optional boolean
`media.hello.data.display` (default false), and confirmed by `media.ready.data.display`.
Only opted-in media clients receive the small JSON display events above,
ordered before the next binary video configuration. An already transmitted access
unit retains its ACK/reset credit and deadline across a generation change. An
old-generation capture that has not been transmitted is dropped without consuming
binary sequence or credit. The next unit requires DISCONTINUITY configuration and
an AVC IDR, even for a same-size reset. The RWB1 header remains v1. The browser
finishes the previous transmitted decode/ACK, then replaces the decoder on config.
Input stays paused until actual metadata and the rendered epoch/dimensions match;
ordering between the separate control and media sockets is not assumed.
Media clients omitting this flag retain the original binary-only post-negotiation
video contract. Internal epoch/ACK safeguards apply to both client modes.

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
