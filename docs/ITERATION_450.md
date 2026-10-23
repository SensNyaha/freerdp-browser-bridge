# Iteration 450 — installed version and upgrade-fixture preparation

Feature branch remains `feature/standalone-installers-0.2.5`; manifests and
accepted prototype packages remain **0.2.4**. This block does not claim a
successful two-version upgrade.

The installed-service fixture now verifies both the installed service manifest
and actual native `/rdp/v1/build` version, plus private Node v24.21.0. Explicit
owned-lab runs can repeat after uninstall only when the retained configuration
is exactly the public default, root-owned, mode 0640 in a root-owned 0750
directory with no other files. Program/service must still be absent. Arbitrary
deployment settings, links, unknown files or permissive permissions are refused.
No existing directory is recursively deleted or repaired.

Actual baseline repeats pass on **Astra 1.7.5 DEB** and **RED OS 7.3 RPM**, child
exit zero: installed/native version, identity, JWT/native TLS, crash recovery,
running reinstall and uninstall/config retention. RED OS also verifies that
stopped reinstall remains stopped. The fixtures restore their public default.
They use the exact prototype package hashes from iteration 447, pinned SSH and
the tested private-stdin sudo handshake. Receipts:
`build/iteration-450-{astra,redos}-installed.{json,log}`.

Optional `build.previous` contains an earlier `0.2.x` version, package path and
SHA-256; the file is regular/bounded and its digest checked before installation.
The new branch installs that seed, configures public JWT verification, creates
a live certificate-pending old worker, installs the candidate, checks a changed
service PID, preserved config, old-session 404, empty runtime and the candidate's
actual native version. The existing native/crash/reinstall/remove checks then
apply to that candidate. This branch is **prepared but not yet run**: it needs
the aligned 0.2.5 native/JS payload, not relabelled 0.2.4 binaries. Its receipt
reports `upgradeToNewVersion: false` in both current baseline runs.

Changed JavaScript passes ESLint, Prettier and diff whitespace checks. Full
pnpm counts from iteration 449 remain separately scoped; this block changes
only the explicit packaging fixture and documentation. Windows/Ubuntu hosted
baseline checks of the changed fixture follow its push. Two-version upgrade,
aligned final artifacts and main/master auto-publication remain open.
