# Bounded desktop dirty regions

Implements SPECIFICATION §2.3 and MEDIA_PIPELINE §2 with the full-frame encoding
policy of ARCHITECTURE §4 and ADR-003. The framebuffer remains authoritative
inside the worker; only rectangle metadata is snapshotted, never raw pixels.

The RDP thread owns `DirtyRegions` and its desktop revision. GFX dynamic channels
are explicitly synchronous so their public GDI output callbacks use this same
thread and adapter; see [GFX binding](GFX.md). Initial connection
and accepted server resize mark the entire desktop dirty. A nonempty classic
paint advances revision once, independent of how many rectangles it contains.
Empty, zero-area and entirely offscreen updates do not advance it. Coordinates
are clipped with 64-bit intermediate arithmetic; extents are limited to the
existing 7680×4320 worker bound.

The pending state is a fixed array of at most 64 rectangles. Touching/overlapping
rectangles are repeatedly united until no intersection remains. This may include
unchanged pixels within bounding boxes, but never omits changed pixels. A 65th
disjoint rectangle collapses pending state into one conservative bounding box;
later updates expand that box until consumption. `Snapshot.area` is therefore
a conservative covered area, not an exact changed-pixel count.

Capture snapshots revision, extents and rectangle metadata on the same thread
that decodes RDP updates. Successful encode and private IPC send consume that
revision; provider failure retains pending regions. Consumption with a stale
revision leaves all newer changes intact. A forced attach/reset capture can
encode the current framebuffer even when the pending dirty set is empty.
JPEG and AVC still encode normal complete frames with the existing 20/30 FPS
ceilings. No tile codec, raw desktop copy, extra frame queue or wire extension
is introduced. Cursor updates remain independent.

## FreeRDP paint adapter

The adapter uses the pinned public `rdpGdi`/`GDI_WND`/`GDI_RGN` headers. BeginPaint
resets both `invalid->null` and `ninvalid`, as the pinned upstream clients do.
EndPaint copies up to 64 source rectangles, or marks the complete desktop dirty
for a larger paint. The pinned aggregate region conversion can omit a one-pixel
region at coordinate zero; individual rectangles are preserved even when that
aggregate is null. Full-desktop fallback avoids losing such pixels in a large
batch while keeping adapter work bounded. Negative counts, count beyond allocated capacity and
missing required pointers are rejected before indexing. After transferring
metadata, EndPaint resets the GDI invalid list; the bridge pending set persists
until a successful capture.

The previous worker reset only `invalid->null`, allowing FreeRDP's individual
rectangle list to grow across paint cycles. This change prevents that cumulative
growth. FreeRDP still owns and allocates its raw per-paint list, retaining its
peak capacity; the adapter does not cap or shrink upstream allocation inside a
single paint. Worker metadata is fixed size. This is not a complete RSS/resource
acceptance claim.

## Acceptance scope

Portable state tests distinguish clipping/overflow, transitive unions,
capacity collapse, stale consumption and pixel coverage against an independent
reference bitmap. Linked integration uses actual public FreeRDP DC/region
allocation and invalidation with fixture window/primary metadata, including the
origin-pixel case; it is not full `gdi_init` or an RDP server integration test.
Actual XRDP video regression remains a separate test. Evidence is recorded in
[iteration 13](ITERATION_013.md).

Modern GFX frame-end output is now checked through public FreeRDP callback
fixtures. Actual negotiated GFX, confirmed dynamic resize, partial/tile transport,
dirty-area metrics and the full desktop performance/soak gates remain open.
The original requirements are retained. This block completes classic bounded
rectangle tracking, rather than the entirety of Stage 4.
