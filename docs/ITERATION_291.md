# Iteration 291 — configured native framed lifecycle capacity

2026-10-18. Continues the Stage 1 configured-capacity acceptance detail /
ARCHITECTURE §2–3 after `63b980e`. This is an actual native process/IPC and
registry-admission integration fixture. It changes no production code, Release
configuration, dependency pin, public limit or wire contract.

## Explicit test boundary

The test-only `LifecycleWorker` adapter starts the real C++ worker and exposes
only HELLO/heartbeat/shutdown to the registry. It never sends CONFIGURE, SECRET
or CONNECT and never reports an RDP-connected state. The unused synthetic
target `capacity.invalid` is not resolved or contacted. The registry remains
in its connecting lifecycle state while the native IPC worker is ready.

The trusted fixture explicitly selects `framed-pipes`, `maxSessions=40` and
`maxPerPrincipal=20`. A finite creation burst of 64 isolates session admission
from the separately tested creation-rate policy. Startup concurrency is four;
the test owns at most 40 simultaneous session workers and 50 total constructed
session backends, plus one warm-up process. The whole test has a 90-second
deadline and per-batch readiness has a 15-second deadline.

## Cases

- Twenty workers belong to each of two principals. A 21st first-principal
  request is refused while the global count is still 20. A third principal
  cannot exceed the configured global count of 40.
- Refusal occurs during the last starting batch, before another backend factory
  call/native spawn; factory counts remain exactly 20 and 40.
- All live workers retain automatic heartbeat ownership for 2.2 seconds and
  answer manual pings. Each owns one private runtime directory.
- Ten first-principal sessions close; their PIDs end and runtime/active counts
  drop to 30. Ten replacements restore the configured capacity, and all live
  owners answer another manual heartbeat round.
- A further request still refuses before a 51st backend. Joined registry close
  proves zero active entries, ended recorded PIDs and empty runtime. Linux
  parent FD count equals its warmed baseline. Failure cleanup joins the same
  close promises and inspects every `allSettled` result.

## Verification

Focused native lifecycle checks pass on Windows (7.82 seconds) and Linux
(2.48 seconds). Full Windows `pnpm check` passes **633 / 90 platform/profile
skips / 723 total / zero failures**, 368.49 seconds for Node tests. Full Linux
passes **579 / 147 skips / 726 total / zero failures**, 102.86 seconds. Both
include build/lint/format and the new actual native capacity case.

Repeated Linux native CTest passes **16/16** in 6.40 seconds. Repeated Windows
CTest against the new MSVC Debug fixture from iteration 289 passes **15/15**;
its original temporary build alias is restored only for the test and removed
afterwards. These are native foundation controls, separate from the Windows
Node suite's reused ordinary foundation worker. Final diff checks pass.

The Linux fixture uses the existing GCC 13 Debug worker and restricted local
network-none/non-root/read-only container from iteration 289. Windows uses the
existing local Debug foundation worker and standard private-directory helper.
This is reused native/runtime input, not another source rebuild or new pristine
root checkout. No device, browser capture, RDP endpoint or external system is
accessed by the new capacity test.

Host `build/iteration-291-windows-focused.log`,
`iteration-291-windows-check.log` and `iteration-291-linux.log` retain the checks.
Repeated Windows CTest is `build/iteration-291-windows-ctest.log`.
The runner is `build/iteration-291-run.py`; full Linux completion also emits
`iteration-291-receipt.json` inside the local container.

The verified test source has SHA-256
`a463d5b366e290fce70e18912bd7faa21b2f629f6715f5390582eb1f52c9f113`.
Full Linux log SHA-256:
`a9641dd784de00f212d1ec3fcf6437e8cdedfad56f4ed521231348c20399161c`.
Full Windows log SHA-256:
`8970f0feb3f5f580b46ac138dc8bf2c6498feb8c32c5e536e3efc4591eb1d6af`.

This accepts only the named unconnected, explicitly framed capacity profile.
The primary Linux addon's 32-pair/environment
limit is unchanged. Larger primary-carrier policies, arbitrary host limits,
connected idle/media soak, total CPU/RSS and multi-user/isolation acceptance
remain open. This does not satisfy Stage 10's 30+ connected-RDP-session soak.
