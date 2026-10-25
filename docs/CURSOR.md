# Independent cursor stream

Implements SPECIFICATION §2.4, MEDIA_PIPELINE cursor handling and ADR-004 on
Windows with the pinned public FreeRDP 3.32.1 pointer API. This is an experimental
cursor capability, not acceptance of the complete desktop/session gate.

## Native extraction and ownership

The headless GDI connection registers pointer New/Set/SetNull/SetDefault/SetPosition
callbacks. FreeRDP owns its pointer cache and raw masks; the bridge assigns a
session-local nonzero u64 shape identity and converts the active shape using
`freerdp_image_copy_from_pointer_data` into owned, top-down RGBA8. Color and mono
mask conversion, row padding, alpha and hotspot validation use the pinned public
API. Pointer and color-pointer caches are limited to 20 entries each. Shapes are
limited to 384×384, with a maximum 589,824-byte RGBA image. Mask lengths and
dimensions are checked before allocating the converted image.

Only the current converted shape is retained. A cached shape selected again after
another shape is converted and sent again; selecting the same active identity
only restores visibility. SetNull hides without discarding the current shape;
SetDefault selects the system cursor. Position and visibility changes contain
no image bytes. No cursor event captures or encodes a desktop video frame.

FreeRDP's monochrome invert-pixel conversion uses a black/white checker fallback.
It does not reproduce exact background XOR in the browser. Exact invert
compositing remains a retained requirement gap; ordinary transparency is tested.

## Private RWI1 extension

HELLO_ACK capability bit 7 (`cursor`) requires connection-core bit 2. Foundation
workers report false. Linked workers report true while usable-desktop `rdp`
remains false. CURSOR_UPDATE is kind 26, requestId zero, with 40 bytes of metadata
and an optional image. Its payload bound is 589,864 bytes, checked at the header
before body allocation. All integers below are big endian:

| Offset | Field |
|---:|---|
| 0 | u16 schema = 1 |
| 2 | u16 flags: visible=1, default=2, position-known=4, image-included=8 |
| 4 | u64 strictly increasing nonzero state revision |
| 12 | u64 shape identity, zero only for default/system cursor |
| 20 | u64 worker steady-clock timestamp in microseconds |
| 28, 30 | u16 x, y; both zero when position is unknown |
| 32, 34 | u16 width, height |
| 36, 38 | u16 hotspot x, y |
| 40 | optional packed RGBA8, exactly width × height × 4 bytes |

Default state has zero dimensions/hotspot and no image. Custom dimensions are
1..384 and hotspot must lie inside the image. Unknown flags, inconsistent
lengths and replayed revisions fail the session. An image-free custom update
must match the current cached shape identity and geometry. Node retains one
validated current snapshot; attachment replays it. Shutdown drops native cursor
events and session cleanup releases the snapshot and subscriptions.

## Browser extension and bounds

A media client opts in with `media.hello.data.cursor=true`. `media.ready` reports
the negotiated extension. Legacy clients omit it and receive no cursor binary
records. Shape is RWB1 type 0x05, flags zero, streamId 2. Its sequence starts at
zero per media attachment and is independent of video stream 1 and video ACK.
The timestamp is the originating worker timestamp; it is not synchronized with
the browser clock. The payload is:

| Offset within payload | Field |
|---:|---|
| 0, 2 | u16 schema=1, u16 format=1 (RGBA8) |
| 4 | u64 shape identity |
| 12, 14 | u16 width, height |
| 16, 18 | u16 hotspot x, y |
| 20 | packed top-down RGBA8 |

Maximum record size is 589,872 bytes including the 28-byte RWB1 header. Control
events are `cursor.visibility` with booleans `visible`, `default` and decimal u64
string `shapeId`, and `cursor.position` with u16 `x`, `y`. Visibility carries the
expected identity because the two sockets can arrive in either order. Shapes
need no ACK and consume no video credit. The server keeps one latest cursor
snapshot and at most one shape WebSocket write in flight. Changes while writing
replace the pending latest state instead of building a shape queue. The total
media socket backlog bound is 8 MiB + 2,059 + 128 + 589,872 bytes.

The harness decodes cursor records independently of the video decode queue and
uses one transparent canvas overlay. Pointer movement updates its local position
immediately. Desktop CSS scaling applies to image dimensions and hotspot;
server position events also update the overlay. It appears only inside the
desktop when visible and the expected shape has arrived. Default state restores
the browser system cursor. Detach removes the canvas and event listeners;
reattachment starts a fresh shape sequence and replays the retained shape.

On a display VIDEO_CONFIG reset, the overlay remaps the last local browser
pointer through the new canvas geometry and hotspot scale. An old server-only
position is hidden until a fresh local position; out-of-desktop server coordinates
cannot show an overlay outside the framebuffer. Shape identity/sequence remains
independent and does not reset with video. The Edge fixture checks stationary local
pointer mapping through a same-CSS-size canvas resize and restoration; see
[iteration 19](history/iterations/001-050.md#iteration-019).

## Acceptance limits

Native state/parser and linked public conversion tests are separate from fake
HTTP/WebSocket and Edge DOM tests. The authorized actual XRDP helper verifies
custom shape delivery after motion and replay after browser reattachment,
without sending buttons, wheel or keys. See [iteration 12](history/iterations/001-050.md#iteration-012).
Linux, Windows RDP server, exact monochrome inversion, actual large/palette
cursor negotiation, and the complete 30-minute desktop/resize gate remain open.
