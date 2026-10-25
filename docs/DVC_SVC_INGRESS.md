# Bounded outer drdynvc SVC assembly

Iteration 147 implements SPECIFICATION §3.1 / ARCHITECTURE §12 after header bounds
`6744bff`. DvcSvcIngress owns one outer fragmented message, no queue/thread/timer.
It is not installed in the worker's actual receive callback yet; upstream host
preallocation acceptance remains open until that placement is verified.

The native caller translates validated public SVC flags into first/last metadata
and provides one serialized monotonic clock and a synchronous forwarding callback.
Positive trusted policy limits can only be reduced from the previous hard caps.
Total encoded length is checked before staging allocation or byte copy. Whole
FIRST|LAST packets borrow producer bytes and need no staging allocation. Partial
packets own one vector of the validated total, require consistent total length,
reject duplicate FIRST, premature LAST and overflow, and allow only a zero-length
terminal fragment after all bytes have already arrived. Zero nonterminal progress
is refused. No raw producer data is changed or logged.

The original partial deadline is 2 s, reducible/adjustable by a trusted native
caller up to 5 s. Later progress does not renew it. Receive and poll check the
deadline before accepting an exact/late final fragment. Backward or unsafe clocks
fail admission. Caller must poll while the RDP loop is idle; this component adds
no timer. Close, failure or abandonment wipes/releases staged storage and closes
admission; all scalar counters saturate. It cannot reopen or retry the packet.

Only a complete message passing allocation-header inspection reaches forwarding.
The callback consumes/copies its span before returning; the enclosing owner must
keep this component alive through that return. Provider false/exception and
reentrant receive/poll fail once. Reentrant close cannot wipe an active borrowed
staged span; release waits until forwarding returns. Successful stale output after
close does not count as forwarded. No native callback/private SDK cast, public
wire change or worker/provider activation is introduced in this foundation.

Seven new portable cases cover zero-copy whole input, every split including empty
terminal completion, outer limits before allocation, huge inner claims before
dispatch, malformed progression, exact abandonment, clocks and reentrant cleanup.
Combined metadata/assembly cases pass 14 / 2,986 assertions; linked public ZGFX
regression passes 16 / 3,018. These are fixture/synthetic-codec checks, not actual
host/core transport or negotiated GFX. A stateful bounded-heap libFuzzer target,
six seeds and Linux CI step are prepared; execution remains unverified locally.

Production public callback/lifetime placement, raw SVC flags/normalization,
cumulative DVC/channel budgets, nested GFX/control/codec allocation, actual hostile /
lost transport, Linux/sanitizers/fuzz and soak gates remain open.
[Header policy](DVC_ALLOCATION_BOUNDS.md), [evidence](history/iterations/101-150.md#iteration-147).

Iteration 148 adds a [public receive adapter](DVC_RECEIVE_GUARD.md) with raw flag,
other-SVC and reentrant lifetime fixtures. Production worker placement remains
open; the historical foundation description above is preserved.

Iteration 149 adds [actual host fixtures and worker placement](DVC_WORKER_INGRESS.md).
