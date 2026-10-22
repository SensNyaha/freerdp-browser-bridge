# Product versions and release branches

The latest stable release is **0.2.0**, identified by annotated immutable
`v0.2.0`. It adds the accepted GCC 8.3 port and named real Astra/RED OS desktop
profiles; [release checks and limits](ITERATION_418.md). The original practical
MVP remains **0.1.0**, by the user's 2026-10-21 decision, with immutable
`v0.1.0` and its [MVP acceptance](MVP_ACCEPTANCE.md). Neither release completes
the full original V1 plan. Major version zero still permits API evolution
under [Semantic Versioning](https://semver.org/), with the explicit project
delivery-series exception below.

The 2026-10-22 **0.2.0** compiler-port decision is completed through the separate
compiler feature and `release/0.2.0`: manifests, native checks, full Node checks
and named actual RDP acceptance have recorded evidence. A later feature branch
carrying the same manifest number is not the stable tagged snapshot. Existing
0.1.0 and 0.2.0 archive bytes and tags remain immutable.

Root/workspace `package.json` versions and CMake `project(VERSION)` use one
product version. `pnpm version:check` verifies their consistency; an explicit
release check is `node scripts/check-version.mjs 0.2.0`. It validates the
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

The user's subsequent adapter sequence fixes the next targets explicitly:
**0.2.1 Fastify → 0.2.2 NestJS → 0.2.3 built-in `node:http`**. Develop in
`feature/fastify-0.2.1`, `feature/nestjs-0.2.2` and
`feature/node-http-0.2.3`, respectively. Complete each adapter's required
acceptance before merging and starting the next one. These are planned release
numbers, not current supported adapters or accepted tags. The user considers
this sufficient as the initial adapter set; other distribution formats remain
future options. Unassigned formats after this reserved sequence follow the
acceptance-order rule above.
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
