# Iteration 440 — actual hosted foundation failures

2026-10-23, `feature/github-foundation-ci`, following the real five-repository
push recorded in [iteration 439](ITERATION_439.md). Original product `v0.2.4`,
its accepted archive bytes and the delivery repositories' annotated `v0.2.4`
tags remain immutable. This correction changes test/profile selection and
generated YAML formatting, not native/session/wire functionality.

## Observed failures

The actual core foundation run `39915569156` is inspected through the GitHub
API. Its Ubuntu compiler jobs build native code and pass CTest 20/20, but
`pnpm check` stops at the new npm YAML: the exporter calls Prettier without
the project's single-quote setting. Sanitizer CTest passes, then Node tests
have exactly one failure: Fastify's linked strict-TLS assertion is executed
with the intentionally unlinked foundation worker, which returns
`RDP_NOT_IMPLEMENTED`. The separate original GCC 8.3 foundation run passes.

Read-only job logs are obtained using the existing system GitHub credential,
only in process memory/HTTPS headers. No credential is written into source,
argv, env, logs or build files. Evidence: `iteration-440-hosted-ubuntu.log`,
`iteration-440-hosted-sanitizers.log` under build. No failed job is relabelled
as accepted; no tag/archive is replaced to hide the failures.

## Correction and local checks

The actual exporter now calls `formattedNpmWorkflow`, which uses the accepted
project Prettier configuration. The regression checks actual generated YAML
for all five kinds against that configuration, rather than merely parsing and
reformatting a template with unrelated defaults.

Fastify's native integration now probes the worker's public bounded capability
output. Two separately named cases share lifecycle assertions: unlinked
foundation must refuse with `RDP_NOT_IMPLEMENTED`; linked native must refuse
the fixture certificate with `RDP_CERTIFICATE_REJECTED`. Both assert zero RDP
application bytes, default factory ownership and joined runtime cleanup. The
linked profile's strict TLS assertion remains mandatory when connectCore exists.

Focused Windows/Linux checks each pass foundation **6 / 1 skip** (including
two exporter tests) and linked **4 / 1 skip**. Full checks pass Windows linked
**968 / 62 skips / zero failures** and Linux/GCC 8.3 foundation **869 / 164 skips /
zero failures**. Profile-specific skips are not linked RDP acceptance.
Native CTest reruns on unchanged existing outputs pass MSVC linked **36/36**
and GCC 8.3 foundation **20/20**; these are reruns, not fresh native builds.
Logs: `iteration-440-focused-{foundation,linked}-{win32,linux}.log`,
`iteration-440-check-win32-linked.log`, `iteration-440-check-linux-foundation.log`,
`iteration-440-native-ctest-{win32,linux-foundation}.log`.

## Hosted verification and remaining delivery

The independently prepared core worktree changes only its npm workflow quotes
and this native Fastify test. It is committed as `0f15fd0` on remote
`feature/foundation-ci`, without changing main or tags before actual checks.
The new GCC 8.3 run `39917594531` passes. General foundation run `39917594525`
is still in progress at this checkpoint. Its result and the subsequent
forward merge remain required; `iteration-440-feature-ci.json` records the
observed actual run handles. Do not restart a run solely because it takes time.

Read-only npm identity/trust checks currently return E401, so the owner needs
a fresh official login before trust setup. This does not restart stage/approve
queues. Actual Trusted Publishing, GitHub Release assets, public npm 0.2.4,
registry-only consumers, old pending 0.2.3 stages and standalone remain separate
open gates. Final project artifact cleanup and documentation consolidation
follow the user's requested sequence after those earlier deliveries.
