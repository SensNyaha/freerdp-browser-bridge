# Session API implementation — Stage 2

The session registry and HTTP/WebSocket boundary are implemented. The Stage 2 gate
uses an explicitly injected fake connection backend; it does not establish RDP sessions.
The native process supervisor is tested separately with real C++ workers.

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
bounded at 64 snapshots/five minutes. Worker startup/cleanup deadlines are 10 seconds/
two seconds. HTTP bodies are limited to 64 KiB; control records to 4 KiB, output
backlog to 64 KiB and all messages to 256 per second, with at most 32 non-input
commands per second. Socket/upgrade counts are bounded. Experimental connected
control input and its queue/release contract are documented in [INPUT.md](INPUT.md).

Control currently emits state/error events and supports session.detach.
Native-backend control attachments now support certificate.prompt and certificate.response;
reattachment receives the pending prompt. Input/auth responses remain unimplemented.
Opt-in native media attachments support bounded H.264/JPEG negotiation, RWB1 records,
render credit and decoder-reset recovery described in MEDIA_H264.md and MEDIA_JPEG.md.
Input/audio and full usable-desktop capability
remain unimplemented; fake backends do not imply actual RDP/media support.

## Backend and diagnostics

Each session owns a fresh trusted backend instance. Starting receives a cloned,
validated configuration and abort signal. Secrets are dereferenced after startup
settles or is aborted; this is not guaranteed zeroization of JS strings.
Failure/shutdown revoke tokens and attachments and bound cleanup time.
Stage 3 now supplies the opt-in NativeSessionWorker backend and private config/state
IPC; see CONNECTION_CORE.md. The default server still has no connection backend.

Pino omits URLs, bodies and headers and recursively redacts secret keys.
Public failures have fixed messages and do not forward backend diagnostics.
Prometheus labels are bounded state names, without session/principal/host/credential
labels. Rejection counters cover manager admission, not every HTTP validation error.

Media attachments add fixed `codec` (`h264`/`jpeg`) and `stage` labels to
`bridge_media_stage_duration_seconds`. The histogram stages are:

- `capture_changed`: successful worker capture request to changed encoded response,
  including native scheduling, encode, IPC and Node response validation;
- `capture_unchanged`: successful polls returning no changed image, kept separate;
- `forward`: from queuing RWB1 records to the final successful local WS write callback;
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
