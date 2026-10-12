# Pinned public manager failure-output normalization

Iteration 153 implements SPECIFICATION §3.1 / ARCHITECTURE §12 after public ID
registry `67f8c1d`. PinnedDvcManager is a nonowning public manager facade, currently
**fixture-only**, not installed in worker/addin registration. Successful listener
ownership remains with its caller; cumulative production admission remains open.

The exact pinned drdynvc CreateListener sets ppListener before HashTable_Insert.
On insertion/allocation failure after that assignment it frees the listener and
returns an error with an undefined/dangling output. Generic DVC Initialize then
unconditionally writes plugin->listener->pInterface even when CreateListener
failed. Generic Terminated later invokes manager DestroyListener on that pointer.
These source facts do not establish that failure output is a valid ownership token.

The facade delegates through the original public manager pointer, catches C++
fixture exceptions, preserves error status, and supplies a persistent local
fallback on error or invalid null success. It never reads/destroys a failed native
output. Fallback pInterface is safe for generic Initialize; GetConfiguration
refuses safely and DestroyListener is a no-op for that exact local object. On
success the actual listener pointer, callback and flags pass unchanged. Public
ID/name functions are copied; FindChannelById translates the facade argument to
the original manager. No SDK private cast or dependency patch is used.

Caller must serialize operations, keep the actual manager/facade alive through
all delegated calls, destroy successful listener handles and finish plugin cleanup
before calling facade retire. Retire clears original delegation and copied ID/name
functions; delayed fallback cleanup remains safe. It does not release native
listener handles, join active calls or normalize successful-handle failures.
Arbitrary backends reporting live partial ownership through error output are not
covered by this exact pinned-source contract; never guess ownership from a nonnull
failure pointer.

Five new cases cover successful pointer/argument/delegate identity, injected
already-freed output and null success, invalid/retired arguments, exceptions and
actual public pinned generic Entry/Initialize/Terminated through success/failure.
One actual pinned drdynvc/fake-SVC case checks successful listener creation, public
ID/find, DATA_FIRST completion and host cleanup through the facade. Failed native
HashTable allocation is source-audited/emulated, **not injected in the actual
drdynvc allocator**. Combined linked suite **67 cases / 6,365 assertions**, bundled
CTest **18/18**, foundation **7/7**, MSVC /analyze /W4 /WX pass.

Existing provider registration/partial-error cleanup assumptions still require
production placement review. Addin/manager/listener lifecycle handoff, callback
alias ownership, actual remote/GFX/Windows-server/cumulative resources, pool/nested
memory bounds and Linux/sanitizer/fuzz/soak gates remain open. No dependency source/
pin/ABI/wire/capability changes.
