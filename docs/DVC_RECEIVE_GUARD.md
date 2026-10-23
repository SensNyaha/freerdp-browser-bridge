# Public drdynvc receive adapter

Iteration 148 implements SPECIFICATION §3.1 / ARCHITECTURE §12 on top of
`e906569`. `DvcReceiveGuard` accepts the pinned public ReceiveChannelData ABI
and resolves the drdynvc SVC ID through public `freerdp_channels_get_id_by_name`.
It is not installed in the worker yet. Actual host/production preallocation and
remote compatibility acceptance remain open.

One serialized caller keeps the adapter alive through callbacks, polls on its
RDP thread and closes before context destruction. A resolved ID cannot migrate
or disappear. Before resolution, and for other SVC IDs, the original callback
receives the original pointer/size/flags/total unchanged. Other channel traffic
still polls the DVC assembly deadline before dispatch. Resolver/delegate
exceptions, false returns, reentrant receive/poll and ID changes close admission
without retries. Reentrant close preserves a borrowed staged span until return;
a successful provider return after normal close is not a provider failure.

For drdynvc, only FIRST/LAST, SHOW_PROTOCOL, SHADOW_PERSISTENT and separate empty
SUSPEND or RESUME notifications are accepted. Unknown flags and payload-bearing,
combined or framing-bearing notifications are refused before host dispatch.
Pinned drdynvc ignores those empty notifications; forwarding preserves this
behavior and does not renew a partial deadline. Bulk compression flags are not
implemented by this adapter and are explicitly refused. Windows server behavior
has not been verified. Null nonempty spans are refused before construction.

Whole inspected input borrows directly. Fragmented input is withheld from the
host until complete and inspected, then dispatched as FIRST|LAST with accumulated
SHOW_PROTOCOL/SHADOW_PERSISTENT metadata and equal actual/total length. This
normalizes upstream fragment accounting; it does not change payload, DVC format
or capabilities. The 2 s deadline and bounded storage from iteration 147 apply.
The callback's true result establishes public dispatch only: pinned core calls a
void channel event and can report downstream failure separately via channel error.

Seven new linked/public-ABI fixture cases cover normalization, unrelated argument
preservation, all unknown flag bits, outer/inner limits, empty notifications,
deadline under other traffic, resolver/provider faults and reentrant retirement.
The full linked suite passes **23 cases / 3,220 assertions**; bundled CTest
**18/18**, foundation CTest **7/7** pass with MSVC /analyze, /W4 /WX. The initial
fixture caught normal retirement being mislabeled as failure; provider return is
now preserved and retirement is checked by its outer owner.

No dependency source/pin/ABI/public wire or worker selection changes. Actual
drdynvc host, worker hook lifetime, negotiated GFX, cumulative channel/message
budgets, nested GFX/control/codec allocation, actual hostile/lost transport,
Linux/sanitizers/fuzz and soak remain open.

Iteration 149 installs this adapter in the [worker receive path](DVC_WORKER_INGRESS.md)
and adds actual pinned drdynvc/fake-SVC tests. The historical unactivated
foundation description above is retained; cumulative and nested limits remain open.

Iteration 167 adds an optional independent static RDPSND resolver/owner, selected
by the production worker even for audio-off fallback. The historical description
of forwarding other SVC IDs now excludes that explicitly selected channel.
[Current static audio placement and retained limits](RDPSND_RECEIVE_PLACEMENT.md).
