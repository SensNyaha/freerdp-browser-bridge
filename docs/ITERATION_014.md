# Iteration 14 — synchronous bounded GFX binding

Date: 2026-10-08. Scope: SPECIFICATION §2.3, ARCHITECTURE §4,
MEDIA_PIPELINE §2 and accepted ADR-003. Original requirements are retained.
Implementation commit: `90285bb`.

## Delivered

- Checked public FreeRDP 3.32.1 GDI graphics-pipeline initialization and channel
  lifecycle binding. A 32-bit session advertises GFX when the client channel is
  compiled; classic updates remain usable when the server chooses them.
- Explicit synchronous dynamic channels and disabled asynchronous update/channel
  handling keep canonical framebuffer mutation, dirty revisions and native
  capture on the RDP loop thread. Binding rejects incompatible settings.
- Before upstream allocation: bounded surface/reset dimensions, format checks,
  duplicate rejection, 16 surfaces / 256 MiB, 4096 cache slots / 128 MiB,
  rectangle/slot checks and transient replacement accounting. Metadata is fixed
  size and optional native reductions cannot raise these limits.
- Public GFX frame-end/inter-frame rendering uses the existing GDI dirty adapter.
  ResetGraphics uses DesktopResize. Teardown frees tracked resources and removes
  callbacks before GDI destruction, including early disconnect and rebinding.
- Bitmap persistence disabled explicitly. RemoteApp and persistent imports are
  unsupported. The current Cairo-free build rejects actual scaled mappings
  before changing mapping state; identity mapping is accepted. Incoming GFX AVC
  is not advertised because the current FreeRDP build has no H.264 decoder.
- Windows `max` macro compatibility corrected in the existing timing header;
  timing behavior and wire format are unchanged.

Contract: [GFX](GFX.md), [dirty regions](DIRTY_REGIONS.md).

## Verification

On Windows x64 / MSVC C++20 `/W4 /WX /analyze`:

- GFX narrow suite: **5 cases / 4,022 assertions**. Linked native public callbacks
  render mapped fill pixels at GFX EndFrame and uncompressed inter-frame pixels
  at the desktop origin; an independent pixel oracle checks the resulting BGRA
  buffer. Empty output does not advance revision. Tests exercise allocation
  budgets against actual padded surface storage, count/geometry/slot rejection,
  transient cache replacement, reset, wrong-thread rejection and teardown/rebind.
- These are **public GDI/GFX callback fixtures** with local DVC storage and resize
  metadata. They are not a full `gdi_init`, remote GFX or actual server-resize
  test. The resize fixture supplies the desktop buffer; upstream GFX reset and
  codec-reset callbacks themselves are real.
- Combined public GDI/GFX executable: **8 cases / 13,133 assertions**.
- Bundled CTest: **7/7**. Foundation CTest: **3/3**. Existing IPC/input/state,
  AVC, cursor, dirty, JPEG and H.264 tests also pass.
- Bundled `pnpm check`: **73/73**, no skipped or cancelled tests, **59.6 s**.
  Node typecheck, lint and formatting checks pass.
- Native ZIP relocation: **1/1**, private runtime/dependency resolution passes.
- `clang-format --dry-run --Werror` and `git diff --check` pass.

## Separate actual XRDP regression

The previously authorized XRDP lab and session-only certificate trust were used.
Credentials stayed in the ignored local helper files and private IPC. Automatic
input was one pointer move and one release/reset, with no remote buttons or keys.

- Edge H.264/reset: **49 rendered frames**, 1920×1080, **1 decoder reset**,
  **50 encoded frames**, 49 paints, cursor shape delivery and reattachment replay.
- Edge JPEG: **49 rendered frames**, 1920×1080, **49 encoded frames**, 51 paints,
  cursor shape delivery and reattachment replay.
- Both helpers exited successfully after deleting the session and checking runtime
  cleanup. Logs: ignored `build/gfx-xrdp-h264.log` and `build/gfx-xrdp-jpeg.log`.

This verifies existing XRDP/browser paths after the new negotiation settings;
it does **not** prove that the server used GFX. A mostly static lab desktop is
also not a maximum-FPS or full latency/soak measurement.

## Retained work

Actual negotiated GFX on a Windows/GFX server, compressed incoming codec
fixtures, FreeRDP AVC decoding, true scaled-output support, actual server resize,
partial-region transport, adaptive scheduling and the 30-minute desktop soak
remain open. Surface/cache budgets do not bound upstream DVC/ZGFX allocations,
region storage or codec working memory; the RSS/resource audit is still required.
Stages 3/4 remain IN PROGRESS and the broad `rdp` capability remains false.
