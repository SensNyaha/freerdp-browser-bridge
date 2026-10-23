# Iteration 155 — public listener factory and accepted callback proxy

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after accepted
handoff `63e4368`. Listener proxy preserves factory status/denial, transfers only
accepted live targets, prevents late publication on close and reports registry/
cleanup faults independently of SDK global channel error. Normal cancellation is
not a provider fault. Production listener/provider placement remains open.

Seven public-ABI and two actual pinned drdynvc/fake-SVC cases pass; linked **83
cases / 6,584 assertions**, bundled CTest **18/18**, foundation **7/7**, /analyze
/W4 /WX. Shared accepted-rejection cleanup handles cancellation/clock faults
without retry or target read after self-destruction. No dependency/source/pin/ABI/
wire/capability change, and no actual remote resource/device acceptance claim.
[Contract and remaining scope/lifetime gates](DVC_LISTENER_PROXY.md).

Full bundled `pnpm check` passes **498/498**, zero failures/cancellations.
