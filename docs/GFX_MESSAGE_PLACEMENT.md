# Production decoded graphics admission

Iteration 165 implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §4/11/12 after
`34fc976`. The exact Graphics DVC name now creates a GfxMessageGate inside its
public completion proxy. This selects the previously isolated owner on the
production synchronous provider/registry path; other channel callbacks retain
their opaque dispatch. All declaration limits precede decode, all decoded PDU
claims precede the original graphics metadata parser, and the existing public
surface/SPS guard remains before the renderer/H.264 decoder.

The original callback receives a temporary literal representation of the checked
batch. Caller input position/buffer and callback/pInterface identity remain
unchanged; original encoded-buffer/stream identity is deliberately different.
This supersedes iteration 160's no-copy target-stream contract for Graphics only.
Complete-message reservations release after original callback return or refused
admission. Nested close/owner retirement keeps the prepared stream alive until
callback return, then retires the independent dictionary before target OnClose.
Late SDK close remains cached and cannot repeat original cleanup.

## Zero-output correction

Pinned zgfx_decompress can succeed with no output pointer/bytes. The original
rdpgfx_on_data_received then calls Stream_StaticConstInit on that pointer, while
WinPR Stream_StaticInit asserts buffer != null even when size is zero. The
isolated prototype's codec-only sink did not exercise that graphics parser.
Production therefore consumes valid zero-output messages after independent
dictionary progression, without invoking the original parser. They contain no
PDU/metadata operation; release accounting still occurs. Empty encoded input is
invalid. This supersedes iteration 164's forwarded empty-multipart behavior.

An actual rdpgfx/drdynvc/fake-SVC case covers empty multipart and compressed
zero output followed by ordinary CapsConfirm, with healthy registry and three
observed reservation releases. This protects the identified source assertion
path without modifying the SDK or weakening claim inspection.

## Evidence and remaining work

Two public binding cases verify excessive metadata refusal before original
callback entry and transformed-stream lifetime through pending registry retirement.
Two actual rdpgfx/drdynvc/fake-SVC cases use public context/stat APIs: complete
AVC420 metadata advances the original command counter once; an excessive count
or cross-PDU borrowing leaves that counter unchanged. The source increments the
counter before its metadata parser, so the unchanged value establishes placement
before those allocations. There is no allocator-failure injection or renderer in
these cases; the slice is synthetic opaque data and is not AVC decode acceptance.

The existing public codec fixture now uses valid GFX batches, including a 12 MiB
two-command literal batch. Pure large ZGFX codec tests remain separate. Historical
arbitrary codec bytes are not a valid Graphics PDU stream. Actual CapsConfirm
and ownership/termination fixtures still pass. Storage/copy/CPU costs from
[the owner audit](GFX_MESSAGE_GATE.md) remain; large literal overhead is material
and total RSS/performance acceptance is not inferred from admission.

The first production XRDP probe reported WORKER_FAILED before rendering. After
the source-based zero-output correction the H.264 resize/restoration/reattachment
probe passes. That sequence alone does not prove which original lab packet
caused the failure; the actual linked zero-output case independently proves the
guarded assertion path. Temporary private helper diagnostics are removed.

Broader negotiated GFX/Windows-server compatibility, multiple simultaneous GFX
channels/reopening, remaining codec/control allocations, upstream fake RDPSND,
pool retention/total RSS, allocator/lost-transport faults, large-batch/soak,
Linux/sanitizer/fuzzer and remote terminal input release remain open. No public
wire/capability/dependency source/pin/SDK ABI change.
