# Iteration 298 — connected Windows RDP RSS policy smoke

2026-10-18. Continues SPECIFICATION §2.12/§3.1 and Stage 10 sampled memory
watchdog work after `6752257`, using access restored in `9dce875`.

The existing authorized lab helper gains an explicit `memory` mode. It enables
the actual WorkerProcess RSS policy, chooses 1920×1080, a 256 MiB cap and 100 ms
polling, then requires at least three connected samples, a matching JPEG,
heartbeat, joined close and empty runtime. The protected sampling seam calls
the ordinary sampler unchanged and accumulates only count/maximum scalars.
It does not replace values, create a parallel query timer or store history.
Other modes retain their settings. No production/native/Release changes occur.

## Actual RDP evidence

The preliminary unchanged-display control connects at 1024×768 and observes
25 connected samples, peak **94,101,504 bytes**. The final 1920×1080 profile
observes **25 samples**, peak **159,162,368 bytes**, below 268,435,456 bytes.
JPEG capture returns 130,061 bytes; the subsequent 40 capture requests find
the same revision. A final run including the explicit 1080p assertion passes
with **26 samples / 158,593,024 peak bytes** and the same JPEG size.
Heartbeat and empty `.runtime/lab-memory` cleanup pass on both 1080p runs.

Evidence is retained in `build/iteration-298-lab-memory.log` and
`iteration-298-lab-memory-1080p.log` and `iteration-298-lab-memory-final.log`.
These short observations use the existing
Windows worker and exact previously approved certificate fingerprint. The
lab password remains in ignored files/private IPC. No remote input, physical
capture, security research, dependency pin or Release setting changes occur.

Focused resource option/receipt/soak compatibility checks pass **9/9**. Three
missing/invalid/excess `memory` argument controls reject before reading lab
files. Final helper ESLint and Prettier checks, local documentation links and
`git diff --check` pass. Native code is unchanged; the Windows/Linux CTest
controls from iteration 296 remain the native baseline.
Full Windows `pnpm check` passes build/lint/format and **650 passed / 90
platform/profile skips / 740 total / zero failures**, Node duration 380.94
seconds (`build/iteration-298-windows.log`). Final helper changes are also
checked separately by ESLint/Prettier after the display assertion was added.

This verifies a healthy connected policy smoke. Actual cap-breach controls
remain the unconnected Windows/Linux cases from iteration 296; no connected
fault or Linux RDP policy acceptance is claimed. The worker sample excludes
Node/total session memory and does not establish PERFORMANCE.md's per-session
target, hard allocation bounds, CPU, between-sample peaks or sustained soak.
