# Native Display Control and private IPC

Implements the native channel/request-state slice of SPECIFICATION §2.3 / §2.10,
MEDIA_PIPELINE §10 and accepted ADR-003 / ADR-008 / ADR-009. The authority for
the ABI is FreeRDP 3.32.1 public `client/disp.h` and `channels/disp.h`, pinned
commit `bf217a504e54cc719880c228e82353382cd7d4fa`.

The native foundation is now connected through bounded private IPC to Node's
`WorkerProcess`; this is not completed browser dynamic resolution. The settings
mapper accepts explicit `display.dynamicResolution=true` on workers advertising
the experimental `displayControl` capability. The control WS does not yet implement
`display.resize.request`, and usable `rdp` remains false. Initial sizing and media
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
protocol limits all monitors to those dimensions. Higher JPEG-only sizes,
multimonitor, rotation and scale metadata remain required later work.

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
Public `display.resize`, browser scale metadata and media/ACK ownership integration
remain open.

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
These host APIs do not grant public browser/controller authority.

## Evidence and remaining acceptance

[Iteration 17](ITERATION_017.md) distinguishes linked native public callback /
GDI realloc / codec tests from actual XRDP browser regressions. The fixtures
replace Display Control's transport write, so they do not establish DVC wire
parsing, remote negotiation or a server accepting a layout request. GDI resize
tests use public GDI objects with actual gdi_resize allocation, not full gdi_init
or an RDP server. Incoming DVC reassembly/parser allocation remains upstream
and still needs the retained resource audit.

The actual authorized XRDP lab negotiated Display Control, accepted 1920×1080 →
1280×720 → 1920×1080, and produced new AVC IDRs and a resized JPEG through private
IPC. [Iteration 18](ITERATION_018.md) records this separately from fake IPC and
linked native fixtures. This does not establish browser rendering across resize,
Windows-server acceptance, full DVC parser/resource limits or soak stability.

Next: control-lease authority in the session manager,
display state replay on attachment, browser `display.resize.request` and real
XRDP/Windows browser resize/recovery checks, including in-flight input/cursor coordinates
and media/ACK ownership. The 30-minute desktop gate remains open.
