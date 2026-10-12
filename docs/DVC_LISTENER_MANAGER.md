# Bounded public DVC listener ownership

Iteration 156 implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §12 with a
serialized public manager facade. It is installed in fixtures only; the worker
still uses the individual receive guard, without production aggregate admission.

DvcListenerManager wraps the pinned manager, retains at most 32 listener proxies
and accepts a trusted smaller slot limit. Names are bounded to 127 bytes and
duplicate live names are refused before native insertion: pinned HashTable_Insert
would replace the existing listener. Slot exhaustion is refused before allocation.
Successful native listener pointers and later plugin-written pInterface are
preserved. Failed creation outputs are never read or destroyed; the caller gets a
stable fallback for the pinned generic plugin's unconditional pInterface write.

The original factory receives TRUE acceptance initially, matching pinned drdynvc.
The actual generic factory leaves that in/out flag untouched. Iteration 155's FALSE
initialization could deny these channels; this iteration corrects it. External
outputs remain false/null until a successful accepted callback is bound. Explicit
factory denial/error retains the existing refusal semantics.

close stops every factory without destroying listeners. Cancellation during native
creation retains and returns the successful handle with closed admission, so the
plugin can clean it later. DestroyListener during a factory callback or manager
call returns pending without native dispatch: drdynvc reads the native listener
after OnNew returns. Successful destruction releases the proxy only after the
delegate returns and unpublishes it. Listener destruction does not close accepted
channels, whose callbacks remain owned by the shared channel registry.

Failed/throwing destruction retains handle and closed proxy, records a fault and
never retries an uncertain native operation. retire refuses live handles and
returns pending during a borrow. The explicit host_unpublished path is only legal
after final host teardown has removed every listener and returned every callback;
it releases retained proxy storage without dereferencing/freeing uncertain native
handles. It is not proof of native allocation reclamation. Destroying the owner
while the host still holds a listener or a callback is active terminates the worker.

Six public fixtures include actual pinned generic factory allocation/cleanup;
one actual drdynvc/fake-SVC fixture verifies automatic manager installation,
complete-message budget release and plugin termination. These are synchronous
public-host tests, not actual RDP memory/device acceptance. Global addin/plugin
registration, shared manager binding, worker fault polling, final host teardown,
pool/nested decoder limits, Linux and sanitizer/fuzz/soak acceptance remain open.
