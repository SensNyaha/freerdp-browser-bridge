# Iteration 372 — receipt-selected native browser lab worker

2026-10-20. The viewer previously always used the ordinary bundled worker,
so the corrected isolated Debug build from [371](ITERATION_371.md) could not
be selected for its audio preview. One optional final native-receipt argument
now delegates to the existing Windows resource-lab profile validator. The
resolved worker path is used by the actual `NativeSessionWorker` options;
the private runtime root and default platform-specific bundled path stay the
same. Invalid arguments, absent/changed artifacts and unsupported profiles
refuse before lab configuration/credentials, listener or worker acquisition.

The existing linked/source/pin/worker/helper checks are reused, without an
arbitrary executable argument or a second trust policy. A separate schema-1
`lab.browser.native-profile` record reports receipt, build type and source /
worker/helper hashes. It describes selection, not a successful connection or
playback. New receipt validation is local only; this iteration starts no RDP
session and changes no host application, public protocol, Release output or pin.

Three new fixture/CLI cases cover untouched Windows/Linux defaults, selected
Debug/Release paths, helper-byte refusal and invalid/missing/extra CLI arguments
in an empty project directory. The first local multi-file invocation used
Node's concurrent default instead of the project's serial test setting: one
CLI child returned no exit status at its unchanged five-second bound
(21 passed / one failed). An isolated serial repeat passes 3/3; the normal
serial selection/profile/options/diagnostic/tone/Edge-observation set passes
22/22. No deadline or assertion is relaxed. Broader concurrent CLI-startup
stress is not accepted by these checks.

Local selection of `build/native-clean-PUICs8/receipt.json` also resolves the
actual Debug worker and verifies source hash
`8acce7392ae76097c973729c5301d79220b0e85026c123b61de28bf2ccae9fe8`,
worker hash `6613765109eedc498178827d764cd0c925456d8c9159daa4857def5e36b27ac6`
and helper hash `4a65bcd8fac00adf2cd0ebf7c5bc17bb2d9d65fa3b585982c1e2c54af32795b1`.
This probe reads only receipt/artifacts and does not execute a native process
or read lab files. Helper syntax, repository-wide ESLint/format and
`git diff --check` pass. Focused evidence is `build/iteration-372-focused.log`.
The preceding full linked Debug Node 812 / 51 skips and native CTest controls
are scoped in [371](ITERATION_371.md); no new full/native rerun is claimed for
this JavaScript lab-selector block. Actual new-worker output remains open.
