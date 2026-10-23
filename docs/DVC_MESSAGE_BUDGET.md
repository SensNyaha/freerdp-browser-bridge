# Cumulative DATA_FIRST declaration reservations

Current deployment: [iteration 159](DVC_PROVIDER.md) activates these reservations
for known live DVC channels in the worker. Unactivated statements below describe
the original iteration-150 foundation. Aggregate declared bytes remain separate
from retained pool capacity and total process memory.

Iteration 150 implements SPECIFICATION §3.3 / ARCHITECTURE §11 after worker
admission `1e16dd6`. The allocation-free DvcMessageBudget is an unactivated
foundation: **it does not limit the production worker yet**. Its future caller
must reserve before host dispatch and release only on observed complete message
delivery or channel close. Outgoing SVC success is not such an observation.

A fixed array has at most 32 active channel reservations. Trusted native policy
may reduce the 64 MiB aggregate / 16 MiB per-message hard bounds and slot count.
Zero-length declarations consume a slot, matching the fact that a host can still
take a default-capacity stream. Channel IDs 0 and UINT32_MAX are ordinary IDs.
Replacement checks the complete aggregate delta before changing the entry, keeps
the original deadline and counts separately. Completion frees one reservation;
absent standalone DATA completion returns false without fault. A reused slot gets
a fresh deadline. No heap storage, queue, thread or timer is added.

Default original deadline is 5 s, trusted range 1..10,000 ms. Exact expiration,
backward/overflow-prone clock, per-message/aggregate/slot refusal fail admission
once. Close/failure clears only this table, preserves lifetime/peak counters and
cannot reopen. **It does not free pinned host allocations**: its owner must also
retire/disconnect the host. Failure or timeout cannot be treated as a successful
remote cancellation or silently used to recycle live memory ownership.

Five portable cases test aggregate reservation before forwarding, replacement
deltas with nonrenewing deadlines, single observed release/fresh reuse, zero
claims/ID/clock/overflow boundaries, unsupported policies and 256 reduced-policy
boundaries. Portable combined suite: **19 cases / 5,384 assertions**. Linked suite
including actual public pool fixtures: **36 / 5,807**. Bundled CTest **18/18** and
foundation **7/7** pass with MSVC /analyze /W4 /WX.

## Pool retention is a separate ownership boundary

Pinned WinPR StreamPool_Remove calls ShrinkToCommonLimit then appends the stream
to the available array. There is no count/aggregate byte cap in that function.
The recorded local cache sets STREAMPOOL_SIZE_LIMIT=0x1000000 (16 MiB), a
**per-returned-stream** threshold. Two public linked SDK cases prove that a
released 12 MiB stream is reused for a one-byte request with its capacity intact,
and four simultaneous 1 MiB streams remain reusable after release. These are
synthetic public API checks, not actual drdynvc pool memory instrumentation.

Therefore active declaration accounting alone does not establish RSS or retained
pool bounds. Returned buffers, concurrent outer/codec allocations, fixed per-DVC
ZGFX dictionaries, channel admission/count, nested GFX/control/codec allocations
and allocator behavior remain separate gates. No dependency option/source/pin is
changed here. Lowering a global pool threshold requires compatibility/performance
evidence and does not by itself cap the number of cached streams.

Next integration requires public channel-ID registration/completion/close hooks,
before-forward reservation, idle polling and host retirement on refusal. Unknown
channels that the pinned host ignores must not be charged as allocated owners.
Fixtures, full actual host/remote compatibility, logical abandonment, cumulative
and retained-memory accounting, Linux/sanitizers/fuzz/soak remain open.

Iteration 151 adds a [public completion/close proxy](DVC_COMPLETION_HOOK.md) with
actual pinned drdynvc/fake-SVC reservation fixtures. It remains outside production
registration/admission; table clearing still does not establish host memory release.
