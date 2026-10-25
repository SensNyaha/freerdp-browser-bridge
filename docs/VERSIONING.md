# Product versions and release branches

Current release preparation targets **0.3.0** for verified runtime ownership and
bounded orphan recovery in Node, all adapters and standalone. The implementation
is frozen at `51283d1`; `release/0.3.0` carries version/delivery preparation.
This is a new capability outside the completed adapter/distribution 0.2.x
exception, so it uses a minor increment. Product publication and new-version
installer acceptance remain pending; the latest public stable release is still
0.2.5. The original full Stage 1 and V1 gates are not closed by this feature.

Release tooling admits canonical bounded pre-1.0 minor versions. Standalone's
0.3.0 upgrade predecessor is explicitly `v0.2.5`; it is not inferred by
decrementing the patch component across a minor boundary. Existing 0.2.5's
historical seed is preserved. A future minor boundary requires an explicit
accepted predecessor. Local source/lock/candidate/publisher tests pass **38/38**,
workflow lint and Python lab-driver syntax checks pass; these do not accept a
real installer, registry publication or real RDP profile.

The latest accepted local release is **0.2.5**, standalone web service and
portable/MSI/DEB/RPM distribution with aligned JS/native packages. Local/native,
exact consumers, eight actual RDP profiles and all named installer-upgrade
checks pass. All ten npm packages, five OIDC workflows and four fresh registry-only
consumers on Windows/Linux pass; [public npm delivery](ITERATION_456.md).
Final main-push installer delivery, downloaded file integrity and actual final
DEB/RPM version upgrades on Astra/RED OS pass;
[public distribution acceptance](ITERATION_457.md);
[local release acceptance](ITERATION_455.md).

Prior stable release is **0.2.4**, identified by annotated
immutable `v0.2.4`: Express 5 root middleware with same-port HTTP/HTTPS/WS and
aligned JS/native packages. Full checks, ten exact archives, external consumers
and eight versioned Astra/RED OS Express profiles pass. All ten npm archives and
five GitHub Releases are public, with successful hosted workflows and four fresh
registry-only consumers on Windows/Linux. [Release acceptance](ITERATION_438.md),
[publication](history/iterations/401-450.md#iteration-441).

Prior stable **0.2.3** is identified by annotated immutable
`v0.2.3`: node:http/node:https embedding with explicit HTTP/WS dispatch and
matching JS/native packages. Final checks, exact consumers/reinstall and
versioned Astra/RED OS desktop profiles pass. Registry publication is separate.
[Release acceptance](ITERATION_433.md). User decision, 2026-10-24: keep this
version archived, with its seven missing JS npm packages intentionally
unpublished; complete public 0.2.4/0.2.5 suffice. Preserve its immutable tag and
accepted archive bytes; do not resume manual approvals. [Decision](ITERATION_458.md).

Prior stable **0.2.2** is identified by annotated immutable
`v0.2.2`: NestJS module with Express/FastifyAdapter and matching README-complete
native/JS archives. Final checks and exact consumers pass; all eight archives
are public at accepted integrity and fresh Windows/Linux registry-only
consumers pass. [Release acceptance](ITERATION_429.md),
[publication evidence](history/iterations/401-450.md#iteration-437).

Prior stable **0.2.1** is identified by annotated immutable
`v0.2.1`. It adds accepted same-port Fastify embedding and matching native npm
packages; [release checks and limits](ITERATION_424.md). All seven exact npm
archives are published at 0.2.1 and pass fresh Windows/Linux registry consumers;
[publication evidence](history/iterations/401-450.md#iteration-426).
The prior immutable `v0.2.0` adds the accepted GCC 8.3 port and named real
Astra/RED OS desktop profiles; [its checks](ITERATION_418.md). The original practical
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
release check is `node scripts/check-version.mjs 0.2.1`. It validates the
currently supported stable `MAJOR.MINOR.PATCH` form, not prerelease syntax.
FreeRDP/other dependency pins and public/private wire schema versions are
separate values. A product release never silently changes those contracts.

## Development and releases

Superseding user direction, 2026-10-24: after the current standalone delivery,
project cleanup and documentation consolidation, continue implementing TODO
features. Each feature uses a new branch and merges only after stable required
checks. Assign the next version according to scope/compatibility below and
publish the accepted aligned npm packages and standalone distributions promptly.
The earlier instruction to stop after cleanup is superseded. This does not
relax native/real-profile/installer acceptance or immutable release protection.

1. Develop each feature on its own branch. Record its tests and acceptance;
   merge only the completed, verified feature into shared `master`.
2. Keep release changes separate in `release/<version>`. Include only completed
   work, update the changelog and align all product version manifests. Do not
   collect uncommitted or unfinished work from another feature branch.
   Every npm package, including common libraries and platform runtimes, must
   ship its own explanatory root README. Run the source and exact-archive checks
   in [the publication contract](NPM_PUBLISHING.md); update examples/dependency
   versions for that release. README changes do not replace accepted archives.
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
**0.2.1 Fastify → 0.2.2 NestJS → 0.2.3 built-in `node:http` → 0.2.4 Express**. Develop in
`feature/fastify-0.2.1`, `feature/nestjs-0.2.2` and
`feature/node-http-0.2.3` and `feature/express-0.2.4`, respectively. Complete each adapter's required
acceptance before merging and starting the next one. These are planned release
numbers until their gates pass. Fastify 0.2.1, NestJS 0.2.2 and node:http 0.2.3
now have accepted immutable tags, as does Express 0.2.4. The earlier request to stop after node:http is superseded by the explicit
Express addition. Other popular integrations require a concrete need and
separate acceptance; other distribution formats remain future options. Unassigned formats after this reserved sequence follow the
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
