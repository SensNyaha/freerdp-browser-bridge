# Iteration 230 — serialized clipboard worker ownership

2026-10-15. Implements the IPC-to-RDP handoff portion of SPECIFICATION §2.7.
Quota/fragment foundation: `f6543a5`.
[Contract](CLIPBOARD_TEXT_SESSION.md#serialized-worker-handoff).

One moved command and one prepared result join the pinned public Unicode owner.
Producer authority requires successfully admitted state; the RDP owner rechecks
current offer/readiness/deadline before dispatch. Set completes on peer ACK, read
on data response. Output backpressure never repeats a remote read. A newer offer
discards prepared text. Finite dispatch/native/publication deadlines, thread
ownership and wipe-on-retirement remain independent of transport progress.

Eight linked CLIPRDR/fake-SVC cases pass 350 assertions on Windows, covering
cross-thread admission, peer ACK/refusal, unavailable/unpublished and stale
authority, blocked result, offer replacement, deadlines, clock regression,
foreign-thread refusal, reentrant retirement and root-thread wrapper destruction
after RDP-thread callback cleanup. An exception-injection test initially exposed
an incorrect noexcept boundary around the output callback; removing that boundary
lets the pump catch the exception and retire ownership. The same fixture passes
after correction; no exception is suppressed or treated as a successful send.

Windows linked CTest passes 29/29; Linux linked CTest passes 30/30. Focused local
non-PIE ASan/UBSan passes six clipboard executables; pinned SDK dependencies are
not instrumented. Full bundled Windows `pnpm check` passes 575 with 49 platform
skips / 624 cases. Evidence: `build/iteration-230-*`.

This owner is not yet selected by the worker. HELLO/config/Connection activation,
typed Node methods, public controller/media revocation, browser gestures and
actual remote clipboard acceptance remain open. No OS clipboard or device is
accessed by these tests; no public capability is claimed.
