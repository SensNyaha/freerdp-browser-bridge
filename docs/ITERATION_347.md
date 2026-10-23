# Iteration 347 — full Node 24 and bundled native regression

2026-10-20. The complete workspace check passes with Node **24.21.0** selected
both for pnpm and its child processes: workspace build, ESLint, Prettier and Node
suite **748 passed / 101 skipped / 0 failed** (849 tests total). The skips are
the existing platform/profile/lab gates. The local shim exists only under the
ignored build tree and invokes the pinned offline pnpm tool.

An initial attempt prepended only the pnpm shim, leaving system Node 22 first
for `node --test`; it reproduced the two Node-24 admission failures documented
in [iteration 332](ITERATION_332.md). Putting the installed Node 24 directory
first in PATH fixed that environment issue without changing source or package
pins.

Bundled native **Release** CTest passes **29/29**. The cached build tree names a
temporary `R:` workspace path; direct CTest could not create its log while that
alias was absent. Running the existing tree through the same temporary `SUBST`
alias used by `scripts/native-build.ps1`, without reconfiguring CMake, passes all
29 tests; the alias is removed afterward. No Release setting or dependency pin
changed.
