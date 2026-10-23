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

## Subsequent hosted failures and exact reproducer

Run `39917594525` finishes: both Ubuntu builds/full checks pass, while Windows
fails because browser fixtures default to absent build/bundled rather than
the actual build/foundation. CI now explicitly sets BRIDGE_TEST_BINARY_DIR
for its full check. Sanitizer Node tests pass after the profile correction,
then clipboard-ingress-fuzz aborts in its own comparison: the oracle expects
the original XRDP trailer even though production ingress intentionally strips
the validated zero DWORD before forwarding.

The exact hosted 48-byte input is captured from its public base64 reproducer
`AgAAACQAAAAAAAAAAAAAAAAAAwABAPsAAAAAAAAAAP////8AAAAAAAAAAAAAAAAA`.
Using immutable v0.2.4 oracle source with GCC 8.3 gives exit 134; the corrected
oracle gives exit zero (`iteration-440-fuzz-exact-replay-corrected.log`).
The first diagnostic incorrectly attempted git show in the source-only Linux
checkout; that attempt is retained and not counted as proof. The corrected
replay extracts the authority source in the actual original Git repository.

The oracle now demands valid inspection, compares exactly the normalized
declared body and retains allocation/close bounds. Production ingress is
unchanged. The captured input is added to the fuzz corpus and a native test
verifies every nonempty split forwards exactly 44 bytes and frees allocations.
Rebuilt GCC 8.3 foundation CTest passes 20/20. Fresh isolated MSVC foundation
`build/native-clean-zR42jW` passes CTest 19/19, lifecycle 16/1; source hash
`12ba1c5e13facbf96dd14b4e15567fc8e08f2573fad38f4e43725f2fcdb6b403`.
Full Windows check against this fresh foundation passes 914/117 skips/zero
failures (`iteration-440-check-win32-foundation-final.log`).

Remote feature continuation `b67d472` starts actual runs `39920657907` and
`39920657917`. GCC 8.3 passes; both Ubuntu compiler jobs pass; sanitizer fuzz
and Windows completion remain to be recorded at this checkpoint. Main and all
accepted tags/archives are unchanged. Do not merge on an incomplete run.

## Actual npm trust, core Release and first OIDC publication

The owner explicitly confirms readiness for official npm login. Login succeeds
as sensnyaha; npm trust listing requires one additional official browser 2FA.
Within the documented skip-window, nine existing packages receive exact
GitHub/file bindings with direct createPackage permission and are read-back
verified. Receipt: `iteration-440-npm-trust-verification.json`. No long-lived
publish token, bypass flag or per-package manual publish queue is introduced.

Core GitHub Release ID 421573323, tag v0.2.4, is actually published through the
guarded bootstrap state machine using GitHub REST with the existing system
credential only in memory/HTTPS headers. Six immutable archives and the
manifest have matching server SHA-256. Its initially hidden draft is found
through authenticated release listing and resumed, not recreated. New tests
cover this real API behavior and duplicate draft refusal.

Actual npm run `39920657127` validates both windows-2025 and ubuntu-24.04, then
publishes runtime-win32-x64 through OIDC. The original short registry poll ends
before public visibility; a later independent unauthenticated registry read
confirms exact accepted SHA-512. Packument records publication at
2026-10-23T07:56:47.933Z. Thus one real automatic OIDC publication is established,
not merely a configured trust. It does not prove completion of all packages.

After that exact public read and terminal failure status, failed-job rerun
skips the matching Windows runtime and accepts the Linux upload; it again
stops at short visibility timeout. Remaining packages and Linux public read
remain unverified here. Future publisher code waits up to five minutes using
reads only and never repeats a write in one run; its template allows the full
bounded sequence. A delayed-read regression proves one upload followed by
17 metadata reads, not a second publish. The existing immutable tag's older
poll code is not silently changed. All 18 delivery tests pass Windows/Linux;
logs `iteration-440-delivery-tests-{win32,linux}-final.log`.

The user separately authorizes exactly one initial Express approve. Only its
accepted archive is staged as new package bootstrap, stage ID
df36c3b9-2b42-4849-9736-956495651a31, exact integrity verified. No approve occurs
before public core/HTTP dependencies; no old 0.2.3 stage is approved. Receipt:
`iteration-440-express-stage.json`. Express trust/approve/public consumers,
remaining OIDC publications, standalone, final cleanup and documentation
consolidation remain open.

## Verified forward merge and updated installer destination

Remote feature `b67d472` passes both actual foundation run 39920657907 (all
Ubuntu/MSVC jobs, sanitizer Node/CTest and all fuzz commands) and GCC 8.3 run
39920657917. Only after those terminal green results, remote main is
fast-forwarded from 16b29a7 to b67d472. The annotated v0.2.4 object remains
4853049e16e61ccd7d0d0be6da766e10152cfb55 and still peels to original 16b29a7.
No accepted tarball or historical tag is modified.

Both native 0.2.4 npm runtime packages are subsequently independently public
at exact accepted integrity. JS core publication is not yet complete. A later
read-only GitHub API rate-limit failure is handled with the existing system
owner identity, not by inferring a live run stopped or repeating an upload.
Only the already terminal failed npm job is explicitly rerun after the public
checks; its unchanged code first skips matching versions. Current run remains
39920657127; fresh attempt/job status is inspected directly.

The user changes the standalone destination: installers must now be published
in Releases of **SensNyaha/freerdp-browser-bridge**, automatically on main/master
push. The previous separate standalone repository plan is superseded in TODO
and the current delivery docs; no such repository is created. Original scope
still includes real OS installer acceptance, cleanup of project-owned unused
artifacts and consolidation of documentation after earlier release gates.
