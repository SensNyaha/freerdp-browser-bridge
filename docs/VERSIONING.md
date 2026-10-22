# Product versions and release branches

The stable practical MVP is **0.1.0**, by the user's 2026-10-21 decision.
Its scope and limits are [MVP acceptance](MVP_ACCEPTANCE.md), not completion
of the full original V1 plan. Major version zero still permits API evolution
under [Semantic Versioning](https://semver.org/).

User decision, 2026-10-22: the next release is **0.2.0**, containing the verified
GCC 8.3 compiler port. Complete the compiler feature's acceptance first, then
prepare `release/0.2.0`, align the manifests and run the release checks below.
Until that happens, 0.2.0 is a release target rather than an accepted tag;
the existing `v0.1.0` and its artifacts remain immutable.

Root/workspace `package.json` versions and CMake `project(VERSION)` use one
product version. `pnpm version:check` verifies their consistency; an explicit
release check is `node scripts/check-version.mjs 0.1.0`. It validates the
currently supported stable `MAJOR.MINOR.PATCH` form, not prerelease syntax.
FreeRDP/other dependency pins and public/private wire schema versions are
separate values. A product release never silently changes those contracts.

## Development and releases

1. Develop each feature on its own branch. Record its tests and acceptance;
   merge only the completed, verified feature into shared `master`.
2. Keep release changes separate in `release/<version>`. Include only completed
   work, update the changelog and align all product version manifests. Do not
   collect uncommitted or unfinished work from another feature branch.
3. Run the version guard, relevant regression and required real RDP/device
   gates. Merge the release branch after checks pass, then create an annotated
   immutable `v<version>` tag on the release commit. Never move an existing tag
   or replace its artifacts with different contents.
4. Development branches may retain the latest product version until release
   preparation; their commit/branch identifies unreleased work. Only the clean
   tagged commit with its recorded evidence is the stable release. Put changes
   since that tag in the changelog's Unreleased section.

Explicit delivery-series decision, 2026-10-22: **Fastify/npm embedding on the
existing application's port targets 0.2.1**, developed separately in
`feature/fastify-0.2.1`. Each next newly supported distribution variant advances
the final component in **0.2.x** (0.2.2, 0.2.3, ...), after that variant's
acceptance passes. This is the user's project-specific exception to the generic
capability rule below. Future format numbers follow acceptance order; a CPack
setting, draft API or local npm tarball is not accepted distribution support.
All manifests/native artifacts remain aligned, published/tagged releases remain
immutable, and incompatible wire/API contracts still require explicit
negotiation/versioning and migration notes. [Delivery proposal](DISTRIBUTION_OPTIONS.md).

Outside that explicit delivery-series exception, compatible fixes use a patch
increment (for example 0.1.1); new capabilities
use the next minor version (for example 0.2.0). Before 1.0, incompatible API
changes also require a new minor version and explicit migration notes. After
1.0, incompatible API changes require a major increment. Documentation/test-only
changes need not trigger a product release by themselves. Prerelease manifests
require explicit tooling support before introduction.

Version 1.0.0 remains tied to the original Stage 0–10 V1 acceptance. The 0.1.0
MVP name does not accept managed drives, devices, Gateway/RemoteApp/reconnect
or other still-open gates. Existing Release flags/artifacts stay protected.
