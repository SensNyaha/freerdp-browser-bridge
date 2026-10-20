# Session API implementation — Stage 2

The session registry and HTTP/WebSocket boundary are implemented. The Stage 2 gate
uses an explicitly injected fake connection backend; it does not establish RDP sessions.
The native process supervisor is tested separately with real C++ workers.

Native RDP terminal failures use fixed public messages. Selected pinned FreeRDP
server reasons map to `RDP_SERVER_TIMEOUT` (504), `RDP_SERVER_LOGOFF` (502),
`RDP_SESSION_REPLACED` (502), `RDP_SERVER_DISCONNECT` (502),
`RDP_SERVER_REJECTED` (502),
`RDP_SERVER_FAILURE` (502), `RDP_SECURITY_MODE_REQUIRED` (502) or the existing
`RDP_AUTHENTICATION_FAILED` (502). Pinned licensing ERRINFO values map to
`RDP_LICENSE_FAILURE` (502); unknown reasons remain `RDP_DISCONNECTED`.
Each error exposes only its stable code, status, fixed message and retryability.
Numeric FreeRDP diagnostics are not included. These selected mappings have unit
coverage; full remote reason/server-profile acceptance remains open. [Connection contract](CONNECTION_CORE.md),
[server reason evidence](ITERATION_338.md), [NLA-required evidence](ITERATION_345.md),
[public error evidence](ITERATION_335.md).

An optional trusted-host [worker RSS policy](WORKER_MEMORY_POLICY.md) adds fixed
native-backend failures `WORKER_MEMORY_LIMIT` (503, not retryable) and
`WORKER_RESOURCE_UNAVAILABLE` (503, retryable). It is disabled by default and
adds no public session-create fields. Public errors expose no sample/PID/OS
diagnostics. Full resource/connected acceptance remains separate.

The optional trusted Windows/Linux host [CPU policy](WORKER_CPU_POLICY.md) additionally
preserves `WORKER_CPU_LIMIT` (503, not retryable), with the fixed message
`Session worker CPU policy exceeded`. It uses the existing failure envelope;
there is no public create-policy field or wire layout change. Existing bundled
Release helpers are not CPU-enabled; the policy is verified with the current
Debug foundation and separately built current Release helpers. Existing
production artifacts/defaults are unchanged. Broader CPU/connected acceptance
remains separate.

The [native resource composition test](ITERATION_317.md) additionally verifies
an actual linked worker's OS RSS breach at a synthetic TLS certificate wait.
The native adapter preserves the exact memory failure; the manager retires
tokens and releases capacity after joined adapter close. The local TLS peer
does not implement a desktop. The same iteration's restored Windows lab run
also passes the named connected native-adapter/manager memory-failure, lease
and joined cleanup slice. Broader public resource profiles and connected sibling
isolation remain separate gates; the named public RSS slice is recorded below.

The [public native/TLS regression](ITERATION_318.md) also verifies actual
HTTP/control/media sockets while the synthetic certificate prompt is pending.
An OS RSS breach emits one fixed control error and closes both channels with
1000 / `session terminal`. GET retains HTTP 200 with the failed snapshot;
new tokens return 409 and a previously unused token cannot upgrade (401).
Native close/PID/runtime cleanup and known-value diagnostic redaction pass.
This peer does not implement a desktop; the separate connected public RSS
control follows below. Other resource/soak gates remain open.

The [connected Windows public RSS control](ITERATION_319.md) additionally
receives actual 1080p JPEG over media WS before sampling and observes the same
fixed error, terminal control/media closure, failed GET snapshot and token
retirement after an actual connected RSS breach. It uses a Node ACK receiver,
not browser rendering. This accepts the named connected memory-error transport
slice; the separate CPU failure control follows below. Connected siblings and
complete resource/soak acceptance remain open.

The [connected public CPU control](ITERATION_320.md) separately passes actual
Windows counter growth and bounded local IPC load after the first connected
baseline/public JPEG. Exactly one WORKER_CPU_LIMIT reaches control, both
channels close, GET retains the fixed failed snapshot and attach authority
retires with joined native/query/runtime cleanup. RSS default behavior passes
again. This is the named failure transport slice; complete CPU budgets,
connected siblings, browser terminal display, OS-failure and soak remain open.

## Hosting and authorization

createSessionServer accepts a trusted authenticate hook and explicit allowedOrigins.
The hook supplies the principal; request bodies cannot select an owner. The default
loopback CLI has no identity provider and denies protected routes with 401.
Without a connection backend, authenticated creation returns RDP_NOT_IMPLEMENTED (501).

Protected routes are POST /v1/sessions, GET/DELETE /v1/sessions/:id,
POST /v1/sessions/:id/attach-token and GET /metrics. Lookups are owner scoped;
foreign and unknown IDs produce the same 404. Health/build endpoints remain available.
Responses use Cache-Control: no-store.

Creation returns a snapshot and newly issued control/media attach credentials.
These are fresh server credentials, not echoes of supplied passwords or tokens.
This implements SPECIFICATION section 2.1 and interprets PROTOCOL section 2's
non-echo requirement as applying to caller-supplied secrets.

## Attach and bounds

Upgrades require an allowlisted Origin, subprotocol freerdp-bridge-v1,
and a channel-scoped single-use token. Authorization Bearer is preferred;
query tokens are supported without logging URLs. Cookies, ambiguous token sources,
extra query fields and replay are rejected.

IDs use 128 random bits; tokens use 256 random bits. Only SHA-256 digests are retained.
Default TTL is 60 seconds, maximum 300 seconds; at most four outstanding tokens per
session. One attachment per channel is supported. Detach does not close the session.

Default active limits are 32 globally and four per principal. Creation rate is five
per minute per principal and IP, with at most 1024 rate keys. Terminal retention is
bounded at 64 snapshots/five minutes. Worker startup/graceful-cleanup deadlines are
10 seconds/two seconds. After graceful failure/timeout the registry calls forced
termination. A trusted backend may return a termination-completion promise; the
registry retains active capacity while awaiting it for a separate bounded
`terminationTimeoutMs` (default two seconds). Thus cleanup has at most two phases
of two seconds, excluding event-loop scheduling. Legacy void termination gives
no completion guarantee. Rejected/hung termination is bounded and cannot expose
backend diagnostics; that fallback does not prove physical resource retirement.
HTTP bodies are limited to 64 KiB; control records to 4 KiB, output
backlog to 64 KiB and all messages to 256 per second, with at most 32 non-input
commands per second. Socket/upgrade counts are bounded. Experimental connected
control input and its queue/release contract are documented in [INPUT.md](INPUT.md).

An additional native lifecycle test uses an explicit test-only registry adapter
with **40 global / 20 per-principal** limits and `framed-pipes` workers. It
verifies pre-factory overflow refusal, ten-slot replacement, heartbeat and joined
cleanup without CONFIGURE/SECRET/CONNECT or an RDP-connected state. This is
separate from the Linux packet addon's fixed 32-pair capacity and production
RDP/backend/resource acceptance. [Evidence](ITERATION_291.md).

A separate three-session native framed fixture force-terminates one owned C++
worker, observes its structured `WORKER_FAILED` state and joined slot/runtime
release, then starts a replacement while the two siblings keep heartbeat.
This remains unconnected lifecycle evidence through the test-only adapter,
separate from connected RDP/resource/soak acceptance. [Evidence](ITERATION_292.md).

Control currently emits state/error events and supports session.detach.
Native-backend control attachments now support certificate.prompt and certificate.response;
reattachment receives the pending prompt. Interactive auth responses remain unimplemented.
Opt-in native media attachments support bounded H.264/JPEG negotiation, RWB1 records,
render credit and decoder-reset recovery described in MEDIA_H264.md and MEDIA_JPEG.md.
Cursor shapes use an optional independent media stream, with position/visibility
on control; attachment replays current state. See [cursor contract](CURSOR.md).
Experimental opt-in Display Control now forwards server-observed state to both
attachments and accepts resize only from the current control lease. One bounded
reservation drains earlier input, resets tracking and pauses new non-reset input;
detach does not transfer request authority. Transmitted media ACK credit survives
resize and the next epoch forces config/IDR. See [public wire contract](../PROTOCOL.md#experimental-display-control-v1-additive-extension)
and [Display Control limits](DISPLAY_CONTROL.md).
Experimental basic input is described in [INPUT.md](INPUT.md). Audio and full
usable-desktop capability remain unimplemented; fake backends do not imply
actual RDP/media support. Cursor records do not contribute to video credit metrics.

## Backend and diagnostics

Prepared clipboard control-lease methods now require explicit policy and backend
read/write/revoke/source hooks. Immediate revocation, finite drain/native ACK and
late-content wiping are described in [CLIPBOARD_SESSION.md](CLIPBOARD_SESSION.md).
Only known scalar source fields reach metadata; fixed `CLIPBOARD_FAILED` fails
unsafe ownership, and `CLIPBOARD_NOT_IMPLEMENTED` refuses an absent backend.
Server control clipboard commands/credit are now implemented for explicit backend
hooks in [CLIPBOARD_CONTROL.md](CLIPBOARD_CONTROL.md). Native selection now requires
a matching numeric item reservation plus both clipboard HELLO capabilities;
missing reservations refuse before spawn, old peers before CONFIGURE/SECRET.
The [explicit reference browser client](CLIPBOARD_BROWSER.md) now passes scoped
Edge/fake-RDP fixtures; actual remote/browser/OS clipboard acceptance remains open.
Worker factories now receive frozen numeric `SessionWorkerLimits`, without
credentials/configuration references, to reserve explicit per-item IPC capacity.
[Reservation and prepared chunk format](CLIPBOARD_CHUNKS.md).

Iteration 116 prepares media-lease microphone methods bound to both current
control and media identities, with immediate revocation and observed native
epoch retirement before transfer. It introduces no socket/capture activation;
normal native creation still refuses non-off input. Fake-manager evidence and
typed backend methods are described in [the microphone contract](MICROPHONE_SESSION.md).

Current update — iteration 119: explicit media.hello PCM microphone selection
now routes source/grant metadata, start/stop and fixed binary packets with
independent ACKs, verified over actual loopback sockets with fake backends.
Legacy media remains unchanged. Native high-level input creation and browser
permission/capture remain gated. [Wire limits](MICROPHONE_SOCKET.md).

Current update — iteration 127: explicit reference-viewer PCM selection now
composes permission, prepared context, server grant and Worklet graph. Waiting
source metadata never acquires a device. Four synthetic Edge/viewer/socket
cases pass; native selection and actual AUDIN/device acceptance remain open.
[Viewer contract](MICROPHONE_VIEWER.md).

Current update — iteration 128: NativeSessionWorker now accepts explicit PCM
microphone only after both pcmInput/microphoneReset HELLO capabilities. Missing
capabilities refuse before configuration/credentials; Opus input refuses before
startup. Actual XRDP/API/Edge metadata replay is waiting at epoch 0 with no device
permission or PCM. Ready AUDIN/remote acceptance remains open.
[Evidence](ITERATION_128.md).

Each session owns a fresh trusted backend instance. Starting receives a cloned,
validated configuration and abort signal. Secrets are dereferenced after startup
settles or is aborted; this is not guaranteed zeroization of JS strings.
Failure/shutdown revoke tokens and attachments and bound cleanup time.
Stage 3 now supplies the opt-in NativeSessionWorker backend and private config/state
IPC; see CONNECTION_CORE.md. The default server still has no connection backend.
Native forced termination returns completion after pending startup settles and
worker child-close/runtime-directory cleanup. Startup checks cancellation after
filesystem awaits and HELLO, so termination before spawning cannot create a late
child. This does not establish simultaneous hard-kill/orphan reclamation, arbitrary
filesystem failure handling or forced cleanup beyond its deadline.
[Termination ownership evidence](ITERATION_056.md).

Pino omits URLs, bodies and headers and recursively redacts secret keys.
Public failures have fixed messages and do not forward backend diagnostics.
Prometheus labels are bounded state names, without session/principal/host/credential
labels. Rejection counters cover manager admission, not every HTTP validation error.

Media attachments add fixed `codec` (`h264`/`jpeg`) and `stage` labels to
`bridge_media_stage_duration_seconds`. The histogram stages are:

- `capture_changed`: successful worker capture request to changed encoded response,
  including native scheduling, encode, IPC and Node response validation;
- `capture_unchanged`: successful polls returning no changed image, kept separate;
- `forward`: from queuing RWB1 records until all configuration/image write callbacks
  finish successfully; a failure in any record excludes the entire frame group;
- `render_credit`: from holding credit before sending records to a valid frame ACK.

All intervals use the Node monotonic clock and are exported in seconds. Forwarding
completion is a local socket write, while render credit includes transport, browser
decode/draw and ACK return. These overlapping intervals must not be summed. Failed
captures/writes and reset/abandoned credit are excluded from successful timing samples.
The histogram has eleven fixed finite buckets plus infinity; no individual samples
or per-session labels are retained.

`bridge_media_frames_queued_total` counts changed frames;
`bridge_media_bytes_queued_total` counts their RWB1 configuration/image bytes.
Queued counters do not establish successful rendering or sustained FPS.
`bridge_media_frames_in_flight` counts frames currently holding render credit and
is decremented once on valid ACK, accepted decoder reset or server socket close.
These metrics aggregate all sessions on the server and retain `/metrics` authentication.
Fake transport regression evidence is in `tests/integration/media.test.mjs`.

Evidence: tests/unit/session-manager.test.mjs and
tests/integration/session-api.test.mjs; eight tests each.

## Typed PCM backend/media lease preparation

SessionWorker optionally exposes `onAudio(PcmSourceEvent)`; NativeSessionWorker
forwards private source events and accepts opt-in public PCM where advertised.
The lease foundation below was introduced before socket/browser activation;
the current public route is described under PCM media negotiation. No JSON audio
control event is introduced.

An explicit `media.audioOutput: 'pcm'` requires the backend listener before startup.
The manager uses the same bounded source/config/packet progress validation as
private WorkerProcess. Ready/config/samples require connected state; waiting/stop
metadata may describe a connecting source. Malformed/unselected/replayed output
fails that session with fixed WORKER_INVALID_STATE. Cleanup unsubscribes the backend
and clears metadata/listener ownership before asynchronous native close.

Only the current media lease can read `audio` (copied state/config metadata), read
`audioFailed`, or register `onAudio`. One subscriber per session/media lease is
allowed. Registration delivers future events only: detached PCM is validated and
discarded, never buffered/replayed. Consumers must copy borrowed sample bytes into
their own bounded handoff storage before returning if needed. A new attachment
uses status/config replay and an initial discontinuity in its wire owner.

Detach removes the subscriber immediately. Old unsubscribe/release cannot remove
a replacement registration, including replacement during a callback. A throwing
subscriber is removed and `audioFailed` becomes true for that lease; source/RDP
progress continues, and a new lease can recover. Resubscription on that failed lease
returns MEDIA_FAILED. No exception is propagated into the native parser callback.
Control, stale, terminal or closing leases return ATTACH_INVALID. No packet queue,
new timer/thread, public metrics, audible or browser acceptance is added.
[Fixture evidence](ITERATION_067.md).

## PCM media negotiation

Typed PCM backends can select the additive media hello/ready and `audio.ack`
extension in [PROTOCOL](../PROTOCOL.md#opt-in-pcm-media-socket-iteration-69).
The media route owns one record credit and one latest pending sample, unsubscribes
on close/fault and preserves RDP/control when only the consumer fails. No audio
records are sent to legacy viewers. The socket uses ordered binary stream 3, with
source stop/reset preceding fresh config/samples. Native PCM creation and the
reference harness gesture/Worklet admission path are implemented; audible RDP
acceptance remains open. [Socket evidence](ITERATION_069.md) uses a fake backend;
[public viewer evidence](ITERATION_071.md) distinguishes synthetic and actual tests.

## PCM media metrics

Iteration 94 adds fixed `codec="opus"` series alongside PCM, with the same
bounded label set. Public Opus selection requires source and epoch-reset backend
methods; native peers must advertise both Opus and audioReset before connect.
See [current public audio contract](AUDIO_OPUS_PUBLIC.md). The PCM sizes and
historical baseline below remain specific to PCM.

The existing authenticated `/metrics` endpoint aggregates fixed `codec="pcm"`
series. `bridge_audio_records_queued_total` and `bridge_audio_bytes_queued_total`
have `record=state|config|packet` and count local socket admission, not playback.
`bridge_audio_records_in_flight` and `bridge_audio_record_bytes_in_flight` describe
unacknowledged records; each attachment owns at most one (maximum 3,868 bytes).
`bridge_audio_pending_sample_bytes` describes the copied latest unsent packet
(maximum 3,840 bytes per attachment). These gauges sum across current consumers
and return to zero on ACK where applicable and on detach/fault.

`bridge_audio_packets_discarded_total` has fixed
`reason=replacement|source_reset|retirement`. It excludes already admitted bytes
which cannot be retracted. `bridge_audio_consumers_failed_total` has fixed
`reason=ack|protocol|receiver_deadline|admission_deadline|consumer`; shared socket
rate/session/transport failures retain their existing behavior and are not all
classified by this audio counter.

`bridge_audio_stage_duration_seconds` has `stage=forward|receiver_credit` and
eleven fixed finite buckets plus infinity. Forward measures successful active
local socket write callbacks; receiver credit measures valid exact ACK return.
Wrong/expired/abandoned ACKs do not count as successful credit observations.
The intervals overlap and must not be summed. Client ACKs indicate admission,
not audible completion or proof of actual Worklet behavior by an arbitrary client.
No identity, target, credential, revision/epoch/PTS or sample payload is a label.
Native/browser jitter and underflow metrics and measured LAN audio acceptance
remain open. [Evidence](ITERATION_072.md).

### Microphone transport metrics (iteration 145)

Protected `/metrics` now includes fixed PCM/Opus microphone packet/byte and local
decision counters, outstanding backend packet/explicit-stop gauges and Node
monotonic admission/retirement histograms. Outstanding operations remain counted
after detach until the backend promise settles; logical wire bytes are not heap
allocation or audio queue depth. Decisions and valid active timing do not prove
remote recording or physical permission. Labels are fixed codec/operation/result/
reason/bucket enums, without session/device/identity or source-clock metadata.
[Exact names, semantics and retained gaps](MICROPHONE_METRICS.md).
