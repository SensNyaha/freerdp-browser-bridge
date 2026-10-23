# Incoming AVC420 SPS admission

Iteration 161 implements SPECIFICATION §2.3/3.1/3.3 and ARCHITECTURE §4/11.
The guard uses the public GFX SurfaceCommand boundary, before the pinned GDI
renderer creates or calls a surface H.264 decoder. This is independent of the
outgoing browser encoder and of nested ZGFX admission.

## Source authority and scope

FreeRDP 3.32.1 `libfreerdp/codec/h264_openh264.c` initializes the decoder with
AVC/error concealment and no public memory/dimension cap. The private OpenH264
2.6.0 source selected by the current Meson build manifest is
`v2.6.0-9e1caa35a8.clean`. Its `codec/decoder/core/src/au_parser.cpp:ParseSps`
obtains coded macroblock dimensions and reference counts from SPS. In
`decoder.cpp:WelsRequestMem/GetTargetRefListSize`, those fields select picture
allocation and reference queue capacity; the single-thread path uses refs + 2,
while multiple decoder threads use a different DPB/thread bound.
`pic_queue.cpp:AllocPicture` allocates padded YUV and macroblock metadata before
cropping. `decoder_core.cpp:InitialDqLayersContext` also allocates per-macroblock
working arrays. Public parse-only mode omits YUV, but still allocates metadata;
it is not an allocation-free inspection substitute. No dependency source/pin or
SDK ABI is modified.

## Admission

The portable inspector borrows one complete Annex-B unit, allocates no storage,
and scans every NAL before forwarding any bytes. Input is limited to 8 MiB and
4,096 NALs. Three/four-byte start codes and Annex-B leading/trailing zero bytes
are supported. SPS (type 7) and subset SPS (type 15) both undergo the same prefix
inspection. Predictive units without replacement parameters remain allowed;
the existing decoder holds only parameters from previously admitted units.

The bit reader removes emulation-prevention bytes without copying and rejects
ambiguous escaped prefixes. Exp-Golomb lengths, SPS IDs, frame-number/POC fields,
255-entry POC cycles, scaling-list loops and reference counts are bounded before
use. The supported profile/chroma/depth/progressive prefix matches pinned
OpenH264: baseline/main/extended/scalable baseline/scalable high/high, chroma
0/1, 8-bit, progressive only. Other profiles and interlacing return an explicit
command failure rather than entering this decoder. This is not new support for
SVC extensions or formats which the pinned decoder cannot render.

Each coded dimension must fit the target surface rounded up to a 16-pixel
macroblock boundary, within the existing 7680×4320 hard limits. Comparison uses
remote minus-one fields before adding or multiplying them. Crop offsets cannot
make an oversized coded buffer admissible. Trusted limits can only decrease
the hard ceilings. The scan is stateless; all replacement parameters in a unit
are inspected, so an acceptable first SPS cannot conceal a larger later SPS.

Incomplete SPS prefixes now return ERROR_INVALID_DATA before decoding/painting.
This deliberately supersedes iteration 15's observed upstream no-pixels but
dirty-invalidation behavior. A refused unit preserves decoder identity,
predictive state, pixels, paints and dirty revisions. Existing actual IDR,
predictive region, recovery/rebinding fixtures still pass.

## Remaining gates

This checks resource-controlling prefixes, not full SPS/PPS/VUI/slice syntax or
entropy validity; the original decoder remains responsible for those. It does
not establish a total decoder allocation budget, account for all retained SPS,
reference/working arrays, transient growth, codec threads, multiple surfaces,
FreeRDP YUV buffers, pool retention or process RSS. Actual allocation failure,
Windows-server/negotiated remote GFX, Linux, sanitizer/fuzzer execution and soak
acceptance remain open. Legitimate batches above 4,096 NALs or coded buffers
larger than their surface are explicitly refused; broad server compatibility is
unverified. The display policy remains unchanged; passing this prefix guard
does not imply that the pinned codec supports every permitted display size.

Six portable cases cover boundaries, profiles/scaling/POC/subset SPS, malformed
framing, UE overflow, escape bytes and exact byte/NAL maxima. Public GFX fixtures
use actual private SDK output and the actual FreeRDP AVC420 decoder, preserving
IDR/prediction/recovery and proving oversized SPS refusal before decoder
creation or mutation. These are synthetic native fixtures, not remote graphics
acceptance. The dedicated fuzz target/seeds are prepared, not counted as run.
