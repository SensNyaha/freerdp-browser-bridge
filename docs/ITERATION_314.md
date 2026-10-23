# Iteration 314 — connected Windows CPU/RSS policy smoke

2026-10-19. Continues SPECIFICATION §2.12 / §3.1 and TODO Stage 10 after the
[current isolated Release consumer](ITERATION_313.md). A new explicit local
helper selects the verified artifact by its source receipt and worker/helper
hashes before lab credential access. Pure selection/metadata/CLI-refusal tests
pass **3/3**. It uses existing WorkerProcess policies/samplers unchanged; no
production/native code, Release configuration or dependency pin is changed.
[Invocation and exact contract](RDP_RESOURCE_SMOKE.md).

## Actual RDP observations

Both runs use the authorized Windows lab, exact previously approved session-only
certificate fingerprint and immutable 1080p/single-primary settings. Each enables
100% of one logical CPU, 256 MiB RSS, 500 ms equal polls and a 1,000 ms CPU window.
No remote application launch/input, clipboard action, physical capture or saved
desktop frame occurs. Credentials remain in ignored files/private IPC.

| Observed control | Release xPANWQ | Debug 7UfcdO |
| --- | --- | --- |
| Connected CPU / RSS samples | 8 / 8 | 8 / 8 |
| CPU growth between first/last connected samples, µs | 375,000 | 1,078,125 |
| Sampled connected peak RSS, bytes | 156,508,160 | 170,221,568 |
| JPEG dimensions / encoded bytes | 1920×1080 / 714,568 | 1920×1080 / 714,453 |
| Heartbeat / continued connection | pass / pass | pass / pass |
| Joined close / PID gone / runtime empty | pass / pass / pass | pass / pass / pass |

Both native policies remain enabled during connect/observation. The reported
counters are unchanged results of real platform queries, not synthetic values.
These short observations do not establish exact CPU utilization or a throughput
comparison between build profiles. Sampling can miss peaks; JPEG capture and
total-session/Node memory are not separately budgeted by these reported peaks.
No connected cap-breach, long observation, audible/recording or device acceptance
is claimed. The JPEG is metadata/encoded-output evidence, not a new browser or
human visual-quality gate.

The exact worker/helper/source hashes are retained in the scalar result and
the source receipts from iterations 312/313. Original logs are
`build/iteration-314-rdp-resource.log` and `iteration-314-rdp-resource-debug.log`.
The scripted target/fingerprint and native source were unchanged between runs;
no host setting, trust store, Release output or dependency was modified.

Full Linux `pnpm check` passes build/lint/format and **647 passed / 151
platform/profile skips / 798 total / zero failures**, Node duration 132.71 s.
The new metadata/CLI unit group passes **3/3** and existing foundation CTest
passes **17/17**. Full Windows `pnpm check` also passes build/lint/format and
**744 passed / 51 platform/profile skips / 795 total / zero failures**, Node
duration 529.33 s. Final unchanged-source Windows native CTest also passes
**31/31** in 19.40 s. Local documentation links, helper ESLint/Prettier and
`git diff --check` pass. Windows producer support is the
only actual lab scope; common Linux unit/refusal checks do not accept a Linux
producer connection. Broader connected faults, CPU/memory totals, OS-stalled
retirement, startup, production package/helper adoption, platform/CI and soak
requirements remain open.
