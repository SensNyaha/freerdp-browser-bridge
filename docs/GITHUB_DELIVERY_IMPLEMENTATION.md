# Delivery implementation notes — work in progress

These are implementation decisions for `feature/github-delivery-oidc`, not
acceptance of an exporter, workflow run, remote repository or public release.
User-facing direction: [GITHUB_DELIVERY.md](GITHUB_DELIVERY.md).

## Initial source and artifact export

The source authority is immutable annotated `v0.2.4`, commit `4b018fc`, with
ten archive digests in tagged `docs/ITERATION_438.md`. The exporter must obtain
these expectations from Git, not trust a mutable ignored audit alone. Inputs
are `build/release-436-archives/`, the corresponding SHA-512 audit and dry-run.
Reject changed bytes/metadata/versions/repository binding before generation.

Generate fresh owned directories under build, never overwrite a user repo:

```text
build/github-delivery-0.2.4-<random>/
  repositories/
    freerdp-browser-bridge/
    freerdp-bridge-fastify/
    freerdp-bridge-nestjs/
    freerdp-bridge-http/
    freerdp-bridge-express/
  release-assets/<repository>/v0.2.4/*.tgz
```

The user's later correction puts standalone installer releases in the existing
SensNyaha/freerdp-browser-bridge, with automatic Releases on main/master push;
the earlier separate standalone repository plan is superseded. Native
tarballs remain outside Git. Each source repo carries a committed
`.delivery/release.json` with schema 1, kind, version, exact SensNyaha repository,
upstream tag/commit/acceptance, ordered package hashes and a complete bounded
source-file inventory. The manifest itself is excluded from its inventory to
avoid a cycle, but verification independently binds it to committed HEAD and
requires a clean tracked tree. `.gitattributes` must preserve LF text and binary
bytes consistently across Windows/Linux; temporary npm/build assets are ignored.

Core receives a pristine Git archive of the accepted source (no old .git,
account settings, node_modules, build, tools or lab files). Add release-tools,
workflow and delivery instructions while preserving original docs. Reject
source symlink/submodule modes and unsafe paths before extraction. Publish
only protocol/config/node/api and the two native runtimes from this repo.

Each adapter receives `package/src` from the accepted source. Its
`package/package.json`, README and LICENSE come byte-for-byte from the accepted
tarball, whose workspace dependencies are already exact public versions.
Keep public package metadata unchanged. Adapt only the nonpacked tsconfig to
local `../tsconfig.base.json`, removing monorepo project references. A private
root npm workspace supplies pinned TypeScript/host test dependencies and an
OS-selected optional native runtime for testing; this does not make native
runtime automatic in the published library. Public apps still install it
explicitly. Build from source and compare every compiled dist file against
the accepted tarball before publication.

## Independent harness and lockfile before public 0.2.4

Core uses its accepted frozen pnpm workspace. For an adapter, generate a
private root npm package/workspace and a committed package-lock. Core 0.2.4 is
not public yet, so preparing that lock requires an explicit local bootstrap:

1. Temporarily point root bridge dependencies and transitive overrides to the
   accepted local tarballs (excluding the adapter's own linked package).
2. `npm install --ignore-scripts` in the fresh private repo, with bounded output,
   timeout and no npm log files. Restore the intended public root manifest in
   a finally block. Do not alter the public package manifest.
3. Rewrite only bridge lockfile resolutions to their eventual official npm
   tarball URLs, retaining the exact accepted SHA-512; replace temporary root
   dependency specs with the intended public versions. Keep third-party
   versions/integrity unchanged. Refuse any residual absolute/local dependency
   path outside the intentional `file:./package` workspace link.
4. Verify `npm ci --offline --ignore-scripts` succeeds from cached exact bytes
   with the public lock, then build, strict consumer declarations, adapter
   tests and compiled-file comparison. This bootstrap is now verified on
   Windows and Linux for all four independent adapter repositories; see the
   export checkpoint in iteration 439.

The independent fixtures reuse the accepted external consumer scenarios:
Fastify's consumer.mjs/consumer.ts plus TLS fixture; HTTP/Nest/Express matrices
with public imports, fake worker helper, linked-runtime resolution and fixture
CA. Fake media, native TLS/lifecycle and actual desktop results stay distinct.
No production/lab credential is copied. Core smoke builds its JS workspace,
links its built source aliases and extracted exact native package, then runs
the accepted Fastify TLS/HTTP/WS fixture without rebuilding native binaries.

Prepare all source files, initialize Git, stage, inventory them, write/stage
the manifest and commit before running committed-source verification. Create
the local annotated version tag only after validation. Assets can then be
copied into ignored build/delivery-assets for local verify/smoke. No remote
operation happens during export. Repeat on Linux using Git bundles of the new
source repos (no config/cache/ignored assets), plus separately verified assets.

## Hosted workflow

The selected npm workflow is `npm-publish.yml`, triggered by release published
and explicit workflow_dispatch tag. Only its publish job has id-token:write;
all checkouts disable credential persistence, npm/pnpm/Node are fixed, package
manager caches disabled, and no NPM_TOKEN/NODE_AUTH_TOKEN is configured.

Official action refs resolved on 2026-10-23:

- checkout v7.0.1: `3d3c42e5aac5ba805825da76410c181273ba90b1`;
- setup-node v7: `949feb2413d6458794dcd2491c4babbbce0c15c1`.

Validation matrix: ubuntu-24.04 and windows-2025, standard-Node guard tests,
exact release-asset fetch, core pnpm build/native smoke or independent adapter
npm ci/build/strict types/tests/compiled comparison, final clean source/input
verification. Publish job repeats fetch/verification on a fresh checkout and
publishes exact archives through official npm OIDC with provenance. It skips
exact public versions, refuses conflicting/uncertain writes and protects a
newer latest tag. Actual hosted validation still requires user push/setup.

Copy the standard-Node delivery guard test into release-tools with adjusted
local module paths so exported workflows test their own guard implementation.
Optional post-publish registry-only matrix can reuse accepted helper sources
in a small registry-check subtree, or a dedicated fresh Fastify registry harness.
Windows accepted helpers need a junction to the setup-node tool directory for
their hardcoded .tools Node/npm path; that junction contains binaries, no
account config. No registry-only result is claimed before the graph is public.

## Bootstrap and account setup

No gh CLI is currently in PATH. Prepare a dry-run/bootstrap script that, after
the user's source/tag push and explicit trust setup, uses normal GitHub CLI
authentication once to upload the exact files with `gh release create
--verify-tag`. Asset upload precedes release published, which starts OIDC CI.
Core release goes first; wait for exact public dependencies, then Fastify,
NestJS, HTTP, Express in dependency order. Never overwrite existing releases,
assets, tags or trust configs. Existing matching trust can be reused; new
settings require owner identity and should be configured just before their
first publish (npm expires unused new trust after two days).

New Express name is a separate initial npm gate: trust configuration requires
an existing package. Official stage publish can create its placeholder without
manual publish, but its first staged version still requires owner approval.
Do not start that stage/approve automatically after the user's stop. Future
Express releases can use OIDC once bootstrap/trust are ready. Seven old 0.2.3
JS stages also remain interactive and unchanged; OIDC does not approve them.

## Acceptance checkpoint before iteration 441

The exporter and five generated repositories now pass Windows/Linux builds,
strict declarations, integration tests, compiled-file equivalence and exact
source/archive verification. Bootstrap/account setup, final full feature
checks, actual hosted OIDC/public consumers and standalone have separate
remaining gates at that earlier checkpoint. Iteration 441 supersedes plugin
delivery status: all ten packages and five Releases are public, all hosted
workflows and four registry-only consumers pass on both OSes, all ten trust
bindings are verified. Standalone, old 0.2.3 pending stages and final cleanup/
documentation consolidation remain separate. See iterations 439–441.
