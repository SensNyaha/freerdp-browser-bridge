# RDPEI and drdynvc upstream resource boundary audit

Date: 2026-10-10. Source inspected locally at pinned FreeRDP 3.32.1 commit
bf217a504e54cc719880c228e82353382cd7d4fa. This is a source audit and retained
acceptance record, not a claim of adversarial remote integration or bounded
upstream memory. Bridge input/state/IPC bounds are separate.

## Incoming allocation precedes the bridge gate

In channels/drdynvc/client/drdynvc_main.c, drdynvc_process_data_first reads a
peer-controlled UINT32 Length. For a running channel, dvcman_receive_channel_data_first
passes it to StreamPool_Take before dvcman_call_on_receive reaches the public DVC
callback. The bridge's RDPEI receive bound of 14 bytes is enforced at that callback,
after upstream reassembly allocation. The fragmented-data path checks accumulated
bytes against the declared length, not a bridge allocation ceiling. Compressed
DATA_FIRST also decompresses before this callback. Static-channel fragments use
Stream_EnsureRemainingCapacity while reassembling the outer drdynvc message.

Therefore the current RDPEI gate cannot establish a preallocation bound for the
upstream DVC host. Closing oversized complete messages is not a substitute. This
also affects other drdynvc users such as GFX and must not be fixed with a tiny
global touch-size ceiling that breaks legitimate graphics traffic.

Required follow-up: design a public static-channel admission boundary or a separately
reviewed, provenance-tracked upstream limit implementation; bound both outer
reassembly and declared DVC/decompression sizes before allocation. Add independent
DATA_FIRST/compressed/fragmented tests against the actual host, including abandonment,
concurrent channels and legitimate large GFX traffic. No private DVC manager casts
or arbitrary argv are permitted. Worker process resource limits are additional
hardening, not this parser acceptance gate.

## Write success does not prove remote terminal release

drdynvc_send calls pVirtualChannelWriteEx. Its CHANNEL_RC_NOT_CONNECTED branch
releases the outgoing stream and returns CHANNEL_RC_OK. The public RDPEI channel
write observed by the bridge therefore cannot always distinguish that upstream
drop from normal acceptance. API/transport-return success is not remote application
acknowledgement, and terminal ID ownership/drain tests with fake DVC do not prove
no-stuck behavior after an actual transport loss. Repeated uncertain writes remain
prohibited. Actual host disconnect/failure and remote contact-release tests remain.

## Pen negotiation corrected separately

The pinned RDPEI client starts clientFeaturesMask=UINT32_MAX and intersects it with
the server's multi-pen feature when writing CS_READY. The bridge now clears only
ENABLE_MULTIPEN_INJECTION through the public RdpeiClientContext field before
Initialize. Actual-addin/fake-DVC tests prove both owned/provider paths retain touch
readiness while refusing multi-pen. [Iteration 32](ITERATION_032.md).

No dependency source or pin was modified by this audit. Linux/sanitizers, malformed
actual-host reassembly, concurrent resource accounting and soak remain unverified.

Iteration 146 adds an allocation-free DATA_FIRST/ZGFX claim inspector with linked
public codec checks and large-payload coverage. It is not installed before host
dispatch yet, so the upstream preallocation gate above remains open. Pinned
zgfx_append bounds each output realloc by the declared size plus 64-byte padding;
transient realloc and fixed dictionary/scratch are separate. The existing worker
already selects SynchronousDynamicChannels=true, which keeps drdynvc's incoming
dispatch out of its asynchronous queue; AsyncChannels alone is not that setting.
[Foundation and remaining placement](DVC_ALLOCATION_BOUNDS.md).

Iteration 149 now installs the public receive admission before pinned drdynvc
outer assembly, DATA_FIRST allocation and compressed-DVC decompression. Actual
linked drdynvc/fake-SVC tests prove claim refusal before host dispatch, compressed
decoding, legitimate 12 MiB input and two independent logical channels. They do
not establish cumulative allocations, pool retention, abandoned logical messages,
nested GFX/control/codec limits or actual lost-transport terminal release.
[Current placement and retained gates](DVC_WORKER_INGRESS.md).

Iteration 150 records the pinned local 16 MiB per-returned-stream pool threshold
and public SDK retention fixtures. Releasing a logical message does not imply its
capacity is returned to the OS. A fixed cumulative declaration budget is prepared,
but not activated; public completion hooks and retained-memory gates remain open.
[Reservation and pool evidence](DVC_MESSAGE_BUDGET.md).

## Pinned listener failure output is not an ownership token

Pinned drdynvc CreateListener assigns ppListener before HashTable_Insert, then
frees on insertion failure; generic Initialize nevertheless dereferences the
returned listener and Terminated later destroys it. A nonnull error output can
therefore dangle. Existing injected partial-creation cases are not proof of this
actual allocator failure path. Iteration 153 prepares a public manager facade
which normalizes error output to persistent fallback without inspecting/destroying
the undefined pointer. Actual generic addin and successful real-manager fixtures
pass; worker/provider placement and actual allocator-failure acceptance remain open.
[Detailed source contract](PINNED_DVC_MANAGER.md).
