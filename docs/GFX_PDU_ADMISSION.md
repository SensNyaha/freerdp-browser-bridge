# Prepared decoded GFX PDU admission

Current placement: [iteration 165](GFX_MESSAGE_PLACEMENT.md) now invokes this
inspector before original Graphics metadata parsing through the bounded decoded
owner. The historical prepared-only status below records iteration 162.

Iteration 162 implements the portable count/framing foundation of SPECIFICATION
§3.1/3.3 and ARCHITECTURE §4/11 after `2d69844`. It does not activate another
production receive adapter yet. Production nested ZGFX claim admission and
surface SPS admission remain the separately verified iterations 160/161.

## Source audit

Pinned `channels/rdpgfx/rdpgfx_common.c:rdpgfx_read_header` checks pduLength
against remaining batch bytes but does not create a PDU-sized substream.
`client/rdpgfx_main.c:rdpgfx_recv_pdu` invokes body parsers with that whole batch
stream, then adjusts position to the declared end. Body length/count checks can
therefore succeed using bytes from a following PDU. The new inspector gives
each body a borrowed span bounded by its own header before examining claims.

`client/rdpgfx_codec.c:rdpgfx_read_h264_metablock` allocates rectangle and
quantizer arrays before the public renderer sees them. It first checks 8 bytes
per rectangle; the 2-byte quantizer availability check occurs after allocation.
The public struct sizes are 8-byte rectangles and 5-byte quantizer metadata;
an admitted region therefore owns 13 bytes of these arrays, separate from its
10 wire bytes. The bridge renderer's existing 1,024-region ceiling is later.

SolidFill/SurfaceToSurface/CacheToSurface allocate arrays from 16-bit counts
after remaining-stream checks. ResetGraphics checks pinned dimension/monitor
limits before calloc and requires a 340-byte padded total PDU. CacheImportReply
already checks a fixed SDK-array limit; it is not a remote-sized heap allocation.
These distinctions are retained rather than treating all counts as unbounded.

## Prepared contract

`admit_gfx_pdus` inspects an already decoded complete batch without allocations,
copies, semantic callbacks or decoder state. Hard limits are 16 MiB, 4,096 PDUs,
and 1,024 AVC420 regions; trusted limits may only decrease them. Every header
must fit and advance within the current batch. Known array/bitmap claims must
fit their own PDU/bitmap span before count arithmetic or host dispatch.

WireToSurface1/2 keep the 8 MiB encoded command ceiling. WireToSurface1 AVC420
checks the full rectangle-plus-quantizer wire footprint. Pinned WireToSurface2
does not call the AVC metadata decoder; its payload remains opaque here.
AVC444/v2 remain explicitly unsupported as in the current renderer, rather than
allocating their metadata before that refusal. Other codecs/command semantics
remain with the existing pinned parser and renderer; admission is not proof of
renderability or complete protocol validity. Array-bearing drawing commands
retain the full 16-bit count range, bounded by their own wire footprint.
Reset/cache checks match current display/monitor/cache budgets. No wider
monitor requirement or new codec capability is introduced.

Five portable cases and one actual public ZGFX-output case cover independent
wire vectors, all header truncations, UINT32 claims, mixed batches, metadata
counts, cross-PDU borrowing, reset/cache and reduced limits. Public SDK constants
and struct sizes are compile-checked. The codec fixture dispatches original
ZGFX first and then inspects its output: this deliberately does not establish
pre-allocation production placement, actual rdpgfx metadata parsing or remote
GFX acceptance. The dedicated fuzzer/seeds are prepared, not counted as run.

## Next ownership layer

Production placement requires access to decoded data before pinned metadata
parsing. The public channel callback presently receives compressed ZGFX;
renderer callbacks are too late. An independent bounded decoded-message owner
must preserve dictionary progression, synchronous callback lifetime, cancellation
and failure semantics. Any extra materialization/forwarding memory and CPU must
be measured and documented before claiming a memory/performance gate. Source
pin/SDK ABI changes are not part of this foundation. Decoder working memory,
pool/RSS, real remote/resource faults, Linux/sanitizer/fuzzer and soak remain open.
