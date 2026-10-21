# Iteration 389 — current offline GCC 12 foundation and Node regression

2026-10-21. After the user starts Docker Desktop and the Windows observation
[388](ITERATION_388.md) completes, a fresh isolated Linux fixture checks the
current MVP code without competing with the actual RDP workload. This is a
required base-platform regression, not a new dependency/sanitizer matrix.

The complete tracked-source archive of `6415d9c1d67f434ef769942205eabe470288bb0c`
contains no previous build, dist, node_modules, tools, SDK, Git metadata or lab
files. Later Windows soak documentation does not change this tested code.
Archive SHA-256 is
`657330ad28ff7085f16db3c59fa4b48f6cb06d11ba98c8b7f91e546913c29c03`.
The prepared public Node cache is reused only after exact hash verification:
`c6f64ae9ae68c3c55948ba26d7df808a962d6789c2dc540a6d4e63b4021a1591`.

The existing local Ubuntu image is
`sha256:e7890149c961c812ab83ecad5dd81ab7bb9281c94ceec00952a87fc7681bf89d`.
The new fixture has UID/GID 1000, network none, read-only root, init, dropped
capabilities, no-new-privileges, two CPUs, 4 GiB memory, 256 PIDs and bounded
tmpfs. There are no host/source/SDK/credential mounts. Prepared Catch2/toolchain
inputs remain external; no registry/source download or OS configuration change
occurs. The standard approved user-context Docker call uses the ordinary local
endpoint; sandbox config/pipe and separate WSL refusals are not bypassed.

Node 24.21.0 / pnpm 10.11.0 perform frozen offline installation with scripts
ignored, then all workspace builds. GCC 12.4 / CMake 3.28.3 / Ninja compile a
new source-only Debug foundation with FreeRDP/addon/sanitizers off. Its native
receipt binds the same 353 files / 1,938,082 bytes and source SHA-256 as Windows:
`767b9ddd7bd3089e3c6ec04543267b6210077e4b29f90feef8ea829a16cf0897`.
Native CTest passes 18/18 in 6.92 s. Actual framed lifecycle passes 15 / one
absent-primary skip. These are native lifecycle fixtures, not connected RDP.

## Final result

Full `pnpm check` passes build/lint/format and **766 / 178 profile/platform skips /
944 total**, zero failures, in 161.25 s. All **1,320** archived files and the
lockfile remain byte-identical. The owned PID namespace contains no remaining
`rdp-worker`. Fresh worker SHA-256 is
`8f71894a92040bdb4514738eebb769bb6cccb8b18aad14a83ea5e18003081190`.
Evidence: `build/iteration-389-linux.log`, `build/iteration-389-run.py`.

The outer invocation exits 1 only after these checks: Docker's archive-copy
operation cannot find the receipt in the running fixture's tmpfs. The full
receipt was already printed by the successful in-container runner, after source
and process checks. The fixture is then stopped/removed. The exact JSON is
recovered from retained stdout into `build/iteration-389-receipt-recovered.json`,
explicitly labelled with that provenance; it is not presented as a successful
copy of the removed original file. Recovery handles the PowerShell log's UTF-16
BOM; its first UTF-8-only attempt refuses without creating a receipt.

The host runner now exports bounded JSON through `docker exec ... cat`, keeping
the mounted process view. A separate tiny UID1000/read-only/no-network fixture
verifies that export and its own removal (`build/iteration-389-export-control.log`).
No build or regression is repeated for this metadata-only correction. There are
no failing product tests or weakened checks. The failed outer export remains in
the original log. The final host runner is `build/iteration-389-host.cjs`.

Release profiles/artifacts, pinned dependencies, GNU minimum 12 and existing
SDKs remain unchanged. This foundation does not accept current linked Linux
FreeRDP, browser/RDP/audio/device, sanitizer/upstream, new distro or actual CI
gates. Historical linked/runtime evidence keeps its stated scope.
