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

New full local regression, hosted install outcomes, RPM, portable distributions,
version/native release alignment and main/master auto-release remain following
gates. Keep feature work isolated until acceptance, then finish cleanup and stop.
