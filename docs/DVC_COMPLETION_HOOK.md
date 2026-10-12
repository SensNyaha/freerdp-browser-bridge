# Public DVC complete-message and close observation

Iteration 151 implements SPECIFICATION §3.3 / ARCHITECTURE §11 on top of
reservation foundation `7b37d1c`. DvcCompletionHook proxies the public
IWTSVirtualChannelCallback, preserving pInterface and the exact borrowed wStream.
It uses a channel ID supplied by the public manager and a trusted serialized
clock. **Production registration and cumulative worker admission remain open**;
the hook is installed only in fixtures in this block.

After the actual original OnDataReceived callback returns, including a reported
application error, the hook observes complete-message delivery and releases its
DATA_FIRST reservation. Standalone DATA with no reservation is ordinary. It does
not equate delivery with successful remote application action, audio playback or
OS memory release: the pinned host still releases/returns its stream after this
callback returns. Caller must keep serialized receive ownership through that return.

OnClose snapshots the original callback and clears its borrowed pointer before
calling it: an original callback may destroy itself. It releases an incomplete
reservation and runs the original close at most once. Reentrant host close while
OnData/Open is active is deferred until that callback returns. Explicit retire
returns IO_PENDING during any active callback, including original OnClose; closed
becomes observable only after all delegated work returns. Duplicate retirement
joins the retained final result and never retries uncertain provider operations.

Missing optional OnOpen/OnClose callbacks preserve success. Missing mandatory
OnDataReceived/clock is refused at construction. Null stream, reentrant data/open,
provider failure/exception and completion-clock/budget faults latch an observable
fault; data is not replayed and original close is still owed. Close errors remain
visible. Normal global table retirement does not suppress original host close.
Pinned DATA_FIRST processing can replace a callback error with a successful channel
close status, so the future owner must also inspect hook fault state; transport
return alone is insufficient. No dynamic registry, timer, queue or SDK private cast.

The enclosing caller must retain hook, original targets and budget until host close
and synchronous delegated return complete. Destroying an active or published
unclosed hook terminates the worker rather than leave a dangling host callback.
This rule is a native ownership invariant, not remote release acceptance.

Eight public-ABI fixture cases cover exact interface/stream preservation, reservation
ordering, standalone data, optional lifecycle/null stream, callback/clock faults,
nested data/open/close, provider self-destruction and joined retirement. Five actual
pinned drdynvc/fake-SVC cases observe raw/compressed completion, reserve only after
final outer fragment, refuse a second aggregate claim before host dispatch, ignore
unowned channel claims and release logical partials during shutdown. They use a
fixture listener and reduced 2-slot/8-byte policy; no real application/device data.

Together with prior bounds/pool tests the linked suite passes **49 cases / 6,042
assertions**, bundled CTest **18/18**, foundation CTest **7/7**, MSVC /analyze /W4
/WX. Initial fixture status comparisons were corrected to explicit unsigned WinPR
types without warning suppression. No dependency source/pin/ABI/wire/capability
change. Actual plugin registration/lifetime/provider/worker activation, pool and
nested memory bounds, real cumulative/abandonment/network/device acceptance,
Linux/sanitizer/fuzz and soak remain open.
