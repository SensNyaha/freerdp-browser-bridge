# Bounded public DVC entry-point registry

Current deployment: [iteration 159](DVC_PROVIDER.md) selects this registry via the
worker's scoped provider. Fixture-only placement below describes the original
iteration-158 block. Actual allocator-fault and remote resource gates remain open.

Iteration 158 implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §12 after
`8e22c2a`. DvcPluginRegistry wraps public entry points for one serialized pinned
host, retains at most 32 plugin proxies/names, and creates one shared bounded
listener manager. Installation remains fixture-only; no production aggregate
admission is claimed.

The entry-point object is borrowed only during install. All getters delegate with
the original host object, since pinned implementations privately extend it.
GetPlugin projects tracked live proxies back to original plugin pointers, preserving
addin casts/identity. Names use fixed 128-byte storage and accept 1..127 bytes;
empty/oversized names, duplicate names/targets and exhausted slots are refused.
The one-plugin-per-entry rule matches the currently selected pinned channel entries;
it is not support for arbitrary external/custom multi-plugin addins.

RegisterPlugin first captures a plugin without publishing it to the host. On entry
failure, the pinned entry owns its cleanup and the captured pointer is never read.
On entry success, bridge publication supplies stable name storage and a plugin
proxy. Failed/throwing host publication terminates the original once, retaining an
inert proxy for an uncertain late host callback. No publication retry occurs.
An exception from entry construction itself has uncertain cleanup; it is reported
as failure without assuming the captured original remains live or was reclaimed.
Actual pinned allocation/ArrayList failure injection remains unverified. The pinned
name append precedes plugin append; source audit is not an allocator-fault test.

Initialize resolves one actual manager identity to the common listener facade.
Manager migration or resolution during installation is refused. close stops
registration, plugin activation and listener acceptance. retire closes channel
targets while their original plugin state is still live if the SDK has not closed
them already; it does not prematurely terminate plugins. Final host_unpublished
requires every retained plugin to have ended, all channel targets to have retired,
and external proof that native listeners/callbacks were unpublished. It releases
retained uncertain listener proxies without native pointer dereference. Storage
must remain alive through delayed host callbacks; destruction otherwise terminates
the worker. No async join, resource reclamation or remote release is inferred.

Seven public fixtures use the actual generic entry/factory, exact original-pointer
projection, shared manager, failed/throwing retained publication, name/slot bounds
and teardown requirements. One actual drdynvc/fake-SVC fixture exercises the full
entry → plugin → shared manager → listener → channel chain and two-channel cleanup.
Scoped global provider/worker activation and independent fault polling remain open,
as do upstream pool/nested codec limits, actual remote resource acceptance,
Linux, sanitizer/fuzz and soak verification. No pin/source/SDK ABI/wire/capability
changes or actual device acceptance claims.
