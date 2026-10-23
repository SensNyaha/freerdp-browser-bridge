# Iteration 445 — actual MSI/DEB development artifacts

2026-10-23, `feature/standalone-installers-0.2.5`, after supervisor `8f47cc7`.
All artifacts here are development prototypes using public **0.2.4** production
dependencies and private Node **24.21.0**. They do not accept an aligned 0.2.5
release, installed SCM/systemd profile or automatic GitHub publication.

## Windows MSI

The reusable `scripts/build-standalone-msi.mjs` checks the private service's
version against its explicit API/native runtime dependencies, inventories
regular files with bounded counts/depth/bytes and writes SHA-256 receipts.
Its pure renderer refuses traversal, Windows aliases/streams, case collisions,
file/directory ambiguity, WiX variable injection and invalid MSI versions.
It renders one component per file, per-machine installation, LocalService,
protected Program Files/ProgramData directories, a preserved never-overwritten
public configuration and bounded two-retry crash recovery. Recovery uses the
official WiX Util extension; there is no custom command interpreter action.

Actual tools: WiX/Util **4.0.6**, official NuGet packages respectively SHA-256
`a94dd42ae1fb56b32da180e2173ceda4f0d10b4c8871c5ee59ecb502131a1eb6`
and `541168d58c299dd8d62e92ea1877489756cfa73a27fd6ec855cd6341c8447562`.
The MS-RL tool license/source provenance is retained with the build inputs;
these tools are not required on the installed machine.

Both the initial assembly and reusable builder produce an actual MSI. The
reusable build receipt is `build/standalone-msi-JPyAIh/build.json`; its MSI is
36,667,940 bytes, SHA-256
`a5cd62f3778eea16e5890f458847eb33552bada5fd2ab35a7d0344b88f034a5b`.
It contains 4,098 inventoried program files plus a separate default config copy.
`read-msi-tables.ps1` inspects the actual database through Windows Installer COM.
The verifier independently reconstructs installed paths from File/Component/
Directory rows, checks LocalService, ACLs, config preservation and the exact
allowlist of three official recovery custom actions. Actual CAB extraction with
installed 7-Zip **26.03** verifies all **4,099** sizes/SHA-256 values.
The packaging test passes **2/2**, including detection of LocalSystem, weakened
ACL, lost configuration preservation, extra shell action, missing file and
changed cabinet digest. These extraction checks do not run an installer.

Retained failures: auto-GUIDs are invalid for directory-keyed components; fixed
stable GUIDs correct that authoring error. The first CAB build fails in WiX's
native helper on long source paths; a temporary free drive alias produces both
successful builds. A nonadministrative `msiexec /a` attempt reaches its deadline
and is stopped; no SCM installation is performed or claimed. The WiX
decompiler warns about its ACL interpretation; direct database inspection proves
the actual MsiLockPermissionsEx rows refer to the correct File/CreateFolder keys.

The supervisor's unexpected SCM error path now exits after its Job/child RAII
guards unwind, so configured SCM crash recovery can apply without relying on
MSI's problematic non-crash-failure flag. Compilation with `/W4 /WX` and all
**9/9** console/native process-tree/recovery/preservation tests pass again.
Actual SCM recovery still requires an administrative installed-service test.

## Linux prototype and DEB

A fresh public production graph uses the existing GNU/Linux runtime package,
private Node 24.21.0 and compiled standalone. Running the CLI directly as
**UID/GID 1000**, with only OS paths/HOME/TMPDIR in its environment, proves real
HTTP/JWT/browser assets, linked native strict TLS refusal, a live certificate
prompt and SIGTERM shutdown with an empty runtime. It runs in the existing
Astra userspace container; it does not accept a full installed OS/systemd.
Receipt: `build/iteration-445-private-cli-linux.json`.

`scripts/build-standalone-deb.mjs` creates an actual Debian archive with private
program files in `/opt/freerdp-bridge`, a dpkg conffile under `/etc`, a non-root
systemd unit, private volatile runtime and executable/idempotent maintainer
scripts. Only npm's generated `.bin` launcher directory is omitted; service and
worker resolve their fixed package paths directly. Other symlinks/special files
remain refused. The old dpkg 1.19.7 builder uses compatible gzip and root ownership.
No globally installed Node or FreeRDP is an installer dependency.

Actual DEB SHA-256:
`05a5193f67fd1f0a9d363111f2160084da51ecb6d4f14aaf16c87ab9cfb27405`.
Local copy: `build/freerdp-bridge-development-0.2.4-amd64.deb`; receipt:
`build/iteration-445-deb-build.json`. Independent dpkg raw extraction passes the
packaging test **1/1**: every staged file/digest matches, entries are root/root,
public config is 0640, private Node/scripts have executable bits, conffile and
unit settings agree, scripts parse with POSIX sh. No maintainer script or service
is executed by this archive test.

Retained failures: the first Linux helper names the GNU runtime incorrectly;
the corrected official name installs successfully. A cap-dropped container
refuses chown; direct Docker exec as UID 1000 creates its own temporary runtime
instead. The first DEB inventory correctly refuses npm `.bin` aliases; excluding
only that unneeded directory preserves the default link refusal. Initial xz
compression exceeds the build deadline; compatible single-thread gzip completes.
The assembler now kills its entire owned build process group at a deadline.

## Regression and remaining gates

Windows complete pnpm check: **981 pass / 63 skip / 0 fail**, child exit zero,
`build/iteration-445-check-win32-final.log` and `.json`. New/changed packaging
code also passes focused lint/format and inventory tests. The initial Linux
complete check has **956 pass / 90 skip / 1 fail**, a 25 ms process-query admission
test while compression runs. The isolated unchanged test and new inventory
tests pass **13/13** without compression; the complete repeat passes **957 / 90
skip / 0 fail**, child exit zero, in
`build/iteration-445-check-linux-final.log` and `.json`. No assertion/deadline is
relaxed. Later notice/build guard changes receive their focused checks; these
suite counts do not turn archive tests into installed-service acceptance.

The MSI builder additionally requires the exact upstream WiX Util license in
the program payload, with a pinned SHA-256 check. Earlier prototype artifacts
above predate that notice guard and remain development evidence. A subsequent
actual build with the required notice and the current supervisor succeeds:
`build/standalone-msi-ocw5RM`, SHA-256
`67e7bedee3bcd71185dcbe6ce456cc1fc64fbc792293f18df900bdcc36f8142f`.
Independent database/CAB verification passes for all **4,100** files, including
the notice and config copy; packaging regression passes **2/2** again. Receipt:
`build/iteration-445-msi-final.json`. Final release artifacts must also provide
the native corresponding-source companions. This remains a development 0.2.4
prototype, not installed SCM/0.2.5 acceptance.

MSI install/upgrade/uninstall/SCM identity and recovery, DEB install/systemd,
RPM, portable distributions, aligned version/native rebuilds, actual declared
OS/RDP profiles and hosted main/master auto-release remain open. Finish that
bounded product, clean project-owned artifacts/document navigation, then stop.
