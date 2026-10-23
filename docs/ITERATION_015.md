# Iteration 15 — private incoming GFX AVC420 decoder

Date: 2026-10-08. Scope: SPECIFICATION §2.3, ARCHITECTURE §4,
MEDIA_PIPELINE §2, accepted ADR-003 and ADR-010. Original requirements retained.
Implementation commit: `d5b1a0a`.

## Delivered

- Pinned FreeRDP 3.32.1 now links the private OpenH264 provider for incoming
  AVC420. Dynamic provider loading, Media Foundation and FFmpeg remain disabled.
  Dependency headers/library must resolve inside the private prefix. Source
  commit remains `bf217a504e54cc719880c228e82353382cd7d4fa`, with no source edits.
- Software GDI and AVC420 negotiation enabled. AVC444 remains unadvertised and
  rejected until its dual-stream path is verified. Browser encoding is separate.
- SurfaceCommand wrapper checks thread ownership, surface ID/existence, 8 MiB
  payload ceiling, AVC420 bitstream containment, required metadata, at most
  1024 rectangles and bounded geometry before renderer decoder allocation.
- Relocated runtime probe now invokes public FreeRDP `avc420_decompress` on a
  compressed frame, in addition to direct OpenH264 and JPEG roundtrips.
- Fixed C-only FreeRDP Ninja dependency detection on localized MSVC. The UTF-8
  include-prefix probe now supports both C and C++ and is injected through the
  upstream CMake project hook. Previously, generated feature headers changed
  while old GDI/codec objects remained compiled without the decoder. No upstream
  source patch or antivirus configuration change was needed.
- Runtime DLL copies now refresh on every native build, including builds with
  no worker relink. Import libraries can remain unchanged when DLL code changes.
  Regression checks verify actual feature-header dependencies and matching
  private/build runtime hashes after the temporary workspace alias is removed.

Contract: [GFX](GFX.md), [browser AVC](MEDIA_H264.md).

## Verification

Windows x64 / MSVC C++20 `/W4 /WX /analyze`:

- AVC420 narrow callback suite: **2 cases / 23,133 assertions**. Actual upstream
  GDI SurfaceCommand decodes IDR and predictive access units into a mapped
  desktop. Independent pixels verify placement, partial-region changes and
  unchanged pixels outside the updated region. Also covers incomplete SPS,
  subsequent IDR recovery and teardown/rebind with a fresh surface decoder.
- Malformed command tests verify rejection before decoder allocation or paint:
  oversized identifier/payload, missing metadata, out-of-bounds rectangles,
  excessive rectangle counts and out-of-range bitstream pointers/lengths.
- Fixtures deliberately account for browser encoder limited-range YUV versus
  RDP full-range conversion: neutral input 40/240 encodes luma 50/222. Tolerance
  is five values for lossy pixels and zero outside the update region. This is
  a decode/placement oracle, not a browser color-conversion test.
- Incomplete SPS can return no new pixels but still advance upstream dirty
  invalidation. The fixture asserts unchanged pixels and that actual behavior;
  it does not claim every accepted command produced a decoded frame.
- GFX callback fixtures: **7 cases / 27,160 assertions**; combined GDI/GFX:
  **10 cases / 36,271 assertions**. These are linked public callback fixtures,
  not a real DVC transport, full `gdi_init` or a remote GFX negotiation test.
- Bundled CTest **7/7**, foundation CTest **3/3**.
- Bundled `pnpm check`: **73/73**, no skipped/cancelled tests, **123.4 s**;
  typecheck, lint and formatting pass. Extended Windows Ninja integration passes.
- Native ZIP relocation **1/1** without dependency PATH, including actual public
  FreeRDP AVC420 decode. Native package: approximately **5.6 MiB compressed**,
  **14.2 MiB installed**, excluding Node.js/API and future media providers.
- `clang-format --dry-run --Werror`, `git diff --check` and pinned-source
  cleanliness checks pass.

Logs are ignored local artifacts: `build/avc420-{freerdp,narrow,bundled,foundation,
pnpm-check,relocate}.log` and the GDI/GFX suite logs.

## Separate actual XRDP regression

Authorized lab, previous session-only exact certificate trust, ignored local
credential helper and private IPC were used. Automatic remote input remained
one pointer move and one release/reset, without keys, buttons or wheel.

- Edge H.264/reset: **42 rendered frames**, 1920×1080, **1 decoder reset**,
  **44 encoded frames**, 44 paints; cursor shape delivery and reattachment replay.
- Edge JPEG: **38 rendered frames**, 1920×1080, **39 encoded frames**, 41 paints;
  cursor shape delivery and reattachment replay.
- Both helpers exit successfully after session deletion and runtime cleanup.

Logs: ignored `build/avc420-xrdp-h264.log` and `build/avc420-xrdp-jpeg.log`.
This proves the existing browser paths still work with the updated build/settings;
it does not prove that XRDP negotiated incoming AVC420 or GFX, nor establish
maximum FPS or desktop soak.

## Retained work

Actual negotiated GFX on a Windows/GFX server, AVC444 and other compressed codec
fixtures, true scaled-output mapping, actual server resize and 30-minute soak
remain open. Callback limits run after DVC/ZGFX parsing and allocation. SPS,
codec working memory, upstream reassembly and region allocations still require
resource audit and RSS/soak verification. No wire contract changed. Stage 4
remains IN PROGRESS and the broad `rdp` capability remains false.
