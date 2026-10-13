# Iteration 178 — bounded Windows bootstrap launch allowance

2026-10-13. Implements ARCHITECTURE §2/3 and SECURITY §2/6 after observed helper
startup uncertainty in otherwise passing full suites. The creation receipt/ACL/
collision rules from iteration 172 remain unchanged.

The helper process budget is now `min(15000, max(5000, startupTimeoutMs))`.
Default existing startup policy permits ten seconds; short HELLO policies retain
the former five-second floor. No unbounded wait, antivirus exception, PowerShell
dynamic evaluation, protocol deadline change or credential argument is added.
Cancellation still joins the bounded receipt and blocks late marker/worker spawn.

A test-only native helper sleeps 5.5 seconds then performs actual atomic directory
creation. It is copied beside a fake protocol worker in an owned temporary root;
the normal host path admits the confirmed receipt, starts and closes with an empty
runtime. The fixture is not installed. Focused Node startup/soak tests pass 13/13;
combined native/legacy-codec/100-worker checks pass 26/26. Foundation CTest 10/10
and bundled 22/22 pass. Full combined `pnpm check` passes 518/518 after this fix.

Observed outliers are not proof that antivirus caused them. Unknown-result
reclamation, simultaneous hard-kill cleanup and cross-account/root isolation
remain open; timeout changes never grant ownership of an uncertain directory.
