# Iteration 446 — pinned assembly and hosted installation acceptance

2026-10-23, `feature/standalone-installers-0.2.5`, after artifact block `0ee503b`.
This checkpoint prepares real installed-service checks; a prepared workflow is
not a passing hosted run. Development dependencies remain aligned public 0.2.4.

## Reproducible inputs

Platform production lockfiles record 61 package entries each, exact official
registry tarball URLs and SHA-512. The guard refuses file/workspace sources,
foreign hosts, development/link dependencies, version drift, unexpected direct
dependencies and unsafe paths. Platform/runtime versions agree with the private
standalone manifest. Node/WiX/Util archives use the previously verified official
URLs/SHA-256 in `packaging/standalone/inputs.json`.

`build-standalone-payload.mjs` verifies the official Node archive before
extraction, copies only its executable/license and the compiled private service,
then runs locked npm ci with ignored lifecycle scripts, isolated cache/config
and an OS-path-only build environment. npm user/account configuration and tokens
are not inherited. The installed service has its separate minimal environment.

Actual fresh Windows payload succeeds from the pinned ZIP and locked npm ci;
the same nine private-Node/native supervisor/recovery cases pass **9/9** against
this new payload. Lock/ordinary-workstation installed-test guards pass **3/3**;
focused build-code lint and formatting pass. An initial extraction helper lookup
fails because the cleaned PATH correctly excludes PowerShell's directory;
using its absolute standard Windows path fixes the build without importing the
user PATH. Public fetch also verifies the cached official WiX package.

## Hosted gate

`standalone-acceptance.yml` targets fresh Windows 2025 and Ubuntu 24.04 runners,
with pinned official checkout/setup-node/upload-artifact commits, read-only repo
permission, no publishing token and a development artifact boundary. It builds
the exact private payload and real MSI/DEB, exercises Windows supervision and
then installs the service on that clean runner.

The installation fixture refuses ordinary developer execution and preexisting
product/configuration paths. It is designed to check LocalService/UID identity,
actual HTTP/JWT/native strict TLS and certificate wait, crash/restart through
SCM/systemd, same-version reinstall preserving public keys and removal of the
program while retaining public configuration. JWT/private signing key/RDP
credentials stay in memory; only public keys/settings are written as config.
It explicitly does not count reinstall as an upgrade to another version or a
synthetic TLS fixture as a real RDP desktop. Reports remain pending until actual
hosted terminal results are inspected. No release is published by this workflow.

## Actual hosted installation results

Windows 2025 job **120385364812**, run
[39944997910](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/39944997910),
commit `0eddb3f`, passes both the nine supervisor cases and the full installed
SCM fixture, ending in `STANDALONE_INSTALLED_SERVICE_PASS`. LocalService SID,
native strict TLS/certificate wait, abrupt host recovery, preserved public
configuration on reinstall and actual uninstall are checked. The matrix's first
Ubuntu job fails before readiness; it is not counted as a passing run.

Primary Debian helper inspection confirms that a disabled inactive unit is
not started. `d9789d2` enables the unit before policy-aware activation. Subsequent
Ubuntu jobs reach native lifecycle/crash recovery, then fail at reinstall.
Captured dpkg output identifies the helper's generic systemctl failure, not a
conffile prompt. The unit's three-start/60-second limit also includes manual
starts, as documented by [systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#StartLimitIntervalSec=interval).
An explicit package reinstall is its fourth start in that test. `4f3b886` resets
the prior counter only for an administrator-requested upgrade/reinstall;
automatic crash limiting remains enabled.

Ubuntu 24.04 job **120395850234**, run
[39948172280](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/39948172280),
commit `4f3b886`, now passes the entire installed systemd fixture and ends in the
same explicit success marker. Windows 2025 job **120395850496** also succeeds on
that exact commit: run **39948172280** is completed/success for both platforms.
The scalar receipt is `build/iteration-446-hosted-installed.json`; both job logs
are retained locally. A prior Windows attempt fails during the first external OpenSSL
fixture setup at its 15-second timeout; the other eight supervisor cases pass.
The workflow initializes that tool before running fixtures, with all product
lifecycle assertions/deadlines retained. All these failures remain recorded.

The first foundation Windows job at `0eddb3f` also has external OpenSSL setup
timeouts and an Edge fixture timeout; its failed log is retained separately.
The subsequent complete foundation run at `d9789d2` passes, without deleting
assertions or changing the product's certificate policy.

These named installed profiles are Windows Server 2025 and Ubuntu 24.04;
Astra/RED OS installed-service acceptance, a newer-version upgrade, real desktop
RDP and an aligned 0.2.5 release are not inferred from them. Hosted foundation
at `d9789d2` also completes successfully; GCC 8.3 jobs pass independently.

New full local regression, remaining hosted outcomes, RPM/portable distribution
acceptance, version/native release alignment and main/master auto-release remain
following gates. Keep feature work isolated until acceptance, then finish cleanup
and stop.

## RPM and common Linux staging

DEB and RPM now call one shared staging function, retaining immutable program
bytes, private Node/runtime, public configuration and the non-root systemd unit.
Only the unit-directory convention differs (`/lib` for DEB, `/usr/lib` for RPM).
Version/unit-root/overwrite guards pass their synthetic staging fixture. Actual
DEB reconstruction and independent raw extraction pass again after the refactor.

The project-owned RPM builder is based on existing pinned Rocky image digest
`d7be1c094cc5845ee815d4632fe377514ee6ebcf8efaed6892889657e5ddaaa6`, with actual
rpm-build **4.16.1.3-40.el9**. This tool environment is not a RED OS acceptance.
The program/runtime is not rebuilt against Rocky. Packaging runs offline with
two CPUs, 4 GiB, 256 PIDs, no capabilities, no-new-privileges and only the explicit
public payload/recipe input mounted read-only. No workspace/lab credentials enter
the context. RPM postprocessing/stripping and automatic private-library dependency
inference are disabled; gzip preserves older RPM compatibility. Explicit system
runtime requirements and per-component license references remain in metadata.

Actual development RPM, product 0.2.4:
`build/rpm-output-446/freerdp-bridge-0.2.4-1.x86_64.rpm`, SHA-256
`6b6f0d1805b7f1202c0984a1e42f505c2e1ce756543a86a8aa3f2dc8aaaf6620`.
Its header/digest/independent cpio extraction test passes **1/1**: gzip, SHA-256
file digests, config(noreplace), protected modes/owners, license inventory and
every extracted regular-file byte agree with staging. Actual child exit zero:
`build/iteration-446-rpm-final.json`; full test output:
`build/rpm-output-446/verification.log`. No installed RPM/systemd profile is
claimed. The first archive test times out writing 4,000+ files across a Windows
Docker bind mount. Extraction into the fixture's owned container `/tmp` preserves
the assertions/deadline and passes; output artifacts remain read-only during
verification. The initial failed bind-I/O log is retained.

Complete local regression after these additions passes **Windows 985 / 63 skips
/ 0 fail** and **Linux 961 / 90 / 0**, both child exit zero. The final logs are
`build/iteration-446-check-{win32,linux}-final.log`, with scalar `.json` receipts.
The first Linux attempt correctly flags a generated runner accidentally copied
into the checkout root; removing only that duplicate and retaining the failed
log produces the complete green repeat. No product file/assertion is removed.
The final RPM script also resets a prior start counter for an explicit package
upgrade, following the proved DEB policy; the changed artifact receives another
full header/extraction check, not an installed RPM claim.

Neither this RPM nor the development MSI/DEB is an aligned 0.2.5 release. Actual
Astra/RED OS installation, cross-version upgrade, real standalone RDP, portable
bundles and auto-publication remain gates before final cleanup.
