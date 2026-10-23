# Iteration 413 — exact GCC 8.3 foundation CI

2026-10-22. Branch `feature/astra17-gcc83`, following `5d9c957`.
Requirement: retain a reproducible regression for the user-required minimum
GCC 8.3.0 before the requested 0.2.0 release. The linked compiler/dependency
port and actual RDP evidence remain in [411](ITERATION_411.md) and
[412](ITERATION_412.md); this job does not replace either.

The new dedicated workflow uses the exact previously tested official GCC
image digest, verifies `g++ -dumpfullversion` is 8.3.0 and builds the unchanged
Release foundation in C++20 mode with warnings as errors. Catch2 3.8.1 is fixed
to commit `2b60af89e23d28eefc081bc930831ee9d45ea58b`. CMake 3.31.6 and Ninja
1.11.1.4 wheels use fixed official PyPI URLs and SHA-256 checks before extraction.
The hashes match both the official metadata and the earlier compiler fixture.
[CMake metadata](https://pypi.org/pypi/cmake/3.31.6/json),
[Ninja metadata](https://pypi.org/pypi/ninja/1.11.1.4/json).

The context exports only tracked CMake/native/test inputs with `git archive`;
it does not copy ignored credentials, node_modules, host SDKs or runtime trees.
Catch2 checkout credentials are not persisted. Image/tool preparation is the
networked phase; both build and test execution disable networking. The test
container has bounded CPU/memory/PIDs, an init process, no capabilities,
no-new-privileges and no host mounts. CTest has a per-test timeout and fails on
an empty test set. Existing modern GNU, Windows and sanitizer CI jobs remain.

Local execution of the actual final Dockerfile passes CTest **20/20**, zero
failures, **4.86 s**, under those run restrictions. The same source archive
has SHA-256 `5d7fcc4fa53096e878598d613ec052cc92fd48c2c335a55bb4e4ca22225ce68d`;
it comes from `5d9c957`'s unchanged CMake/native/test inputs. Tool hashes are:

| Input | SHA-256 |
| --- | --- |
| CMake Linux wheel | `1c8b05df0602365da91ee6a3336fe57525b137706c4ab5675498f662ae1dbcec` |
| Ninja Linux wheel | `096487995473320de7f65d622c3f1d16c3ad174797602218ca8c967f51ec38a0` |

The first outer PowerShell invocation reports Docker's ordinary stderr progress
as an error. The later reviewed runner exits 0 with matching cached build layers;
CTest then actually executes. This is not a compiler failure or proof that the
first Docker daemon build did not complete. Original output remains available.

The final profile passes formatting and `git diff --check`. Full Linux
`pnpm check` with the same verified GCC 8.3 linked worker/addon passes
**877 / 87 skips / 964 total**, zero failures, **222.04 s** for the test suite;
version/build/lint/format checks also pass. There are no native implementation,
wire-contract, dependency-pin or product-version changes.

Evidence is retained under ignored `build/` as
`iteration-413-gcc83-ci-build2.log`, `iteration-413-gcc83-ci-build-runner.log`,
`iteration-413-gcc83-ci-ctest-final.log` and `iteration-413-gcc83-full-check.log`.
The [fixture instructions](../tests/fixtures/gcc83/README.md) are tracked.
The GitHub-hosted job itself has not run from these local commits; local Docker
execution is the evidence claimed here. No Stage 0 completion, shared merge,
installed-distro acceptance or 0.2.0 tag is accepted by this report alone.
