# Scoped production DVC provider and aggregate admission

Iteration 159 implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §11/12 after
`eb2549e`. DvcProvider binds last on the serialized RDP thread after existing
touch/output audio/microphone providers. It retains up to 32 public addin entry
pointers and fixed 127-byte names, delegates other ABIs to the previous provider,
and returns a non-null DVC refusal on unsupported/invalid selection to prevent
dynamic-library fallback. It requires synchronous dynamic channels and no async
channel/update profile. Arguments/context/settings correlate the common entry
thunk with the original addin; foreign thread, reentrant DVC selection and stale
entry calls are refused. Nested synchronous device loading still uses the previous
provider during DVC entry. No arbitrary external/multi-plugin addins are accepted.

Iteration 163 corrects the earlier flag-only ABI classification: pinned dynamic
RDPSND uses the same DYNAMIC flag for subsystem device entrypoints. Requests with
subsystem/type selectors retain the previous provider and exact flags; only bare
dynamic plugin requests use this DVC registry. The actual XRDP audio-off profile
can load the pinned `sys:fake` fallback through RDPDR/network feature dependencies.
This fixes an Open refusal without changing backend/capture policy. Earlier
synthetic other-ABI coverage used flags 0 and missed this case.
[Source audit and restored regression](ITERATION_163.md).

The worker now owns a channel registry and plugin registry before its context
member, preserving wrappers through context destruction. The receive guard's
complete-message delegate reserves known live DATA_FIRST declarations before
native allocation: default at most 32 active declarations, individual 16 MiB,
aggregate 64 MiB and nonrenewing 5-second logical deadline. Unknown channels
remain uncharged because the pinned host has no matching live callback. Existing
outer framing and individual ZGFX claim limits remain unchanged. Empty suspend/
resume notifications are delegated without treating them as PDUs.

Both sides of each bounded event batch poll outer and logical limits, with idle
waits no greater than 50 ms. Incoming non-DVC SVC traffic also polls the logical
budget. Post-dispatch checks observe bridge listener/plugin/registry faults even
where negative CREATE or callback-close handling leaves SDK global error zero.
During blocking connect, callback-time checks and the finite connect watchdog
apply; idle 5-second reclamation during blocking connect is not claimed.

Teardown closes admission and retires channel callbacks before freerdp_disconnect,
while original plugin state remains live. This also covers accepted callbacks
retained by the bridge but not published to the host after cancellation. The last
provider scope closes first. Synchronous SDK disconnect then unpublishes listeners,
terminates plugins and closes/frees the native DVC host. Final host_unpublished
releases retained inert listener proxies without native dereference. Pending or
unpublished callback ownership at this serialized boundary terminates the worker
instead of freeing a live borrow. Faults map to existing structured protocol
failure; no new wire field or advertised device capability is added.

Five public provider fixtures and one actual drdynvc/fake-SVC fixture cover ABI
delegation, cached entry/name/slot bounds, non-null refusal, context/argument/thread
checks, ordered scope restoration and callback retirement before plugin teardown.
The source audit confirms OpenHandle is established before dynamic entry loading,
core channels.connected is set before post-connect callbacks, and public
freerdp_disconnect dispatches final channel termination even after connect failure.
These findings are source evidence, not actual allocator-fault injection.

64 MiB is a bound on active declared logical bytes, not total worker RSS. The pinned
pool can retain returned capacities; transient realloc, dictionaries, nested
RDPGFX ZGFX and codec/control allocations remain independent gaps. Actual Windows
RDP/GFX, adversarial/lost transport, remote cumulative memory, Linux, sanitizers,
fuzz and soak acceptance remain open. Transport success is still not proof of
remote terminal touch release. Existing requirements are retained.

Iteration 160 subsequently bounds nested RDPGFX ZGFX allocation claims through
exact public channel-name selection before the codec callback. [Current nested
contract](GFX_ZGFX_ADMISSION.md). Dictionary/scratch/transient realloc, other
metadata/codec working memory, retained pools/total RSS and remote gates remain open.
