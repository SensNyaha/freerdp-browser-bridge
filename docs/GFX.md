# Experimental headless GFX binding

Implements the modern graphics callback slice of SPECIFICATION §2.3,
ARCHITECTURE §4, MEDIA_PIPELINE §2 and ADR-003 against the public FreeRDP
3.32.1 headers, pinned commit `bf217a504e54cc719880c228e82353382cd7d4fa`.
The overall RDP capability remains experimental, with `rdp=false`.

## Rendering and ownership

The worker advertises the graphics pipeline for 32-bit sessions when the built
client includes `CHANNEL_RDPGFX_CLIENT`. A server can still negotiate classic
updates. ChannelConnected binds the public `gdi_graphics_pipeline_init` API;
the bridge checks initialization instead of discarding its return value.
GFX output mapping feeds FreeRDP's canonical BGRA primary buffer through
`update_begin_paint` / `update_end_paint`, so the existing bounded dirty adapter,
revision scheduler, JPEG encoder and browser AVC encoder share the same state.
Uncompressed inter-frame updates also reach that path. Server ResetGraphics
uses the existing bounded DesktopResize callback and marks the whole desktop
dirty after accepted resize.

`SynchronousDynamicChannels=true`, `AsyncChannels=false` and `AsyncUpdate=false`
keep GFX decode, framebuffer writes, dirty snapshots and encoding on the RDP
loop thread. The binding rejects asynchronous settings; allocation, cache,
reset and mapping wrappers also reject use from a different thread. There is
no additional raw-frame queue. FreeRDP codec implementations can still use
their own internal threads and working buffers.

The FreeRDP-allocated client context contains a C-compatible bridge pointer;
the C++ binding lives outside that allocation. Channel disconnect and
PostDisconnect release tracked surfaces/cache, uninitialize GFX and remove
callbacks before GDI is freed. This also handles PostDisconnect preceding
upstream channel closure. Rebinding a fresh channel is supported; session
reconnect itself remains unsupported.

## Allocation guards

Before calling upstream allocation callbacks, the bridge enforces:

- nonzero surface/reset dimensions, maximum 7680×4320;
- ARGB/XRGB 8888 surface formats and no duplicate surface identifiers;
- at most 16 live surfaces, with a 256 MiB combined surface allocation budget;
- 4096 session cache slots, with a 128 MiB combined cache allocation budget;
- source cache rectangles inside their surface and valid slot numbers;
- at most 16 monitors and a required pointer for nonempty monitor metadata;
- valid desktop mapping origins and nonzero bounded target dimensions.

Byte accounting includes the pinned upstream 16-pixel surface alignment,
16-byte stride padding and surface/cache structs. Cache replacement must fit
the transient old-plus-new footprint: FreeRDP allocates the new bitmap before
eviction. Limits can be reduced by a native caller, never raised above these
ceilings. Tracking arrays are fixed size; no remote-sized bridge metadata is
allocated. Cache-import replies are bounded and reconciled even after partial
upstream failure. Bitmap persistence is explicitly disabled; persistent imports
and RemoteApp/window mappings return unsupported errors.

These budgets cover surface/cache allocations, not total process RSS. Upstream
DVC reassembly, ZGFX decompression, codec working memory and per-paint region
allocation require a separate resource audit/soak. The full memory gate remains
open rather than inferred from these guards.

## Build and acceptance limits

The current private FreeRDP build does not include its H.264 decoder or Cairo
scaler. GFX AVC420/444 flags are therefore disabled in this build. The separate
private OpenH264 provider still encodes browser video as before; browser H.264
does not prove server-side GFX AVC negotiation. True scaled-output mapping is
rejected before changing mapping state; identity mapping via that PDU works.
Adding a scaling provider and incoming AVC decoder remains required work.

Linked native tests invoke the actual public GDI GFX callbacks, codec reset,
pixel copy and region invalidation. They use bridge fixture channel storage and
desktop resize metadata, not a real DVC transport, full `gdi_init`, or an RDP
server. Tests cover frame-end pixel placement, inter-frame/origin pixels, empty
updates, geometry/count/byte guards, transient cache replacement, teardown and
rebinding. Real XRDP browser regression is recorded separately; it does not
establish that XRDP negotiated GFX. A Windows/GFX server, compressed-codec
fixtures, actual server resize and the 30-minute desktop soak remain open.

Evidence: [iteration 14](ITERATION_014.md).
