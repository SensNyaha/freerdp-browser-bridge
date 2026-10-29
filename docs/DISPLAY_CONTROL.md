# Display Control: native, private IPC and browser

## Fake-peer completion ownership

The explicit IPC fixture retires its pending resize before flushing an
`applied` reply, matching the real controller's completion ownership. The
`applied-handoff` fixture profile keeps its confirmation thread alive for a
bounded 100 ms after that reply. The existing integration scenario immediately
requests the same layout and must receive `unchanged`, while a second request
during the original pending operation still receives `busy`. This exposes the
previous fixture race deterministically without retrying or relaxing the
assertion. It is a fake-peer lifecycle check, not actual RDP/display acceptance.

The original final-tag Windows run `40908609344` retains the failure; local
`display-handoff-failing-before.log` reproduces it. The correction changes only
test sources; the accepted 0.6.0 npm/runtime archives and production display
implementation remain unchanged.

Current release scope: [accepted ADR-011](adr/ADR-011-single-display-100-percent.md)
fixes one primary monitor at 100% desktop/device scale and the existing orientation
0. This profile is sufficient by explicit user decision; wider layouts are outside
current required implementation/acceptance work.

Implements the native channel/request-state slice of SPECIFICATION §2.3 / §2.10,
MEDIA_PIPELINE §10 and accepted ADR-003 / ADR-008 / ADR-009. The authority for
the ABI is FreeRDP 3.32.1 public `client/disp.h` and `channels/disp.h`, pinned
commit `bf217a504e54cc719880c228e82353382cd7d4fa`.

The native foundation is connected through bounded private IPC to Node's
`WorkerProcess`, session control leases and the reference browser. The settings
mapper accepts explicit `display.dynamicResolution=true` on workers advertising
the experimental `displayControl` capability. The control WS implements the additive
v1 `display.resize.request` slice, and usable `rdp` remains false. Initial sizing and media
negotiation retain their current contracts.

## Ownership and negotiation

The bundled worker explicitly enables `SupportDisplayControl` only when
`CHANNEL_DISP_CLIENT` is compiled. It binds `DispClientContext` on the public
ChannelConnected event for `Microsoft::Windows::RDS::DisplayControl`.
Automatic window-driven `DynamicResolutionUpdate` stays disabled.

The adapter requires synchronous dynamic channels and disabled AsyncChannels /
AsyncUpdate. The RDP thread owns binding, server caps, layout writes, observed
desktop state and teardown. Foreign custom/caps callbacks, a missing plugin
handle or send callback, and unsupported threading settings fail binding.
ChannelDisconnected, PostDisconnect and the final connect-failure cleanup clear
the adapter's caps/custom callbacks before the FreeRDP context is destroyed.
Rebinding requires new server caps; an already observed desktop is retained.

Readiness requires both actual desktop dimensions and the server's caps PDU.
FreeRDP's plugin default limits are not treated as negotiated capabilities.
Zero monitor count or area factors clear resize readiness and pending state,
without failing an otherwise healthy desktop connection.
Nonzero remote values do not allocate monitor arrays in the bridge.

## Native layout requests

The current native request interface supports one primary monitor at (0,0),
orientation 0, desktop/device scale 100% and unknown physical size. Width and
height must be even and between 200 and 3840×2160. This is the intersection
with the currently supported browser H.264 provider, not a claim that the RDP
protocol limits all monitors to those dimensions. Higher JPEG-only sizes are a
possible provider extension; multimonitor and other rotation/scale profiles are
outside current required scope under ADR-011.

The server area limit is `MaxNumMonitors * MaxMonitorAreaFactorA *
MaxMonitorAreaFactorB`, as specified in
[MS-RDPEDISP caps](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpedisp/8989a211-984e-4ecc-80f3-60694fc4b476).
The adapter saturates that product to its local provider area without integer
overflow, including three UINT32_MAX inputs. It validates geometry and area
before calling SendMonitorLayout, so the pinned FreeRDP sender cannot silently
round/clamp a bridge request. Physical dimensions and the scale fields follow
the [monitor layout contract](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpedisp/ea2de591-9203-42cd-9908-be7a55237d1c).

At most one native request may wait for confirmation. A duplicate of the actual
desktop is a no-op when no request is pending; further valid requests return
busy until confirmation, expiry or channel teardown. A successful transport
write returns sent, never applied. A failed write removes pending state and
does not change observed dimensions or FreeRDP desktop settings.

Pending confirmation expires after five seconds, polled by the RDP loop.
Only successful GDI initialization/DesktopResize calls observe actual size.
A matching observation clears pending state; other valid remote sizes update
authoritative state without falsely confirming the request. A late server
resize after expiry remains an authoritative remote observation. There is no
raw-frame allocation, frame queue or settings mutation on the request path.

## Actual DesktopResize handling

The shared public GDI adapter validates server width/height against the existing
7680×4320 framebuffer ceiling before gdi_resize. It advances full-desktop dirty
state from the latest revision after any EndPaint flushed inside gdi_resize.
Invalid dimensions preserve the current framebuffer and dirty metadata.

After a successful resize, the worker records the actual GDI dimensions and
discards lazy JPEG/H.264 encoders. This also handles a same-size GFX reset:
the next AVC capture starts a fresh predictive chain with an IDR. The existing
encoded-media dimension/config mechanism remains in place. Private display metadata
and request correlation now use the [IPC contract](IPC_FOUNDATION.md#display-control-payloads).
Public `display.info` / `display.resize` expose the observed epoch and fixed provider
scale metadata; the media path preserves transmitted ACK ownership across resets.

## Private IPC and supervisor

HELLO bit 9 reports compiled experimental Display Control IPC, independently of
remote caps and session opt-in. CONFIGURE v3 adds the opt-in flag while keeping
v1/v2 disabled and readable; false/absent opt-in can still use older workers.
Unknown payload flags are rejected; envelope lengths are checked before payload allocation.

IPC places at most one request in the native fixed slot. The RDP thread releases
tracked input, sends the bounded layout, and keeps its request ID until observation,
five-second timeout, caps loss or disconnect. Non-reset input is rejected while
queued/active; reset and lifecycle IPC remain available. Server-observed display
generation/revision and caps are published before successful result/media delivery.
Same-size resets increment generation. Caps updates do not invent framebuffer changes.

Node caches a copyable display state and emits `display`; `resizeDisplay` bounds
one in-flight request and returns typed outcomes. It requires opt-in, rejects
changed geometry with a reused generation, and rejects applied results without a
matching newer observation. A 6.5-second IPC deadline permits the native timeout
to arrive without triggering the ordinary two-second deadline. Timed-out commands
do not change cached geometry, but later remote observations remain authoritative.
These private host APIs do not by themselves grant public browser/controller authority.

## Session leases and browser rendering

The [public contract](../PROTOCOL.md#experimental-display-control-v1-additive-extension)
requires explicit opt-in and negotiated caps. SessionManager caches validated
metadata, reserves one resize across accepted-input drain, resets tracked input,
and rechecks the current control lease before sending and after completion.
Non-reset input during the reservation is a nonfatal pause; detach/reset can still
proceed. A replacement controller sees the pending state and actual observations
but cannot start a second resize. A seven-second backend deadline covers drain,
reset and dispatch; a hung backend fails before reservation release.

Control attachments, and media clients explicitly negotiating `media.hello.data.display=true`,
replay actual metadata with decimal u64 epochs and
BGRA8 / orientation 0 / desktop/device scale 100%. Request scale is a ratio and
currently only 1 is accepted. Broader scale/rotation/multimonitor support is outside
current scope under ADR-011; the browser's existing CSS-scaled input/cursor mapping
remains independent.

Each media generation discards only unsent stale captures. An already transmitted
unit keeps its render credit, ACK sequence and deadline. After ACK/reset, the next
valid capture forces DISCONTINUITY config and IDR even if dimensions/SPS repeat.
Frame revision/dimensions must match current observed metadata. Caps-only and
pending-state updates do not reset video. One timer/capture/render-credit slot
remains bounded. No binary RWB1 format change or raw frames in Node are needed.

The harness provides manual width/height controls and `bridgeViewer.resize()`.
It consumes display events in media order, completes previous decode/ACK before
replacing the decoder, and changes the canvas only on VIDEO_CONFIG. Input waits
for the rendered epoch and geometry to match actual state and for the reservation
to clear. Cross-socket notification order is not assumed. Its ordered receive
queue is capped at five messages / 8 MiB + 8 KiB, allowing display metadata,
negotiation, config and the one credited unit. Cursor shapes remain independent.

## Evidence and remaining acceptance

[Iteration 17](history/iterations/001-050.md#iteration-017) distinguishes linked native public callback /
GDI realloc / codec tests from actual XRDP browser regressions. The fixtures
replace Display Control's transport write, so they do not establish DVC wire
parsing, remote negotiation or a server accepting a layout request. GDI resize
tests use public GDI objects with actual gdi_resize allocation, not full gdi_init
or an RDP server. Incoming DVC reassembly/parser allocation remains upstream
and still needs the retained resource audit.

The actual authorized XRDP lab negotiated Display Control, accepted 1920×1080 →
1280×720 → 1920×1080, and produced new AVC IDRs and a resized JPEG through private
IPC. [Iteration 18](history/iterations/001-050.md#iteration-018) records this separately from fake IPC and
linked native fixtures. This does not establish browser rendering across resize,
Windows-server acceptance, full DVC parser/resource limits or soak stability.

The public lease/browser implementation and actual XRDP resize evidence are recorded
in [Iteration 19](history/iterations/001-050.md#iteration-019). Windows-server resize, full DVC resource audit
and the 30-minute desktop gate remain open. Automatic viewport policy is optional
follow-up; broader scale/layout support is outside current scope under ADR-011.
