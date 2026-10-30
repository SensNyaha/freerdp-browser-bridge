# Building the foundation

Current public release is **0.7.0**. The inventory feature and release branches
are merged; exact npm and standalone distribution acceptance is complete.
[Public sources, installer profiles and remaining limits](RELEASE_0_7_0.md#public-delivery).
Older version-specific checkpoints below retain their original scope.

For current installation, architecture and release reading paths start with the
[documentation map](README.md). Historical lab commands below retain their
one-run authorizations and original scope; they are not permission to repeat
remote tests. Cleanup removes obsolete native build outputs after saving their
receipts ([record](ITERATION_458.md)). In a new test use a fresh verified linked
receipt for that source/version; an archived receipt cannot make a removed
worker executable available again.

Current delivery criteria and evidence boundaries are in
[practical MVP acceptance](MVP_ACCEPTANCE.md).

The bundled builder explicitly prepares corresponding-source archives after
staging native binaries. A vcpkg binary-cache hit can restore libraries without
downloading their upstream sources. `scripts/fetch-native-package-sources.mjs`
reads the staged dependency SBOMs and verifies the pinned SHA-512 archives in
`.tools/vcpkg-downloads`, fetching only missing bytes from the public upstream
GitHub source endpoint. Valid cached archives require no network; corrupt or
foreign entries refuse without replacement. The archives are not extracted or
executed. Native npm packaging retains its independent source/recipe checks and
remains an offline operation over the prepared inputs.

The foundation CI matrix explicitly retains GCC 11 alongside GCC 12, the
default Ubuntu compiler and MSVC; exact GCC 8.3 remains a separate workflow.
The GCC 11 compiler/foundation job runs on Ubuntu, so its success must not be
reported as actual RED OS 7.3/GCC 11 platform acceptance. Named runtime/lab
results retain their own target OS, compiler and artifact identities.

## Windows MSI physical-full CI

The installed MSI / real RDP / bounded NTFS resource scenario passes in
run `41027120795` and independent fresh-runner repeat `41029036732` on
`feature/windows-msi-disk-full`, with unchanged functional helper/product bytes.
Final source-wide gates pass at public `5e0bf07` / private `de2d6e3`:
foundation `41029036693` (Windows/MSVC, two Linux/GCC profiles and sanitizers /
bounded fuzz) and exact GCC 8.3 `41029036699`. This accepts the named branch
scenario for merge; the broader resource/soak requirements remain open.
[Accepted case and exact evidence](FILES.md#installed-windows-msi-physical-full-acceptance).
Its privileged host helper is reserved for an isolated Windows CI runner with
an admitted private 16 MiB VHD and a verified absent product installation.
Ordinary unit tests import only the pure configuration validator and exercise
the bounded input/download/client admission controls. The host admission smoke
case additionally requires `BRIDGE_WINDOWS_MSI_HOST_TEST=1` in that designated
job; do not enable it for local development.

An earlier local invalid-input smoke invocation was blocked by endpoint
protection with `ScriptContainedMaliciousContent`. The local record is
`build/current-validation/windows-msi-local-protection-response.json`.
The new task uses a plain local `.ps1` through `-File`, validates its hash and
session identity, and grants the temporary account only read/execute access to
that fixture. No generated PowerShell source, execution-policy override or
antivirus exception is used. The privileged helper has not been rerun on the
developer workstation; successful isolated CI execution does not establish
approval by that workstation's endpoint protection.

Hosted attempt `41001988763` passes the fixture controls and reaches the actual
published MSI's `StartServices` action, then fails its 120-second installation
deadline. This is not installed acceptance: retirement fails and the detached
test volume retains diagnostic files, although the temporary RDP account and
RDP settings are restored. The next diagnostic revision records only public
SCM state and data/config/runtime ACLs on that deadline. It stops only the
verified, freshly installed LocalService process to let MSI finish rollback
before terminating its own installer client. The VHD data-root owner/ACL now
matches the MSI's administrative data-root contract; its separate controller
context remains private. Pure tests construct and inspect this security
descriptor without applying permissions or executing the host helper locally.

Attempt `41003665765` confirms the ACL contract and SCM exit code **1067**
(`Stopped`, PID zero), not a slow successful startup. It remains failed MSI
acceptance, with failed retirement retained. A failure-only scheduled task now
reuses the existing static startup diagnostic under LocalService, using the
unchanged installed private Node/modules and matching environment. It reports
only a fixed bootstrap phase and task result; it has no session credentials.
Its copied code is read-only to LocalService, which can write only its public
diagnostic output subdirectory. The task is stopped/unregistered afterward.
This alternate-process probe diagnoses startup; it cannot establish SCM,
installed-session or disk-full acceptance.

Attempt `41005712810` runs that diagnostic successfully under SID `S-1-5-19`
and localizes the failure to **config** (task result 1), before runtime resolve.
The NTFS file/directory DACLs still admit LocalService. The disposable image
now explicitly grants that SID read/execute/write on the backing file before
attachment: the [AttachVirtualDisk contract](https://learn.microsoft.com/en-us/windows/win32/api/virtdisk/nf-virtdisk-attachvirtualdisk)
uses the image's descriptor when no attachment descriptor is supplied. The
previous private controller copy did not explicitly admit the service account
at this separate device-filter layer. Its original source image and all
production/session ACLs are unchanged. Pure tests verify owner, protection,
exact principals and bounded rights, without mounting anything locally.
This is a test-device admission correction; its actual MSI result remains open.

Attempt `41006724177` confirms the read-access correction: the unchanged
installed Node bootstrap now completes under LocalService (task result 0).
SCM still exits with 1067. Its C++ supervisor additionally creates a private
runtime lock with `FILE_FLAG_DELETE_ON_CLOSE`; the test image filter's initial
read/write grant did not include delete or native security operations. The
private 16 MiB copy now admits full device access for its controller, SYSTEM
and LocalService only, leaving every production/session NTFS ACL unchanged.
The failure-only Node diagnostic additionally checks an exclusively created,
tiny owned runtime file and deletion, with fixed write/delete failure phases.
Full source foundation and GCC 8.3 checks pass for `373ebb4`; installed SCM and
the connected resource scenario still require their own positive result.

Attempt `41017607893` passes actual published MSI installation, SCM startup,
public configuration and the client's real loopback RDP connection. Failure
is now the fixture's worker-image selection, before resource tests. Actual
MSI uninstall, native/runtime retirement, account/settings restoration and
empty/detached VHD cleanup all pass. The identity fixture now selects the one
service-descendant worker by name, then reads its exact image with the WMI
privilege option required for [Win32_Process.ExecutablePath](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process).
It accepts only the same installed local-drive path, including normal Windows
case/extended-prefix forms; SID and exact worker hash checks remain mandatory.
A bounded PID/parent/fixed-name snapshot records future selection failures,
without command lines, environment or arbitrary executable paths. This is not
yet accepted connected disk-full testing.

Attempt `41019037273` passes exact worker PID/image/SID/hash verification and
complete cleanup, then refuses the fixture's runtime-name assertion. The SDK
creates `worker-<RuntimeOwner.id>-1-<nonce>`; that private lifetime-owner UUID
is independent of the HTTP session ID. The corrected fixture still requires
the service lock and exactly one schema-1 worker directory in its fresh
exclusive runtime, after verifying the single real native worker. Pure tests
reject missing/extra entries and malformed/traversing names. A separate fixed
failure-phase field preserves client failures even after service-stop cleanup.

Attempt `41020419951` reaches connected HTTP exhaustion and fails its observation
helper; complete installed/account/volume cleanup passes. The native protected
directory grants data access to LocalService and SYSTEM, not the administrative
HTTP client. A separate static SYSTEM task now observes only the admitted
worker's `.uploads` count/size, without reading content or changing its ACL.
It has at most 24 ordered snapshots, bounded JSON/files/enumeration/time and
verified private-Node image/SYSTEM identity. Atomic request/reply files live in
the controller context, outside the bounded volume, and contain no credentials.
The producer still waits for 393216 staged bytes before EOF, checks empty staging
after each 507, and requires every observation plus joined task cleanup. The
task is stopped/unregistered before installed-service retirement. Its final
count/size receipts are retained as separate evidence. Unstructured PowerShell
warnings/progress are suppressed on the private JSON pipe; terminating errors
still refuse. This fixes test observation, not production/session permissions;
actual resource acceptance remains open.

Attempt `41022399807` passes all twelve connected HTTP 507 cases, confirming
4718592 pre-EOF staged bytes and all 24 staged/empty snapshots; observer task
and PID retirement pass. The real RDP task receives Windows disk-full status,
but the independent zero-free-space assertion fails. The MSI-only task now
explicitly exhausts a remaining allocation tail through RDP with bounded 4 KiB
and one-byte append attempts. Its extra tail acknowledgements require an
explicit receipt-parser mode; the original aligned 64 KiB prefix and default
lab profiles keep their contracts. Host physical free space must still be
exactly zero. A numeric sample is retained before that assertion. RDP retirement
also failed at native `logoff`; native text is now discarded with its exit code
retained, while owned-session absence, profile unload, account removal and RDP
settings restoration remain required. This source correction is not accepted
until the complete live case and cleanup pass.

Attempt `41025154912` passes the complete installed MSI/native/real-RDP file
scenario: 13 HTTP 507s, independent physical free space zero, Windows error 112,
757760 verified partial bytes, recovery/Unicode/read-only/quota/stale-ID checks,
74 exact native package files and native PID exit. MSI, observer and volume
retirement pass; RDP retirement still fails reading the automatic
`LASTEXITCODE` variable. The helper now waits on an explicit, owned logoff
process handle with a deadline and captures its numeric exit code directly.
Its bounded native output is discarded, never uploaded; fixed admission/result
metadata records executable presence, bitness and byte counts. Final session,
profile, account and RDP-settings conditions remain unchanged. Overall MSI
acceptance remains false until that final cleanup passes.

Run `41027120795` passes that final cleanup with native logoff exit zero and
zero output bytes, owned account/task/settings retirement, empty runtime,
successful MSI uninstall and empty/detached private VHD. Its exact public MSI
and native hashes, 13 HTTP 507s, zero physical free bytes, verified 757760-byte
partial file, 74 native package files, Unicode/chunked/read-only/quota/stale-ID
and native PID proofs are saved separately from all earlier failed attempts.
The fixture now also runs automatically after successful installer publication
or publication resume, using the exact published version; this is qualification
of public bytes, not a prepublication gate. Existing-source checks and their
candidate/installer gates remain separate. Already-published plan skips do not
republish or launch this post-publication job. The helper's dependency paths
also trigger the isolated development workflow. No new product version or
archive is produced by these test/documentation changes.

## Prepared Windows managed-file application check

Current accepted public **0.6.0** profiles and their scope are recorded in
[managed files](FILES.md#accepted-managed-file-capabilities). The additional
[Windows-server disk-full check](FILES.md#connected-windows-server-rdpdr-disk-full-acceptance)
uses `--owned-windows-managed-files-full --prepared-powershell` and adds
`fullRoot` to the private bootstrap below. It requires an admitted fresh private
1 MiB Linux tmpfs and the same operator-confirmed window and certificate;
the helper does not provision a mount. Ordinary filesystems refuse before any
worker or remote input. The earlier source checkpoints below remain historical.

The final corrected public source `95c9fc5` passes foundation run
`40879990951` and GCC 8.3 foundation run `40879991017`, including the sanitizer
job. A separate fixture correction in `d5af615` handles legal transient codec
admission with the existing bounded busy retry. GCC 8.3 linked CTest passes
43/43 plus 25 stream repeats; Clang 18 ASan/UBSan passes 25/25 on a Linux
filesystem plus 25 repeats each of stream and seqpacket. A Windows bind mount
cannot provide the required exclusive-rename primitive and is not Linux
filesystem acceptance. Both corrections are merged with the feature into
local shared `master` at `aa4b7de`; the original failed checkpoints below are
retained as history.

The first hosted source checkpoint `85b0b2b` passes both Linux foundation
compiler jobs and Windows foundation, but its sanitizer job cannot link
`ipc-fuzz`: the new drive-name validator, path validator and file-record codec
were missing from that target. The separate `fix/managed-files-fuzz-link`
branch adds those instrumented sources, keeps warning-as-error policy, directly
fuzzes file commands/results and seeds maximum schema-15 configuration plus
full 64 KiB file chunks. The IPC input bound is 65600 bytes (24-byte header,
40-byte metadata, 65536-byte chunk); timeout and RSS limits remain unchanged.
A local Clang 18 ASan/UBSan run completes 160539 executions in 21 seconds with
the new corpus; hosted acceptance of the correction is still required. The
failed job log is retained separately.

The separate `test/windows-managed-drive-application` branch prepares the
remaining actual Windows RDP-server application check for SPECIFICATION 2.8.
`scripts/test-windows-managed-files.mjs` requires both
`--owned-windows-managed-files --prepared-powershell`. Run it only after the
operator opens and confirms an empty active PowerShell window with an English
keyboard in the dedicated Windows VM. It sends one fixed command through
physical US-layout keys into that window; it does not launch
an application, change execution policy, or use either OS clipboard.

The runner consumes one bounded JSON record over private stdin, never argv or
environment: `id` (32 lowercase hex digits), private IPv4 `host`, integer
`port`, `testCertificateConfirmedByUser: true`, approved `fingerprint`
(`sha256:` plus 64 lowercase hex digits), `credentials`, `workerPath`,
`workerSha256`, and `ipcTransport` (`framed-pipes` or
`unix-seqpacket-rws1`). The worker must resolve beneath this checkout's `build`
directory and match the supplied hash. Obtain approval for the VM's certificate
before setting the confirmation field. A changed certificate is refused.
Keep lab credentials only in the authorized ignored local profile and send
this bootstrap through the parent's pipe. Do not paste a credential-bearing
record into a terminal command or save it as an artifact.

Through the real HTTP/native/RDPDR path the runner uploads its fixed owned
PowerShell script and seeds into session-managed RW/RO shares. The remote
script attempts three forbidden RO mutations, creates a 131111-byte synthetic
Unicode file, truncates it to 65599 bytes, moves it into a directory and writes
a bounded scalar receipt. The HTTP client verifies the exact file bytes and
uploads a new chunked 131111-byte file. A nonce-bound continuation lets the
remote application verify it and remove only the enumerated owned entries,
including its script. The client verifies the retained RO seed, stale ID/owner
refusal, final receipt deletion, captured worker PID exit and empty runtime.
The Windows profile keeps `xrdpLegacyDelete: false`.

Ten local Windows helper controls pass, including PowerShell parsing,
independent command reconstruction, pattern/hash, bounded file reading and
command/refusal checks and bounded failure-receipt parsing. The updated Linux
UID1000 / no-capabilities helper repeat passes eight controls with two
PowerShell-specific skips.
These controls do not connect to RDP or prove remote application acceptance.
The former shared Windows lab is in use by other users; a new dedicated VM
is now reachable with its separately approved certificate.

The `fix/managed-drives-windows-announce` candidate now passes the complete
owned Windows RDP-server application scenario with the MSVC Release worker
`071a1fa6284797c17f8c06542a33fbe1f2496268a767429c24f4fdc4522f6857`.
The exact Unicode 65599-byte rename/readback, 131111-byte chunked upload,
three RO refusals, owner/stale-ID refusal, captured-PID exit and empty runtime
all pass. Audio remains off with zero audio events; the XRDP delete quirk
remains false. The certificate is separately operator-approved.

Both GCC 8.3 Linux carriers also pass the same real Windows application
scenario with worker
`14d4aead81e1ff016fc55709c327d074c94a6e687f25beb26b2f4837d3035250`.
The Windows worker additionally passes the whole scenario with two distinct
64-byte full share names; short PreferredDosName aliases do not silently
reduce the full-name field. The actual pinned SDK test now exercises a
64-byte name too. XRDP uses the preferred alias, so both local and SSH
fixtures use names of at most seven bytes.

Initial runs exposed missing RDPSND dependency, zero-length root CREATE,
standard Windows NO_RECALL/no-follow opens and a nonterminated preferred DOS
alias. These now have native regressions; the focused suites pass 21 drive
cases / 1458 assertions and 82 audio cases / 496167 assertions. Full Windows
foundation / linked CTest passes 25/25 and 42/42; GCC 8.3 Release passes 43/43.
The strengthened SDK-name test passes again on both compilers. Full Windows
`pnpm check` passes 1303 / 73 skips / 1376 total, with all three native,
file-service and managed-drive selectors enabled. ASan/UBSan passes all five
changed-owner/IPC/safe-root/recovery suites.

The current workers additionally pass all six actual HTTP/native/XRDP profiles
against Astra and RED OS (Windows and Linux RWS1/framed on each). Both distro
component repeats pass 95 cases / 8704 assertions with explicit GCC 8.3 /
GCC 11 scope. Private payloads are removed only after full owner/hash inventory
verification. The source/binary/log bindings are retained in
`build/current-validation/windows-managed-interop-acceptance.json`.
These source checks remain separate from exact published-package and installer
acceptance. No whole Stage 7 checkbox is accepted by these passes.

The fixes are committed as `5032fec`, integrated into `feature/managed-drives`
at `96a1435`. A fresh package repeat now passes four independent projects on
each OS: five Windows and ten Linux native-file profiles, strict TypeScript,
producer-before-EOF streaming and captured-PID cleanup. These installed package
tests use synthetic RDP state, separately from the actual desktop matrix above.
Their current runtime archives are development 0.5.0 candidates, never
replacements for published 0.5.0. Full Linux UID1000 / no-capabilities
`pnpm check` passes 1275 / 124 skips / 1399 total on the same source checkpoint.
Two earlier CMake admission controls failed because the consumer PATH omitted
builder CMake; both controls and the full run pass with the complete tool PATH.

Public source-only checkpoint `85b0b2b` is on
[`feature/managed-drives-source`](https://github.com/SensNyaha/freerdp-browser-bridge/tree/feature/managed-drives-source).
Its hosted foundation/compiler/fuzz and bundled jobs are separate pending gates;
the branch push changes no main ref, release tag or npm version. Local package
and full-Linux evidence is bound in
`build/current-validation/managed-interop-package-source-acceptance.json`.
The next minor upgrade seed is independently prepared in `b52396e`: 0.6.0
must upgrade v0.5.0, with 47 standalone/version controls passing. Product
manifests remained 0.5.0 at that checkpoint. The subsequent versioned branch
is tracked in [VERSIONING](VERSIONING.md).

Burst Unicode console input also failed during investigation. Physical
US-layout delivery is independently reconstructed by a unit control and used
only for this prepared lab fixture. The broader Unicode/console input gap
remains open. Failed runs also join the worker and clean their runtime.

## Versioned 0.6.0 managed-file checkpoint

Full versioned checks pass Windows **1306 / 73 skips / 1379 total** and Linux
**1278 / 124 skips / 1402 total**, with no failures or cancellations. Eight
independent installed npm consumer projects pass across the four adapters and
both OS builds, including strict TypeScript and actual native file operations
with synthetic RDP. Native versioned CTest passes Windows foundation 25/25,
Windows linked 42/42 and GCC 8.3 linked 43/43.

On the dedicated Windows RDP VM, the exact 0.6.0 Windows npm worker and the
installed Linux npm worker pass the prepared PowerShell file application
check: Windows framed, Linux RWS1 and Linux framed. A fourth run uses the
fully installed Windows npm API/node/protocol/runtime with two 64-byte share
names. Each verifies 131111-byte chunked upload/readback, a 65599-byte Unicode
rename/truncate workflow, three read-only refusals, foreign/stale authority
refusals, native PID exit and empty private runtime cleanup. Audio publication
and host OS clipboard access stay off. These are actual RDP application
profiles, separate from synthetic consumer controls.

Windows npm worker SHA256:
`8f5b7c6b70f77dbf8ea586cdc87d49032dc77f94161c003a499f63f8d9e333a5`.
Linux installed npm worker SHA256:
`c282e1e3ca304fee0c95dd38754231a1c7e954acbe7736c0ab5b3342ba853079`.
Linux CMake installation changes ELF RPATH; its pre-install build worker has
different bytes and is not substituted for npm acceptance. Local evidence is
retained in `build/current-validation/managed06-native-archive-worker-proof.json`,
the `managed06-rdp-*` and `managed06-win64-*` receipts and logs.

All ten archives are prepared. Four adapter README installation commands now
select 0.6.0; every compiled JS entry remains byte-identical to the accepted
consumer cohort. The four core archives and both native archives retain their
accepted bytes, so both production locks remain unchanged. The final archive
audit is `managed06-final-archive-code-equivalence.json`.

Candidate MSI, Windows ZIP, DEB, RPM and Linux TGZ are built. WiX cabinet
creation needs a temporary short workspace alias in this long Unicode checkout;
the alias is removed after building. Building a package does not accept its
installation: hosted Windows/Ubuntu and named Astra/RED OS 0.5.0-to-0.6.0
upgrades, versioned installed service/RDP checks, public npm/standalone delivery
and fresh public-byte verification remain open. No 0.6.0 stable tag or release
is claimed. File-manager clipboard and the full Stage 7/resource matrix remain
open.

The subsequent acceptance closes those named candidate gates: source CI
`40904652569` and GCC 8.3 CI `40904652331` pass on `d1d4446`; installed-service
run `40904699711` passes both OS jobs and combined verification, with publication
skipped. Exact local DEB/RPM 0.5.0-to-0.6.0 upgrades pass Astra/RED OS. Six
actual standalone file profiles pass (Windows ZIP, Linux TGZ and installed
DEB/RPM on each lab), including restored configuration and service removal.
Six additional exact installed npm profiles pass against both XRDP labs.
Native RED OS/GCC 11.4.1 linked CTest passes 43/43 with all 440 archived source
files verified; its initial receipt omitted a nested SDK probe from the hash
glob, so that one file was verified separately without rebuilding the already
successful tests. The GCC 8.3 SDK is reused; this is not a GCC 11 dependency
rebuild. The temporary candidate pointer is removed for stable delivery.
The [release report](RELEASE_0_6_0.md) retains exact archive hashes and open
public-delivery/full-Stage-7 boundaries.

## Installed Linux managed files and program permissions

`fix/standalone-linux-program-modes` addresses an installed-service failure
exposed by the first managed-file DEB run on Astra. Private build inputs had
JS mode 0600 and directories 0700. The portable launcher ran as their owner,
but the installed root-owned copy was unreadable to the separate
`freerdp-bridge` service UID. The journal's fixed error counters show EACCES;
the program path and package are absent after the failed fixture's uninstall.
The failed unit and installed-service logs are retained.

Linux staging now normalizes only its newly copied public program tree:
directories and previously executable files become 0755, other regular files
0644. The bounded walker refuses links/special files. Configuration remains
0750/0640 and runtime stays private; source files retain their original
0600/0700 modes. The real Linux staging regression fails before and passes
after. Independent DEB/RPM checks now verify program access modes in addition
to their existing exact-byte, owner, protected-config and package metadata
checks. Neither Node nor native/FreeRDP bytes change.

New unpublished DEB SHA256
`5f285b89ab6b61aaf698405beb379170f515f20c18016438caa10487f9f2c60b`
and RPM SHA256
`f0f60085ab808babd0807d966438aaa32494630748afcb8c3c992837867d6cfb`
pass actual clean installation and real JWT/HTTP/RDPDR file composition on
Astra 1.7.5 and RED OS 7.3 respectively. The ordinary systemd unit launches
private packaged Node/native as a non-root service account. Each checks
Unicode/binary CRUD, read-only shares, a chunked 131111-byte upload, 65599-byte
readback, owner/anonymous refusal, quota and stale-ID refusal, then observes
an empty runtime, removes the package and restores the public configuration.
Owned shares and payload/helper files are gone. The initial failed Astra
payload is separately removed by exact owner/inventory/hash checks
(129855444 bytes); unknown entries are retained.

The shared lab client gains an explicit installed-service mode; portable mode
passes again after the extension. The root helper accepts only an explicitly
selected fixed bounded file policy; eight pure Python controls and the Node
public-key/EOF-before-readiness control pass. Credentials and signing private
keys remain in memory/private IPC. These tests use local development archives
still marked 0.5.0, not published 0.5.0 packages; the Linux native runtime is
the preceding Debug-linked candidate. Production Release/versioned artifacts,
upgrades, Windows installed-service/RDP-server and hosted CI remain separate.
Full Windows `pnpm check` passes **1293 / 73 skips / 1366 total** with all three
native/file/managed-drive selectors enabled, zero failures/cancellations.
The final test-only DEB/RPM access-mode assertions pass independently; their
addition does not change the production inputs of the full check. Targeted
ESLint/Prettier and the two Node/eight Python helper controls pass. Native
sources/binaries are unchanged, so their accepted CTest scope is retained.
Both Windows and Linux portable modes also pass again after extending the
shared lab client. This accepts the named program-mode fix and the two local
Linux installed-service profiles; it does not accept the complete Stage 7 or
future public distributions. Logs and manifests use
`build/current-validation/managed-files-installed-*` and
`standalone-modes-*`.

The verified block `8a76da7` is integrated into `feature/managed-drives`,
including its installed-test branch. The shared delivery branch and published
distributions remain unchanged.

## Portable connected-file check and early refusal

The owned-lab runner `tests/fixtures/standalone-files-rdp-client.mjs` extracts
and verifies a selected portable archive, launches its actual private Node
through the normal launcher, then uses JWT and the packaged HTTP API for real
RDPDR file transfer. It never installs a synthetic backend. Credentials arrive
through bounded private stdin and reach the session only in the POST body and
private native IPC; the disk configuration contains only public keys/policy.
Only the already authorized lab certificate fingerprint can be accepted.

Initial unpublished Windows ZIP and Linux TGZ runs pass both directions,
Unicode CRUD, read-only refusal, JWT principal isolation, stale-ID refusal and
launcher/runtime cleanup against Astra and RED OS in named passing runs.
The initial Windows/Astra run and one subsequent repeat fail during an eager
2097153-byte quota probe. Those failures remain retained and prevent claiming
stable packaged acceptance. Adding phase diagnostics alone does not fix them.
A separate plain Node HTTP server with immediate 413 and no bridge reproduces
the reset (one fetch failure in 30 requests; two incomplete `node:http`
responses in 60). This reference distinguishes the transport race from RDPDR.

`fix/file-upload-early-refusal` adds a bounded, unbuffered discard before the
original header-admission error: at most 4 MiB and 250 ms, with no native
mutation. Unknown/large/Expect framing and slow peers keep their refusal.
A saved real HTTP/native regression first fails with `ECONNRESET`; after the
change its forty declared oversized requests all return a complete 413 with
unchanged native call count. Four unit controls cover listener release,
framing/size refusal, stalled production and peer failure. Windows HTTP plus
five adapter checks pass **14/14**; Linux GCC 8.3 checks including both IPC
transports pass **25/25**. Native/compiler inputs are unchanged.

Fresh Windows ZIP SHA256
`8cb68f1f09b6633f0d66eb565bd32c7cc48544d0194981d61491ca4955694fdd`
passes five sequential Astra runs and one RED OS run. Linux TGZ SHA256
`1f17eb42062cb3cc9e6985a4e814f3498196675957f2eee9e7d4fb6ecbf02c3c`
passes Astra and RED OS. All eight use private packaged Node, the normal
launcher, JWT, actual RDPDR and exact archive inventories. They verify binary
readback (65599 bytes), a chunked 131111-byte upload read remotely, Unicode
rename/truncate/delete, three read-only refusals, foreign-owner and anonymous
refusal, a complete 413 for the 2097153-byte declared quota probe, stale-ID
refusal, launcher exit and an empty runtime. Installed-service acceptance in
this earlier checkpoint and future Release/public archives remain separate;
the newer Linux installed checks above bind their own package hashes/scope.

The Linux install step relocates the ELF RPATH: its packaged worker hash is
`1076619b74c7e3ca35fe456be55b4a68aad9406287dc0ef0728733533cb04612`;
the preceding build-directory worker was `88fba1bc...`. The archive's manifest
and each new run bind the installed bytes; no byte-equality claim is made
between pre-install and relocated ELF. Windows packaged worker remains
`c1366b02...`. Detailed source/archive/log bindings and preserved earlier
failures are in `build/current-validation/early-refusal-acceptance.json`.
Full Windows `pnpm check` now passes **1287 / 78 skips / 1365 total**, zero
failures/cancellations. Five additional skips versus the preceding full run
come from an omitted `BRIDGE_MANAGED_DRIVE_TEST_BINARY_DIR` selector. Those
exact five cases are then selected explicitly and pass **5/5** on Windows;
the corresponding Linux profiles pass **10/10** through both IPC transports.
The bundled-native workflow now sets that selector alongside the existing
native/file selectors, so hosted runs select these controls. This CI-only
delta passes formatting; hosted execution remains separate. No production
input changes after the full check. The bounded refusal fix passes its named
local/compiler/native/portable-RDP scope; full managed-drive/public release
and Windows installed-service acceptance remain open. Newer named Linux
installed results are recorded above.

The verified block is committed as `6f6d5a9` and integrated into
`feature/managed-drives`, including the portable test branch. The shared delivery
branch and public 0.5.0 distributions are unchanged.

## Installed package checks

The test branch `test/managed-files-package-consumers` extends the four existing
independent npm installation checks with native file streaming and strict
file-policy/drive TypeScript examples. Windows passes **4 installed projects /
5 file profiles**, including NestJS on both host frameworks. The first Fastify
attempt correctly refuses a test example that puts `prefix` inside the plugin
options type; the corrected example passes. The final recovery fixture also
checks HELLO against the installed adapter's package version rather than a
hard-coded 0.5.0, and passes again in all four installed Windows projects.

Linux GCC 8.3 passes the complete aggregate command: **4 installed projects /
10 file profiles**, with both IPC transports and all five host variants. Its
fresh native archive has SHA256
`fe793c11d3bf805b83fef4b4d4972b1f58849a6b150b6a2c03ab2d3e6d143020`;
Windows uses
`96a6f225eb7f21eccdcb086a1c6d47aecc03fe3085739249eb956b515c841b70`.
These are unpublished development archives. Linux uses the current Debug linked
test build; Windows uses the compatible Release SDK/build. Future release
artifacts still require their own Release builds and exact-archive checks.
Linux preparation attempts that lacked workspace links/browser assets are
retained as failed setup records; the final complete run succeeds. The
tooling unit checks pass **2/2**, and the changed JavaScript passes ESLint and
Prettier. Native/production code is unchanged in this block, so its earlier
full `pnpm check` and CTest evidence retains its original scope.

The [complete command and evidence scope](FILES.md#installed-npm-consumer-checks)
are saved in source and wired into the bundled-native workflow. These use local
unpublished development archives, with actual native files/IPC and synthetic
RDP state. Hosted CI, exact future published npm archives, standalone installers
and current real-RDP/platform
repeats remain open. This test-only block does not change the native candidate
or accept the full managed-drive feature.

## Standalone managed-file startup checks

`test/standalone-managed-files-startup` extends the existing portable acceptance
test with file mode, mandatory from 0.6.0. For a local unpublished 0.5.0
development candidate, set `BRIDGE_PORTABLE_MANAGED_FILES=1` explicitly alongside
`BRIDGE_PORTABLE_TEST_ROOT` before running
`node --test tests/packaging/standalone-portable.test.mjs`.

Both Windows and GCC 8.3 Linux portable candidates pass after relocation, using
their own private Node and native runtime. The server reads a trusted file
policy, creates an actual native `.data`/`.uploads` sandbox and reaches the
unapproved local TLS certificate prompt. File requests require JWT, another
principal receives 404, and the owner receives 409 `FILES_NOT_CONNECTED` for
listing and a 131111-byte binary upload. Both trees remain empty. Launcher
shutdown joins native cleanup and leaves no runtime entries; the existing
recovery, unchanged-byte inventory and unsafe-runtime refusal controls pass.
No certificate is approved and no RDP desktop or connected file transfer is
claimed by this test.

Windows ZIP SHA256 is
`eb3dcd5faa1a54aa797bbc5f710019dd24928ba2a5c1b54870f8093e91cdbaaa`;
Linux TGZ SHA256 is
`aa0d6e61e6a91a3e2e15e654a8e0e0d2365cf13135e6afe42c2b6a9e3f9762ca`.
Each is built from its five verified local core/runtime npm archives with
`candidateOnly: true` in an isolated source copy. The project's production locks
and published 0.5.0 artifacts remain unchanged. Linux uses the current Debug
linked test runtime; release builds still need their own exact-artifact tests.
Windows first stopped before extraction because PowerShell read a UTF-8 JSON
path in its legacy encoding; explicit UTF-8 fixes the invocation, without a
product change. Logs are `managed-files-standalone-portable-windows-v2.log`
and `managed-files-standalone-linux-build-test.log` in `build/current-validation`.
Complete connected-file, installed-service and future public-artifact
acceptance remains open.

## Current functional work

The candidate on `fix/windows-managed-delete` joins Windows pending namespace
deletion using the same verified DELETE handle. An independent shared-delete
reader regression fails against the old backend and passes **22 assertions /
1 case** after POSIX disposition. Actual HTTP diagnostics show a further case:
successful extended file disposition followed by Win32 error 145 for a directory
with zero visible children. The candidate permits at most eight additional
disposition attempts within a 2 ms monotonic window, only after bounded empty
enumeration. Visible children, unsafe/failed enumeration and other failure
classes retain their immediate refusal. No path reopen, child deletion, HTTP
retry or IPC timeout change is introduced. [Policy and remaining limits](FILES.md#windows-namespace-deletion).

The completion-policy controls pass **67 assertions / 3 cases**. Windows
foundation/linked CTest passes **25/25 + 42/42**, GCC 8.3 **25/25 + 43/43**,
and ASan/UBSan **4/4**. The original eighty Fastify lifecycle sequences and
five adapter variants pass **85/85**, without HTTP deletion retries. The saved
`tests/integration/files-frameworks.test.mjs` covers HTTP, Express, Fastify and
both NestJS adapters with real native files and synthetic RDP state; the Linux
HTTP/file/runtime subset including both transports passes **100 / 4 skips /
104 total**. Full Windows `pnpm check` passes **1285 / 73 skips / 1358 total**.
After that full check, the new adapter test gains a stricter producer barrier
and explicit PID-exit assertion: the remaining body is withheld until the first
native write is dispatched. The affected Windows **5/5** and Linux **10/10**
cases pass again. This is a test-only delta; production/native and other test
inputs are unchanged, and the full-check receipt retains its preceding test
body hash. Detailed bindings are in
`build/current-validation/managed-delete-window-local-evidence.json`.

Earlier POSIX-only HTTP failures and the kernel/physical/logical diagnostic
records remain in `build/current-validation/managed-delete-*`. A passing
fifty-session diagnostic alone did not erase those failures. Temporary scalar
stderr instrumentation is removed from the candidate. Source-v2 contains
790 compiler/context inputs; current native inputs and binaries are pinned in
`managed-delete-window-candidate.json` and `managed-delete-window-linux-binaries.json`.
The first source-v2 Docker run failed because Docker Desktop had stopped; the
same checks pass after restoring it. After the labs restart, RED OS 7.3 /
GCC 11.4.1 component repeats pass **95 cases / 8704 assertions** against the
same 48 native inputs. Its private test directory is removed only after exact
owner/inventory/SHA256 checks (54 files / 3643927 bytes). The new test driver's
first attempt calls an unavailable Paramiko SFTP method; the corrected bounded
SSH `os.statvfs` query preserves the 64 MiB free-space guard. Current Windows
worker and Linux framed/RWS1 workers also pass the complete real HTTP/RDPDR
composition against RED OS XRDP: 131111-byte remote creation, truncate/Unicode
rename and 65599-byte HTTP readback, a separate chunked 131111-byte HTTP upload
read remotely, three read-only refusals, remote deletion/stale-ID refusal,
mandatory captured-PID exit and disappearance of the owned shares. Worker
hashes remain the current `c1366b02...` / `88fba1bc...` candidate. RED OS's
certificate is bound to its previously approved pinned SSH host; the actual
prompt fingerprint must match it. Drivers now capture PID before close, so the
exit assertion cannot be skipped because close cleared the PID. These repeats
use actual workers, not synthetic RDP state. Astra repeats now also pass:
**87 cases / 8634 assertions** for the file component plus **8 / 70** for
runtime recovery, followed by the same three real HTTP/RDPDR profiles.
Its four payload files are removed after exact owner/hash checks. Both platforms
therefore pass **95 cases / 8704 assertions** with different compiler profiles.

The current two-server crash/isolation repeat also passes all three worker
profiles: nine actual RDP connections, two concurrent sessions per profile,
independent quota/namespace authority, worker death during an unfinished upload,
continued remote sibling reads and a real replacement connection. Every owned
share disappears and each Node driver exits zero without stderr. Together with
the six single-server composition profiles this is **15 actual connections**
against the current worker hashes. Evidence is bound in
`managed-delete-window-platform-rdp-evidence.json`; the local native/full-check
receipt retains its original scope. The namespace-deletion fix has its named
integration checks; Windows RDP-server and complete managed-drive/public npm/
installed-standalone gates remain open. No release or complete managed-drive
acceptance is claimed.

The named namespace fix `2b3d01d`, installed-package checks `729a47f` and
portable-startup checks `a06eb8e` are now integrated into `feature/managed-drives`.
The feature remains unreleased; this integration does not merge it into the
shared delivery branch or complete the remaining Stage 7/product gates.

The latest API block makes the Stage 7 file-clipboard deferral explicit through
public HTTP capability **`clipboardFiles: false`**. Existing enabled-file
selection refusal is now specifically checked for all three directions: HTTP
returns immediate 501 `RDP_SETTING_NOT_IMPLEMENTED` before backend start or
configuration handoff; direct `NativeSessionWorker` refuses before process
start. No native HELLO/CLI bit, file clipboard messages or selection behavior
changes are introduced. [Contract and remaining requirement](FILES.md#file-clipboard-is-deferred).

Focused checks pass **2/2**. Full Windows `pnpm check` passes **1280 / 73 skips /
1353 total**, with no failures/cancellations. The Linux HTTP/Fastify/file/runtime/
capability subset passes **90 / 4 skips / 94 total**, including existing native
file tests through both transports. The four skips are the foundation-only
refusal case on a linked worker, two unselected tmpfs cases and the distinct-UID
recovery case. An earlier test assumed asynchronous 202/failure; only its
expectation was corrected to the existing synchronous 501 and the failed log
is retained. Native inputs/binaries remain identical to `f641efd`, whose CTest
and platform results keep their earlier scope. Source, client archive, binaries
and check bindings use `build/current-validation/managed-files-deferred-acceptance.json`.
Only the TODO's explicit-deferral alternative is accepted; file-manager copy/
paste, the complete managed-drive feature and packaged release remain open.

The latest integration checkpoint verifies two simultaneous actual RDP sessions
to Astra 1.7.5 and RED OS 7.3 through production HTTP, authentication and
`NativeSessionWorker`. Windows framed IPC and GCC 8.3 Linux framed/RWS1 each
pass separate worker PIDs, session quotas and opaque IDs, third-session refusal,
remote Unicode readback and sibling survival after a staged-upload worker crash.
Joined cleanup releases capacity for a **real replacement RDP connection**;
the sibling stays connected and readable through its redirected drive before
the crash, after it and after replacement. Final close joins all three workers
and removes their runtime directories and unique remote shares.
[Scenario, certificate trust and limits](FILES.md#two-server-session-isolation).

The final three profiles pass **9 actual connections**, with **2 concurrent
sessions per profile**. An earlier Windows pass is retained separately. No
production/native/test source changes follow `346b040` / `f641efd`; their full
checks retain their recorded scope. The client archive matches 180 local built
SDK/protocol/API files. Helper, source, binary and terminal/cleanup evidence is
bound in `build/current-validation/managed-files-isolation-acceptance.json`.
No V1 CPU/RSS/latency, Windows RDP-server or packaged feature acceptance is
inferred. Those remaining gates still prevent feature merge/release.

The preceding test block saves bounded real HTTP/native disk-full automation in
`tests/integration/files-disk-full.test.mjs`, sharing the existing actual file
worker fixture with the HTTP regression suite. Framed IPC and RWS1 each pass
twelve real ENOSPC/HTTP 507 attempts on a disposable 1 MiB tmpfs. Native write
bytes exceed the 8 MiB quota across those failed transfers, while abort returns
space/entries and a fresh 64 KiB upload/download/delete still passes. No RDP
connection is claimed; only its connected state is synthetic.
[Invocation, safeguards and scope](FILES.md#bounded-http-disk-full-acceptance).

The ordinary Linux file/HTTP/runtime subset passes **71 / 3 skips / 74 total**,
followed by the two enabled tmpfs cases **2/2**. Windows HTTP regression passes
**8 / 2 skips / 10 total**. An unsafe-root control verifies refusal at the
filesystem guard without allocating a runtime or changing root entries; its
first wrapper had an obsolete source-line expectation after formatting, now
derived from the saved source. Linux foundation CI now provisions a private
1 MiB tmpfs and runs both cases automatically after ordinary checks, then
unmounts it. Workflow formatting and the exact bash step syntax pass; hosted
execution of this changed workflow remains pending. Lint/format and diff
checks pass. Production and
native inputs/binaries remain those accepted at `f641efd`; that commit's full
`pnpm check` and native/platform/RDP checks retain their original scope.
Evidence is bound in `build/current-validation/managed-files-http-full-acceptance.json`.
Windows/connected-RDP disk-full, complete resource/isolation and packaged
acceptance remain open.

The preceding implementation selects `MAXIMUM_ALLOWED` after resolving each
entry's share and virtual attributes. An existing read-only entry on a writable
share now opens with read/basic-metadata authority, without data write, append,
rename or delete rights. Explicit forbidden rights remain refused even when
maximum access is selected. Sharing checks and future operations use the fixed
granted mask, so clearing the flag cannot upgrade an existing handle. No
RDPDR/private IPC layout or host ACL changes are introduced.
[Rights and limits](FILES.md#session-file-metadata).

Both new wire regressions fail against the preceding backend and pass after
the change (**117 assertions / 2 cases** on Windows). Full Windows foundation
CTest passes **25/25**, linked **42/42**, GCC 8.3 foundation **25/25**, linked
**43/43** and ASan/UBSan **4/4**. File tests pass **9234 assertions / 81 cases**
on Windows and **8550 / 83** on GCC 8.3 and actual Astra 1.7.5. Public SDK
DEVICE/IRP tests pass **1179 / 18**. Astra's runtime component remains **70 / 8**;
native GCC 11.4.1 on RED OS 7.3 passes combined file/runtime **8620 / 91**.
Remote payloads are removed by exact owner/hash checks. A first SDK-test build
exposed a signed `NTSTATUS` comparison; correcting the test's parameter type
keeps warnings-as-errors intact. Both failed compile logs are retained.

The rebuilt Windows/Linux workers repeat the actual HTTP/NativeSessionWorker/
Astra RDPDR scenario through all three worker/transport profiles. This is
general real-server regression: the actual `MAXIMUM_ALLOWED` selector is
proven by wire and public SDK tests, not an assertion that XRDP emitted it.
The unchanged Linux Node/file/HTTP/runtime subset passes **71 / 1 skip / 72
total** with the new worker. Full Windows `pnpm check` passes **1278 / 71 skips /
1349 total**, with zero failures or cancellations. Source, binaries, logs and cleanup bindings use
`build/current-validation/managed-drives-maximum-allowed-acceptance.json`.
Windows-server, complete read-only/resource/isolation and packaged feature
acceptance remain open; the Windows server currently refuses RDP/SSH connections.

The preceding acceptance checkpoint verifies the complete production HTTP /
NativeSessionWorker / actual Astra XRDP/FUSE path. Windows framed IPC and
GCC 8.3 Linux framed/RWS1 all pass HTTP uploads observed through remote drives,
remote Unicode/binary CRUD downloaded through HTTP opaque IDs, exact headers,
chunked upload, cross-principal/unauthenticated refusal, stale locator refusal,
three read-only mutation refusals and joined HTTP session/PID/runtime/share
cleanup. Certificate approval uses the real control WebSocket and the existing
approved fingerprint. No synthetic RDP state, direct native file shortcut or
new production source/binary is used by this checkpoint.
[Scenario and remaining limits](FILES.md#actual-http-and-astra-rdp-composition).

The worker/client source is unchanged from `d6df964`; its full Windows
`pnpm check` **1278 / 71 skips / 1349 total**, native CTest **25/25 + 42/42**
and Linux file/HTTP/runtime **71 / 1 skip / 72 total** retain their exact scope.
Logs, helper input/source bindings and final binaries are recorded in
`build/current-validation/managed-files-http-rdp-acceptance.json`.
Windows-server, HTTP disk-full, remaining share-policy/resource/isolation and
packaged acceptance still prevent a full managed-drive feature merge/release.

The preceding block joins verified managed-file cleanup into worker retirement
while the Node server remains alive. It preserves the startup cohort, joins
worker/IPC/probes, closes the session's ownership endpoint and invokes one
bounded native helper for that directory. Unknown content, changed helper,
unsafe root or uncertain completion preserve both files and session capacity.
Manager waiting deadlines do not release the slot before joined cleanup.
[Automatic retirement contract](RUNTIME_RECOVERY.md#automatic-worker-retirement-with-a-live-node-server).

Actual registry tests crash a file worker while preserving a live sibling,
hold recovery past both manager waiting deadlines, verify admission refusal,
then confirm cleanup, sibling readback and replacement admission. Negative
cases preserve a committed **131111-byte Unicode file**, a **65536-byte staged
upload** and capacity. The HTTP case loses a backend completion after actual
native write/worker termination; the real file deadline revokes authority,
returns fixed errors and permits replacement under a one-session limit.
Its RDP state is synthetic. The Linux subset passes **71 / 1 skip / 72 total**
with framed and RWS1 transports. Windows focused native-file/registry cases
pass **5/5**, and the focused HTTP lost-completion case passes **1/1**.
The full Windows `pnpm check` passes **1278 / 71 skips / 1349 total**, with
zero failures or cancellations and the current linked worker selected.

Separate connected Astra XRDP/FUSE crash runs pass Windows framed IPC and
Linux framed/RWS1. Before the crash each verifies Unicode/binary remote CRUD,
three read-only refusals and native readback. Committed remote/host files
and a staged upload are reclaimed; the old native file authority is refused,
Node remains alive, a replacement lifecycle worker starts and joins, and the
owned remote shares disappear. This does not claim an HTTP/real-RDP composition
or a second connected RDP session. The first helper attempt raced an explicit
close with crash observation; waiting for the actual failure event fixes the
test without changing production behavior. The failed log and subsequent
read-only confirmation that its owned shares vanished remain recorded.

Native source and binaries remain those accepted at `9ad453d`; rerunning the
Windows foundation and matching-CRT linked CTest passes **25/25** and **42/42**.
No new compiler/platform component result is inferred from the Node changes.
Source, client archive, binaries, crash profiles and checks are bound in
`build/current-validation/managed-files-live-retirement-acceptance.json`.
Full HTTP/real-RDP composition, Windows-server, remaining share-policy/resource
and packaged acceptance stay open. This is still the unreleased feature branch.

The preceding block adds verified native cleanup of declared managed-file trees
after both the Node owner and worker have died. A private, immutable 56-byte
ownership declaration binds the runtime and managed-container identities.
Bounded inventories are checked twice before deletion; unknown runtime siblings,
foreign or linked content, live owners and uncertain ownership retain the tree.
Normal shutdown removes the declaration after joining file users and removing
the managed container. [Format, trust boundary and recovery API](RUNTIME_RECOVERY.md#claimed-managed-file-trees-unreleased).

Real Node/native tests hard-kill owners with a **131111-byte committed Unicode
file** and a **65536-byte pending upload**, verify live-owner and unknown-sibling
retention, then reclaim the declared tree. Parent-only kill separately verifies
native self-cleanup. Windows framed IPC passes **2/2** focused cases; the Linux
file/HTTP/runtime subset passes **63 / 1 skip / 64 total** through framed and
RWS1 transports. These crash tests do not establish connected-RDP crash cleanup.

MSVC foundation passes **25/25**, matching-CRT linked **42/42**, GCC 8.3 foundation
**25/25**, GCC 8.3 linked **43/43** and ASan/UBSan **4/4**. File cases pass
**9117 assertions / 79 cases** on Windows and **8443 / 81** on GCC 8.3 and actual
Astra 1.7.5. Astra's separate runtime component passes **70 / 8**; native GCC
11.4.1 on RED OS 7.3 passes combined file/runtime **8513 / 89**. Completed remote
test payloads are removed using their exact owner/hash inventories. The final
full Windows `pnpm check`, selecting the fresh linked worker for general native
regression too, passes **1274 / 71 skips / 1345 total**, with zero failures or
cancellations. An earlier full run's unchanged synthetic microphone startup
timeout remains recorded; its isolated repeat and final full run both pass.

The final Windows/Linux workers also pass graceful Astra XRDP/FUSE CRUD and
file-transfer regression, including three read-only refusals, joined cleanup,
both Linux transports and a Windows strict-default deletion refusal. This is
separate from the credential-free crash tests and distro component checks.
Source, binary, test and remote-cleanup bindings are recorded in
`build/current-validation/managed-files-recovery-acceptance.json`. Live-owner
file-fault retirement/capacity return, connected crash, full HTTP/RDP composition,
Windows-server and packaged acceptance remain open; this checkpoint is neither
a feature merge nor a release.

The preceding block adds trusted-host `files.xrdpLegacyDelete`, default false,
with private HELLO/initialize negotiation. It handles Astra XRDP's metadata-only
unlink and abandoned mkdir handle without granting data/rename/security access
or retiring active/alias handles. Regression tests fail before the mkdir fix
and pass after it. Empty wildcard scans also return a virtual self entry;
unmatched filters and traversal refusals retain their original behavior.
[Policy and interoperability limits](FILES.md#xrdp-legacy-delete-policy).

The final Windows and Linux workers pass actual Astra XRDP/FUSE Unicode/binary CRUD,
including file/directory deletion, empty final listing, native file transfer
in both directions, read-only refusals and joined cleanup. The identical
Windows binary separately passes the strict-default refusal control. Linux
passes both RWS1 and framed IPC with Docker init/reaping enabled. This is a
named Astra-server checkpoint; Windows-server, full HTTP/RDP composition,
managed-content orphan recovery and packaged acceptance gates remain open.

Current component checks pass Windows foundation **25/25**, matching-CRT
Windows linked **42/42**, GCC 8.3 foundation **25/25**, GCC 8.3 linked **43/43**
and ASan/UBSan **3/3**. File tests pass **8588 assertions / 69 cases** on MSVC
and **8002 / 71** on GCC 8.3, actual Astra 1.7.5 and native GCC 11.4.1 on
RED OS 7.3. The fresh Linux Node/HTTP/runtime subset passes **52/52** through
both transports. Completed platform payloads are removed using exact owner/hash
inventories. Source, binaries, actual RDP profiles and logs are bound in
`build/current-validation/managed-drives-legacy-delete-acceptance.json`.
The complete Windows `pnpm check` passes **1272 / 71 skips / 1343 total**,
with zero failures or cancellations. General linked regression still selects
accepted 0.5.0; the managed-drive tests select the fresh worker separately.

The preceding checkpoint corrects RDPDR clock-domain admission and XRDP CREATE rights
after actual Windows-worker to Astra XRDP/FUSE testing. The SVC gate now polls
its own callback clock; a clock exception fails closed. Recognized `WRITE_DAC`
open hints do not authorize file data, basic metadata, owner or security-IRP
mutation. The regression with actual XRDP mask `0x0016019f` fails before the
fix and passes after it. [Real-server scope and remaining DELETE mismatch](FILES.md#actual-xrdp-interoperability-checkpoint).

That checkpoint passed **25/25** on MSVC/GCC 8.3, **42/42** Windows linked,
**43/43** GCC 8.3 linked and **3/3** ASan/UBSan. File tests pass **8228 / 63**
on MSVC and **7707 / 65** on GCC 8.3. Public SDK tests pass **1106 / 17**.
The same file tests pass **7707 / 65** on actual Astra 1.7.5 and RED OS 7.3;
RED OS compiles them with GCC 11.4.1, while Astra runs the exact GCC 8.3
executable. Both completed payload directories are removed by owner/hash checks.
The rebuilt Linux worker/addon and unchanged Node file/HTTP/runtime subset pass
**48/48**, including both IPC transports. The actual Astra RDP test verifies
owned Unicode/binary create/read/write/truncate/rename and both transfer
directions, read-only refusals and joined cleanup. Its strict DELETE refusal
is an explicit negative control; it does not close the remote CRUD gate.
Source and evidence are retained under `build/current-validation/managed-drives-xrdp-*`.
The complete Windows `pnpm check` passes **1269 / 71 skips / 1340 total**.
Current source, binaries, platform cleanup and the actual strict-profile RDP
run are bound in `build/current-validation/managed-drives-xrdp-acceptance.json`.

The preceding block wires managed sandbox drives into the actual worker and
expands `thinclientDrives` through the same bounded descriptor validation.
The private managed-drive capability requires the initialized file owner;
CONFIGURE schema 15 carries only approved relative shares. Shutdown joins the
RDP thread and releases share/handle pins before owner cleanup. The selected
loader prevents automatic host-media and fake-audio additions while preserving
network settings. [Runtime selection and limits](FILES.md#runtime-selection-in-this-development-branch).

Current native checks pass **25/25** on MSVC and GCC 8.3, **42/42** for matching
Release-CRT Windows linked tests, **43/43** for Linux linked tests, and **3/3**
under ASan/UBSan (the cached SDK itself remains uninstrumented). The new actual
worker tests pass **4/4** on Windows and **8/8** on Linux across framed/RWS1:
audio off, PCM, Opus and immediate cancellation. These use a synthetic TLS
endpoint to verify strict certificate refusal and joined sandbox cleanup;
they are not remote file CRUD. The current Linux Node file/config/HTTP/runtime
subset passes **48/48** with no skips. Source/binary/log bindings are retained
in `build/current-validation/managed-drives-runtime-acceptance.json`.
Full Windows `pnpm check` also passes: **1269 passed / 71 skipped / 1340 total**;
the new current-worker cases are enabled explicitly alongside the existing
accepted-0.5.0 linked regression.
The earlier failed Debug/Release allocator run, initial runtime compile errors
and Linux addon PIC failure retain their logs. The PIC dependency is now built
correctly for the paired Linux worker/addon. Public drive capability, network
application CRUD, managed-content recovery and release acceptance remain open.

The preceding block implements session VFS basic metadata and restricts the SDK
IO capability response to implemented operations.
[Metadata, per-handle time controls and persistence boundaries](FILES.md#session-file-metadata).
Actual filesystem tests pass **8198 assertions / 62 cases** on MSVC and
**7682 / 64** on GCC 8.3, actual Astra 1.7.5 and RED OS 7.3 (native GCC 11.4.1).
MSVC/GCC 8.3 foundation CTest passes **25/25**; matching-CRT Windows linked CTest
passes **42/42**. Public SDK tests pass **998 / 15** on both compilers, including
actual RDPDR handshake/capability filtering and basic metadata IRPs over a
synthetic SVC host/server. ASan/UBSan passes **3/3**; the rebuilt Linux worker
and RWS1 adapter pass **35/35** HTTP/file/config tests in both transports.
These results do not establish network RDP, persistence/orphan recovery or
packaged-product acceptance. Public drive activation and Stage 7 remain open.
Both completed platform payloads are removed by exact owner/hash checks.
Evidence is bound in
`build/current-validation/managed-drives-metadata-acceptance.json`.
Full Windows `pnpm check` passes **1260 / 71 skips / 1331 total**. Existing
linked RDP regression still uses accepted 0.5.0; current metadata SDK tests and
fresh foundation HTTP tests retain their separate scopes. The retained initial
direct fixture run encountered delayed NTFS directory deletion and left four
empty private directories in the source root, causing ESLint's ACL scan to
refuse. They were individually verified and removed; the fixture now retries
only its exact known non-reparse directories for a bounded interval. Subsequent
direct case runs use the native build working directory. The final complete
workspace and native checks pass without disabling any assertion or relaxing
production filesystem checks.

The preceding SVC block bounds RDPDR writes before the SDK queue and retains
ownership through acknowledged or joined completion.
[Limits, SDK pool handling and acceptance boundaries](FILES.md#bounded-rdpdr-svc-component).
MSVC/GCC 8.3 foundation CTest passes **25/25**, and the complete matching-CRT
Windows linked CTest passes **42/42**. Foundation files/budget tests pass
**7809 assertions / 57 cases** on MSVC and **7313 / 59** on GCC 8.3 and both
actual Astra/RED OS labs (RED OS compiles with GCC 11.4.1). Public SDK tests pass
**972 / 15** on MSVC and GCC 8.3. ASan/UBSan passes **3/3**, including the
wrapper and actual pinned RDPDR plugin with synthetic SVC/server packets.
The real owned filesystem is used; these are not network RDP results.
Both platform payloads are removed through exact owner/hash inventories.
The rebuilt Linux worker/RWS1 pair passes the unchanged HTTP/file/config subset
**35/35** in both transports. Source and evidence bindings are retained in
`build/current-validation/managed-drives-svc-acceptance.json`.
Full Windows `pnpm check` passes **1260 / 71 skips / 1331 total**. Its existing
linked-RDP regression uses accepted 0.5.0; current SDK/SVC tests are the native
component checks above. These scopes do not establish current network drive or
installed-product acceptance.
The runtime does not yet install this component; public `drives` and Stage 7
acceptance remain unchanged.

The preceding block adds the internal RDPDR wire codec, public SDK device adapter,
context-bound device loader and scalar receive admission guard.
[Implementation and remaining activation requirements](FILES.md#rdpdr-codec-and-public-sdk-adapter-in-development).
MSVC foundation CTest passes **25/25**, with **7580 assertions / 51 cases** in
the file suite. GCC 8.3 foundation CTest passes **25/25**, with **7084 / 53**.
The public SDK adapter tests pass **122 assertions / 5 cases** on both compilers.
These use real filesystem operations and the SDK's public ABI with a synthetic
device manager/IRPs; they are not remote RDP acceptance. No runtime activation,
public capability or Stage 7 checkbox changes in this block.
The same foundation file suite passes **7084 / 53** on actual Astra 1.7.5
(exact SDK GCC 8.3 binary) and RED OS 7.3 (native GCC 11.4.1 build).
ASan/UBSan file and IPC CTest passes **2/2**. Both completed lab payloads are
removed through exact owner/hash inventories. The rebuilt Linux file worker
and RWS1 adapter pass the unchanged HTTP/file/protocol/config subset **35/35**.
Source and evidence bindings are retained in
`build/current-validation/managed-drives-wire-acceptance.json`.
Full Windows `pnpm check` passes **1260 / 71 skips / 1331 total**. The initial
run exposed a test race after peer cancellation: observing dispatch of native
`abort` did not establish receipt of its acknowledgement. The HTTP test now
waits for the public operation lease to be released, still requiring an empty
list and successful quota reuse. The complete check passes after that fix.
Full linked Windows CTest passes **42/42** in the SDK's Release profile. The
Debug-only CRT report control remains covered by the separate **25/25**
foundation run; it is not a Release test and was not suppressed.

The preceding managed-drive block implements scoped native shares and the drive
handle backend. [Current details](FILES.md#native-drive-backend-in-development).
Actual filesystem tests pass **3096 assertions / 42 cases** on MSVC and
**2640 / 44** on GCC 8.3 and both actual Astra/RED OS labs (RED OS compiles with
GCC 11.4.1). Full MSVC/GCC 8.3 native CTest passes **25/25**, and ASan/UBSan
file/IPC checks pass **2/2**. These are backend component results: FreeRDP
device/IRP wiring, remote CRUD and final linked/product acceptance remain open.
Full Windows `pnpm check` passes **1260 / 71 skips / 1331 total**, and HTTP/file
regression on a rebuilt Linux worker/packet pair passes **35/35**. Both owned
platform payloads are removed by exact owner/hash checks. Source and evidence
bindings are in `build/current-validation/managed-drives-backend-acceptance.json`.
The following HTTP and earlier component checkpoints retain their original scope.

Windows linked builds must match the CRT profile of their SDK. The cached
FreeRDP/WinPR SDK is Release, so use `-DCMAKE_BUILD_TYPE=Release` for linked
checks; foundation-only builds can use Debug independently. A full experimental
Debug linked run exposed allocator-boundary assertions in DVC/GFX/GDI fixtures
which exchange allocated objects with the SDK. PE imports confirm debug CRT
in the test and release CRT in the DLL. The failed log and import inventory
are retained as `managed-drives-wire-linked-windows-full.log` and
`managed-drives-linked-crt-mismatch.log` under `build/current-validation`.
Disabling CRT assertions is not a remedy; use a matching SDK/build profile.

The unreleased managed-drives branch now adds an opt-in
[streaming file API](FILES.md), with session-owned opaque IDs, native quota
ownership, upload cancellation and bounded download leases. This work extends
the accepted private file IPC at `e33f9ab`; it does not yet provide a redirected
RDP drive or managed-content orphan recovery. HTTP integration uses a real file
worker with synthetic connected RDP state. Source configuration for standalone
is implemented; installer/product acceptance remains open. The historical
component checkpoints below retain their original scope and numbers.

The HTTP block passes full Windows `pnpm check` **1260 / 71 skips / 1331 total**
and MSVC foundation CTest **25/25**. Focused file/config tests pass **27/27** on
Windows; Linux's combined file/protocol/config subset passes **35/35**, including
actual HTTP and both framed/RWS1 file transports with UID 1000, no capabilities
and no network. The unchanged native sources retain the preceding GCC 8.3 and
Astra/RED OS component evidence. Existing linked-RDP regression still selects
accepted 0.5.0; fresh linked file/RDP and installer tests remain open. Source
hashes, logs and boundaries are in
`build/current-validation/managed-files-api-acceptance.json`. The first Linux
run's missing temporary fixture directory is retained; the final run adds that
directory and uses the same application/test inputs. Stage 7 remains unchecked.

Image clipboard **0.5.0 is publicly delivered**, including ten exact npm
packages, five successful OIDC workflows, eight fresh registry consumers and
seven final standalone files. Public Astra/RED OS 0.4.0 upgrades pass.
[Acceptance](RELEASE_0_5_0.md#public-delivery). The next unchecked Stage 7 work is
the session sandbox/safe resolver, then streaming file APIs and managed drive
redirection. These file capabilities are not accepted by the image release.
Keep their implementation on a new feature branch and close each actual gate.

Implementation resumes the existing `feature/managed-drives` branch and its
internal `SafeRoot` foundation (`e94891b`), updated by merging accepted `master`
at `4d94bab`; it does not start a competing implementation. The original
[foundation report](history/iterations/401-450.md#iteration-406) is retained
verbatim in the historical volume. Browser file IDs, REST streaming, session
quotas, RDPDR CRUD and drive policy are still required before feature acceptance.

Port commit `6b7f96a` uses the existing borrowed-span compatibility API and no
longer requires C++20 `string_view::starts_with`. Its Linux syscall wrapper
uses the stable [Linux openat2 ABI](https://github.com/torvalds/linux/blob/v5.6/include/uapi/linux/openat2.h)
with the [x86-64 syscall number](https://github.com/torvalds/linux/blob/v5.6/arch/x86/entry/syscalls/syscall_64.tbl)
when old GCC 8.3 SDK headers lack the declaration. It retains the same
beneath/no-symlink/no-magiclink/no-cross-mount rules. It never substitutes an
ordinary pathname open if the kernel lacks the syscall. A Linux child-only
seccomp test returns `ENOSYS` for that syscall and verifies that both new roots
and all file-open modes return `unavailable` without changing the owned file.
This is an internal filesystem component, not an advertised runtime capability.

Current local component checks pass MSVC warnings-as-errors/static analysis
with **24/24** full foundation CTest and exact GCC **8.3.0** with **25/25**,
including the kernel-refusal test. The GCC build/test runs as UID 1000 without
capabilities or network in the prepared SDK. Receipts and source hashes are in
`build/current-validation/managed-drives-foundation-source.json`,
`managed-drives-windows-foundation.log` and `managed-drives-gcc83-ctest.log`.
The first GCC test command has a retained CRLF harness error after the complete
build; CTest alone then passes without a rebuild. Full Windows `pnpm check`
then passes **1232 / 71 skips / 1303 total**, zero failures/cancellations. Its
native lifecycle regression uses the unchanged accepted 0.5.0 linked worker;
the new filesystem library is tested separately above and is not yet linked
into that worker. The earlier workspace attempt pointed at the wrong worker
parent directory and was terminated; its failed log remains retained. The
source-bound component receipt is
`build/current-validation/managed-drives-port-acceptance.json`.
The user-approved, source/hash-checked platform payload then passes **152
assertions / 5 cases** on each actual lab: Astra 1.7.5/kernel 6.1.50 with the
GCC 8.3 SDK-built executable, and RED OS 7.3/kernel 6.1.180 with a fresh native
GCC 11.4.1 build. Each runs as UID 1000 in a new private test directory.
`managed-drives-astra-acceptance.json` and `managed-drives-redos-acceptance.json`
bind the source archive, executable and test log hashes. These are filesystem
component checks; they do not establish Node, RDPDR or installer integration.

Commit `b432f94` adds one-entry directory creation/removal
and atomic rename. It keeps parent directories anchored by handles, rejects
recursive deletion and implicit parent creation, defaults to exclusive commit
and permits replacing only a regular single-link file through an explicit mode.
Immutable `RootAccess::read_only` refuses write/create, resize, mkdir, removal
and both rename modes; it does not change host permissions. Trusted share
policy must select it before the backend is given to a remote caller.

Windows follows the [relative rename contract](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information)
through [NtSetInformationFile](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile)
with DELETE access and a held destination-directory handle. A separate owned
control observes Win32 `SetFileInformationByHandle` error 87 and Native API
success for the same relative buffer/handles; no absolute-path fallback is used.
Linux uses `renameat2` and never emulates no-replace with a check-then-rename or
copy/delete sequence. Missing syscall support returns `unavailable`.

The final local checks pass **24/24** MSVC foundation CTest with **1607 assertions
/ 9 file cases**, and **25/25** exact GCC 8.3 CTest with **1280 assertions / 11
file cases**. Every ordinary file suite includes 64 independent competing
commits. An extra Windows stress profile passes **1024 races / 16 processes**.
Full `pnpm check` passes **1232 / 71 skips / 1303 total**, zero failures. The
workspace checks cover unchanged JS/TS and the accepted 0.5.0 linked runtime;
later changes only strengthen the separately tested native test harness.
Node file APIs and RDPDR still have no integration with this library.

Retained failed controls exposed Windows fixture cleanup error 145 after
successful entry removals; subsequent inspection found the owned root empty.
The fixture now retries only that exact directory and its parent for at most
500 ms each, never deleting unknown children or recursing. Persistent failure
still fails the test. Test-only CRT reporting exits on assertions/errors rather
than opening a dialog; a deliberately failing child verifies exit code 120.
The evidence does not identify which OS component held the transient entry.
The temporary automatic-approval usage failure was resolved before these checks.
The final strengthened suite separately passes **1280 assertions / 11 cases**
on both actual Astra and RED OS, including 64 competing commits and both
syscall-refusal controls. Its 747-file source archive has SHA-256
`2021b8149bde5b9fdf65987fea63b1cfdf8adbf8a497715d6abd27a81bf22fae`.
`build/current-validation/managed-drives-namespace-acceptance.json` binds the
source, full-check logs, platform executables and stress/CRT controls. Platform
metadata and the earlier 152/335-assertion checkpoints retain their earlier
scope; they do not substitute for this final suite.
All six owned lab test directories from the portability/namespace runs are
removed after bounded inventories, owner checks and exact per-file SHA-256
verification. Logs and receipts remain local; existing installed services,
runtime inputs and lab toolchains are preserved. The three empty Windows
directories left by failed fixture controls are also removed without recursion.
All additions stay on the feature branch; no Stage 7 checkbox, runtime
capability, version or public release is accepted by this component checkpoint.

Commit `9a14683` adds one shared internal `FileQuota` authority per
sandbox, with logical byte, per-file size and entry-count limits. Entries include
directories and temporary uploads. Its defaults (256 MiB total, 64 MiB per file,
1024 entries) are internal constructor defaults, not a newly enabled public
server policy. Entry count is capped at 65536 and byte arithmetic at `INT64_MAX`.
Refused entry admission allocates no per-entry record; growth reservation itself
does not allocate. One mutation may be pending on each allocation.

The future sole sandbox owner must reserve before filesystem mutation, report
native-verified size after joined IO and release only after physical removal
and closure of every IO handle. Dropping an allocation never silently refunds
a file that might remain on disk. A lost operation result charges its admitted
upper bound; an impossible completion retires the whole authority. Destruction
or explicit retirement of its owner refuses new work while late results and
confirmed cleanup can settle. No browser claim of size/deletion is proof.
This layer contains no paths, credentials or file contents.

Component tests cover shared-byte and entry boundaries, integer overflow,
concurrent admission, pending/busy ownership, partial completion, shrink,
orphaned results and move/retirement behavior. Actual bounded `SafeRoot` IO
checks quota refusal before further writes and counts sparse logical growth.
A separate Linux profile runs `[.disk-full-control]` only on a private tmpfs
of at most 256 KiB. The measured 128-KiB Docker tmpfs reaches actual filesystem
exhaustion and reports the native `disk_full` status. The profile verifies partial
completion accounting and capacity recovery after truncation and deletion.
That hidden profile cannot pass on an ordinary host filesystem.
Full local native CTest passes **24/24** MSVC and **25/25** GCC 8.3; file/quota
suites pass **1884 assertions / 18 cases** and **1552 / 20**, respectively.
Actual Astra and RED OS separately pass the same **1552 / 20** component suite.
The real-full profile passes **40 assertions / 1 case** without filling either
lab disk. These are not HTTP upload, RDPDR or installed-server quota tests.
Full `pnpm check` also passes **1232 / 71 skips / 1303 total**, zero failures.
Source, compiler/full-check/platform logs and the separate disk-full profile
are bound in `build/current-validation/managed-drives-quota-acceptance.json`.
Both owned lab payload directories are removed after exact owner/file/hash
checks, retaining their receipts and logs locally.
The quota authority still requires a bounded entry registry and sole filesystem
owner integration; its calls are not exposed through npm or public HTTP.

The bounded-full scenario is also wired into the ordinary GCC 8.3 GitHub job:
it runs the same source-only image as its foundation CTest, with UID 1000,
no capabilities/network/host runtime mounts and a fresh 128-KiB tmpfs. The
Windows Debug foundation now includes the deliberate CRT-error child as a
bounded CTest; all **25/25** local Windows tests pass. The exact GCC CI Docker
fixture is built offline from the pinned compiler/Catch2 and checked cached
CMake/Ninja inputs, then locally passes **25/25** plus the **40-assertion**
full profile with the workflow arguments. Actionlint, YAML formatting and
**12** delivery/export guards pass. This verifies the CI recipe locally; no
hosted GitHub run is claimed for the unfinished feature branch. Production
quota code is unchanged by this test-wiring follow-up.

The next component is the native `Sandbox` owner (`native/files/sandbox.*`).
It accepts only a trusted empty private root and creates separate data/upload
directories. Its bounded registry owns the existing safe resolver and one shared
quota allocation per physical file, directory or pending upload. Regular-file
views share that owner and serialize filesystem operations; a view must outlive
its IO, and its close/move must be serialized with its own IO. Native IDs are
monotonic session-local keys, not paths or authorization tokens. An eventual
authenticated adapter must bind unpredictable public IDs to the owning session.

Uploads remain absent from ordinary lookup/list/open until the writer closes
and an atomic rename publishes them. Exclusive publication is the default;
replacement is explicit, file-only and refused while either file has an open
view. Moving a directory preserves descendant IDs and the logical destination
of a pending upload. Listing is capped at 64 entries per page, file views at
256 per sandbox, transfers at 64 KiB, and stored name/path metadata at 1 MiB by
default with a 4-MiB hard limit. Entry/byte quota admission precedes physical
creation or growth. Windows name collisions use ordinal case-insensitive
comparison; Linux preserves case-sensitive names.

Held-handle metadata uses the OS file identity and verified size rather than a
caller-reported byte count. Unexpected identity/size changes retire the owner.
Explicit cleanup first retires new work, waits for every file view to close,
then removes only registered, identity-verified objects in child-first order.
Charges are released after physical removal and joined handle closure. Unknown
or substituted objects are retained; cleanup never recursively removes unknown
content. The outer private directory belongs to its lifecycle host. Destruction
alone retires the owner and does not claim physical cleanup. As with `SafeRoot`,
this does not claim isolation from a malicious process with the service UID or
privileged access to the host.

The source-bound native checkpoint passes **25/25** full foundation CTest on
both MSVC and GCC 8.3. File/quota/owner cases pass **2431 assertions / 28 cases**
on Windows and **2045 / 30** on GCC 8.3 and each actual Astra/RED OS lab. RED OS
uses its native GCC 11.4.1; Astra runs the GCC 8.3 SDK-built executable. The GCC
8.3 ASan/UBSan file suite also passes. The actual 128-KiB tmpfs profile now tests
both direct quota accounting and the sandbox upload path: **76 assertions / 2
cases**, including native disk-full, partial-size settlement, hidden partial
upload and confirmed cleanup. Both profiles are selected by the GCC CI job.
The two owned lab payload directories are removed after exact owner/hash checks.
Local logs and hashes are retained under
`build/current-validation/managed-drives-owner-*`.

The full workspace attempt completes with **1231 passed / 71 skipped / 1
cancelled / 1303 total**: the unchanged synthetic image browser fixture exceeds
its 25-second test deadline. That exact fixture passes an isolated repeat
(1/1, 3.4 seconds). Its cause is not established; this is not a green full
`pnpm check`. Both logs are retained. Version/readme/build/lint/format checks
pass, and JS/TS plus the linked 0.5.0 worker are unchanged by this native block.
A green complete workspace run remains required before feature merge/release.

At that checkpoint this owner remained an internal component, not wired into the worker, Node file
API or RDPDR. Authenticated streaming, scoped share/read-only policy, worker
shutdown/orphan recovery with managed contents, actual remote CRUD and feature
acceptance remain open. Stage 7, runtime capabilities and public version 0.5.0
are unchanged by this checkpoint.

The next follow-up wires the owner into the actual worker's private file service.
`WorkerProcess.nativeFileCommand` streams bounded binary blocks through RWI1
commands/results, with explicit initialization, staged upload/commit/abort,
stable download leases, listing, directory creation and removal. Initialization
requires an owned private runtime and exclusively creates its fixed container;
there is no host pathname in a command. Publication verifies held-handle OS size
as well as accumulated bytes. A download pin refuses writes/resize even from
writers opened before it. Native cleanup refusal is preserved: Node removes
only an empty managed runtime and `close()` reports `FILE_CONTENTS_RETAINED`
when unknown contents survive. It never replaces that refusal with recursive rm.
[Wire and lifecycle contract](../PROTOCOL.md#private-managed-file-worker-service-schema-1-in-development).

Full local native CTest passes **25/25** on MSVC and GCC 8.3. File suites pass
**2520 assertions / 31 cases** on Windows and **2119 / 33** on GCC 8.3 and each
actual Astra/RED OS lab. ASan/UBSan file and IPC suites pass **2/2**; the separate
bounded tmpfs quota/full profile passes **76 assertions / 2 cases**. Actual Node
to worker file transfer, visibility, Unicode/binary readback, correlation,
retirement and unknown-content preservation pass on Windows framed IPC and on
both Linux framed/RWS1 with a newly built, hash-paired packet adapter. Linux's
combined file/protocol/HTML compatibility subset passes **21/21** as UID 1000,
CapEff=0 and no network. Final `pnpm check` passes **1238 / 71 skips / 1309
total**, with zero failures/cancellations. The earlier image fixture timeout and
the first full attempt's obsolete HELLO-bit assertion remain in their logs;
the final full run is green. Existing linked-RDP workspace regression still
uses the accepted 0.5.0 worker; the new file worker is tested separately above.

Foundation and bundled CI now select the file integration tests explicitly;
Linux foundation also builds its packet adapter, so both transports are covered.
Workflow formatting and Actionlint pass locally; no hosted run is claimed here.
Both final lab payloads are removed by exact owner/hash inventories. Evidence is
retained in `build/current-validation/managed-files-ipc-*` and
`managed-drives-file-ipc-v4-*`. This remains on `feature/managed-drives`.
Authenticated public HTTP streaming, unpredictable session-bound public IDs,
scoped/read-only RDPDR drives, managed-content orphan recovery, actual remote
CRUD and current linked/package acceptance remain open. The public managed-drive
and file-clipboard capabilities, Stage 7 gate and public version 0.5.0 remain
unchanged; private HELLO `fileService` is a separate implementation flag.

The source/preparation checkpoints below retain their historical scope.

The image source feature is now accepted at private `f922a9a` / public `794f9b7`:
all required foundation, GCC 8.3, sanitizer/fuzz and Windows/Linux bundled jobs
pass. The Linux final full-image SBOM gate passes after the measured size-budget
correction. The explicit cache save also succeeds after checked native builds
and before packaging; its restore was a miss, so a subsequent cache-hit speedup
is not yet measured. The [acceptance record](CLIPBOARD_BROWSER.md#image-source-feature-acceptance)
separates named real RDP, compiler, runtime and upcoming 0.5.0 installer/npm gates.
The earlier checkpoints below retain their historical scope.

HTML clipboard **0.4.0** is publicly delivered: ten exact npm packages, five
GitHub Releases, stable standalone installers/source companions, four fresh
registry-only consumers per OS and final public Astra/RED OS upgrades pass.
Feature/release branches are merged into shared `master` at `53b5edb`.
[Public delivery and current CI follow-up](CLIPBOARD_BROWSER.md#040-public-delivery).
The preparation checkpoints below retain their historical scope/status.

### Hosted HTTPS fixture startup budget

The Markdown-only public main `37213b1` repeats the earlier Windows system
OpenSSL timeout in `express-adapter.test.mjs`; Linux and sanitizer jobs pass.
The first failure is retained in
`build/current-validation/html04-public-docs-windows-failed.log`. Separate
`test/https-fixture-startup-budget` private `9652248` / public `241e609` changes
only dummy certificate setup from 15 to 60 seconds and its enclosing test from
20 to 90 seconds. HTTPS/WSS request deadlines, CA/hostname verification and
joined cleanup assertions remain unchanged. No product source, wire contract,
accepted archive or immutable tag changes; this needs no new product version.

The focused verified HTTPS/WSS scenario passes in 1.4 seconds. Full local
Windows foundation `pnpm check` passes **1065/137 skips/1202 total/zero failures**.
[Hosted foundation](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40360010862)
and [exact GCC 8.3](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40360010759)
pass before merge: Windows, both Linux build jobs, sanitizers with all twelve
fuzz steps and exact GCC 8.3 are successful. The public source inventory and
unchanged accepted archives are independently verified. Local and hosted
acceptance are bound in
`build/current-validation/https-fixture-budget-acceptance.json`; no test is skipped
or assertion removed for this correction.

HTML source acceptance is now complete at private `bba3c98` / public `04fd0cc`:
all hosted foundation/GCC 8.3/sanitizer/fuzz checks and the named application
profiles pass. [Evidence and limits](CLIPBOARD_BROWSER.md#html-source-feature-acceptance).
The feature is merged into shared `master` as `6f21ce7`; `release/0.4.0` prepares
aligned npm/standalone delivery separately. The preparation checkpoints below retain their original
scope and do not claim a published 0.4.0 artifact.

Release preparation now aligns all ten manifests and CMake to 0.4.0. TypeScript
build/version/README checks pass; all ten JS/native tarballs have exact dependency,
repository and root README audits. Fresh Windows/Linux linked runtimes reuse
the pinned SDK and pass CTest 39/40 and installed probes. All four exact npm
consumers pass on each OS, including relocated native HTML capabilities and
installed browser codec/assets without checkout imports. Both standalone locks
now bind the exact 0.4.0 SHA-512 values; external dependency graphs are unchanged.
Full release checks pass Windows 1131/71 skips and Linux 1099/108, zero failures.
Windows/Linux portable relocation/startup recovery/shutdown passes; Windows
payload checks pass 10/10. Production-mode MSI and candidate DEB are built.
Release hosted foundation/sanitizer/fuzz/GCC 8.3 and both installer jobs now pass.
Installed 0.3.0-to-0.4.0 upgrades pass Windows/Linux CI, Astra 1.7.5 and RED OS
7.3. Eight actual 0.4.0 desktop profiles pass, as does the prepared Windows
HTML application test using the exact npm/CI-portable worker. RED OS GCC 11.4.1
foundation CTest separately passes 23/23. Ten npm dry runs pass; public stable
delivery and registry-only postpublication consumers remain. The candidate
pointer is removed before stable export. Published 0.3.0 archives remain immutable.
[Versioned acceptance](CLIPBOARD_BROWSER.md#040-versioned-distribution-acceptance).

The next feature is HTML clipboard in `feature/html-clipboard`, started from
shared `master` after the accepted recovery and cross-principal branches were
merged (`284d9b9`). The bounded CF_HTML codec and combined native CLIPRDR
HTML/Unicode owner pass their component checks. Private HTML worker/Node
negotiation and handoff are implemented, including bounded two-format reads
under one revision and shared write/revoke ownership. Public session/control
transport now implements explicit HTML commands over the same bounded RWC1
flight. The browser byte codec/client now implements explicit HTML commands,
shared transfer ownership and preserved context/selection ranges. The reference
form/panel now implements explicit ClipboardItem actions and inert selected-byte
conversion with bounded static formatting. Physical browser/OS and real
application acceptance remain on this same branch.
Named Windows/Edge 156 OS ClipboardItem acceptance now passes in `c3447a5`:
real API, owned source selection, Unicode/static formatting and readback through
a second independent headed browser process, followed by owned clipboard/UI
cleanup. Its session API is synthetic; real RDP HTML acceptance remains open.
[Owned OS scenario](CLIPBOARD_BROWSER.md#named-windows-os-clipboarditem-acceptance).
The later named Windows-worker/Windows-peer prepared Edge application scenario
now passes both HTML/Unicode directions, a newer remote revision, native revoke,
owned OS cleanup and PID/runtime retirement. Broader peer/platform and release
acceptance remain open. [Actual application evidence](CLIPBOARD_BROWSER.md#named-windows-rdp-html-application-acceptance).
The Linux-worker/Windows-peer prepared Edge profile now also passes both
primary RWS1 and framed IPC: both HTML/Unicode directions, newer remote source,
owned page reset/close, acknowledged revoke and OS/PID/runtime cleanup. Full
Windows checks pass 1129/71 skips/0 failures; Linux UID1000 passes 1097/108/0.
Hosted and versioned release acceptance remain separate.
[Linux evidence](CLIPBOARD_BROWSER.md#named-linux-worker-html-application-acceptance).
Post-application CLI/HELLO and CI fixture corrections, full Windows regression
and the instrumented general IPC fuzz dependency correction are recorded in
[source CI acceptance](CLIPBOARD_BROWSER.md#source-ci-compatibility-correction).
Conversion checkpoint `a3542d7` and reference-action checkpoint `7019d7a` pass
combined full Windows `pnpm check` 1113/71 skips and Linux UID1000 1085/104,
linked MSVC CTest 39/39, focused UI/permission/config/codec 25/25 and final
normalizer 4/4, zero failures. These accept browser/synthetic integration and
actual permission denial; physical OS/RDP HTML roundtrips remain open.
[Current conversion/action contract](CLIPBOARD_BROWSER.md#html-selection-conversion-and-clipboarditem-actions-in-development).
Browser byte-client checkpoint `57981d3` passes full Windows `pnpm check`
1103/71 skips and Linux UID1000 1083/96, linked MSVC CTest 39/39, browser/legacy
composition 14/14 and actual Edge/WebSocket synthetic-RDP checks 3/3, zero
failures. [Browser scope and remaining UI/RDP gates](CLIPBOARD_BROWSER.md#html-byte-client-in-development).
Public ownership/control checkpoint `7ccef0a` passes full Windows `pnpm check`
1092/71 skips and Linux UID1000 1075/93, with zero failures; linked MSVC CTest
passes 39/39. Focused checks pass 31/31.
[Contract, evidence and remaining gates](CLIPBOARD_CONTROL.md#html-control-extension-in-development).
The bounded inner HTML item codec now has independent C++/TypeScript golden
vectors, borrowed content views and seeded wire fuzzing; its schema is documented
in [private payloads](CLIPBOARD_IPC.md#html-inner-item-in-development). Schema-3
commands are selected only with HELLO bit 256 and connection schema 13.
No HTML capability, TODO checkbox or release is accepted by the codec alone.
The intended capability release is 0.4.0 after complete acceptance; manifests
remain at the published 0.3.0 during implementation.
[Codec contract and remaining integration](CLIPBOARD_TEXT.md#html-codec-in-development).
[Native owner and acceptance scope](CLIPBOARD_TEXT_SESSION.md#html-and-unicode-share-one-native-owner).

Additional Stage 1 cross-principal acceptance is complete in
`feature/stage1-cross-principal-isolation`: actual distinct Linux UIDs and
Windows LocalService are denied access to private live, sibling and orphan
session directories while their owner remains operational. Dedicated steps pass
2/2 on each OS, full hosted suites and sanitizers/fuzz succeed, and exact GCC 8.3
passes with a readable-orphan negative control and a private source checkout.
Local full checks pass Windows foundation 995/127 skips and Linux linked 1031/93;
native CTest is 21/39, zero failures. This changes tests/CI, with no new production
RDP capability or repacked 0.3.0 artifact.
[Accepted scope and remaining gaps](RUNTIME_RECOVERY.md#cross-principal-acceptance).

The Stage 1 runtime recovery feature is completed and publicly released as
**0.3.0**, before starting HTML clipboard. Its feature/release branches and both
delivery repairs are merged into shared `master`. All ten exact npm packages,
five OIDC workflows, four registry-only consumers on each OS and final standalone
delivery pass. Final public DEB/RPM upgrades pass on Astra 1.7.5 and RED OS 7.3;
Windows/Ubuntu installed upgrades and eight actual desktop profiles pass too.
Current full checks pass Windows **1050/70 skips** and Linux **1030/92 skips**,
zero failures; native CTest passes **38/39**.
[Current evidence](RUNTIME_RECOVERY.md#030-public-delivery). Earlier checkpoints
below retain their original evidence scope and do not override this status.

`feature/stage1-runtime-isolation` and `release/0.3.0` are merged into shared
`master`; this recovery scope is closed. The original eight Stage 0 tasks and its clean-build/version gate
already have accepted release-profile evidence in
[0.2.5 delivery](ITERATION_457.md). The expanded sanitizer matrix continues in
the separate `feature/stage0-sanitizer-matrix` branch; its pending Node/addon and
broader dependency results are retained, not treated as successful acceptance.

The corrected hosted Node-ASan build in run `40113778793` now succeeds. Its
next standalone-Node baseline fails before any bridge addon is loaded:
LeakSanitizer reports 24 bytes allocated by Node's bundled OpenSSL
`ossl_load_builtin_compressions`. The identity control exits 1; addon checks are
skipped and remain unaccepted. This is a failure boundary, not an approved
suppression or a claim that bridge sanitizer checks passed. The original JSON
and diagnostic are retained as
`build/current-validation/github-node-sanitizer-baseline.{json,stderr.log}`;
the independent local Node build also finished successfully. Its automatic
acceptance then failed the same standalone-Node baseline with a 24-byte
OpenSSL leak before loading the bridge addon. Local evidence is
`build/current-validation/node-addon/instrumented-node/node-sanitizer-baseline.{json,stderr.log}`;
the addon matrix remains unaccepted. No suppression was added.

The first Stage 1 change rejects unsafe Linux runtime roots before session
creation: foreign service UID, group/other write permission, or a root symlink.
It never changes an existing directory's owner/mode. Native runtime and wire
contracts are unchanged. The host still supplies trusted ancestors; this does
not close simultaneous hard-kill recovery or the whole multi-user isolation
gate. [Host boundary](../SECURITY.md#2-worker-sandbox).

Five actual Linux admission cases pass without skips under UID1000, including
a real UID1001 root; four fail before the change. A real unchanged foundation
worker passes HELLO/heartbeat/shutdown and leaves an empty safe 0750 runtime
root with its original mode. Evidence is under
`build/current-validation/runtime-root-{before,after,native}.log` and
`runtime-root-acceptance.json`. Strict TypeScript, lint and formatting pass.
Unchanged native CTest passes **36/36**; Windows worker/private-directory
integration passes **22/22**, including 100 actual sequential workers and
parent-death cleanup. Product version is
still 0.2.5 during development; choose the next version only for accepted work.

The SDK now verifies a bounded worker/helper manifest, selects managed session
names, keeps independent Node ownership through joined retirement and exposes
bounded `recoverRuntimeSessions` through all four adapters. Only known metadata
in confirmed orphan directories can be removed; live owners, locked workers,
foreign UID/unsafe ACLs, links and unknown contents are preserved.

The current revision passes fresh linked MSVC CTest **38/38**, full Windows
`pnpm check` **1036 / 70 skips / 0 failures**, Linux GCC12 ASan/UBSan foundation
**22/22** and all SDK/process controls **27/27** without skips under UID1000 and
zero effective capabilities, including a real UID1001 root. The current helper
also compiles/links and runs its refusal path with exact GCC 8.3.0. Prior native
and endpoint-only results remain in [Runtime recovery](RUNTIME_RECOVERY.md).
`runtime-recovery-sdk-acceptance.json` under `build/current-validation` binds
the unchanged native source snapshot and current JS to these results.
Standalone calls recovery before listening. Actual Windows supervisor checks
now pass **9/9**, portable ZIP acceptance **1/1**, service-host CTest **1/1** and
full Windows check **1036/70 skips/0 failures**. The host now admits the bounded
recovery report before READY and leaves schema-1 orphan directories for the
verified SDK helper. The isolated development ZIP is not a published 0.2.5
replacement. Linux portable now also passes actual orphan recovery before
readiness, JWT/HTTP/native TLS and joined shutdown under UID1000. The current
GCC 8.3 linked build passes CTest **39/39** and SDK/recovery **27/27**; a fresh
Windows build passes CTest **38/38**. Installed bundle relocation passes on both
OSes without a library-path override. An actual Linux startup failure exposed
pre-install hashes surviving ELF RPATH replacement; installation now regenerates
the recovery manifest from final bytes, and npm packaging verifies the cohort
before creating an archive. Final Windows regression passes **1036/70 skips/0
failures**; CPack's actual native TGZ also has matching installed cohort hashes.
Installed upgrades, release
versioning, merge and publication remain open;
[evidence and limits](RUNTIME_RECOVERY.md#acceptance).

The final helper-owner correction retains a four-child physical limit even
after an unconfirmed close deadline; `exit` alone cannot free capacity. Its
failing-before/passing-after model and actual recovery checks pass. Updated full
`pnpm check` passes Windows **1037/70 skips/0 failures** and Linux **1017/92
skips/0 failures**, using the exact GCC 8.3 linked worker under UID1000. The
initial clean Linux source fixture omitted an empty scratch `build/` directory;
all eleven resulting path failures pass after fixture setup, without changing
test conditions. New-version installed upgrades, merge and publication remain
open.

Latest user priority: finish this Stage 1 recovery feature and its accepted
delivery before starting HTML clipboard. The empty HTML branch/worktree was
removed without code changes. Existing broader isolation and sanitizer gates
remain explicit; no original stage is closed by a component-only check.

Feature workflow (user instruction, 2026-10-21): start each feature on a separate
branch from the shared `master`, keep its acceptance criteria/evidence with the
change, and make focused commits there. Run narrow checks, relevant regression
and actual RDP/device acceptance where required. Merge the completed feature
into `master` only after those checks pass; unfinished work stays on its branch.
This workflow does not mark an entire V1 stage complete after one component.

Fetch-backed loopback tests use `tests/fixtures/browser-port.mjs` to select
49152–65535 with bounded collision retries. Some hosts allocate `listen(0)`
from a low range containing ports such as 2049, which Node Fetch rejects before
opening a connection. HTTP/Express/NestJS fixtures, copied npm consumers and
standalone web-port reservations therefore use the same helper. Generated
consumer projects must copy it next to their other local fixtures and rewrite
its import, preserving their independence from the source checkout. The port
unit test demonstrates the actual Fetch refusal and a reachable selected port.
The port-fixture correction passes full Windows `pnpm check` **1006 / 63 skips /
0 failures**, all four fresh public npm 0.2.5 consumers (strict TypeScript and
native TLS), and the relocated Windows portable/private-Node shutdown test.
Its five temporary consumer/portable trees were removed after saving receipts
under `build/current-validation`; accepted release archives were preserved.

Certificate-wait resource fixtures await the session's actual
`certificate.prompt` event before taking an attachment's certificate snapshot.
The preceding `awaiting-user` state is a separate IPC message and can arrive
first. The combined sanitizer-branch check exposed this race at `assert.ok(prompt)`
(1013 passed / 64 skipped / one failed); the failed report is retained under
`build/current-validation/certificate-race-check`. After correcting the event
wait, five consecutive native RSS/certificate runs and all nine related
native TLS/HTTP/WS checks pass without skips. The original deadlines and memory
policy assertions remain in the test.

For the user-authorized local Linux RDP container, use the
[owned XRDP stand](OWNED_XRDP_LAB.md). Its separate fixed loopback profile keeps
Windows lab credentials and certificate decisions independent.

For a separately authorized real Browser Clipboard API ↔ Windows Notepad
check, prepare a fresh empty unsaved editor with input focus, then disconnect
mstsc without logging off. The headed Edge helper replaces both clipboards
with fixed Unicode/multiline test text and uses the ordinary viewer buttons
and public control input. Pass the exact certificate fingerprint approved for
that one session and an existing verified linked Windows native receipt:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/test-windows-browser-clipboard.mjs $fingerprint build/native-clean-4ZhORq/receipt.json
```

The helper compares text without logging it, checks actual browser permission
refusal, clears only its verified test document after success, detaches and
joins native/runtime cleanup. It does not save or close the remote document.
A failure may leave synthetic text in the prepared document; its fixed result
reports that possibility. Do not rerun under an already consumed one-session
authorization. Browser directions/quota fixtures are separate evidence.
The optional `--focus-editor` additionally requires approval for a single center
click in the prepared editor and one ignored native RDP frame on failure. It
does not search the desktop or repeatedly capture frames. A reconnect can change
remote input focus even when the editor was focused before mstsc disconnected.

The separately authorized `--focus-editor --keyboard-smoke` additionally tests
physical Shift/number entry, release of left Ctrl / right Shift / left Alt on
canvas blur, and held right Ctrl across viewer detach/fresh-token reattachment.
The left-Alt case cancels application menu mode with Escape before the next digit.
Every step compares actual Notepad copied text through the ordinary Get action;
it uses only the already verified synthetic document. The fixed `!1` expectation
is a named current-layout check, not automatic layout selection or acceptance of
all keyboards. It requires explicit approval for those inputs and reattachment
in addition to the ordinary Clipboard scenario. No application is launched and
no file is saved. Preparation or fixtures do not accept actual remote input.

The joint Windows helper uses `--focus-editor --mvp-soak` with the same
fingerprint/receipt arguments. It requires a user-prepared maximized disposable
Notepad and the existing fixed tone running inside that RDP session for 33
minutes. The tone command is offered in the local viewer draft; sending it is
an explicit user action, and executing it/preparing Notepad remains manual.
After audio decoding starts, click “Блокнот готов — начать совместный тест”.
Alternatively the operator can relay an explicit user readiness confirmation
by creating the exact per-process `build/mvp-notepad-ready-<pid>` file printed
by that invocation; it contains no secrets or application data.

This mode replaces only the prepared document with synthetic text, verifies
both Clipboard API directions, then repeats a physical-key/edit/readback check
every 30 seconds during the full 30-minute H.264/Opus observation. It measures
existing video/audio/RSS counters, then checks resize, permission refusal,
revoke, reattachment and cleanup. Its watchdog is 40 minutes; epoch recovery
is observed for at most 3 seconds and still counts toward total sample loss.
It captures no failure screenshots. A failed run may leave its test document;
the finite tone ends itself or the user can stop it with Ctrl+C. Numeric results
do not replace the user's listening assessment. The named complete real joint
gate passes in [403](history/iterations/401-450.md#iteration-403); the earlier failed run remains recorded
in [402](history/iterations/401-450.md#iteration-402). New compiler/profile regressions retain their own
acceptance and do not inherit that result merely by using this helper.

For separately authorized basic mouse/scroll acceptance, copy
`tests/fixtures/rdp-pointer-page.html` to the Windows lab yourself, open it in
Edge, maximize the window and disconnect mstsc. The page stays local/offline
and exposes only fixed bounded numeric counters. Use the same helper with
`--focus-editor --pointer-smoke`, instead of `--keyboard-smoke`. This requires
approval for the button/drag/wheel sequence, left-button blur and middle-button
detach/reattach, F2/Ctrl+C scalar readbacks and the existing optional single
failure frame. It runs no remote command, does not launch an application, does
not write a remote document and sends no clipboard offer. Exact scope and actual
acceptance status are in [the pointer iteration](history/iterations/351-400.md#iteration-396).

For operator-assisted actual Windows Notepad Unicode/input/clipboard checks,
use the [application smoke](WINDOWS_APPLICATION_SMOKE.md). It requires an empty
user-prepared Notepad, fixed test data and phase-by-phase native JPEG inspection;
it never saves the document or accesses the host Clipboard API.

Current authorized `192.168.21.149` is the **Windows lab**, confirmed by the
user on 2026-10-18. The `test-xrdp-*` filenames are legacy helper names; label
new evidence by the actual endpoint. The user has cleared the Windows backup/
preparation wizard themselves. [Current status and remaining gates](LAB_STATUS.md).

## Connected worker RSS policy smoke

Core lab `strict` mode succeeds only for exact `RDP_CERTIFICATE_REJECTED` and
a subsequent native heartbeat. A timeout/authentication error or unexpected
connection is a failed check. `inspect` is inventory only; `connect`/`memory`
require a connected/no-error result. [Result-classification evidence](history/iterations/251-300.md#iteration-299).

With the current built Node package, existing bundled worker and ignored
authorized lab files, use the previously approved exact fingerprint:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/test-xrdp-lab.mjs memory $fingerprint
```

This explicit mode selects 1920×1080 and a 256 MiB sampled worker RSS cap at
100 ms intervals. It requires at least three actual connected samples, a JPEG
frame, heartbeat and empty-runtime cleanup. It records only count/peak scalars
and sends no remote input, audio generation or physical capture. It does not
stress memory or prove the whole-session target, CPU, hard allocation limits
or sustained acceptance. Ordinary modes and Release defaults remain unchanged.
[Host policy](WORKER_MEMORY_POLICY.md), [evidence](history/iterations/251-300.md#iteration-298).

## Private clipboard lab probe

With the paired current worker/Node build and ignored authorized lab files:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-clipboard.mjs $fingerprint inventory
```

Use the previously verified SHA-256 fingerprint. Inventory reports source
readiness, scalar offer metadata, heartbeat and cleanup; it never reads remote
clipboard contents or accesses the host OS clipboard. The optional action
`set-sentinel` explicitly replaces the remote text offer with a fixed synthetic
value, waits for the native peer ACK, then clears it. This changes clipboard
state and does not prove that a remote application consumed it. Do not run that
action against a session whose clipboard must be preserved. Linux bootstrap can
use `--private-stdin` or `--private-stdin-framed` after the action; credentials
still travel only in bounded private stdin/worker IPC. The SDK build container
must not receive lab secrets. Run lab modes sequentially.

These are private `WorkerProcess` probes. Public session/control/browser clipboard
activation remains gated. [Private API contract](CLIPBOARD_IPC.md#private-typed-node-selection-iteration-232).

## Manual Windows/XRDP viewer

From the project root in PowerShell, with the existing local toolchain and
bundled native build, run:

```powershell
& .\scripts\local-pnpm.ps1 -PnpmArguments @('build')
$fingerprint = 'sha256:7a826b7c5f71b03b67866a63d03e15279aefb6638a36cfc9c7209e349d5e75ed'
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --manual
```

This local helper opens installed Edge visibly, uses the ignored lab configuration
and credentials, and accepts only the supplied previously verified certificate.
It serves the harness only on 127.0.0.1:47999. Click the desktop to give it keyboard
focus; mouse buttons and wheel are enabled in this explicit manual mode. Changing
`h264` to `jpeg` selects the fallback. Close the Edge window or press Ctrl+C to
close the session and clean up the worker. Automatic mode without `--manual`
retains its movement/reset-only lab guard and finishes after its smoke checks.

For explicit PCM output use `--audio-manual` instead of `--manual`:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --audio-manual
```

Click **Включить звук и подключиться** before attachment: the harness creates
the AudioContext/Worklet from that gesture, then opens sockets. The host must
provide fresh single-use tokens; delaying activation beyond their TTL requires
a fresh attachment. Waiting status with no PCM is not audible acceptance.
The helper reads only ignored local credentials and uses private IPC as before.
Automatic `--audio-test` exercises gesture, media/source status and reattachment
with the existing motion/reset-only guard; it never generates remote sound.
Opus/microphone and audible/latency acceptance remain open.

For explicit Unicode/IME fallback, first focus the desired field on the remote
desktop, then enter text in **Текст Unicode / IME** below the canvas, complete IME
and press **Отправить текст**. Physical canvas keys remain the shortcut path.
The field accepts at most 256 UTF-16 units, with one pending submission. A sent
result clears it; unavailable/resize pause retains the draft. Timeout detaches the
viewer without retrying text because delivery may already be partial/complete.
Server Unicode support and real remote application/OS IME behavior still require
acceptance; automated lab checks do not send text. [Contract](INPUT.md#committed-unicode-text).

The lab files are `.local-tests/xrdp-lab.json` and
`.local-tests/xrdp-lab.secrets.json`; the existing user-authorized development
exception permits the latter locally. Neither file is published or packaged.
If the native worker needs rebuilding, run `./scripts/native-build.ps1 -Task bundled`.

Session creation now accepts [quality/FPS profiles](VIDEO_QUALITY.md). To run the
automatic lab check with 5 FPS and the low-bandwidth profile, use the same
fingerprint variable and pass `--quality-test` instead of `--manual`:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264-reset --quality-test
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint jpeg --quality-test
```

This verifies the reported cap, browser output and direct native capture pacing;
it is a bounded smoke check, not maximum-FPS or 30-minute soak acceptance.

## Foundation prerequisites

Prerequisites: Node.js 24, pnpm 10.11.0, CMake >=3.24, Ninja and a C++20 compiler.
Windows: initialize the x64 MSVC/SDK environment with `scripts/msvc-env.cmd`
and the Visual Studio installation path in a disposable `cmd.exe` session.
Linux: install Ninja and GCC/Clang.
No GUI, Docker or system FreeRDP is needed for this *lifecycle-only* development profile.

```sh
pnpm install --frozen-lockfile
pnpm build:native
pnpm test:native
pnpm check
node examples/lifecycle.mjs
pnpm --filter @freerdp-bridge/api start
```

Lint/format exclude `.local-tests` and `.runtime`. The format commands name the
maintained source roots (`apps`, `packages`, `scripts`, `tests`, `examples`,
`.github`) and root configuration/code files explicitly, so Prettier does not
walk private development directories even when their ACL denies enumeration.
Add a new source root to both format commands when introducing one. This does
not change directory permissions or the native clang-format workflow.

API listens on localhost:8080 and exposes /healthz, /readyz, /v1/build and /v1/capabilities.
Foundation readiness means the native lifecycle executable can be started and negotiated,
not that an RDP connection can be created. RDP is reported false.

Runtime root may be configured through BRIDGE_SESSION_RUNTIME_DIR; binary location through
BRIDGE_WORKER_PATH. Neither setting contains per-session secrets.

```sh
cmake --preset sanitizers
cmake --build --preset sanitizers
ctest --preset sanitizers
BRIDGE_TEST_BINARY_DIR=build/sanitizers pnpm test
cmake --preset fuzz
cmake --build --preset fuzz
node scripts/seed-fuzz.mjs
build/fuzz/ipc-fuzz build/fuzz/corpus -max_total_time=20
```

The pinned FreeRDP source metadata is native/dependencies.json. The bundled development profile
links exact FreeRDP/WinPR 3.32.1 and provides an experimental native connection core.
See [connection contract](CONNECTION_CORE.md) and [XRDP evidence](history/iterations/001-050.md#iteration-004).
Usable browser RDP remains false. Foundation defaults to BRIDGE_WITH_FREERDP=OFF explicitly.

The Windows test machine originally had Node.js 22. A SHA-256 verified portable Node.js
24.21.0 and pnpm were installed under ignored .tools without changing system installation.
CI uses Node.js 24 directly. Catch2 v3.8.1 is fetched only at configure time, not at runtime.

On this machine, `./scripts/local-pnpm.ps1 check` selects the local Node/pnpm for one command.
The helper restores PATH after execution. It uses Windows system CA trust, keeping TLS checks
enabled. Native compilation still requires an initialized MSVC/SDK environment.

Private dependency and runtime build (Windows x64 verified; Linux acceptance pending):

Linux build prerequisites include Perl, NASM, pkg-config, Autotools/libtool and libudev-dev
in addition to CMake/Ninja/compiler. The pinned libusb Linux port enables udev by default;
its OS integration library must be inventoried and declared before Linux installer acceptance.

```sh
pnpm build:dependencies
pnpm build:freerdp
pnpm build:bundled
BRIDGE_TEST_BINARY_DIR=build/bundled pnpm check
pnpm test:bundle
```

On Windows, prefer the helper commands below from regular PowerShell. They prepare
the MSVC/SDK environment and a temporary short workspace alias for vcpkg, which
is needed for this workspace's long non-ASCII path:

```powershell
./scripts/native-build.ps1 dependencies
./scripts/native-build.ps1 freerdp
./scripts/native-build.ps1 bundled
$env:BRIDGE_TEST_BINARY_DIR = 'build/bundled'
./scripts/local-pnpm.ps1 check
./scripts/local-pnpm.ps1 test:bundle
```

The lifecycle-only Windows foundation can use the same helper:

```powershell
./scripts/native-build.ps1 foundation
```

It configures/builds/tests the foundation preset without FreeRDP. Catch2's
FetchContent base is explicitly kept on the temporary ASCII alias: a preset can
expand sourceDir to the canonical non-ASCII path, and MSVC's library response-file
reader then misreads UTF-8 object paths even when compilation itself succeeds.

The helper creates an unused R:–Z: subst alias, initializes the MSVC shell, selects local
Node.js and removes the alias in finally. Build caches contain this temporary alias; subsequent
builds must reuse the same available drive letter. Fresh checkouts can use installed Node.js 24
in an MSVC shell on a short ASCII workspace path; local-pnpm/native-build helpers are machine helpers.

The Windows helper uses `scripts/msvc-env.cmd`: `VsDevCmd -no_ext` initializes
the SDK, followed by explicit C++ and CMake batch extensions. It does not invoke
Visual Studio's vcpkg shell integration, whose `iex (Get-Content ...)` initialization
can be blocked by endpoint protection. The target and host overlay triplets set
`VCPKG_LOAD_VCVARS_ENV=OFF` and pass only build-tool environment variables, so
private vcpkg does not repeat the full Visual Studio shell initialization.
Compiler tracking remains enabled and environment values participate in ABI hashes.
`native-build.ps1` discovers the installed Git executable and passes its directory
as the second argument to `msvc-env.cmd`. Before SDK setup the disposable cmd shell
sets PATH to that directory and standard Windows executable directories; the SDK,
C++ and CMake extensions then append their own tool paths. Node is invoked by its
explicit local executable path. Transient caller/automation directories therefore
do not invalidate every vcpkg ABI key between helper calls. PATH remains tracked;
compiler and SDK checks are not disabled. Direct `msvc-env.cmd` calls without the
second argument retain their existing inherited PATH behavior.
The supported variables are described in [Microsoft's vcpkg documentation](https://learn.microsoft.com/en-us/vcpkg/users/triplets#vcpkg_load_vcvars_env).
This requires an initialized MSVC environment; use the helper from a regular terminal.
No antivirus settings, exclusions, execution policy or Visual Studio installation files
are changed. Existing native-build commands above remain the entry points.

Pinned vcpkg builds release shared libraries into .deps/installed/<triplet>, with downloads,
tooling, build trees and binary cache under .tools/.deps. No system installation or global vcpkg
integration is performed. ZLIB/OpenSSL/libusb/OpenH264 paths are checked before building FreeRDP.
The Windows bundled profile includes private OpenH264 browser encoding and incoming
FreeRDP AVC420 decoding; FFmpeg remains disabled. These are experimental media
features, with the overall `rdp` capability still false. [GFX contract](GFX.md).
Windows serial/parallel client modules are explicitly disabled because pinned upstream lacks them.

build/native-stage contains only the native runtime and licenses/metadata. Windows DLLs and
release CRT live beside the worker; Linux libraries use private lib paths with relative RPATH.
build/packages contains the ZIP/TGZ and SHA-256 sidecars. MSI/EXE/DEB/RPM generators can consume
the same CPack install rules once their tooling and installer integration are added and tested;
none of those installer formats is accepted yet. Node.js and the API are not in this native bundle.

rdp-worker --build-features and /v1/build expose compiled channel inventory and dependency versions.
Compiled channels do not imply working redirection. tests/packaging/relocate.test.mjs moves the
runtime to a path containing spaces, removes dependency PATH entries, validates loaded module
paths and static addins, then runs worker HELLO/heartbeat/shutdown and cleanup.

For the user-provided XRDP lab, non-secret connection parameters are in ignored .local-tests.
The current viewer helper reads the already authorized plaintext lab credentials
from the ignored `.local-tests/xrdp-lab.secrets.json`, under the explicit local
development exception in AGENTS.md. These files never enter Git or the package.
Passwords still reach the worker through private IPC and never through argv,
environment, logs or production persistence. Certificate verification remains
strict by default; the lab helper uses only the previously approved exact fingerprint.

Original blueprint: ../README.md. Current implementation status: ../TODO.md.

## Private XRDP Display Control check

After building Node and the bundled worker, use the already approved exact lab
fingerprint with the ignored local credentials:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-display.mjs $fingerprint
```

The helper opts in to native dynamic resolution, checks negotiated caps, changes
1920×1080 to 1280×720, verifies new AVC IDR/JPEG dimensions, and restores the original
size with another IDR. It sends only input reset and lifecycle requests. If the
server has no negotiated Display Control, it records unavailable rather than
claiming a successful resize. This helper is private worker integration.

## XRDP browser resize check

The public control/media path can be tested separately in Edge for each codec:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --resize-test
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint jpeg --resize-test
```

Run sequentially (the helper uses local port 47999). It explicitly opts in, checks
1920×1080 → 1280×720 → 1920×1080 rendering/config generations and fresh AVC IDRs,
no-op/invalid typed replies, display/cursor reattachment replay and resumed motion.
Only motion/reset input is sent to the operational lab desktop. The helper attempts
restoration on failure before closing. Manual `--manual` viewing also opts in and
shows width/height controls. Other session creators must explicitly set
`display.dynamicResolution=true`; default remains disabled. This is one primary
monitor at 100% scale, not automatic browser viewport or multimonitor support.

## XRDP touch inventory and manual input

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-touch.mjs $fingerprint
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --touch-inventory
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint jpeg --touch-inventory
```

The first checks private native readiness, heartbeat and JPEG. The browser modes
explicitly opt in, validate matching rendered touch/display generations and
control reattachment replay. They send no touch/key/button/wheel/text; the browser
helper retains its authorized motion/reset checks. Run modes sequentially.
Credentials stay in ignored lab files and private IPC; use the previously verified
fingerprint. Inventory is not physical touch or remote application acceptance.
Manual --manual viewing also opts in and captures supported touch Pointer Events
only after readiness and matching rendered geometry. It never maps pen to mouse.

## Private Windows PCM readiness check

After bundled native and Node builds, run `node scripts/test-xrdp-audio.mjs
sha256:<verified-lab-fingerprint>` with the bundled Node 24 executable on PATH.
The helper reads the authorized ignored lab files, opts in to private PCM,
observes source metadata for three seconds, checks heartbeat/JPEG and closes.
It sends no remote input/sound-generation commands and writes only a bounded
non-secret `.local-tests/xrdp-audio-report.json`. Waiting with zero packets is an
idle/source observation, not audio negotiation, audible/browser or latency
acceptance. Public session PCM remains unavailable until ordered media routing.

Iteration 85 extends this private helper with an optional second argument:
`node scripts/test-xrdp-audio.mjs sha256:<verified-lab-fingerprint> opus`.
PCM remains the default. Opus writes its bounded metadata report to
`.local-tests/xrdp-audio-opus-report.json`, separate from PCM. The same approved
fingerprint check, private IPC credentials, heartbeat/frame/cleanup and no-input /
no-sound-generation behavior apply. High-level public Opus remains unsupported;
this helper does not test browser playback or audible acceptance. Current public
PCM availability is documented in the later media/viewer contracts.

## Public Windows Opus viewer

Iteration 94 enables explicit `media.audioOutput: 'opus'` and matching
`bridgeViewer.attach(created, { audioOutput: 'opus' })`. The harness opens audio
sockets only after the existing **Включить звук и подключиться** button activates
an exclusive AudioContext; AudioDecoder support is checked and unsupported Opus
fails explicitly. No codec switch or automatic PCM fallback occurs mid-session.

Use `node scripts/test-xrdp-viewer.mjs sha256:<verified-lab-fingerprint> h264
--audio-opus-test` for the authorized local browser/idle-source regression.
It retains only the existing motion/reset input checks and generates no remote
sound. `--audio-opus-manual` opens the manual viewer with the same gesture button
and manual input enabled. Existing `--audio-test` / `--audio-manual` select PCM.
Run lab modes sequentially. Waiting/zero packets is not audible acceptance.
[Wire and recovery ownership](AUDIO_OPUS_PUBLIC.md).

## Private XRDP microphone inventory

After bundled native and Node builds, run sequentially:

```powershell
node scripts/test-xrdp-microphone.mjs $fingerprint off
node scripts/test-xrdp-microphone.mjs $fingerprint pcm
node scripts/test-xrdp-microphone.mjs $fingerprint opus
```

Use Node 24 and the previously verified `sha256:<fingerprint>`. The helper reads
authorized ignored lab credentials and sends them through private IPC. It selects
PCM input with the indicated output, observes three seconds of source metadata,
checks heartbeat/JPEG and closes with empty runtime. It sends no PCM/input/reset
or remote application commands and requests no physical/browser microphone.
Reports in `.local-tests/xrdp-microphone-<mode>-report.json` contain only bounded
scalar inventory. Waiting/epoch 0 is not ready capture, permission, remote
application, audible or latency acceptance. Historical iteration 115 public
creation gating is superseded by explicit PCM selection in iteration 128.
[Actual evidence](history/iterations/101-150.md#iteration-115).

## Explicit native/browser microphone viewer

After the bundled native/Node builds, use the same previously verified fingerprint:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --microphone-manual
```

This opens the actual native PCM-input session with output off. The viewer waits
for remote source readiness before enabling **Включить микрофон**. Click that
separate button to request a local microphone; **Выключить микрофон** stops
tracks and joins graph/server cleanup. There is no automatic device request.
Current XRDP evidence is waiting/epoch 0, so the button stays disabled until a
remote application/server negotiates a supported capture profile. No remote
application is opened automatically.

Use `--microphone-pcm-manual` or `--microphone-opus-manual` for simultaneous PCM
input and the indicated output. These modes first require the existing output
activation button, then the separate microphone button. Opus **input** remains
unsupported. Incomplete/failed old permission cleanup blocks new capture until
reload. Other manual input follows the existing explicitly manual viewer rules.

Automated `--microphone-test` verifies H.264/source replay and cleanup with the
existing motion/reset-only guard. It never clicks microphone enable and replaces
getUserMedia with a rejecting sentinel, preventing physical capture even on an
unexpected startup. [Evidence and remaining acceptance](history/iterations/101-150.md#iteration-128).

## Explicit Opus microphone input

Iteration 144 supersedes the unsupported-input statement above. With Node 24 and
the bundled guarded Windows worker, use:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --microphone-opus-input-manual
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --microphone-opus-input-test
```

The first selects Opus input / output off and opens the manual viewer. A bounded
provider support check runs before sockets; physical capture still requires the
separate microphone button and an actual ready remote source. The second is an
automated source/video regression with a rejecting getUserMedia sentinel, no
microphone button click and only the existing motion/reset. Waiting is not remote
recording acceptance. Run lab modes sequentially.

Existing `--microphone-opus-manual` keeps its original **PCM input / Opus output**
meaning. It does not select Opus input. Typed `bridgeViewer.attach` and SessionCreate
can select input/output independently; there is no codec fallback.

The private inventory helper accepts an optional third argument selecting input:

```powershell
node scripts/test-xrdp-microphone.mjs $fingerprint off opus
node scripts/test-xrdp-microphone.mjs $fingerprint pcm opus
node scripts/test-xrdp-microphone.mjs $fingerprint opus opus
```

Omitting it retains PCM input and the existing report paths. Opus-input reports
use `.local-tests/xrdp-microphone-opus-<output>-report.json`; all reports remain
bounded scalar metadata. The helper checks selected native capabilities and sends
no microphone samples, reset or remote application input. Credentials stay in
ignored local files and reach the worker only through private IPC.

## Single-viewer stability observation

After building Node and the bundled Windows worker, with the previously verified
lab fingerprint, run lab modes sequentially:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --soak-test
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --transport-loss-test
```

This holds the actual 1920×1080 desktop for 30 minutes, prints fixed aggregates
every 30 seconds, then checks resize/restoration and cursor/attachment replay.
It observes graphics with audio off and requests no microphone. Working-set
measurements use the bundled limited-query helper. Do not rebuild native DLLs or
run competing timing benchmarks during the observation. A reported failed memory
budget or interrupted run is not acceptance. [Scope](history/iterations/151-200.md#iteration-174).

The separate transport-loss mode uses one loopback relay to the configured lab
IP, waits for real decoded desktop pixels, then breaks only that test connection.
It requires an explicit RDP failure, closed viewer and ordinary cleanup. Extra
peers are refused; no payloads are recorded or device permissions requested.
Run it after the soak, not during another timing observation. [Verified scope](history/iterations/151-200.md#iteration-183).

The private `test-xrdp-audio.mjs $fingerprint pcm` (or `opus`) now observes ten
seconds of real source data and makes at most one reset attempt while ready.
Subsequent fresh config/packet evidence is distinct from merely scheduled reset.
It emits scalar counts and a PCM nonzero indicator, never recordings/sample data.
Dedicated lab viewer `--audio-manual` / `--audio-opus-manual` performs the output
activation button click so certificate approval cannot expire while waiting for
it. The product viewer retains its gesture gate; this does not request microphone
permission. Audible quality remains a user check. [Current XRDP corrections](history/iterations/151-200.md#iteration-175).

## Explicit 200 ms output compatibility profile

The selected native output capacity can be set independently for PCM/Opus:

```powershell
node scripts/test-xrdp-audio.mjs $fingerprint pcm 200
node scripts/test-xrdp-audio.mjs $fingerprint opus 200
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-test
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-manual
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-listen
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-recovery-test
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-compat-recovery-test
```

Automatic and manual audio viewer runs emit a final schema-1
`lab.browser.audio-negotiation` record after joined native/server cleanup.
Its `negotiation` object contains only the worker's fixed numeric server/client
format, Training/Wave and write/completion/cancellation/failure counters, as
decimal strings. `null` means no complete diagnostic receipt was observed;
it must not be interpreted as zero negotiation. The private audio helper uses
the same stream parser so stderr fragmentation cannot drop a valid receipt.
The browser footer additionally includes `nativeCounters` (chunking, overflow,
skipped/late publication, revisions, consumer resets and packets) and
`nativeCauses` (initial/profile/block, arrival/timestamp discontinuities,
formats and Close). Both are exact fixed uint64 decimal-string projections,
or `null` if absent. The private helper preserves the same field names with
omitted absent receipts. These are lifetime counters, not a causal diagnosis
of a specific audible pause. [Collection checks](history/iterations/351-400.md#iteration-368).
`consumerRecovery` separately counts calls and fixed results of the existing
Node reset API: requests, scheduled/stale/busy/unavailable, unexpected results
and failures. It never includes epochs or error text. A request can be pending
or refused; it is not a successful source reset or an audible interruption.
[Wrapper checks](history/iterations/351-400.md#iteration-369).
Recovery runs require actual ready-source packet/playback evidence before
detachment; a waiting source fails in phase `audio-source-ready`, before a
desktop snapshot is taken. The host source must run in the redirected Windows
audio endpoint/session. Source launch, endpoint selection and audible acceptance
remain explicit user/lab operations.

PCM viewer modes are `--audio-compat-test` / `--audio-compat-manual`. Manual output
activation is performed by the dedicated lab helper; no microphone is requested.
Run actual RDP modes sequentially. Programmatic creation uses
`media: { audioOutput: 'opus', audioOutputBufferMs: 200 }`; omission or 120 keeps
the original capacity. This is native handoff storage, not total playback latency.
The private Node/native pair must both support the new gated schema.
[Accepted scope](adr/ADR-012-audio-compatibility-buffer.md).

The `--audio-opus-compat-listen` preview activates output, leaves the visible
viewer open for one minute after the first rendered frame, and closes through
ordinary browser/server/worker cleanup. Closing the viewer sooner also finishes
normally. Use this bounded preview for a short listening check.
Before timed cleanup it requests one fresh Worklet stats reply and prints a
schema-1 `lab.browser.audio-preview` observation: fixed video/source/decoder and
Worklet counters, without raw media. A closed viewer or unavailable reply is
reported as `observation: null`, never as a fresh reading of stale counters.
The report does not claim audible acceptance. To verify the source route,
restart the source in PowerShell inside this active Bridge viewer after
connection; the user-started tone in a previous `mstsc` connection did not
establish that route. The native negotiation footer still follows joined close.

Each bounded listening preview also awaits one existing native pipeline query
before cleanup and emits schema-1 `lab.browser.native-pipeline`. Its `stats`
contains only `rdpChecks`, `paints`, `encodedFrames`, `encodeMeanUs`,
`encodeP95Us`, `encodeMaxUs`, `maxReadBatch` and `maxReadBatchUs`, or `null`
when unsupported, closed, refused or unavailable. The existing native request
deadline owns the query; the helper adds no retry, polling or detached timeout.
Encode p95 covers the latest 128 encoded frames; mean/max and the other
counters/maxima cover the worker lifetime. These describe video work, without
identifying the cause or time of a particular audio pause. They exclude audio
codec work, event waits, Node/browser processing and end-to-end latency.
[Collection verification](history/iterations/351-400.md#iteration-374).

For a separately authorized fixed-source Windows test, use
`--audio-opus-compat-tone-listen` instead. This opt-in is restricted to the
named Windows lab `192.168.21.149:3389`. Through private RDP input it opens
Windows PowerShell and types one fixed in-memory quiet 440 Hz PCM8 source,
with a 45-second sleep and Stop/Dispose/exit in `finally`. It accepts no command
or source-file argument, creates no WAV file, and captures no microphone.
The one-minute viewer then collects the same counters and joins normal cleanup.
Do not connect with `mstsc` concurrently; it can replace the Bridge connection.
`lab.browser.tone-input` reports command dispatch, not remote execution or
process-readback proof. In this mode `remoteAudioGenerated: null` means that
the helper cannot independently verify source execution; actual packet/playback
counters and the operator's listening report provide separate evidence.
[Named audible result and retained quality gaps](history/iterations/351-400.md#iteration-367).

For user-operated source startup, `--audio-opus-compat-source-listen` (also
`--audio-opus-compat-tone-soak`, superseding its unverified automatic dispatch) opens a
bounded Opus/200 ms preview and selects browser-to-server text clipboard
with a 2,048-byte cap, including its UTF-16 representation. It places the fixed
three-minute source command in the
local draft only: no Send, paste, Enter or application launch is automated.
The user separately clicks Send, waits for offer acceptance, focuses the already
open PowerShell in the remote desktop, pastes and executes the command. Existing
source counters and the operator's assessment remain the evidence. Clipboard
uses the ordinary grant/revoke lifecycle; server-to-browser reads are disabled.
The helper permits at most five minutes of preparation, then starts its
180-second observation only after the existing browser counter reports the
first decoded audio packet. Missing source fails that explicit scenario and
joins cleanup; preparation is not misreported as active playback time. This is
an observation budget, not a change to connection/protocol/record deadlines.
Opus/200 ms, microphone off, the existing counters and joined cleanup remain.
Ordinary one-minute/45-second modes stay unchanged. This mode requires a
separately approved connection and user-prepared PowerShell. Source-start
failures and exact acceptance boundaries are retained in [387](history/iterations/351-400.md#iteration-387).

On Windows, append one isolated native receipt after the existing viewer mode
to select its verified worker/helper pair:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-tone-listen build/native-clean-EXAMPLE/receipt.json
```

The same receipt validator used by the resource lab checks the pinned linked
profile, source identity and exact worker/helper bytes before reading lab
configuration or credentials. It accepts the existing Windows Debug/Release
receipt profiles. Omitting the receipt keeps the ordinary bundled worker;
explicit selection does not replace it. A schema-1 `lab.browser.native-profile`
record reports receipt/build type and source/worker/helper hashes, without
claiming connection or playback. This prepares the corrected Debug worker for
a separately authorized actual session. [Selection checks](history/iterations/351-400.md#iteration-372).

The recovery modes require real active output before and after browser detach/
reattach, and fail for an idle source. Opus also requires an observed native
reset result and a fresh epoch. Leave audio playing on the authorized lab; the
helper does not start remote applications or record audio. [Verified scope](history/iterations/151-200.md#iteration-181).

## Manual WEB connection example

`node scripts/start-reference-harness.mjs` opens an empty, authenticated local
Edge example. Enter RDP address, settings and credentials manually; choose strict
validation or an explicit session-only certificate prompt. Window close stops the
owned server/workers. [Detailed contract and launch](WEB_CONNECTION_EXAMPLE.md).

## Local linked Linux verification

After `pnpm build:dependencies`, `pnpm build:freerdp` and `pnpm build:bundled`,
the separate private SDK prefixes are used only for build-tree Node checks:

```sh
BRIDGE_TEST_BINARY_DIR=build/bundled \
  LD_LIBRARY_PATH="$PWD/.deps/freerdp-install/lib:$PWD/.deps/installed/x64-linux-bundled/lib" \
  pnpm check
pnpm test:bundle
```

CMake scopes the same private lookup to linked CTest. The relocation command
runs without dependency PATH and validates the staged installed layout instead.
The Linux worker inherits normal HOME unchanged for the pinned settings
initializer, then selects its private cwd through public HomePath/ConfigPath
settings. Do not replace HOME with a project/test directory. Linked Linux
CTest 20/20, Node 452 passed / 76 skipped, and canonical codec/libudev-context /
lifecycle relocation 1/1 pass locally. Private ELF closure is enforced before
CPack; clean-machine and actual Linux RDP/device acceptance remain open.
[Build evidence](history/iterations/151-200.md#iteration-187), [closure boundaries](history/iterations/151-200.md#iteration-189).

The actual Linux/XRDP transport helper uses a separately owned Linux lab container
with the current built source and private dependencies. The host reads ignored
lab credentials and forwards one bounded private stdin object:

```powershell
node scripts/run-linux-xrdp-transport.mjs freerdp-bridge-linux-rdp-201 strict
node scripts/run-linux-xrdp-transport.mjs freerdp-bridge-linux-rdp-201 connect sha256:<previously-approved-fingerprint>
```

Use only an explicitly authorized certificate fingerprint; the helper never
accepts another certificate. Run modes sequentially. The connected mode requires
actual JPEG/H.264 and negotiated resize/restoration, writes no desktop images,
and performs no remote keyboard/mouse, audio generation or microphone capture.
It is a private native integration check, separate from browser acceptance.
[Actual evidence](history/iterations/201-250.md#iteration-201).

To test a Linux producer with the local Windows Edge consumer, use a separate
owned container built from the current verified SDK/source, publish its API only
as `-p 127.0.0.1:47998:47999`, and copy
`scripts/linux-xrdp-viewer-server.mjs` into the same `/work/scripts` location.
Keep lab credential files on the host. Run codecs sequentially:

```powershell
node scripts/test-linux-xrdp-viewer.mjs freerdp-bridge-linux-viewer-202 sha256:<previously-approved-fingerprint> h264
node scripts/test-linux-xrdp-viewer.mjs freerdp-bridge-linux-viewer-202 sha256:<previously-approved-fingerprint> jpeg
```

The helper verifies the actual loopback publication before authentication, starts
the bounded Linux server through private stdin, and uses ordinary REST/control /
media paths. It checks nonblank pixels, confirmed resize/restoration and fresh
attachment replay; no microphone, audio or operational remote input is activated.
The server is a disposable test host, not the production deployment image.
[Browser evidence](history/iterations/201-250.md#iteration-202).

Active Linux audio checks use `--audio-pcm` or `--audio-opus` instead of `--form`
on `test-linux-xrdp-viewer.mjs`. These explicitly select the 200 ms output profile
and activation gesture, require actual ready packets/Worklet rendering, then
check replay. Opus additionally requires a native reset/new epoch. Leave sound
playing in the authorized XRDP session; an idle source fails the audio gate.
No microphone or audio recording is requested. [Evidence](history/iterations/201-250.md#iteration-208).

The Linux 30-minute H.264 observation uses `--soak-test` in place of `--form`:

```powershell
node scripts/test-linux-xrdp-viewer.mjs freerdp-bridge-linux-viewer-202 sha256:<previously-approved-fingerprint> h264 --soak-test
```

Copy scripts/linux-process-resident.mjs and scripts/viewer-soak.mjs into the same
Linux /work/scripts tree as the lab server. The private bootstrap selects a
finite 30-minute observation window plus cleanup time. It samples copied viewer
queues, protected render credit and worker/Node RSS every 30 seconds, retains
only fixed aggregates, then checks resize/restoration and fresh attachment.
The resource endpoint requires the ephemeral host bearer and rechecks the same
connected worker owner. It activates neither audio nor physical microphone.
This is one actual viewer, not concurrent/interactive/LAN quality acceptance.
[Actual result and bounds](history/iterations/201-250.md#iteration-220).

Current RSS lab wrappers share the strict TypeScript sampler from the built
Node package. Rebuild the ordinary Node packages before use; when refreshing a
prepared Linux lab tree, copy the matching `packages/node-bridge/dist` (including
`process-resident.js` and its updated entry point) together with those scripts.
Historical containers with older JS require that refresh before using current
wrappers. This development step does not run an RDP/device check.
[Host sampler and error contract](PROCESS_RESIDENT.md).

For microphone inventory without physical capture or sample submission, use:

```powershell
node scripts/run-linux-xrdp-microphone.mjs freerdp-bridge-linux-rdp-201 sha256:<previously-approved-fingerprint> off pcm
node scripts/run-linux-xrdp-microphone.mjs freerdp-bridge-linux-rdp-201 sha256:<previously-approved-fingerprint> opus opus --framed
```

The owned container needs the current paired worker/addon/manifest, built Node
packages, `test-xrdp-microphone.mjs` and `private-lab-input.mjs`. Credentials stay
in ignored host lab files and are sent over private stdin. The helper only reads
source status, pings, captures one desktop frame in memory and closes. Waiting
or timed-out input is reported separately from ready AUDIN/recording acceptance.
[Evidence and current network gap](history/iterations/201-250.md#iteration-210).

The independent native archive check uses only three explicitly selected files:

```sh
node scripts/prepare-native-runtime-check.mjs
docker build -t freerdp-bridge-native-check build/native-runtime-check
docker run --rm --network none --init --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /run/rdp-bridge-tests:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=700 \
  freerdp-bridge-native-check
```

Preparation defaults to `build/packages/freerdp-bridge-native-0.1.0-Linux.tar.gz`;
one alternate archive below the project's build directory can be supplied.
The verifier removes its own pinned base's system libudev fallback and changes
no host libraries. [Actual restricted native-runtime evidence](history/iterations/151-200.md#iteration-190).

### Isolated native foundation source build

With Node 24, GCC, CMake/Ninja and an already prepared Catch2 3.8.1 source tree:

```sh
node scripts/test-native-clean-build.mjs /catch2-src
```

Run from the Linux project root after the ordinary Node build. The helper copies
only project-native source and C++ fixtures into a unique ignored build tree,
uses disconnected FetchContent, compiles a new foundation worker, checks native
CTest/CLI and runs the existing framed Node lifecycle tests against that worker.
It leaves the fixture and SHA-256 receipt for inspection. Existing objects,
FreeRDP SDK, Node dependencies and lab files are not copied; lifecycle JS is
loaded from the original built workspace. This is a local project-native source
check, separate from fresh upstream dependency/FreeRDP, linked, distro and CI
acceptance. [Exact evidence and retained first helper error](history/iterations/201-250.md#iteration-243).

New clean-native receipts also include `buildProfile.v = 1`: the actual Ninja
generator, configured build type, CMake version and C++ compiler ID/version/path.
The helper requests CMake's versioned `toolchains-v1` File API reply, follows
the newest reply index and checks the requested build type against the cache.
Incomplete compiler evidence or a mismatched configuration fails verification.
Only the selected scalar fields enter the receipt; existing historical receipts
are preserved. This records the existing Debug/foundation or Release/linked
selection and does not change either build configuration.

New receipts additionally bind foundation runtime outputs in `artifacts`:
Windows `rdp-worker.exe` / `rdp-runtime-directory.exe`, or Linux `rdp-worker` /
`rdp-process-query`. Each value is SHA-256 over the completed output, streamed
with the existing 64 MiB per-file bound. A missing/oversized output fails before
receipt publication. Linked artifact inventories keep their existing fields;
historical foundation receipts without this map are preserved. These hashes
bind observed outputs, not deterministic binary reproduction or redistribution
acceptance. [Receipt evidence](history/iterations/351-400.md#iteration-381).

On Windows x64, after preparing the ordinary foundation/Catch2 source, use:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-foundation
```

The wrapper supplies the MSVC environment and temporary ASCII workspace alias
through the entire new build/CTest/Node lifecycle run. It uses the same source
copy/hash checks and platform-specific Windows pipe/private-directory inventory.
It copies no old object or binary. This is local foundation source evidence;
linked FreeRDP/dependencies, clean-machine/distro and actual CI remain separate.
[Windows/Linux receipts](history/iterations/201-250.md#iteration-244).

To compile a new Linux linked Release project-native tree against the already
prepared pinned SDK, after the ordinary dependency/FreeRDP build:

```sh
node scripts/test-native-clean-build.mjs /catch2-src linked
```

This verifies the clean pinned FreeRDP source identity, reuses external installed
SDK/Catch2/toolchain inputs, copies the filtered feature report as declared build
metadata and compiles new worker/addon/fixtures. It requires linked CTest and
Node primary/framed/TLS lifecycle, checks the IPC addon's direct import boundary
and leaves a source/input/artifact-hash receipt. No project binary/cache is
copied. Upstream libraries are reused, not rebuilt; packaging,
clean-machine/distro and CI gates remain separate.
[Exact Linux scope and results](history/iterations/201-250.md#iteration-245).

For the corresponding Windows x64 linked source build after preparing the
ordinary bundled SDK/Catch2 source:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-bundled
```

It uses the same clean pinned SDK checks and declared feature input, creates a
new MSVC Release output tree, copies SDK runtime DLLs through the existing CMake
rules and verifies Windows linked CTest/framed Node lifecycle. The Node addon
remains Linux-only. The wrapper keeps its alias alive through all child checks;
the fixture and hashes remain available under canonical build paths afterward.
This does not rebuild/package upstream dependencies or prove clean-machine /
device acceptance. [Windows linked receipt and scope](history/iterations/201-250.md#iteration-246).

To rebuild FreeRDP itself from a new local clone of the prepared pinned source,
using the existing private dependency/toolchain inputs on Linux:

```sh
node scripts/build-freerdp.mjs --clean-local
```

The helper requires a clean exact cached Git pin and creates a unique
`build/freerdp-source-clean-*` checkout, build and installed SDK. It preserves
the ordinary profile/private dependency checks, compiles a public-API consumer,
checks actual loaded-library origins/version/static channels, tests rejection
of a foreign expected prefix and runs the consumer CTest. The generated report
and receipt stay inside the fixture. No network, existing SDK replacement,
RDP connection or device access is needed. Dependencies are reused; complete
fresh dependency/distro/CI acceptance remains separate.
[Exact scope, hashes and retained first failure](history/iterations/201-250.md#iteration-247).

After that SDK receipt passes, compile and verify an independent Linux project
consumer against its exact installed prefix:

```sh
node scripts/test-native-clean-build.mjs /catch2-src linked \
  build/freerdp-source-clean-EXAMPLE/receipt.json
```

Use the actual generated receipt path. The helper checks its finite size,
completed SDK identity/pin, new source/output/install relationship and unchanged
bytes, then requires all three CMake package origins inside the new SDK. Runtime
library paths are scoped automatically for its CTest/Node children. Its own
receipt binds the SDK receipt hash and distinguishes SDK consumption from the
preceding actual source rebuild. It leaves both build trees for inspection.
This accepts the named Linux consumer, with reused other dependencies, rather
than complete fresh dependency/distro/CI or RDP/device acceptance.
[Results and scope](history/iterations/201-250.md#iteration-248).

The corresponding new Windows SDK source build uses the existing MSVC/ASCII
alias wrapper:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-freerdp
```

The alias stays alive through clone/build/install, DLL version/origin/static
channel verification, foreign-prefix refusal and CTest. Existing dependency
DLLs/toolchain are reused, not rebuilt. The independent probe explicitly uses
the public shared WinPR import ABI; no production source is patched. This is a
local SDK check, separate from a new Windows worker consumer and complete fresh
dependency/clean-machine/distro/CI acceptance.
[Windows result and retained first probe failure](history/iterations/201-250.md#iteration-249).

To build a new Windows worker consumer of that completed SDK receipt:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-bundled `
  -RebuiltSdkReceipt build/freerdp-source-clean-EXAMPLE/receipt.json
```

Use the actual relative generated receipt path. The wrapper refuses absolute /
traversal paths and other tasks before toolchain setup, then projects the path
through its ASCII alias. The shared helper validates the complete unchanged SDK
receipt and exact CMake package origins. It creates fresh project output and
checks linked CTest/Node process lifecycle without replacing the ordinary SDK.
Compilation has a separate finite ten-minute budget; CTest and process/IPC
checks retain their existing deadlines. The prepared dependency/toolchain inputs
remain reused. [Current Windows/Linux acceptance](history/iterations/201-250.md#iteration-250).

For a separate Windows linked **Debug** consumer, first build an isolated
Debug SDK with matching Debug CRT:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-freerdp-debug `
  -DependencyReceipt build/dependencies-source-clean-EXAMPLE/installed/bridge-dependency-build.json
```

Then pass that new SDK's actual receipt to the Debug consumer:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-bundled-debug `
  -RebuiltSdkReceipt build/freerdp-source-clean-EXAMPLE/receipt.json
```

The underlying SDK mode is `--clean-debug`; it always uses new source/build/
install directories and leaves ordinary/clean Release modes unchanged. The
source consumer mode is `linked-debug`. It requires a bound SDK
receipt before Catch2/toolchain/build preparation, and writes the filtered SDK
feature input inside its new fixture. On Windows it additionally requires the
SDK receipt/cache to identify Debug with dynamic Debug CRT. A Release-CRT SDK
is rejected before output preparation: its returned allocations cannot be
freed through a different consumer CRT. The private dependency outputs remain
reused with their recorded build types and API-specific ownership.
The actual CMake compiler/build-type reply is verified in the consumer receipt.
The existing `linked` / `clean-bundled` profile remains Release. No ordinary
worker, helper or generated feature inventory is replaced by this Debug task.
[Profile scope and verification](history/iterations/301-350.md#iteration-312).

Windows receipt-backed consumers validate CRT compatibility in both directions:
a Release consumer also refuses a Debug SDK before preparing output. Historical
Release receipts without a recorded build type remain accepted when their
actual SDK cache identifies Release and dynamic Release CRT.
[Reverse-combination control](history/iterations/301-350.md#iteration-313).

The selected source receipt can also drive the explicit authorized Windows
RDP CPU/RSS smoke, including worker/helper hash verification and joined cleanup:

```powershell
node scripts/test-rdp-resource-lab.mjs sha256:<approved-session-fingerprint> `
  build/native-clean-EXAMPLE/receipt.json
```

This observes the existing desktop without remote input/application launch or
saved frames. [Requirements and scope](RDP_RESOURCE_SMOKE.md),
[Release/Debug actual observations](history/iterations/301-350.md#iteration-314).

For an isolated local Linux private dependency rebuild from cached source/tool
downloads:

```sh
node scripts/build-dependencies.mjs --clean-local
```

Prepare the ordinary pinned vcpkg checkout/tool first. The helper uses unique
install/buildtrees/packages directories, disables binary caches, refuses new
source downloads and limits compilation to two jobs. It checks the clean vcpkg
pin and bounded unchanged recipe input, then writes
`installed/bridge-dependency-build.json` with source-only settings and the
installed-status hash. The original dependency prefix remains separate.
Compiler/build tools and source archives are reused; this is local source
rebuild evidence, separate from Windows/distro/CI and final runtime acceptance.
[Results and provenance](history/iterations/251-300.md#iteration-252).

Use the completed source dependency receipt for a new Linux FreeRDP SDK:

```sh
node scripts/build-freerdp.mjs --clean-local \
  build/dependencies-source-clean-EXAMPLE/installed/bridge-dependency-build.json
```

The SDK helper verifies the receipt/settings/current recipes/status, uses its
exact dependency root for configure/link/runtime and feature inspection, then
binds the unchanged dependency receipt hash into the new SDK receipt. Omitting
this argument retains the ordinary prepared dependency input. Neither path
replaces the ordinary installed SDK. [Verified handoff](history/iterations/251-300.md#iteration-253).

Pass that SDK's new receipt to the source-only project helper as before:

```sh
node scripts/test-native-clean-build.mjs /catch2-src linked \
  build/freerdp-source-clean-EXAMPLE/receipt.json
```

If the SDK binds a source-rebuilt dependency receipt, the project helper checks
that exact receipt/status/recipe input and uses its prefix throughout configure,
inventory and runtime children. Both receipt hashes appear in the consumer
receipt. The actual Linux source chain, codec/module-origin checks and full
Node regression pass locally; fresh OS/distro/CI and RDP/device/release gates
remain separate. [Complete consumer evidence](history/iterations/251-300.md#iteration-254).

The same source dependency → SDK chain is available on Windows:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-dependencies
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-freerdp `
  -DependencyReceipt build/dependencies-source-clean-EXAMPLE/installed/bridge-dependency-build.json
```

Use the actual generated relative receipt path. Run Windows native wrappers
sequentially so their temporary ASCII drive aliases cannot outlive one another.
The dependency selector refuses other tasks and traversal/absolute paths before
toolchain setup. Existing binary caches are disabled and source downloads are
refused; the Windows host itself is not network isolated. The first sandboxed
MSBuild FileTracker access failure and successful authorized repeat are retained
in [dependency evidence](history/iterations/251-300.md#iteration-255). The new pinned SDK's module origins,
static inventory, consumer CTest and receipt binding pass
[separately](history/iterations/251-300.md#iteration-256). Use its receipt with `clean-bundled` as above.

Source-only linked consumers pass their verified SDK source `LICENSE` through
`BRIDGE_FREERDP_LICENSE_FILE`. Ordinary builds retain `.deps/FreeRDP/LICENSE`
as the default. Linked packaging requires this input and the generated
`build/native-features.json` at configure time; it installs both even when the
source-only fixture contains no copied SDK CMake cache. New Linux install/ELF
closure/TGZ/restricted native-only runtime and Windows install/ZIP checks pass
[with the new source-built chain](history/iterations/251-300.md#iteration-258). To verify a particular TGZ,
pass its actual project-local path to `prepare-native-runtime-check.mjs`; the
default archive may belong to an older release cohort.

Windows Ninja dependency verification follows the SDK actually selected by the
worker's CMake cache. It checks the SDK's own matching install prefix and C-only
GDI/H.264 object dependencies after rebasing its cached ASCII alias. Both the
ordinary prepared and isolated source-built SDK layouts pass; unknown layouts
refuse. [Verification correction and full regression](history/iterations/251-300.md#iteration-261).

For Windows native-build verification, keep CMake's temporary ASCII alias alive
but run Node tests with physical project, entry-file and binary paths. The
source-only driver uses `fs.realpathSync.native()` for this Node phase because
pnpm junctions resolve to the physical drive. Mixing alias and physical module
URLs can instantiate error classes twice and break constructor checks.
Source/SDK receipt paths keep their original namespace. The bounded SUBST/pnpm
identity regression and complete Windows/Linux checks pass
[in iteration 266](history/iterations/251-300.md#iteration-266). A full tracked-source Windows export with
offline install/build/relocation/production deploy also passes
[in iteration 265](history/iterations/251-300.md#iteration-265).

The current required GNU target is GCC 8.3.0 for Astra Linux 1.7.5, while RED OS
7.3/GCC 11 remains mandatory. The compiler port retains C++20 language mode and
uses the limited bridge compatibility subset where the stock library lacks it.
See [current acceptance scope](COMPILER_SUPPORT.md) before treating a source
version check as complete platform support. Use a fresh build tree for each
compiler and rebuild all C++ dependencies rather than mixing their ABI/runtime
closures. Node 24 and CMake >=3.24 requirements are unchanged.

The bundled-native workflow now selects the
[pinned GCC 8.3 builder](../docker/gcc83-bundled-builder.Dockerfile) for Linux.
The Ubuntu runner orchestrates Docker; dependencies, FreeRDP, native worker/addon
and linked Node checks execute inside the Debian 10/glibc 2.28 builder with the
runner's non-root UID, dropped capabilities and no-new-privileges. Checkout does
not persist Git credentials. The image context contains only its recipe, public
CA roots and hash-checked Node 24.21.0/CMake 3.31.6/Ninja inputs. Historical Debian
archive metadata needs its expiry check disabled; HTTPS and signed package
verification remain enabled. The resulting tools also pin pnpm 10.11.0.

Linux has a separate recipe-bound GCC 8.3 binary-cache key; the existing Windows
MSVC key is retained. The subsequent native/service verification still uses the
original restricted bookworm images without build-prefix mounts. This catches
the initial Ubuntu-built bundle's `GLIBC_2.38` dependency mismatch rather than
raising the verification runtime's baseline. Both OS jobs finish independently.
Linux now uses separate cache restore/save actions: the checked dependency binary
cache is saved immediately after successful native build and linked checks,
before later runtime/SBOM steps. Three retained failed jobs report misses for
the same recipe key; the former combined action only saves on whole-job success,
so a late image-inventory refusal discarded that cache opportunity. The cache
path, exact recipe/input key and OS/compiler separation are unchanged; no broad
restore fallback is added. This follows the
[cache action's explicit restore/save workflow](https://github.com/actions/cache/blob/v4/README.md#using-a-combination-of-restore-and-save-actions).
It neither skips required builds/checks nor accepts cached bytes as release
evidence. Saving and a later cache hit still need hosted observation; cache scope
remains restricted by GitHub's branch rules.
The local builder/UID1000 smoke passes, including Node/glibc/compiler and the
pinned vcpkg/Meson tools. The first cold hosted run identified missing `zip`
before vcpkg bootstrap. The builder now explicitly installs curl/zip/unzip/tar;
a source-only bootstrap with no pre-existing vcpkg binary passes as UID1000.
The next cold hosted dependency build reaches gperf 3.3, whose nested
`lib/configure.ac` requires Autoconf >=2.70. Debian 10's 2.69 fails `autoreconf`
with exit 63. The builder now compiles official hash-pinned Autoconf 2.72 into
its private build-tool prefix and verifies the selected version. The GNU source
archive is limited to 8 MiB, checked before extraction, and excluded from native
runtime artifacts. A source-SHA512-bound gperf fixture reproduces exit 63 with
2.69 and passes with 2.72 under UID1000/network-none/read-only/tmpfs, retaining
GCC 8.3 and glibc 2.28. No library or FreeRDP pin is changed for this tool fix.
The following hosted attempt times out during an HTTPS builder-tool download
before compilation. These GETs now use a 15-second connect timeout, at most two
retries and the existing per-transfer time/size limits. SHA256 checks still run
before any archive extraction; mismatched content is a refusal, not a retry or
alternative unpinned source. The failed log is retained separately from build
failures.
The next hosted run `40468676394` passes the cold GCC 8.3 dependency/FreeRDP
build, native CTest 41/41, linked Node checks 1182/119 skips, and the unchanged
restricted native runtime verifier (six modules, one IPC pair, three lifecycle
acknowledgements and cleanup). It then fails the clean Node build because the
host's default pnpm store differs from the container's temporary HOME store.
The workflow now explicitly shares a workspace-local `npm_config_store_dir`
between the non-root builder and host Node assembly. The clean build/deploy
commands remain offline and frozen. A network-disabled UID1000 regression with
an empty host HOME reproduces the missing-tarball error before the explicit
store, then checks the actual clean source build, production deploy/import and
unchanged lockfile against the populated shared store. Its logs are bound in
`build/current-validation/image-builder-pnpm-store-acceptance.json`.
Corrected-source public `c04c030` then passes the cold Linux native build/CTest
41/41, full linked Node 1184/119 skips, clean offline Node source build and
production deploy/import, both application/native SBOM archives, and restricted
native and full API runtime probes. The final image inventory step fails with
`SBOM_IMAGE_IDENTITY` before scanning; the saved log does not identify which
inspection field was refused. The fixed refusal codes described in
[the SBOM contract](SBOM.md) preserve all original admission limits. Local
`build/current-validation/image-actual-linux-hosted-checkpoint.json` binds the
terminal job/step states, counted tests and successful probe receipts. Windows
bundled `c04c030` passes CTest 40/40, Node 1227/71 skips, relocation and CRT/SBOM
checks. Final Linux image inventory and overall bundled acceptance remain open.
Actual Astra/RED OS application and installed-runtime acceptance stays separate.

Diagnostic repeat `40482004084` at public `59d71eb` retains all those native/API
successes and records the precise image refusal: `SBOM_IMAGE_IDENTITY_SIZE`,
312,426,738 inspect bytes and seven layers. The prior 256 MiB SBOM admission
budget is explicitly corrected to a finite 512 MiB, with a measured-size
failing-before case and exact/over-ceiling tests passing on Windows and Linux.
The independent saved-archive/report bounds and digest/platform/layer checks
continue to apply. See [the measured artifact budget](SBOM.md); the corrected
hosted full scan remains a separate required result.

The separate [exact GCC 8.3 foundation workflow](../.github/workflows/gcc83.yml)
uses the pinned compiler image and hash-checked offline build tools. Follow the
[container instructions](../tests/fixtures/gcc83/README.md) to repeat it without
installing an OS VM. It tests foundation compilation/CTest; the linked private
runtime and actual RDP checks remain separate. [Local verification](history/iterations/401-450.md#iteration-413).

The following historical sanitizer profile uses GCC 12 with its C++20 library. The local
Ubuntu builder now includes g++-12; select it explicitly in a new output tree:

```sh
cmake --preset sanitizers -B build/sanitizers-gcc12-check \
  -DCMAKE_CXX_COMPILER=g++-12 -DFETCHCONTENT_FULLY_DISCONNECTED=ON \
  -DFETCHCONTENT_SOURCE_DIR_CATCH2=/catch2-src
cmake --build build/sanitizers-gcc12-check --parallel 2
ctest --test-dir build/sanitizers-gcc12-check --output-on-failure --timeout 30
```

`/catch2-src` is the prepared public source in the native Ubuntu verifier.
Keep an executable bounded build tmpfs, noexec /tmp, read-only root, UID1000,
network none and the other restrictions from iteration 262. Do not add non-PIE
flags or change ASLR/seccomp. GCC 12.4 CTest 16/16 and eleven Clang 18 bounded
PIE fuzz smokes pass locally; CI explicitly selects these compiler profiles and
budgets but remains unrun. Fuzz seed generation additionally needs Node 24 and
the built protocol JS (or its already generated public corpus).
[Current results and remaining symbolizer/upstream scope](history/iterations/251-300.md#iteration-264).
