# Iteration 439 — GitHub delivery guards (in progress)

2026-10-23, `feature/github-delivery-oidc`, after accepted local `v0.2.4`
(`4b018fc`). Implements the user's separate-repository/direct-OIDC direction;
the final GitHub owner is SensNyaha, independent of npm scope freerdp-bridge.
[Delivery design and outstanding account gates](GITHUB_DELIVERY.md).

The initial standard-Node module `scripts/github-delivery/manifest.mjs`
defines bounded delivery manifests, expected package/repository binding,
streamed SHA-256/SHA-512 checks, guarded local file/JSON reads, actual tar
package metadata validation and complete Git source inventory verification.
It refuses oversized input before allocation, reparse/symlink escapes,
version/tag/package drift, duplicate/case-colliding paths and unexpected
tracked sources. It does not upload files, change npm settings or publish.

Focused tests pass **4/4 Windows and 4/4 Linux**, with lint and formatting:
malformed binding/version/set/bounds, oversized JSON and filesystem escape,
real tar tampering/wrong repository metadata, and source content/set drift.
Empty tracked source files are explicitly supported. Logs under `build/`:
`iteration-439-manifest-tests-{win32,linux}.log`, `iteration-439-lint.log`.

Exporter, independent local Git repositories, actual workflow/bootstrap,
required full feature checks and hosted OIDC acceptance remain incomplete.
No new native/wire contract, supported RDP/device profile or public version
is claimed by this guard checkpoint. Existing release 0.2.4 bytes remain
immutable. The stopped manual approval queue stays stopped.

## Subsequent publisher guard block

`publish.mjs` adds a fail-closed OIDC context gate (exact owner/repository/tag,
required short-lived GitHub OIDC identity, refusal of NPM_TOKEN/NODE_AUTH_TOKEN
fallback), bounded unauthenticated registry reads and exact public integrity
checks. Publication invokes official npm CLI with an exact archive, provenance,
ignore-scripts and noninteractive stdin, without logging raw CLI diagnostics.
It revalidates source/archive inputs before each write, skips identical public
versions, refuses differing bytes and never retries an uncertain upload in the
same run. Publishing an older missing stable version uses a version-specific
tag, preserving an already newer latest. The documented `0.0.0-stage`
placeholder is supported; other unhandled latest-version forms fail closed.

Expanded focused matrix passes **7/7 Windows and 7/7 Linux**, with lint/format.
The publisher tests use a synthetic runner and public-metadata fixtures; no
actual npm write, OIDC proof, account setting or browser approval is performed.
They verify conflict refusal, idempotence, no uncertain-upload retry, private
CLI diagnostic suppression, token/local context refusal and registry bounds.
Logs: `iteration-439-publisher-tests-{win32,linux}.log` and
`iteration-439-publisher-lint.log`. Remaining export/workflow/hosted gates above
are unchanged.

## Subsequent asset/CLI and committed-source block

`fetch.mjs` downloads only expected assets from the manifest's exact
GitHub owner/repository/tag, bounds sizes while streaming, compares accepted
hashes and refuses replacement of existing corrupt files. Failed new downloads
are retired. `run.mjs` offers fetch/verify/publish; local verify is read-only
and actual local publish refuses absent OIDC context before invoking npm.

Review finds that the first source guard binds content hashes and tracked file
set but does not independently anchor the manifest itself to committed HEAD.
It now requires the committed manifest, matching parsed input, unchanged
tracked source set and a clean tracked working tree. Tests commit their own
isolated synthetic fixtures with signing/hooks disabled; no user repository
or global Git configuration is modified. Manifest-only tampering/dirty trees
are explicitly refused.

Expanded matrix passes **8/8 Windows and 8/8 Linux**, plus lint/format.
New coverage uses real downloaded-byte fixtures and the actual CLI in a
sanitized local child context: size/hash refusal, cleanup/reuse, no corrupt
file replacement, ignored asset placement, verify success and publish refusal.
Logs: `iteration-439-committed-tests-win32.log`,
`iteration-439-fetch-tests-linux.log`, `iteration-439-tools-lint.log`.
No remote download, account setting or publication is credited from those
synthetic fetch/runner cases. Export/workflow/hosted gates remain incomplete.

## Source export and independent repositories

`export-github-deliveries.mjs`, adapter kit, public lock transformation,
compiled-file comparison, native smoke and workflow templates implement the
local export. The immutable authority is original annotated `v0.2.4`, commit
`4b018fc406af148dbde8651282149d32b507a4f6`, and its tagged iteration 438 ten-file
SHA-256 table, additionally checked against accepted SHA-512/audit/metadata.
No accepted tarball is repacked and no remote/account operation runs on export.

The final verified bundle is `build/github-delivery-0.2.4-rwdL2I/`. Its five
source commits and push/bootstrap instructions are recorded in
[GITHUB_DELIVERY.md](GITHUB_DELIVERY.md). All five contain a clean committed
bounded manifest, original source, complete applicable guides, pinned workflow,
guard tests, annotated local tag and SensNyaha origin. Exact assets remain in
the sibling release-assets directory. Core Git executable modes are retained;
raw-byte Git attributes preserve identical source contents on both systems.

Windows export passes all five builds, guard tests (8/8 each), native TLS and
lifecycle smoke, strict adapter declarations, accepted integration fixtures,
and byte-for-byte compiled-file comparisons. Each private public-URL lock is
verified by `npm ci --offline` after bootstrap from the accepted archives.
Log: `build/iteration-439-export-win32-final.log`; detailed labels under the
bundle's `logs/`.

Linux independently clones source-only Git bundles, verifies tag/HEAD and exact
inputs before/after builds, and passes the same five matrices. It uses a fresh
cache populated only with accepted archives and 177 selected public cache
entries, without account configuration. Verification is offline in the GCC
8.3 container. Log: `build/iteration-439-deliveries-linux-main.log`; detailed
logs under `/work/build/linux-delivery-439-sLln0n/logs/` in that container.
These are source/native TLS/lifecycle results, not new actual RDP/device claims.

The retained diagnostic attempts identify three preparation issues: nested
pnpm required its executable on PATH; core's isolated fixture required Fastify
and ws from API-owned dependencies; Git bundle clone required explicit main.
Corrections preserve the original fixture assertions and archive bytes. Earlier
failed exports/clones are retained pending the user's final cleanup stage.

## Managed release bootstrap

`bootstrap-github-deliveries.mjs` defaults to a local-only verified plan.
`bundle.mjs` independently anchors all ten assets to the original tagged
acceptance report, checks source/manifest copies, exact local annotated tags,
commits, paths and origins. `bootstrap.mjs` prepares a draft only after exact
pushed tag/workflow verification, uploads only missing assets and requires all
server SHA-256 digests before publishing. It never clobbers assets, retries an
uncertain write or treats an authentication failure as a missing release.
The CLI checks exact public core/HTTP dependencies before downstream submission.

Seven focused Windows tests pass: six synthetic remote/API state tests and one
actual five-repository/ten-tar fixture with an independent synthetic authority
tag. They cover drift, changed assets, public dependency pending/conflict,
draft recovery, idempotence and uncertain writes. The actual local-only CLI
plan passes against the final bundle (`iteration-439-bootstrap-dry-run.log`).
No actual gh command, upload, npm setting, OIDC identity or npm write is credited
from the synthetic tests. Hosted/public-registry gates remain open.

The first bare full Windows check used the existing unlinked foundation worker:
906 passes / 115 skips / one Fastify native TLS failure (`RDP_NOT_IMPLEMENTED`
instead of certificate rejection). It is not accepted as the linked regression.
The corrected full runs select the accepted 0.2.4 linked workers explicitly;
their final results remain to be recorded below.

## Full feature regression and pushed repositories

Final linked full checks pass: **Windows 968 / 61 skips / zero failures**
(`iteration-439-check-win32-linked.log`) and **Linux 945 / 87 skips / zero
failures** (`iteration-439-check-linux-final.log`). They include all 17 new
delivery tests; final focused Linux matrix is 17/17. Build/lint/format/version
and npm README checks pass. Native code and accepted runtime bytes are unchanged.
The first Linux full attempt exposed Git 2.20's lack of `git init -b`: fixture
and exporter now initialize normally and set HEAD symbolically to main. The
corrected focused and full Linux matrices pass; no assertion is weakened.
Export implementation checkpoint: `d8a7b71`.

The user subsequently creates the five public SensNyaha repositories and
explicitly asks the agent to push all of them. All five main branches and
annotated v0.2.4 tags are sent atomically per repository without force. Git
Credential Manager's normal GitHub browser login succeeds; its retired local
callback page displays ERR_CONNECTION_REFUSED afterwards, but actual git push
succeeds and independently verified refs prove the writes completed.

`iteration-439-remote-push-verification.json` and its log independently compare
all remote main/tag objects and peeled commits to the local catalog, public
repository/default-branch metadata and exact public npm workflow contents.
All five match. Core push starts existing foundation CI; its actual run is
tracked separately, not credited as npm validation. No npm workflow, release
asset upload, trust setting or npm 0.2.4 publication has run yet.

Actual core CI run `39915569156` is inspected after push. The separate GCC 8.3
foundation run `39915569139` completes successfully. In the general foundation
run, native builds/CTest pass on both Ubuntu compiler jobs, but `pnpm check`
fails; matrix fail-fast cancels the Windows job. Sanitizer CTest passes and its
Node tests are still running at observation. The general run is not accepted
as green; exact logs/root cause and a forward correction remain required.
Evidence: `build/iteration-439-core-ci.json`. No old tag is moved or archive
replaced to hide the failure.
