# Public DVC listener factory and accepted handoff

Iteration 155 implements SPECIFICATION §3.1 / ARCHITECTURE §12 after accepted
handoff `63e4368`. DvcListenerProxy borrows a public listener callback and preserves
its pInterface, actual channel and opaque data argument. It is installed only in
fixtures; production provider/listener/aggregate worker admission remains open.

The proxy starts external outputs with false acceptance/null output and uses local factory results.
Iteration 156 corrects the original factory's in/out acceptance default to TRUE,
matching pinned drdynvc and generic addins which leave this flag untouched.
Only successful factory status plus explicit acceptance and a live target reaches
accepted handoff. Ordinary factory error or denial preserves its return, emits no
callback and does not close an output whose ownership was never transferred.
Exceptions and successful acceptance with missing target latch a bridge fault.
An accepted target rejected by registry/clock/cancellation closes through the
shared handoff cleanup with separate status; aliases stay with their existing owner.

Reentrant factory admission fails once without double dispatch. close stops
admission and prevents late publication, while leaving the native listener and
plugin owned by the enclosing caller. Normal close/cancellation with successful
cleanup is not a provider fault. Callback/clock/handoff faults remain visible in
fixed scalar stats even when pinned CREATE responds negatively with SDK global
error zero. Unknown/uncertain cleanup is not treated as memory or remote release.

The enclosing owner must serialize callbacks and retain proxy, factory targets,
public manager, registry and clock context through host unpublication and callback
return. Destroying an active proxy terminates rather than leave a live borrow.
The proxy does not destroy the native listener, retire plugins, join async SDK
work, introduce a queue/timer or implement same-plugin reopening.

Seven public-ABI cases cover argument/identity projection, failed/denied/throwing
factory ownership, missing target, clock failure, reentrant close/factory, duplicate
alias and invalid delegates. Two actual pinned drdynvc/fake-SVC cases attach this
proxy through the pinned manager facade, verify complete-message reservation
release and reduced one-slot refusal/cleanup with global channel error zero.
Combined linked suite **83 cases / 6,584 assertions**, bundled CTest **18/18**,
foundation **7/7**, MSVC /analyze /W4 /WX pass. No dependency/source/pin/public ABI/
wire/capability change. These are fixture/public-host evidence, not remote or
production aggregate resource acceptance.

Global addin/plugin/manager lifecycle binding, failed/partial host registration,
callback cancellation during accepted registry binding, actual GFX/Windows server /
remote cumulative memory, pool and nested codec limits, Linux/sanitizer/fuzz/soak
remain open. The owner must observe both proxy/registry fault and SDK channel error.
