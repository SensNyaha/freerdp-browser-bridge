# Iteration 447 — portable staging and owned service acceptance preparation

Work remains on `feature/standalone-installers-0.2.5`. Product and prototype
runtime versions are still **0.2.4**. This iteration does not accept a 0.2.5
release or a newer-version upgrade. The following results distinguish the
accepted prototype profiles from that still-pending production release.

## Evidence obtained

The previous committed block, `bc0cb5d`, completes all three hosted workflows:

| Workflow | Run | Result |
| --- | --- | --- |
| GCC 8.3 | 39951518571 | success |
| Installed service on Windows/Ubuntu | 39951518406 | success |
| Foundation | 39951518582 | success |

These are results of that commit, not of the subsequent uncommitted portable
and lab-test changes. Named installed OS profiles remain Windows Server 2025
and Ubuntu 24.04; their earlier scope is retained in [iteration 446](ITERATION_446.md).

The new portable builder produces one versioned root directory, private Node,
production service/runtime, public default-deny config, platform launcher and
license inventories. It refuses mismatched runtime/manifest versions and
inventories regular-file contents before compression. Linux npm executable
symlinks are omitted; arbitrary links remain refused. Windows uses the system
archive tool to retain dot-prefixed npm files.

Actual Linux prototype archive:

```text
build/standalone-442/build/standalone-portable-eVDXkl/
freerdp-bridge-0.2.4-linux-x64-gnu.tar.gz
SHA-256 3ae2b23a811655b29f59bd85d2ed2456805178f322826c393be8cc3edfb002b1
4209 inventoried regular files
```

This path is inside the project-owned GCC 8.3 container. The archive passes the
new independent extraction/lifecycle test as **UID 1000**, with no injected
SDK loader paths: complete byte inventory including hidden files, relocation,
private Node, unauthenticated POST refusal, RS256 owner JWT, live native TLS
certificate prompt, zero post-TLS application bytes, SIGTERM joined cleanup,
empty runtime, and refusal of an existing mode-0755 runtime without permission
repair. This is a synthetic TLS peer, not an RDP desktop or installed OS service.
The first test incorrectly requested nonexistent GET `/sessions`; it is corrected
to the actual protected POST route. The assertions retain the 401 requirement.

Windows extraction/byte inventory completes, but launcher acceptance fails.
An isolated native-helper invocation succeeds; invocation from PowerShell 5 with
a clean environment has no exit code or JSON because `PATHEXT` is absent.
The launcher now sets the fixed `.EXE` extension list before executing its
fixed packaged binaries. It emits only a fixed stage code on failure, without
exception/path/config contents. Its subsequent runtime verification follows
below. Prototype Windows ZIPs are not final-release deliverables.

The existing owned SSH lab is read-only inventoried: actual **RED OS 7.3**,
systemd **249**, running system manager, and no bridge program/config/service.
Its current private address is bound in memory to the exact previously
user-confirmed SSH host key; no AutoAdd or known-hosts replacement is used.
The configured credential permits `sudo true` through private SSH stdin; no
password is copied to argv, env, output or new files. This proves only that
the later explicit installation test can be attempted.

## Changes awaiting their installed/hosted checks

`standalone-installed.mjs` gains the explicit `--owned-lab-redos-7.3` mode:
it requires root, exact OS ID/version, no existing program/config directory
and absent service. RPM install/reinstall/remove use the same native/JWT,
non-root identity, crash recovery and retained-public-config checks as CI.
It resolves `jose` from the installed private service rather than relying on
a developer checkout's dependencies. No lab installation has run yet.

The installed-service workflow now builds and verifies both portable formats
and retains their concrete archive paths. These workflow additions have not
been pushed or run. Local guard/staging/payload/lock tests pass **8/8**; changed
JavaScript passes ESLint and Prettier. Whole-project lint, format, aligned-version
and ten npm README guards also pass. The portable test additionally checks the
archive digest and prepares a Windows permissive-ACL/data-preservation refusal
case; those latest assertions still require the next runtime execution.
Full regression for this new block is
still pending; the earlier full counts remain those of iteration 446.

The elevated Windows launcher probe was not executed: automatic approval review
could not finish because the account usage limit was reached. This is a review
availability failure, not an unsafe-action finding. No alternate execution path
is used to bypass it. Local file editing/static checks remain available.

Remaining gates: verify Windows portable shutdown, installed Astra DEB and
RED OS RPM, cross-version upgrade, real standalone desktop profiles, aligned
0.2.5 native/JS production artifacts, automatic main/master release delivery,
then project-owned cleanup and documentation consolidation. Stop after that
agreed delivery; do not add more product scope.

## Following runtime verification

The automatic approval review becomes available again. The same elevated probe
runs through that normal review, without an alternate execution path, and exits
zero with the private-directory receipt and `STANDALONE_READY`.

The rebuilt Windows prototype archive is
`build/standalone-portable-ePGJ8y/freerdp-bridge-0.2.4-win32-x64.zip`, **4094**
regular files, SHA-256
`ec495ff543ead24a4738be77e71503631773af77ca56d51950f6ab367aa60823`.
Actual extraction/lifecycle test passes **1/1**: complete SHA/byte inventory,
relocation, minimal environment including absent PATHEXT, private-directory
creation, private Node, JWT/native TLS prompt, joined host/worker shutdown,
empty runtime, and refusal of a permissive ACL while preserving caller data.
An initial version of the ACL fixture uses PowerShell Set-Acl and fails because
it attempts a SACL operation without SeSecurityPrivilege. The fixture now changes
only its own directory's DACL through icacls; the refusal/data assertions remain.
The final Linux test also repeats **1/1** with the archive-digest assertions.

The exact RPM from iteration 446 passes actual **RED OS 7.3** installed-service
acceptance, child exit zero. Evidence:
`build/iteration-447-redos-installed.{json,log}`. It proves a non-root service,
RS256 owner JWT, unauthenticated denial, strict native certificate rejection,
live native prompt, service crash/restart with a new PID and unavailable old
session, same-version running reinstall with a new PID, stopped reinstall
remaining stopped until explicit start, and uninstall/program removal.
Modified public config survives as **bridge.json.rpmsave**, mode 0640, matching
standard RPM behavior. The fixture verifies its exact configured bytes, then
restores its original public default. The service account is retained by design.
No secret is written to a config/log/argv/env; dummy TLS fixture keys and the
approved ignored SSH lab credentials retain their separate test-only scope.

Retained failures are `iteration-447-redos-installed-kill-whom-failed.*`,
`iteration-447-redos-installed-preflight-failed.*` and
`iteration-447-redos-installed-stopped-reinstall-failed.*`. The first uses a
newer systemctl option spelling; the actual 249 tool requires the compatible
`--kill-who=main`. The second safely refuses cleanup until the fixture accounts
for `.rpmsave`. The third expects RPM try-restart to start an intentionally
stopped service; the final fixture instead verifies both running replacement
and preservation of the stopped state. No service policy is weakened to make
these tests pass. Recovery removes only the identified prior test config after
checking the previous failed receipt, absent package/service, exact public
contents and absence of other directory entries; it never recursively removes
an arbitrary host directory.

This remains prototype **0.2.4** native/TLS/service acceptance, not a real RDP
desktop, cross-version upgrade or final 0.2.5 acceptance. The current Astra lab
config contains no SSH identity; its port and confirmed public host-key
fingerprint have been requested while other checks continue.

## Astra service and full regression

The user explicitly authorizes SSH port 22 with the RDP lab credentials and
acceptance of the first SSH key, then enables access. Initial TCP timeouts
occur before authentication. Once reachable, the first key is recorded in the
ignored lab configuration and subsequent commands use exact key pinning.
This SSH-only authorization does not change RDP certificate verification.
Read-only inventory proves **Astra Linux 1.7.5**, systemd **241**, a running
system manager and absence of a bridge installation; private-stdin sudo works.

The exact accepted Linux portable archive supplies private Node and the compiled
service/native payload. Current public staging/maintainer scripts build an
actual DEB on that Astra host as the ordinary lab user. SHA-256:
`d08affb5cf938a317932f22d043a0325ad6026bcaa27e56db97c69bcfaf1fb9a`.
The separate privileged installed test exits zero and proves non-root systemd
identity, owner JWT, strict/prompt native TLS, crash recovery, running reinstall
with new PID and unchanged public config, uninstall/program removal and exact
retained config. The fixture restores its original public default. Receipts:
`build/iteration-447-astra-deb-build.log` and
`build/iteration-447-astra-installed.{json,log}`. No system Node/npm/FreeRDP is
used; the test driver also runs with the payload's private Node.

Complete local regression passes **Windows 988 / 63 skips / zero fail** and
**Linux 963 / 90 / zero fail**, actual child exit zero. Final logs/receipts:
`build/iteration-447-check-{win32,linux}-final.{log,json}`. Windows tests take
712 seconds; Linux 268 seconds in the current environment. These are complete
test-suite times, not JS compilation times or a promised hosted SLA.

The first Linux full run fails to import avvio because the source overlay
accidentally includes a Windows app node_modules tree. The failed log remains
`iteration-447-check-linux-overlay-dependencies-failed.log`. Recovery verifies
the exact owned checkout path, removes only that app dependency directory,
relinks from the offline frozen pnpm cache, passes the focused standalone test
and then repeats the complete suite. No product assertion is removed.

Hosted checks of these additions, real standalone desktops, newer-version
upgrade, aligned 0.2.5 artifacts and final auto-publication remain following
gates. The completed local prototype checks do not accept those gates.
