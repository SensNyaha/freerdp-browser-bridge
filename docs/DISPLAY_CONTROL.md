# Native Display Control foundation

Implements the native channel/request-state slice of SPECIFICATION §2.3 / §2.10,
MEDIA_PIPELINE §10 and accepted ADR-003 / ADR-008 / ADR-009. The authority for
the ABI is FreeRDP 3.32.1 public `client/disp.h` and `channels/disp.h`, pinned
commit `bf217a504e54cc719880c228e82353382cd7d4fa`.

This is a native foundation, not completed browser dynamic resolution.
The public settings mapper still rejects dynamic resolution and the control WS
does not yet implement `display.resize.request`. No new HELLO capability or IPC
record is advertised, and usable `rdp` remains false. Initial display sizing
and existing media negotiation retain their current contracts.

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
encoded-media dimension/config mechanism remains in place. Completion events,
public `display.resize`, scale metadata and command/result correlation await
the IPC/Node/browser slice; this foundation does not claim those contracts.

## Evidence and remaining acceptance

[Iteration 17](ITERATION_017.md) distinguishes linked native public callback /
GDI realloc / codec tests from actual XRDP browser regressions. The fixtures
replace Display Control's transport write, so they do not establish DVC wire
parsing, remote negotiation or a server accepting a layout request. GDI resize
tests use public GDI objects with actual gdi_resize allocation, not full gdi_init
or an RDP server. Incoming DVC reassembly/parser allocation remains upstream
and still needs the retained resource audit.

Next: explicit per-session opt-in/capability negotiation, bounded IPC requests
and server-observed result events, control-lease authority and deadlines in Node,
display state replay on attachment, browser `display.resize.request` and real
XRDP/Windows resize/recovery checks, including in-flight input/cursor coordinates
and media/ACK ownership. The 30-minute desktop gate remains open.
