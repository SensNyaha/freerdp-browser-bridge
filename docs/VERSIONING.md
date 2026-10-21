# Product versions and release branches

The stable practical MVP is **0.1.0**, by the user's 2026-10-21 decision.
Its scope and limits are [MVP acceptance](MVP_ACCEPTANCE.md), not completion
of the full original V1 plan. Major version zero still permits API evolution
under [Semantic Versioning](https://semver.org/).

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

Compatible fixes use a patch increment (for example 0.1.1); new capabilities
use the next minor version (for example 0.2.0). Before 1.0, incompatible API
changes also require a new minor version and explicit migration notes. After
1.0, incompatible API changes require a major increment. Documentation/test-only
changes need not trigger a product release by themselves. Prerelease manifests
require explicit tooling support before introduction.

Version 1.0.0 remains tied to the original Stage 0–10 V1 acceptance. The 0.1.0
MVP name does not accept managed drives, devices, Gateway/RemoteApp/reconnect
or other still-open gates. Existing Release flags/artifacts stay protected.
