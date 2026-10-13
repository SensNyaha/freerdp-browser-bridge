# Isolated decoded GFX message owner

Iteration 164 implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §4/11/12 after
`a6c60e2`, composing the already verified ZGFX claim and decoded-PDU inspectors.
The module is tested independently and is not selected by production callbacks
yet. This is a separate step from the restored XRDP provider ABI correction.

## Public API placement and ownership

The owner uses the pinned public zgfx_context_new/decompress/free APIs. It first
inspects encoded declarations before decode allocation, then checks the whole
decoded batch before calling the original IWTSVirtualChannelCallback. There is
no public hook inside the pinned graphics parser between decode and metadata
allocation. Therefore the original callback is given a separate borrowed stream
of literal ZGFX segments containing the inspected bytes. It runs the unmodified
parser/public renderer; no private SDK struct, parser ABI or dependency source
patch is used. The independent ingress decoder owns compressed dictionary
progression. The original decoder receives only literals and cannot require
the original compressed history.

All inputs stay on one owner thread. One synchronous callback owns the prepared
storage; there is no queue. Input pointer/position is untouched. The original
callback identity and pInterface are preserved, but its wStream/buffer identity
and encoded representation differ deliberately. The prepared stream/span cannot
escape callback return. Codec/declaration/metadata/callback/allocation faults
permanently stop reuse of that prediction/history owner. No uncertain retry occurs.
Foreign calls fail without touching active state; reentrant forwarding faults
the owner. Retirement during callback returns pending, keeps all borrows alive,
then releases the independent decoder when the callback returns. Target close
remains a separate parent-owned responsibility. Destruction during a borrow fails
the process rather than freeing live storage.

Valid zero-output ZGFX messages preserve the pinned no-op behavior: they have no
metadata to allocate, are forwarded as an empty multipart representation and
do not lose prior dictionary progression. Empty encoded input is still invalid.
Malformed/excessive decoded PDU claims enter no original metadata parser.

## Bounded storage and cost

The pinned codec contains a fixed 2,500,000-byte history and 65,536-byte segment
scratch plus fields (about 2.45 MiB per independent context). The original
graphics decoder retains its own context. A decoded batch is capped at 16 MiB;
its pinned allocation includes 64-byte padding. Literal forwarding uses one
exact reserved vector, split at 65,535 bytes, with at most 257 segments and
1,292 bytes of headers at the hard batch maximum. It does not raise public DVC
logical admission limits; this representation is internal callback storage.

Decoded preparation is released before invoking the original callback, so the
owner does not retain both decoded outputs throughout that call. Preparation
still overlaps decoded data and the literal vector, and callback execution
overlaps the literal vector and the original decoder output. Host input/pools,
temporary realloc, allocator behavior, surface/codec working arrays and total
process RSS remain separate; these sizes are not a measured total-RSS guarantee.

Two deterministic native measurements include actual public ZGFX decoding and
the same output-copy/byte-comparison sink on both sides. One input is a 12 MiB
literal two-command batch; another is a 6,390-byte WireToSurface1 AVC420 PDU with
an actual private OpenH264 1080p IDR and one metadata region. The target fixture
does not render or decode its AVC payload. The encoder runs before timing.
Neither measurement is a remote/frame-rate/LAN acceptance result.

The Windows CTest snapshot recorded six large-batch passes at 4,108.55 ms direct
versus 8,491.47 ms guarded total; 100 actual-SDK AVC passes recorded 0.9368 ms
direct versus 1.1111 ms guarded total. This is a local sample, not a stable speed
claim: earlier large-batch totals also varied substantially. Large literal
traffic has material added CPU/copy cost. Production placement must preserve
this limitation, validate actual compatibility and retain the performance gate.

## Evidence and open gates

Nine cases / 904 assertions cover actual public compressed literals and
history-only matches across messages, fresh-dictionary refusal, malformed/
excessive metadata before target dispatch, unchanged input position, sticky
callback faults, reduced policy, foreign/reentrant calls, deferred retirement,
zero output and both measurements. All samples are synthetic/native; no physical
capture/device/remote graphics acceptance is inferred.

Production completion/close proxy selection and actual rdpgfx parser placement
remain next. Allocator failure injection, codec/pool/total RSS, large-batch
performance, real negotiated GFX/Windows server, lost transport, Linux,
sanitizer/fuzzer and soak gates remain open. No wire/capability/pin/SDK ABI change.
