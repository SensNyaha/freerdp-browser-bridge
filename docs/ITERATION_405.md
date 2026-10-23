# Iteration 405 — stable MVP 0.1.0 release

2026-10-21. Explicit user decision: the accepted stable practical MVP is named
**0.1.0**. Work is isolated on `release/0.1.0` from shared `master` `806147b`;
the unfinished XRDP Clipboard feature is excluded.

Root, four workspace manifests and CMake already declare 0.1.0. The release
adds a bounded consistency guard to `pnpm check`, with an explicit expected
release version option, plus mismatch/invalid-version tests. The two focused
tests, narrow lint and formatting pass; the guard confirms five manifests and
native version 0.1.0. Full release-branch `pnpm check` passes **893 / 61 skips /
954 total**, zero failures/cancellations, 382.74 s for Node tests. This includes
build, lint, format and the new consistency guard. Evidence:
`build/iteration-405-release-check.log`. The hash-verified unchanged Release
worker is selected explicitly; native sources/flags/dependencies are untouched,
so [401](ITERATION_401.md) CTest 34/34 retains its exact scope.

After these checks, merge `release/0.1.0` into `master` and create the annotated
immutable `v0.1.0` tag on that release merge. The tag, rather than the numeric
version on a later feature branch, identifies the stable snapshot.

README, changelog and [version policy](VERSIONING.md) distinguish the stable
tag from unreleased feature commits, keep immutable release history and
describe patch/minor/major decisions. Product versioning is separate from
wire schemas and dependency pins. No package dependency, native source,
protocol or existing Release flag/artifact changes.

The accepted product behavior remains exactly the [MVP evidence](ITERATION_403.md),
with [Windows/Linux regression](ITERATION_402.md), known limitations and the
full original V1 plan preserved. This naming does not accept deferred features.
