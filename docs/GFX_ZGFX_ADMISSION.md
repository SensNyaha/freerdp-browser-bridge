# Nested graphics ZGFX admission

Iteration 160 implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §11/12 after
`d1efcac`. Pinned rdpgfx_on_data_received decompresses its own ZGFX stream before
parsing graphics PDUs or invoking the bridge's public renderer callbacks. Outer
compressed-DVC inspection therefore does not cover this separate allocation path.

The production plugin registry now requires public GetChannelId/GetChannelName
manager APIs. Channel binding reads the actual public DVC name, bounded to 127
bytes, and selects nested inspection only for RDPGFX_DVC_CHANNEL_NAME
(`Microsoft::Windows::RDS::Graphics`). The addin name `rdpgfx` is not this endpoint.
Pinned listener lookup uses case-sensitive HashTable_StringCompare/strcmp, so a
different-case remote name cannot match the registered graphics listener and
bypass the exact-name policy. Null/empty/oversized/throwing getter results refuse
binding. Lower-level fixture facades may omit the getter and remain opaque;
production resolution refuses that missing API.

The completion proxy inspects the exact remaining borrowed wStream before calling
the original graphics callback. It uses the existing allocation-free ZGFX inspector:
encoded ceiling 16 MiB + 64 KiB, decoded multipart claim ceiling 16 MiB plus
64-byte allocation padding, at most 4,096 segments and single-segment 65,536-byte
scratch bound. Trusted native limits may be reduced. These are per-message limits;
they introduce no change to the 7680×4320 display policy. A large graphics PDU batch
whose decoded ZGFX output exceeds 16 MiB is explicitly refused, even if its encoded
logical message fits. Actual broad server/batch compatibility remains unverified.

Malformed/truncated/contradictory/excessive claims return invalid data without
entering the codec callback. No entropy decode, copy or remote-sized allocation
occurs in the inspector, and stream position/interface identity is preserved.
Completion still releases the logical reservation when the host callback returns,
including refusal; target close remains separately owned and faults are polled by
the worker. This is not successful graphics delivery or proof of freed host memory.

Six public callback/codec cases include actual public ZGFX decode, a legitimate
12 MiB multipart output, reduced output budget, exact-name selection and malformed
claim refusal without decoder invocation. One production-resolver case requires
both public identity APIs. Two actual linked rdpgfx/drdynvc/fake-SVC cases load the
real static graphics addin through the production scoped provider, open its actual
listener, process valid single/multipart CapsConfirm, refuse excessive nested
claims and retire callbacks before SDK plugin cleanup. No renderer/physical/remote
GFX acceptance is inferred; the large roundtrip is codec data, not a desktop frame.

Dictionary/scratch storage, transient realloc and other graphics metadata/codec
working memory remain independent. Active declaration limits are not total RSS or
pool-retention limits. Windows-server/actual negotiated GFX, malicious/lost transport,
Linux, sanitizer/fuzzer and soak gates remain open. No dependency/source/pin/SDK ABI,
public wire or capability change.
