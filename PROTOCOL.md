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

### Experimental touch input (v1 additive extension)

Session creation explicitly sets `input.touch=true`. `touch.info` is an additive
control-only readiness event with exactly `revision`, `generation` (nonzero u64
decimal strings), `width`, `height`, `enabled`, `maxContacts` and `availability`.
Availability is unavailable, handshake, ready, suspended, draining or incompatible.
Only ready has 1..10 maxContacts; other states have zero. Compiled touch capability
does not establish channel readiness, physical device support or remote acceptance.
Metadata is replayed on control attachment. No coordinates/contact IDs are logged.

`input.touch` data has exactly `{ "action": "begin", "contactId": 7, "x": 100,
"y": 200, "generation": "1" }`. Actions are begin/update/end/cancel, external IDs
are integers 0..2,147,483,647, x/y are bounded absolute coordinates 0..7679/4319.
Generation must match observed readiness and current display. Unknown fields,
invalid shapes and overflowing epochs are protocol errors; no mouse substitution.

Only the current connected control lease may enqueue contacts. Touch shares the
64-slot serialized input queue. Lease, readiness, generation and resize pause are
rechecked immediately before dispatch; rejected gestures are never replayed.
Reset is a terminal-contact barrier, also used on detach/resize/focus loss.
`input.touch.paused` carries `{ "requestSeq": 482, "code": "INPUT_TOUCH_UNAVAILABLE" }`;
codes also include INPUT_DISPLAY_TRANSITION, INPUT_TOUCH_INVALID_TRANSITION and
INPUT_QUEUE_FULL (native contact capacity, as well as the bounded host queue).
These semantic refusals leave the attachment/session alive; the harness clears
its local contacts and sends one reset when input was active. Successful submission
is API acceptance, not acknowledgement from the remote application.

The harness captures only Pointer Events with pointerType=touch and at most ten
contacts within negotiated limits. It uses the rendered display generation and
geometry, captures each pointer, forwards ordered transitions without a gesture
backlog, and cancels on pointercancel/lost capture. Blur/visibility/dispose or an
unavailable/new-generation event clears local ownership and resets server input.
Pen remains unsupported. Physical device and actual application acceptance remain
open; Edge emulated pointer/fake-control tests are not those acceptance tests.
Build/CLI/capability reports expose `penInput: false`. No pen HELLO bit or payload
is allocated. The owned RDPEI registration clears ENABLE_MULTIPEN_INJECTION before
channel initialization, even if the server offers it; touch features are preserved.

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
0x09 AUDIO_STATE             # server -> client; prepared, not activated yet
0x0a MIC_OPUS_PACKET         # client -> server; prepared, not selected
```

Iteration 112 prepares a fixed PCM MIC_PACKET type 7/stream 4: nonzero sequence,
captured timestamp, input epoch and exactly 960 stereo S16LE 48 kHz frames.
Public negotiation, permission, lease and dispatch remain pending.
[Wire contract](docs/MICROPHONE_WIRE.md).

Iteration 113 adds isolated one-flight Node admission: sequence consumption,
capture continuity and lease/source checks before and after private submission.
Revocation drains its one owned sample slot; the host must additionally reset
native capture before ownership transfer. Public dispatch remains pending.
[Admission contract](docs/MICROPHONE_INGRESS.md).

Iteration 114 adds an isolated exclusive owner with a finite drain/reset/new-epoch
barrier. A scheduled reset alone grants no replacement authority; failure requests
host termination and permanently disables that owner. Public lease/socket routing
remains pending. [Ownership contract](docs/MICROPHONE_OWNERSHIP.md).

Iteration 116 connects the isolated owner to typed SessionManager media methods
bound to both attachment identities. Detach immediately revokes input and a
fresh native epoch gates replacement. No public socket command or capture
activation is introduced. [Session contract](docs/MICROPHONE_SESSION.md).

Iteration 117 prepares one media-lease scalar status subscription with explicit
server grant/retirement state. Control loss revokes and notifies synchronously;
consumer removal/fault also requires native retirement. These are typed library
events, not activated public JSON/binary messages or permission claims.

Iteration 118 prepares an isolated microphone media adapter with explicit
start/stop commands, scalar state and separate MIC_PACKET ACK correlation.
One sample/stop flight, fixed deadlines and shared backlog bounds are tested
with pure fake sockets; media.hello does not select this adapter yet.
[Prepared shapes and limits](docs/MICROPHONE_SOCKET.md).

Iteration 119 activates that adapter only for explicit
`media.hello.data.microphone: {codec: "pcm", sourceStatus: true}`. Ready confirms
the fixed input profile/deadlines; microphone state/start/stop/result/ACK stay
separate from video/output audio credit. Selected mixed media gets 160 incoming
messages/s and microphone commands 16/s; prior 32/128 budgets and 4 KiB input
preallocation remain. Actual sockets are verified with fake RDP backends;
normal native input creation and browser permission/capture remain gated.
[Negotiation and routing contract](docs/MICROPHONE_SOCKET.md).

Current update — iteration 127: the reference viewer now selects this profile
explicitly with gesture-only microphone controls, bounded startup/cleanup and
independent JSON/ACK routing. Synthetic Edge/viewer/socket evidence establishes
browser composition; native selection and actual AUDIN/device acceptance remain
open. [Viewer contract](docs/MICROPHONE_VIEWER.md).

Iteration 128 enables native high-level PCM selection only with pcmInput and
microphoneReset HELLO capabilities. No public/private wire shape changes; actual
XRDP source replay is waiting epoch 0 without capture. Opus input and actual
recording acceptance remain open. [Evidence](docs/ITERATION_128.md).

Iteration 131 prepares RWB1 MIC_OPUS_PACKET type 10/stream 4, 42..1,315 bytes,
with epoch, measured encoder lookahead and one bounded stereo 20 ms packet.
The standalone 26..1,299-byte private input payload has no assigned RWI1 kind.
Neither route nor Opus microphone selection is activated by these codecs.
[Wire contract](docs/MICROPHONE_OPUS_WIRE.md).

Iteration 134 assigns private RWI1 input kind 44 (26..1,299 bytes, nonzero
correlation) and CONFIGURE schema 8 / Opus input bit 32, mutually exclusive
with PCM input bit 16. Current workers validate then reply unavailable and
refuse Opus selection before secret/connect; no input capability is advertised.
[Private contract](docs/MICROPHONE_OPUS_IPC.md).

Video flags include `KEYFRAME`, `DISCONTINUITY`, `END_OF_STREAM`. Audio flags include `DISCONTINUITY`.

### H.264 payload

Define one format and do not mix Annex-B/AVCC silently. Recommendation: `VIDEO_CONFIG` carries AVCDecoderConfigurationRecord; access units use AVCC length-prefixed NAL units because this maps cleanly to WebCodecs `VideoDecoderConfig.description`. The native encoder adapter is responsible for conversion from provider output.

### Audio payload

Current iteration 94 enables explicit public PCM **or Opus** selection and
gesture-activated harness delivery with one audio ACK credit. Historical
preparatory gates below are superseded by the
[current Opus negotiation contract](docs/AUDIO_OPUS_PUBLIC.md).

Opus mode uses complete Opus packets with timestamps. PCM mode uses interleaved signed 16-bit little-endian frames and explicit sample-rate/channel config.

The preparatory private Opus payload schema is specified in
[AUDIO_OPUS_WIRE.md](docs/AUDIO_OPUS_WIRE.md): RWI1 kind 36, zero request ID,
26..1,299-byte bounded body and one stereo 20 ms frame. No public Opus media
negotiation, source-state mode or browser activation is introduced by that codec
preparation; current public Opus selection remains explicitly unsupported.

Preparatory private CONFIGURE schema 6 adds a mutually exclusive Opus flag
while preserving earlier masks and body bounds. Current workers refuse that
selection before secret/connect; public settings and HELLO remain unchanged.
[Private schema contract](docs/IPC_FOUNDATION.md#preparatory-connection-schema-6-iteration-82).

Iteration 84 activates that raw native flag on guarded Windows builds, fixing
dispatcher/session ownership to the same codec. HELLO and high-level Node/public
Opus selection remain unchanged. [Native wiring](docs/IPC_FOUNDATION.md#raw-native-opus-profile-wiring-iteration-84).

Iteration 85 adds experimental private HELLO bit 8192 and typed WorkerProcess
selection; old workers report false and are refused before secret delivery.
Public sessions/media/viewer still reject Opus pending delivery/recovery ownership.
[Private Node activation](docs/IPC_FOUNDATION.md#private-typed-opus-activation-iteration-85).

Additional preparatory RWB1 Opus records use stream 3: codec-1 AUDIO_CONFIG is
48 bytes, raw AUDIO_PACKET is 30..1,303 bytes, and codec-1 AUDIO_STATE is 68 bytes
with matched body/header time. The isolated browser parser checks these layouts;
no Opus viewer, public selection or ACK owner is activated. See the
[source/RWB1 preparation contract](docs/AUDIO_OPUS_WIRE.md#source-state-and-rwb1-preparation-iteration-76).

The first PCM schema is specified in [AUDIO_PCM.md](docs/AUDIO_PCM.md#pcm-ipcrwb1-codec-foundation).
It uses audio stream ID 3, separate from video 1 and cursor 2: AUDIO_CONFIG has
20 bytes describing schema 1, PCM codec 2, S16LE stereo 48 kHz, 960-frame packets
and a nonzero stream epoch. AUDIO_PACKET has exactly 3,840 sample bytes (20 ms),
with timestampUs unchanged from the worker and DISCONTINUITY flag 0x0002 on reset
or attachment. Private metadata is not prepended to the public sample payload.
Windows bundled workers activate opt-in PCM on private IPC with typed Node
source/config/packet listeners, public session/media negotiation and explicit
reference harness gesture activation. Actual audible RDP remains unverified;
Opus is open. [Private activation](docs/IPC_FOUNDATION.md#private-pcm-worker-activation-iteration-66),
[public viewer](docs/ITERATION_071.md).
Private source status schema 1 is now prepared as RWI1 AUDIO_STATE kind 35 with
40 bytes. Its public preparatory counterpart is RWB1 AUDIO_STATE type 0x09,
stream 3, DISCONTINUITY 0x0002, exact 40-byte payload. Payload repeats the worker
timestamp and must match the header timestamp. Revision, epoch, availability,
immutable opt-in and fixed requested profile follow the private status schema.
It shares the attachment's audio sequence with config/PCM, never cursor/video
sequences. Stop/reset status must use the same ordered media socket as PCM;
cross-socket ordering is not assumed. No public JSON control event is added.
The opt-in worker emits private status; API emits the public extension only after
explicit PCM/source-status media negotiation.
Default packet-only browser
ownership refuses it. Isolated `sourceStatus: true` ownership requires increasing
status revision, nondecreasing epoch/clock and immutable opt-in. Status clears
pending config/samples and schedules Worklet reset before fresh config/PCM; ready
and its matching config are required before samples. The reference harness
selects source status and one-record Worklet admission credit only after a user
gesture. [Browser ownership](docs/AUDIO_PCM.md#browser-source-status-ownership).
[Status codec contract](docs/AUDIO_PCM.md#pcm-source-status-codec-preparation).

### Opt-in PCM media socket (iteration 69)

The additive v1 `media.hello.data.audio` extension is exactly
`{"codec":"pcm","sourceStatus":true}`. Omission preserves the legacy video/cursor
protocol. A selected backend must expose PCM media lease ownership; otherwise
negotiation fails with MEDIA_NOT_IMPLEMENTED. `media.ready.data.audio` confirms
`codec: "pcm"`, `sourceStatus: true`, `streamId: 3`, `maxInFlight: 1` and
`ackTimeoutMs: 2000`. This route is available to typed PCM backends, including
the opt-in Windows native adapter. Browser creation/playback requires explicit
user activation; source waiting is not audible acceptance.

Every stream-3 RWB1 record (status, config and samples) consumes one shared audio
credit. The client sends exactly `{"v":1,"type":"audio.ack","data":{"sequence":N}}`
on the media socket after its Worklet has accepted the corresponding command.
This acknowledges bounded receiver admission, not audible completion. Sequence N
must match the single outstanding record. It is independent of video `media.ack`,
cursor sequence and JSON envelope sequence; neither ACK releases another stream.
No audio ACK is accepted without PCM negotiation. Wrong/duplicate/expired ACK
closes media, preserving RDP/control ownership. Negotiated PCM permits at most 128
incoming commands/sec; legacy media keeps 32/sec. No Opus/microphone selector exists.

Attachment replays only source/config metadata and joins the next fresh sample
with discontinuity. Config waits for a sample and uses its captured timestamp,
which can precede the status observation clock. One copied latest pending sample
is replaced with discontinuity when behind. Stop/reset discards unsent samples;
an already admitted record keeps its credit until ACK. Ordered status reaches the
same Worklet before fresh config/samples. Both receiver ACK and blocked local
socket admission have a two-second deadline. Local queue bounds do not establish
end-to-end latency or audible RDP acceptance. [Evidence](docs/ITERATION_069.md).

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

The additive private reset kinds 37/38 are fixed, correlated RWI1 messages;
see [audio reset contract](docs/AUDIO_RESET.md). Iteration 87 prepares the codec
and explicit unavailable worker response. It enables no public reset message.

Iteration 103 adds private RWI1 microphone kinds 39/40 with fixed schema-1 PCM /
result bodies and nonzero request correlation. Workers explicitly reply
unavailable; microphone settings/capability, public MIC_PACKET, permission and
capture remain unactivated. [Private input codec](docs/MICROPHONE_PCM_WIRE.md).

Iteration 105 prepares private RWI1 MICROPHONE_STATE kind 41, fixed schema-1
input readiness with zero unsolicited ID. No worker/public emission or capture
activation is added. [Input status contract](docs/MICROPHONE_STATE.md).

## 7. Error model

Iteration 108 adds private CONFIGURE schema 7/input flag 16 and guarded Windows
worker dispatch/status for explicit raw-IPC tests. It keeps microphone HELLO,
normal Node/public creation, permission and capture unactivated.
[Private worker contract](docs/MICROPHONE_WORKER.md).

Iteration 109 adds experimental HELLO bit 15 (`pcmInput`) and private Node PCM
selection/status/one-flight sending. Public microphone permission, lease and
browser transport remain pending. [Node contract](docs/MICROPHONE_NODE.md).

Iteration 110 prepares fixed input reset kinds 42/43 and one bounded versioned
HELLO capability suffix. Missing suffix means microphoneReset=false; workers
reply unavailable and do not advertise execution yet.
[Reset contract](docs/MICROPHONE_RESET.md).

Current update — iteration 111: guarded Windows/AUDIN advertises and executes
private microphone reset through the versioned HELLO suffix. Source epoch/reset
and one-flight Node sender remain independent of output audio; public capture
permission and lease remain pending. [Owner contract](docs/MICROPHONE_RESET.md).


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
