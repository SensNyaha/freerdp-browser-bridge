# Public DVC plugin lifecycle projection

Iteration 157 implements SPECIFICATION §3.1 and ARCHITECTURE §12 with a borrowed
IWTSPlugin proxy. The enclosing owner retains the proxy through host unpublication
and callback return. It owns neither host registration nor the original plugin,
and does not terminate the original early. Production provider activation remains
open.

Initialize resolves the actual manager through an owner-supplied synchronous
callback. The resolver must retain one common bounded manager for all plugins,
validate its identity, and keep it alive through plugin cleanup. It runs at most
once per plugin. Null/throwing resolution refuses original initialization;
cancellation during resolution prevents late initialization without treating
normal close as a provider fault. pInterface is preserved, while callbacks always
receive the original plugin rather than a privately cast bridge wrapper.

Connected/Attached are refused after close. Disconnected/Detached remain available
for cleanup until Terminated. Optional absent callbacks return success. Delegate
failure or exception latches a fault and stops new lifecycle activation. Reentrant
calls return pending without dispatch, including attempted termination of a
currently borrowed plugin. An enclosing owner must handle pending termination;
the SDK is not assumed to retry it automatically.

Terminated clears the original borrow before calling the captured callback. It
may free its own plugin or throw after freeing it. Status is retained, duplicate
termination never dispatches again, and no original pointer is inspected afterward.
This is a callback ownership guarantee, not proof of remote cleanup or memory
reclamation following uncertain failure. Destroying an active proxy terminates
the worker. Parent close must separately stop the shared listener manager and
retire channel callbacks before original plugin cleanup when they borrow plugin
state.

Entry-point interception, failed/partial host registration, GetPlugin projection
back to original pointers, shared manager construction, production worker fault
polling and final host teardown remain required. Public entry-point getter calls
must use the original entry-point instance: pinned getters cast it to their own
extended structure. No private SDK casts, dependency changes, wire changes or
capability claims are introduced by this proxy.
