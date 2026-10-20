# Iteration 332 — selected remote disconnect reason mapping

2026-10-20. Closes a small Stage 3 error-reporting slice without changing the
RWI1 state record. The native state already carries FreeRDP's numeric error;
the Node adapter now translates only four pinned 3.32.1 ERRINFO values into
stable fixed public failures. Idle/logon timeout becomes `RDP_SERVER_TIMEOUT`,
and RPC/user logoff becomes `RDP_SERVER_LOGOFF`. Other disconnect values stay
`RDP_DISCONNECTED`, while `NONE` and every non-disconnect error preserve their
existing behavior. Unknown values are not guessed. This does not establish full
remote disconnect categorization or actual Windows server coverage.

`tests/unit/native-session-failure.test.mjs` passes **1/1**, covering both
timeout values, both logoff values, ordinary/unknown disconnect values and a
protocol-error non-reclassification control. The node package TypeScript build,
ESLint and repository Prettier check pass. `git diff --check` passes. No C++ or
native foundation code changed, so native CTest was not rerun.

The full workspace check was executed with the locally available Node **22.22.0**
and cached pnpm **10.11.0**; the workspace requires Node 24. Build, lint and
format checks pass. Node reports **741 passed, 101 skipped, 2 failed**. Both
failures are pre-existing toolchain-admission tests which require the child
process to run Node 24 and therefore observe the explicit refusal from
`scripts/test-native-clean-build.mjs` under Node 22. The repeated full log is
`build/iteration-332-node-test-repeat.log`; no Node 24 executable was present
in the available environment. The new mapping test passes in that full run as
well as in the focused rerun. Full Node 24 acceptance remains unverified.

The first full check attempt could not resolve `pnpm` from PATH. A temporary
workspace-local command wrapper then successfully drove the cached pnpm binary;
it was removed after the run. No package version, dependency pin, Release
configuration or external system was changed or contacted.
