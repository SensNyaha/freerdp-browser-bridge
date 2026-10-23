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
