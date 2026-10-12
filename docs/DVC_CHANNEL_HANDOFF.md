# Accepted DVC callback ownership handoff

Iteration 154 implements SPECIFICATION §3.1 / ARCHITECTURE §12 after pinned manager
normalization `4a396a4`. The helper consumes **only a live callback explicitly
transferred by a successful, accepted listener factory**. Failed/denied factory
output has not transferred ownership and must not be passed here. Production
listener/provider wiring remains open.

Successful registry binding returns its proxy without early close. When a new
accepted target is rejected, the helper snapshots OnClose and invokes it at most
once, even if it deletes the callback or reports/throws an error. It never reads
the target after close. Binding status and separate cleanup status/close_invoked
are retained; close invocation does not prove resource release. Missing OnClose
reports an unresolved NOT_SUPPORTED cleanup obligation for the enclosing owner.
No uncertain close is retried.

The registry now records original callback identity and refuses one live original
being bound to different IDs. Its owns_callback query compares only identity of
live entries. An already-owned alias is never closed by a rejected second handoff;
the existing registry owner still closes it once. Sharing original callback targets
across IDs is unsupported by this ownership profile. Closed, unpublished slots
retain the prior reuse rules. No public wire/capability/dependency change.

Five fixture cases cover successful transfer, self-destroying rejection, alias
ownership, failed/throwing cleanup and missing close. Two actual pinned drdynvc /
fake-SVC cases cover normal projection and refusal at a reduced one-slot registry.
The rejected new target closes once while the old target remains open until host
shutdown. The initial fixture expected a nonzero global channel error, but pinned
CREATE instead sends a negative response and returns overall success. The corrected
test checks both that behavior and the registry's own failed state: the future
owner must inspect its own fault even with SDK channel error zero.

Combined linked suite **74 cases / 6,461 assertions**, bundled CTest **18/18**,
foundation **7/7**, /analyze /W4 /WX pass. These are ownership/public-host fixtures,
not actual server/device/application acceptance. Global listener/addin registration,
cancelled/failed factory handoffs, active worker aggregate limits, actual allocator /
remote cumulative memory, pool/nested codec limits, Linux/sanitizer/fuzz/soak remain
open. Original factory ownership/lifetime must be preserved through all calls.
