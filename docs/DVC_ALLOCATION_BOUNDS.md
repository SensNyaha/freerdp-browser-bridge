# DVC/ZGFX allocation-header foundation

Iteration 146 implements the declared-size slice of SPECIFICATION §3.1 /
ARCHITECTURE §12 and the retained drdynvc audit. The allocation-free inspector
is not installed in the worker receive path yet. Its existence does not bound
current upstream allocations; outer SVC admission and actual host placement
remain required. FreeRDP source/pin/public ABI are unchanged.

Authority is pinned FreeRDP 3.32.1 commit
`bf217a504e54cc719880c228e82353382cd7d4fa`, public ZGFX header and inspected
drdynvc_main.c / zgfx.c. DATA_FIRST allocates its declared UINT32 length before
the public DVC callback. Compressed DATA_FIRST independently decompresses before
that allocation. Pinned zgfx_append checks used+OutputCount against the multipart
uncompressedSize before each realloc, then adds 64 bytes of padding. Therefore
limiting that field bounds each concatenated-output allocation; it does not
establish total RSS, transient old-plus-new realloc memory or dictionary/scratch
budgets. Single compressed segments have a fixed 65,536-byte output scratch.

The proposed internal policy has independent reducible hard ceilings:

| Domain | Ceiling |
| --- | --- |
| Logical DVC DATA_FIRST/raw DATA | 16 MiB |
| Encoded complete SVC/DVC input | 16 MiB + 64 KiB metadata allowance |
| Multipart declared codec output | 16 MiB, plus 64-byte allocation padding |
| Segments examined | 4,096 |
| Single segment output scratch | 65,536 bytes, plus output padding where applicable |

Native callers may reduce positive limits, never raise them. No public JSON or
arbitrary argv is added. These are foundation policies, not today's advertised
worker/graphics limits. A 12 MiB raw DVC fixture and actual pinned ZGFX multipart
roundtrip retain large-payload coverage; neither is actual negotiated GFX.

DVC fields use little-endian 1/2/4-byte selectors, preserving the pinned helper's
selector-2/3 four-byte alias. Missing fields, excessive logical/encoded/codec
claims, known decoded fragments larger than their logical bounds, malformed
segment ranges/counts and contradictory raw size claims are refused before a
caller dispatches to the SDK. Compressed entropy is not decoded. Single compressed
output is unknown and needs a codec limit of at least 64 KiB; a logical touch
limit may independently stay 14 bytes. Empty compressed multipart output still
accounts for its 64-byte SDK allocation. Inspection borrows input and returns
only trivially copied bounded scalar metadata.

Control/unknown DVC PDUs still need separate host validation. Stateful outer
fragmentation, cumulative DVC reassembly/concurrent channels, abandonment/lifetime
and production callback ownership remain open. GFX's nested ZGFX and metadata /
codec allocations require their own placement/audit; inspecting compressed DVC
alone does not cover them. Fixed dictionary/scratch memory, upstream queues,
actual hostile/lost transport, Linux/sanitizers/libFuzzer and soak remain open.
[Audit](RDPEI_UPSTREAM_AUDIT.md), [evidence](ITERATION_146.md).
