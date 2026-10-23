# Iteration 151 — public DVC completion and close observation

Date: 2026-10-12. Implements SPECIFICATION §3.3 / ARCHITECTURE §11 after cumulative
declaration foundation `7b37d1c`. Public callback proxy releases a reservation only
after complete host callback return or original channel close. Provider/clock
faults remain visible; deferred close and joined retire preserve an active borrow,
including callbacks that destroy themselves. Production wiring remains open.

Eight public-ABI cases and five actual-linked drdynvc/fake-SVC cases pass, including
compressed/raw completion, before-host aggregate refusal and shutdown. Combined
linked suite **49 cases / 6,042 assertions**, bundled CTest **18/18**, foundation
**7/7** pass under /analyze /W4 /WX. Initial signed/unsigned fixture status warnings
were corrected with explicit WinPR UINT values. No dependency/source/pin/ABI/wire/
capability change or warning suppression. These are public-host/fixture ownership
checks, not actual remote cumulative memory or device/application acceptance.
[Contract and retained integration gates](DVC_COMPLETION_HOOK.md).

The initial full Node gate recorded **497 passed / 1 cancelled**, with the
unchanged Edge PCM fixture timing out and leaving evaluate/browser ownership
alive. Its verified browser tree was closed; the fixture now aborts owned browser
work while preserving the original deadline failure. Standalone PCM passes 1/1;
a forced unresolved-evaluate probe exits itself in 5,011 ms with expected timeout.
[Fixture cleanup evidence](PCM_BROWSER_FIXTURE.md). Full gate is rerun separately.

Full bundled rerun passes **498/498**, zero failures/cancellations. The PCM fixture
completes in 1,445 ms in that run; no assertion/deadline was relaxed.
