# Iteration 174 — bounded Windows/XRDP viewer soak probe

2026-10-13. Implements the verification path for Stage 4 and PERFORMANCE.md,
without claiming the 30-minute gate before the actual run completes.

The viewer's diagnostic snapshot now includes current decode/packet/socket queue
occupancy. NativeSessionWorker exposes its retained child PID for host-side probes;
it is not a REST field or a liveness guarantee. A fixed internal Windows helper
operation reads only working-set metadata using limited query access. It needs no
PowerShell dynamic evaluation, WMI inventory or antivirus exclusion.

The authorized lab `--soak-test` runs 30 minutes after desktop warmup, samples
every 30 seconds and retains a fixed aggregate plus one previous observation,
never a frame/sample/process history. It checks connected ownership, monotonic
frame/byte counts, 1080p codec identity, decoder and packet bounds, exact single
render credit, and sampled worker/Node residency. Worker samples above 256 MiB
are recorded as a failed budget, never silently accepted. Resize to 1280×720,
restoration, cursor and attachment replay follow the run.

Four pure tests cover receipt/credit bounds, aggregation and lifecycle/queue
faults. Three actual Windows process tests cover minimal-PATH query, invalid PID,
native adapter PID lifecycle and a live worker sample. Relocation checks the
installed query operation alongside the private runtime dependencies.

The probe verifies one desktop during its observed activity, not a prescribed
interactive scene sequence, Windows-server/Linux compatibility, network loss,
four active/30 idle sessions, CPU or latency acceptance. Thirty-second residency
samples do not establish an absolute peak. No physical microphone is enabled.

Current verification: focused Node fixtures 16/16, foundation CTest 10/10 and
bundled CTest 22/22. Actual 30-minute results and full-suite results will be added
when completed; the Stage 4 gate remains IN PROGRESS meanwhile.

Full Node runs observed 512/514 passes with varying process-start failures;
the affected focused reruns passed. These are retained failures, not a passing
full gate. Relocated helper/runtime verification passes 1/1. Implementation of
the probe does not imply acceptance of the actual soak or process reliability.
