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
