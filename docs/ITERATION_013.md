# Iteration 13: bounded classic desktop dirty tracking

Implementation commit: `aac32a3`.

Requirement: SPECIFICATION §2.3, MEDIA_PIPELINE §2, ARCHITECTURE §4 and ADR-003.
This continues Stage 4 after the user accepted current screen responsiveness;
FPS, codec quality and transport contracts are unchanged.

The worker now retains at most 64 clipped dirty rectangles, coalesces intersections
and collapses excess pending regions conservatively. A paint advances revision
once only when some region intersects the desktop. Initial connection/server
resize marks the full desktop. Snapshot consumption is conditional on the current
revision and successful encode/send, so a failed provider or stale snapshot cannot
discard pending updates. All decode/encode work remains on the RDP thread and
raw desktop pixels stay out of Node.

The classic BeginPaint callback previously reset the aggregate null flag but not
FreeRDP's individual invalid count. Both metadata fields now reset at paint
boundaries; bridge pending state survives independently. The adapter copies at
most 64 individual regions per paint and uses full-desktop fallback for larger
batches. Native integration exposed the pinned aggregate conversion omitting a
one-pixel origin region; the adapter reads individual regions even when that
aggregate is null. The dedicated regression protects pixel (0,0).
See [contract and allocation limits](DIRTY_REGIONS.md).

Verification on Windows x64, 2026-10-08:

- Portable dirty-state tests: 4 cases / 696 assertions passed. Includes clipping
  with 64-bit arithmetic, empty paint suppression, transitive coalescing, the
  65th disjoint-region fallback, resize, stale consumption and failure retention.
  An independent reference bitmap checks changed-pixel coverage through 200
  mixed rectangle updates and periodic consumption.
- Linked public GDI tests: 3 cases / 9,111 assertions passed. Real public DC/region
  allocation and invalidation execute 1,000 two-region paint cycles: individual
  count returns to zero each time, its original 64-entry capacity stays constant,
  and both uncaptured regions persist in bridge state. An 80-region paint uses
  the conservative full desktop; invalid counts and the origin pixel are tested.
  Fixture primary/window metadata is supplied locally; this is not an RDP server
  or full `gdi_init` integration. The initial full-GDI fixture required an absent
  runtime cache and aborted; it was replaced with the supported public DC/region
  path without private FreeRDP cache APIs.
- Linked bundled CTest: 7/7 passed, with existing IPC, AVC, cursor, JPEG and H.264
  regression suites unchanged. Build uses MSVC /W4 /WX and /analyze; touched C++
  is clang-formatted. An initial test compilation lacked the full FreeRDP type
  include; fixture setup was subsequently revised as described above.
- Foundation CTest: 3/3 passed, including dirty state without FreeRDP linkage.
- Actual authorized XRDP/Edge H.264 regression: 1920×1080 image, 85 rendered
  frames, exactly one requested decoder reset, cursor shape after motion and shape
  replay on reattachment passed. Native diagnostics counted 108 changed paints
  and 86 encoded frames, including the deliberately failed decode. Input was
  one pointer move plus release reset, with no buttons, wheel or keyboard events;
  worker/runtime cleanup passed. This is a short functional regression, not a
  sustained FPS, latency or memory measurement.
- Actual XRDP/Edge JPEG fallback also passed 1920×1080 rendering, 47 images,
  cursor shape delivery/replay, detach/reattach and clean worker/runtime shutdown.
  Native diagnostics recorded 65 paints and 47 encodes. The same motion/reset-only
  policy was used; live artifacts remain Git-ignored.
- Final linked `pnpm check`: build/lint/format passed, 73/73 tests passed with
  zero failures, cancellations or skips in 94.4 seconds. ZIP relocation passed
  1/1 with private FreeRDP/ZLIB and no dependency PATH. clang-format dry-run
  with warnings as errors and `git diff --check` passed.

Modern GFX callbacks, accepted dynamic resolution, partial-region/tile transport,
dirty-area metrics and 30-minute desktop/performance gates remain open. FreeRDP's
raw invalid array still retains the largest individual paint capacity; the
bridge's fixed metadata bound does not claim a bound on all upstream decoder
allocations or complete RSS acceptance. No Stage 4 aggregate gate is checked off.
