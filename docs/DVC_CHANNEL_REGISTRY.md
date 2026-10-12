# Bounded public DVC ID registry

Iteration 152 implements SPECIFICATION §3.3 / ARCHITECTURE §11 after completion
observation `80cd152`. DvcChannelRegistry combines the declaration table and public
callback proxies in a fixed array of at most 32 channel slots. It obtains IDs only
through IWTSVirtualChannelManager.GetChannelId on the actual public channel.
**Production addin/listener registration and aggregate worker admission are not
connected yet.** The worker's individual bounds from iteration 149 remain active.

Trusted reduced slot/aggregate/individual/deadline policy comes from the existing
budget. A successful bind returns an owned proxy preserving original pInterface;
rejected callbacks remain caller-owned. Missing delegates, duplicate live IDs,
capacity refusal, public-ID exceptions and reentrant bind/poll faults close
admission. Cancellation during ID resolution cannot publish a late proxy. ID 0
and UINT32_MAX are valid. A closed slot can be reused only after the host has
returned from OnClose and unpublished its old pointer; this does not implement
same-plugin RDPEI reopening or remote reconnection.

Before host forwarding, admit validates individual metadata and reserves
DATA_FIRST only for a live registered ID. Unknown IDs that pinned drdynvc ignores
are not charged as allocated owners. Complete callback/close observation releases
reservations. Poll also checks callback faults, since the pinned DATA_FIRST path
can replace an application callback failure with a successful close status.
Existing nonrenewing deadlines and exact/overflow/backward-clock bounds apply.

Failure/table close does not free host memory. Retire closes admission, invokes
all original callback closes through the proxy exactly once, and returns pending
while any callback or binding still runs. resources_retired becomes true only
after those borrows return; final provider errors remain visible. No failed close
is retried. The enclosing host owner must preserve this registry until host
callbacks are unpublished and retirement completes; published unclosed proxies
retain the destructor invariant from iteration 151.

Seven public-interface fixture cases cover zero/wide IDs, aggregate/slot/duplicate
refusal, caller ownership of rejected callbacks, ignored IDs, closed slot reuse,
reentrant resolution/retirement, callback faults and exact deadlines. Five actual
pinned drdynvc/fake-SVC cases use public ID binding and this registry for raw and
compressed completion, before-host aggregate refusal, ignored unknown channel and
logical deadline followed by actual shutdown. Reduced test policy is 2 slots /
8 bytes / 100 ms. These are fixture/public-host tests, not production RDP resource
or device acceptance. Combined linked suite **61 cases / 6,282 assertions**;
bundled CTest **18/18**, foundation **7/7**, MSVC /analyze /W4 /WX pass.

Global addin/manager/listener lifecycle integration, failed/partial registration
handoffs, actual GFX/Windows server/remote cumulative memory and lost transport,
pool retention, nested control/codec allocation, Linux/sanitizers/fuzz/soak remain
open. No dependency source/pin/ABI/wire/capability changes.
