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
reset, mapping and surface-command wrappers also reject use from a different thread. There is
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

SurfaceCommand additionally checks surface existence, 16-bit identifiers and an
8 MiB encoded command limit before forwarding to the renderer. AVC420 checks
the bitstream range inside the command, bounded surface coordinates, at most
1024 update rectangles and their required metadata pointers/geometry before
upstream creates the surface decoder. AVC444/v2 commands return unsupported.
Iteration 161 adds [SPS coded-dimension admission](AVC_DECODE_ADMISSION.md) before
renderer/decoder dispatch: all SPS/subset SPS prefixes in the complete Annex-B
unit must fit the surface's macroblock-rounded dimensions. Incomplete prefixes
are refused before dirty invalidation. Reference/working memory and total RSS
acceptance remain separate; this is not a full H.264 validator.
These callbacks run after upstream DVC/ZGFX parsing and metadata allocation;
they do not provide pre-allocation transport limits for those upstream layers.

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

Iteration 165 selects [decoded-message admission](GFX_MESSAGE_PLACEMENT.md)
before the original graphics metadata parser, retaining all existing public
surface/SPS and declaration limits. Valid zero-output messages are consumed
without entering the pinned null-buffer static-stream path. Additional bounded
dictionary/copy/CPU costs are documented; total memory/performance and broader
remote GFX acceptance remain open.

Iteration 160 adds [nested ZGFX admission](GFX_ZGFX_ADMISSION.md) before the
actual graphics DVC decoder callback through the public scoped ownership chain.
The earlier preallocation gap is now covered for bounded ZGFX allocation claims;
dictionary/scratch/transient realloc, other metadata/codec working memory,
retained pools/total RSS and actual remote resource acceptance remain open.

The private FreeRDP build now links the pinned private OpenH264 provider with
`WITH_OPENH264=ON`, `WITH_OPENH264_LOADING=OFF` and
`WITH_MEDIA_FOUNDATION=OFF`. Software GDI and incoming AVC420 are enabled;
AVC444 remains disabled until dual-stream decoding is verified. FFmpeg and Cairo
remain absent. Browser AVC encoding is a separate path and does not prove
server-side GFX AVC negotiation. True scaled-output mapping is rejected before
changing mapping state; identity mapping via that PDU works. A scaling provider
and actual negotiated GFX acceptance remain required work.

The relocated runtime probe calls FreeRDP's public `avc420_decompress` on an
actual compressed frame, in addition to the direct OpenH264 roundtrip. Windows
Ninja tracks C-only FreeRDP feature headers using the same UTF-8 MSVC include
probe as the bridge. Runtime DLL copies refresh on every build even without an
executable relink, so changed decoder binaries cannot remain stale locally.

Linked native tests invoke the actual public GDI GFX callbacks, codec reset,
pixel copy and region invalidation. They use bridge fixture channel storage and
desktop resize metadata, not a real DVC transport, full `gdi_init`, or an RDP
server. Tests cover frame-end pixel placement, inter-frame/origin pixels, empty
updates, geometry/count/byte guards, transient cache replacement, teardown and
rebinding. AVC420 fixtures additionally exercise actual IDR/predictive decoding,
mapped full-frame and partial-region pixels, malformed command rejection before
decoder allocation, incomplete SPS behavior, IDR recovery and fresh decoder
rebinding. Pixel checks account explicitly for the test encoder's limited-range
luma versus RDP's full-range YUV conversion. Incomplete SPS can produce no new
pixels yet still trigger an upstream invalidation; that pinned behavior is
tested historically, not represented as a successful decoded update. Iteration
161 now refuses incomplete SPS before entering that upstream path.

Real XRDP browser regression is recorded separately; it does not establish that
XRDP negotiated GFX. A Windows/GFX server, AVC444/other compressed-codec fixtures,
SPS/codec working-memory limits, actual server resize and the 30-minute desktop
soak remain open.

Successful worker DesktopResize now drops lazy encoders even when dimensions
are unchanged, so a same-size graphics reset begins a fresh AVC IDR chain.
The [Display Control foundation](DISPLAY_CONTROL.md) observes dimensions only
after GDI success; browser layout requests and actual server resize remain open.

Evidence: [iteration 14](history/iterations/001-050.md#iteration-014), [iteration 15](history/iterations/001-050.md#iteration-015),
[resize foundation](history/iterations/001-050.md#iteration-017).
