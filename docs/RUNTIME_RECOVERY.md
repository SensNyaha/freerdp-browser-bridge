# Runtime recovery

## Claimed managed-file trees (unreleased)

The `feature/managed-drives` branch adds native cleanup of managed content after
both the Node owner endpoint and worker leases are absent. Published 0.5.0
retains its existing empty-runtime scope. The branch also joins this helper into
automatic worker retirement while the Node server remains alive, as described
below. Full HTTP/RDP composition, Windows-server and packaged feature acceptance
remain separate.

### Automatic worker retirement with a live Node server

After the actual child `close` event, the SDK joins IPC and resource probes,
then closes that session's Node ownership endpoint. If managed contents remain,
it invokes the native helper for exactly its owned directory. It does not scan
other sessions or recursively remove files in Node. The startup worker/helper
hashes are retained and reverified before dispatch; a changed installation does
not authorize substituting a different cleanup helper. Admission uses the shared
bounded recovery gate and existing physical-child capacity control. Cohort
verification and helper execution share a bounded retirement budget, capped at
60 seconds and otherwise using the worker's shutdown timeout.

The runtime root must satisfy the existing native ownership/permission contract.
In particular, an unsafe inherited Windows ACL is not repaired during cleanup.
Provision a private root using the installed private-directory helper or the
deployment's equivalent ACL setup. An uncertain root, unknown content, missing
or changed helper, timeout or unjoined child retains `FILE_CONTENTS_RETAINED`.
Its session capacity remains reserved. Repeated close calls share the same
completion; they do not launch an automatic retry loop. An operator's later
startup sweep does not by itself acknowledge an already-retained registry slot.

Only confirmed native removal, or confirmed absence after a concurrent verified
sweep, resolves file retirement. The existing session manager then releases the
slot. If its public shutdown/termination waiting deadlines expire first, the
slot remains held until the original joined completion succeeds. Failed sessions
and their old file locators remain unavailable; cleanup never resurrects them.

Actual Node/native registry tests keep a sibling active, crash a worker with a
131111-byte Unicode file and a 65536-byte staged upload, and hold helper dispatch
past both manager deadlines. They verify blocked admission before cleanup,
replacement admission afterward and sibling readback. Unknown runtime siblings
and mismatched startup-cohort bindings preserve files and capacity. An HTTP test
holds a backend write completion after actual native IO and kills that worker;
the real file deadline revokes authority, reports fixed `FILE_FAILED`, joins
native cleanup and permits a replacement under a one-session limit. RDP state
in that HTTP test is explicitly synthetic.

Separate actual Astra XRDP/FUSE runs create/read/write/rename Unicode/binary
files and verify three read-only refusals before crashing the connected worker.
Windows framed IPC and Linux framed/RWS1 all reclaim committed remote/host
files and a pending upload, refuse the old native file authority, keep Node
alive, join a replacement lifecycle worker and verify the owned remote shares
disappear. These are named Astra-server crash results, not Windows-server,
HTTP/real-RDP composition or installed-product acceptance. Evidence is bound in
`build/current-validation/managed-files-live-retirement-acceptance.json`.

Use the existing trusted-host API with a matching worker/helper cohort:

```ts
import { recoverRuntimeSessions } from '@freerdp-bridge/node';

const report = await recoverRuntimeSessions({
  workerPath,
  runtimeRoot,
  timeoutMs: 60000,
  maxEntries: 128,
});
```

`maxEntries` bounds the outer runtime scan, not the managed files inside one
session. The total deadline includes cohort verification and native children;
timeout does not authorize uncertain cleanup or another unjoined child. The
existing report, fixed helper status and CLI arguments are unchanged.

### Ownership declaration

An eligible native file service exclusively creates `managed-files`, then an
immutable `.managed-files-owned` file in the session runtime, before creating
its user-data namespace. It contains exactly 56 bytes, with no credentials,
logical filenames, file contents or user-profile data:

| Offset | Width | Value |
| --- | --- | --- |
| 0 | 8 | ASCII `BRMF0001` |
| 8 | 8 | Runtime directory volume ID, unsigned big-endian |
| 16 | 16 | Runtime directory file ID |
| 32 | 8 | Managed container volume ID, unsigned big-endian |
| 40 | 16 | Managed container file ID |

File IDs use the native `FileIdentity` representation: Windows' 16 raw ID bytes;
Linux's inode in eight little-endian bytes followed by eight zero bytes. The
record is private ownership metadata, not an authentication token or a per-file
journal. It explicitly declares the private `.data` and `.uploads` trees as
disposable session content. `.uploads` admits only flat 16-digit lowercase hex
native keys; logical names occur under `.data`. A browser selecting a reserved
basename creates a logical file inside `.data`, never the runtime declaration.

Full records must match both held directory identities. A valid startup prefix
or an absent record authorizes only an empty managed container. A partially
removed container can be rescanned while its full record remains. If the
container is already gone, only matching parent-bound metadata remains to be
removed. Malformed, oversized, nonprivate, linked or foreign records are
retained. Older nonempty containers without this declaration are retained too.

### Cleanup boundary

The helper first verifies the existing owner endpoint and directory/marker
locks, OS ownership and private permissions. Before touching content it rejects
any runtime entry other than `.rdp-worker-owned`, `.managed-files-owned` and
`managed-files`. An unknown sibling retains all managed content as well.

The managed root is opened relative to a duplicate of the already-held native
lifecycle handle. Windows keeps its original non-delete-sharing guard; cleanup
never solves a sharing conflict by relaxing that guard or reopening its path.
Linux retains the original dev/inode binding when refreshing the directory link
count changed by removing the declared managed child.

Preflight inventories the complete tree with at most **65540 entries**, **4 MiB
of stored pathname bytes**, **32 components**, **4096 bytes per path** and **255
bytes per UTF-8 component**. Count and string budgets are checked before
allocation. All entries must have private ownership, remain on the same
filesystem and be ordinary single-link files or directories. Symlinks,
reparses, mount escapes, hardlinks, devices, FIFOs, sockets, invalid names and
unrecognized container-level entries refuse the plan. File contents are not
read. Native Windows file creation now applies the root's explicit private
owner/DACL so these files can be independently verified after a crash.

The owner endpoint is checked again after preparation. Before the first
removal, the entire inventory and declaration are revalidated. Validation
refusals return no partial deletion plan. Physical removal can still fail after
some declared entries have been deleted; remaining content and its declaration
are retained for another verified recovery attempt. Children are removed before
parents with expected file-ID checks. The declaration is removed only after the
managed container, followed by the ordinary runtime marker and empty runtime.
The existing same-OS-user trust boundary remains unchanged.

### Verification and remaining acceptance

Actual Node/native tests create a **131111-byte committed Unicode file** and a
**65536-byte unfinished upload**. A blocked live Node owner preserves them after
worker hard kill. After Node is also killed, the helper removes the claimed
content and runtime. An unknown runtime sibling first forces retention of every
owned file. A separate parent-only kill verifies native self-cleanup. Windows
framed IPC and Linux framed/RWS1 execute these cases without RDP or credentials.
Native tests additionally cover foreign declarations, bounded scans, partial
startup/finalization, changes after preflight, private modes, links and the
original live-lease controls.

Windows initially exposed a conflicting path reopen against the held DELETE
guard; handle duplication fixes it. Linux exposed the legitimate parent link
count change after managed-child deletion. RED OS exposed a legacy C++ fixture
inheriting SSH umask `0002`; that fixture now creates its marker as `0600`, like
production, without weakening ownership checks. Prior failures remain recorded.

Logs/source and binary bindings use `managed-files-recovery-*` under
`build/current-validation`, with actual distro component receipts under
`managed-drives-recovery-*`. This named dead-owner scope remains separate from
the subsequently verified automatic retirement above, full HTTP/RDP composition,
Windows-server, installed npm/standalone and full Stage 7 acceptance.

## Windows long installation paths in 0.5.0 preparation

An actual independent 0.5.0 npm consumer exposed a canonical helper path of
299 characters: the verified executable exists and can be read, but Windows
process launch returns ENOENT. Its 303-character extended-length path launches
the same bytes. Cohort canonicalization removes that prefix, so the recovery
process owner now applies `toNamespacedPath` only at the Windows executable
launch boundary. Linux executable handling is unchanged. Root/component
arguments, cohort hashes, finite child/output limits, cancellation and joined
settlement retain their existing contracts.

`tests/integration/runtime-recovery-long-path.test.mjs` copies the actual native
helper into a fresh path above MAX_PATH, canonicalizes it, and verifies recovery
of a privately created owned orphan through the production process owner. The
case fails before the fix with `RUNTIME_RECOVERY_UNAVAILABLE`; all nine focused
long-path, SDK and cancellation cases then pass on Windows. A fresh exact-archive
Fastify consumer also passes image/HTML capabilities and runtime recovery after
the fix. Full final release checks and other OS/installer acceptance are
separate. The prior failed consumer log and unpublished archive are retained in
`build/current-validation/image05-recovery-long-path-counterexample.json`.
No existing immutable release bytes are replaced.

Shared `master` now includes both accepted branches; immutable annotated
`v0.3.0` identifies merge `4ce88b3`. The following local-acceptance report was
recorded before that merge. npm and standalone public delivery is now accepted;
see [public delivery](#030-public-delivery).

Post-tag review found a second delivery-only boundary: the standalone publisher
still tested only `patch >= 5`, so it would reject 0.3.0/0.3.1 before uploading.
New before/after cases reproduce both refusals and now verify the complete
version against 0.2.5. The immutable product tag and ten archive bytes are
preserved. Core OIDC has published both native runtimes; delayed registry
visibility ended the first job after acceptance. A read-first continuation of
that same job skips the now-public exact bytes and continues the shared JS set.

An explicitly committed `packaging/standalone/release-resume.json` may route a
trusted main/master publisher revision to the original retained hosted build.
Its bounded schema fixes product version, source SHA and run ID. GitHub API
proof must match the immutable annotated product tag, the same public source
repository, the original standalone workflow and a completed successful run;
plan, both Windows/Ubuntu installed build jobs and combined verification must
all have succeeded. Tag-based dispatch is validation-only until this proof is
available. Actions downloads only that run's SHA-prefixed artifacts and checks
their digests; ordinary receipt verification still requires the exact seven
files and `candidateOnly: false`. The publisher rechecks the API proof and
source/tag binding before writing. Normal publication retains its exact current
workflow SHA rule. The main/master, fixed repository, no-overwrite and
manifest-last guards remain unchanged; no local fake CI environment or manual
asset upload is introduced. A verified retained run can resume partial uploads;
a fresh build still refuses them. Pointer/schema/fork/workflow/source/job drift
and the actual CLI partial-plan path have explicit tests.

This delivery repair was merged from `fix/standalone-minor-publication`
(`275a7ea`); focused release
tests pass **17/17** and workflow lint passes. Full current-source `pnpm check`
passes Windows **1050/70 skips/0 failures** and Linux **1030/92 skips/0 failures**,
recorded in `recovery-release-resume-{windows,linux}-check.log` under
`build/current-validation`. Actual hosted retained-artifact publication is
accepted below. No new RDP feature, dependency version, native binary or
accepted npm archive is introduced.

The first generated GitHub delivery export then exposed a test-packaging omission:
`release-tools/native-smoke.mjs` copied its Fastify consumer and TLS fixture but
omitted the consumer's `browser-port.mjs` dependency. Direct execution confirms
`ERR_MODULE_NOT_FOUND` before native work. Copying the existing helper fixes the
same smoke without changing the accepted product source, archive bytes or tag.
The previous failed run leaves an intentional runtime junction, so the local
repeat retires only that verified scratch alias before creating a fresh one.
The source/native smoke and delivery guards pass; evidence is
`recovery-release-native-smoke-{before,port-helper-fixed}.log` under
`build/current-validation`. Current export tooling supplies this checked
delivery helper separately from the immutable upstream product snapshot.

The **0.3.0 recovery feature is locally accepted**: native/full workspace checks,
exact npm consumers, both portable formats, Windows/Ubuntu/Astra/RED OS installed
upgrades and eight actual desktop profiles pass. [Exact release acceptance and
frozen archives](#030-local-release-acceptance). Merge/tag and publication are
complete. The original full Stage 1 is still open.

## Cross-principal acceptance

2026-10-25: the named OS-principal lifecycle scope is accepted. Private commits
`7a17eca`, `1838a05` and `5c4ac52` match tested public source `e7f2af2`.
[Foundation CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40212301851)
passes Windows, both Linux compiler profiles and sanitizers/fuzz;
[exact GCC 8.3 CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40212301856)
passes too. Each OS-principal step passes **2/2 with no skips**, separately from
the ordinary suite, which deliberately skips that privileged scenario.
Windows full foundation checks pass **995/127 skips**, Linux linked checks
**1031/93 skips**, zero failures. Native CTest passes Windows foundation **21/21**
and Linux linked GCC 8.3 **39/39**. Both hosted foundation profiles also pass the
actual 100-worker lifecycle gate. [Bounded machine-readable evidence](evidence/RUNTIME_RECOVERY_ISOLATION.json)
binds all source inputs and final/retained-failure log hashes.

This is additional acceptance of the existing 0.3.0 production boundary. No
production package/dependency/native source, RDP capability, accepted npm archive
or installer is changed or repacked. Malicious processes running as the same OS
user, the broader installed-distro multi-user/security matrix and future
drive/spool retention remain outside this accepted scope; full original Stage 1
is not silently closed. Preparation failures below remain as history.

`feature/stage1-cross-principal-isolation` adds an actual OS-principal boundary
check for the remaining Stage 1 isolation gate. It does not change production
admission or claim a new RDP capability. Two real Node/native workers and one
schema-1 orphan share a readable runtime root; a different unprivileged OS
principal must be able to list that root but must be denied session-directory
listing, marker read/write, child creation, marker ownership and recovery.
Both live workers must answer heartbeats after each foreign attempt. The
legitimate owner then removes only the orphan and joins both workers' cleanup.

Exact GCC 8.3 Linux passes this scenario under owner UID/GID 42420 and foreign
UID/GID 42421, including an intentionally readable orphan counterexample that
must fail the privacy probe. A separate private HOME is required for linked
FreeRDP's settings initialization; its first missing-HOME failure is retained.
The first fixture close also incorrectly treated its own stdin destruction as
failure; breaking the command loop preserves all cleanup/exit assertions.
Evidence is `cross-principal-linux-{first,preflight,home,counterexample}.log`
under `build/current-validation`. This is native lifecycle, not connected RDP.

Windows uses a one-shot scheduled task under actual
[`NT AUTHORITY\LocalService`](https://learn.microsoft.com/en-us/windows/win32/services/localservice-account),
without user passwords or new local accounts. The probe verifies its actual
TokenUser SID. A fresh CI-only directory grants LocalService read/execute on the
public probe/root and write access only to bounded nonsecret receipts; session
directories retain the production owner/System boundary. Tasks have finite
execution limits and only the newly registered task is retired. The probe is
test-only and is never installed in npm or standalone payloads. Hosted Windows
proof and full regression now pass as recorded above. Existing
same-user DACL checks do not count as this second-principal evidence.

First hosted run `40210047679` passed the ordinary Linux suite but its extra
UID case could not load a fixture from the runner's private home. The corrected
test stages only declared compiled workspace packages, installed TypeBox build,
fixed native files and Node into a fresh public test subtree. It never copies a
home directory, Git metadata or lab configuration and never changes ancestor
permissions. Files/depth/bytes are bounded; the subtree is retired after joined
cleanup. Exact GCC 8.3 passes with the original source checkout deliberately
mode 0700, reproducing this boundary locally. The initial TypeBox manifest-export
lookup failure is retained too. An unrelated Windows full-suite Edge `page.goto`
3000 ms timeout passes its unchanged focused repeat; the first log remains.
Full Linux linked checks pass **1031/93 skips/0 failures**; original Windows
foundation CTest is **21/21**, linked Linux CTest **39/39**. Hosted proof and
current Windows full-suite success were still pending at that checkpoint.

The corrected Linux CI cases pass both compiler profiles. The next Windows CI
reaches setup but inherits PowerShell 7 module lookup paths into the explicitly
selected Windows PowerShell process, so `Set-Acl` cannot load its matching module.
The fixture now selects only that process's standard `$PSHOME/Modules`; the host
environment is unchanged. OS-principal checks run as named CI steps before the
long browser suite, and matrix failures no longer cancel the other profiles.
Local Windows full checks pass **995/127 skips/0 failures**. Actual Windows
LocalService acceptance then passes in run `40212301851`; its first setup failure
is retained. Windows' ordinary full hosted suite also passes **995/127 skips**,
and each Linux foundation suite passes **930/194 skips**, zero failures.

## Preparation checkpoints

Release preparation now targets **0.3.0** on `release/0.3.0`, from the feature
implementation at `51283d1`, with candidate corrections under validation. The
public stable version remains 0.2.5. Fresh
0.3.0 native CTest passes Windows **38/38** and exact GCC 8.3 Linux **39/39**;
workspace checks pass Windows **1044/70 skips** and Linux **1024/92 skips**,
zero failures. Exact archived packages pass all four external npm consumers
on both OSes, including strict TypeScript and native TLS rejection.

The first actual Linux npm-installed portable candidate exposed a packaging
error: npm normalized the new recovery executable to mode 0644 because its
`bin` entry was missing. The strengthened consumer now creates a real schema-1
orphan and invokes recovery; it reproduces the old archive's failure. The
corrected Linux archive declares the executable, and npm resolves its updated
lock metadata while preserving every external dependency entry. Lock advancement
and candidate verification now reject executable-metadata drift too. All four
Linux consumers then pass real orphan recovery; the four existing Windows
consumers pass the same stronger operation. Actual relocated portable checks
pass **1/1 on each OS**, including orphan removal before READY and joined native
shutdown. The Windows protected-directory fixture requires execution as its
owner outside the restricted sandbox; its original PATHS refusal is retained.

Evidence is `recovery-release-{windows,linux}-check.log`, native/package logs,
`recovery-release-linux-{repackage,lock-resolution,consumers-fixed,portable-fixed}.log`
and `recovery-release-windows-portable-owner.log` under
`build/current-validation`. `recovery-release-archives.json` records the rejected,
unpublished Linux archive separately from the corrected hash. These are local
candidate results: installed upgrades, actual desktop profiles, final merge and
publication remain open. They do not close the original full Stage 1 gate.

Hosted Windows foundation CTest in run `40182867601` then exposed a Windows
ownership distinction absent from the local token: an elevated process can
create a marker whose default owner is Builtin Administrators. The correction
under validation admits that marker owner only when it exactly matches the
process token's default Administrators owner. Marker ACLs must still grant only
the individual service user and LocalSystem; session-directory ownership must
still match the individual user. Arbitrary groups and group-owned session
directories remain refused. No ACL or owner is repaired. The existing trusted
administrator host boundary is unchanged. Hosted elevated acceptance and rebuilt
candidate archives remain pending; the first candidate is not accepted.
Fresh local MSVC CTest **38/38** and the clean driver's native-process matrix
pass for this correction; the added actual elevated-token directory control
explicitly skips on the local non-elevated token and still needs hosted proof.
The matching native source hash is
`03bba62ebab1f96812652d7d79bf717572f37d42c2e097b2df9a01bdc41c3005`.
Exact GCC 8.3 rebuild/CTest **39/39** reproduces the unchanged Linux runtime
archive `1ac6478f5d2954452bfc7cf9af2f54447dffb4a2762c012399b7f9c243390d87`;
this correction changes only Windows production code. The new Windows archive
is `e6853af5a8804b595ece3008970588e58f8be8c4b3d85cd21924384a8abfb53f`.
The failure-only private-payload startup probe and supervisor matrix pass
**10/10** locally. Evidence is `recovery-release-windows-owner-{clean,package}.log`,
`recovery-release-linux-owner-native.log` and
`recovery-release-windows-startup-diagnostic-fixed.log`. Installed candidate
acceptance and final delivery are still pending. Current-source full checks now
pass Windows **1044/70 skips/0 failures** and Linux **1024/92 skips/0 failures**,
logged in `recovery-release-{windows,linux}-owner-check.log`. All four exact
Windows npm consumers pass with the corrected archive; Linux keeps its already
verified byte-identical archive and four consumer receipts. The rebuilt Windows
host/payload passes supervisor **10/10**, portable **1/1**, and all four actual
Astra/RED OS H.264/JPEG desktop/resize/reattach/cleanup profiles. The new ZIP hash
is `38041edaf31e27c7eb3c82a7db3e6ef37c4176885f0fe397396b1f45ded2e2a1`.
Evidence is `recovery-release-owner-consumer-*-windows.log`,
`recovery-release-windows-owner-{supervisor,portable-build,portable-test}.log`
and `recovery-release-rdp-evidence/` under `build/current-validation`.
All ten archives pass known-lab-value scanning and official npm dry-run, with
unchanged SHA-512; `recovery-release-owner-archive-audit.log` records this.
Neither a dry-run nor a public unstable candidate is npm/stable publication.

Second installer candidate CI
[`40185826696`](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40185826696)
at public `21a36f1cd70286ea2998bf355ef22cebeb4a22be` passes both platform builds,
portable/native shutdown, Windows/Ubuntu installed upgrades from 0.2.5 and the
combined seven-file verification. Publication is intentionally skipped.
The initial candidate's Windows foundation failure is fixed; its installer
supervisor failure is absent in this run. All GCC8.3 and Linux source profiles,
sanitizers and fuzz pass. The Windows source job passes native CTest but reports
one Edge fixture `page.goto` timeout (5000 ms) before any clipboard operation;
the failed log is retained and only that job is being rerun without changing
its timeout or assertions. Installed Astra/RED OS profiles and final publication
are still separate gates.

Named candidate upgrade checks now also pass on actual Astra **1.7.5** and
RED OS **7.3**, using the independently downloaded/verified CI DEB/RPM. Both
retire an old live 0.2.5 worker, preserve public configuration, confirm the new
service/native version and non-root identity, recover after a crash, reinstall
and uninstall. RED OS also preserves an intentionally stopped service and its
`rpmsave` behavior. All eight actual desktop profiles pass: Windows portable to
both labs and each installed Linux service to its lab, H.264/JPEG, resize,
fresh-grant reattachment, zero browser errors and empty-runtime joined cleanup.

The initial Astra desktop fixture correctly received HTTP401 because the VM
clock was 222 seconds behind the local synthetic issuer. Read-only SSH checks
confirmed this skew (RED OS was within one second). The test-only issuer now
uses the owned service's HTTP Date over the pinned lab tunnel, with a bounded
900-second fixture admission check, and emits only scalar skew/status/phase.
It creates the same five-minute in-memory JWT after readiness. The real
authenticator retains its five-second tolerance; no system time, service policy,
certificate trust or credential transport is changed. Both corrected Astra
profiles pass with the original failed receipts retained. Production issuers
and services must synchronize clocks; this fixture correction does not make
arbitrary clock skew a supported deployment profile.

Source CI `40185826828` now succeeds after repeating only its failed Windows
job, including the unchanged Clipboard API denial case; the first timeout log
is retained. Windows passes 988 tests/126 foundation-profile skips/zero failures
in that hosted run, separately from local linked 1044/70. Evidence under
`build/current-validation` is `recovery-release-windows-owner-foundation-rerun.log`,
`recovery-release-ci-{windows,linux}-verified*.log`,
`recovery-release-installed-labs/installed-{astra,redos}.{json,log}` and
`recovery-release-rdp-evidence/`. Stable merge/tag, npm publication and final
registry-only installer publication remain pending.

Status: in development on `feature/stage1-runtime-isolation`. Linux root
admission is implemented. The internal parent ownership endpoint is implemented
and tested. The native worker now recognizes schema-1 directories and requires
an exclusive marker lock before entering its IPC loop. Native component checks
pass on Windows and Linux; current full `pnpm check` passes Windows 1037 tests
with 70 explicit skips and Linux 1017 tests with 92 explicit skips, no failures.
The native cleanup helper, cohort verification, SDK managed-directory selection
and explicit recovery API are implemented. Standalone invokes recovery before
opening its listener. Windows portable startup and supervisor crash/restart
checks now pass, as does Linux portable startup/recovery/shutdown. Installed-service
release acceptance remains open.
This revision is not
part of the published 0.2.5 release. The original Stage 1 cleanup/isolation gate
remains open until its remaining acceptance checks pass.

This implements SPECIFICATION sections 2.12/3.1 and SECURITY's per-session
ownership boundary. One native FreeRDP worker remains separate from Node.
No RDP credentials, attach tokens, process environment or application content
belongs in recovery metadata, command arguments or logs.

## Ownership and compatibility

Each managed session will have two independent signs of life:

1. Its Node owner holds a random local IPC endpoint. A successful connection
   preserves the directory. A timeout, cancellation, permission error or any
   uncertain result also preserves it; only definite endpoint absence permits
   the next check.
2. Its native worker holds an OS lock on the existing `.rdp-worker-owned`
   marker. Recovery must acquire that lock exclusively before touching files.
   A surviving worker therefore remains protected after its Node owner dies.

The endpoint identifier is nonsecret ownership metadata, not an authentication
credential. The endpoint consumes no peer payload and exposes no operations.
It uses an abstract Unix-domain socket on Linux and a named pipe on Windows,
with no TCP port or filesystem socket. These OS endpoints disappear when their
owner's last handle closes; see the pinned
[Node 24 IPC contract](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/net.md#ipc-support).
Actual tests verify that a separately spawned child does not retain the endpoint
after the owner is hard killed. No PID-based deletion authority is used.

The native-lock protocol must be proven for the selected worker before managed
directories are created. Builds now generate a colocated `rdp-worker.runtime.json`
binding the worker and recovery-helper SHA-256 values to directory/lock schema 1.
SDK verifies the bounded manifest and both binary hashes before enabling managed
directory selection. An absent
manifest retains the existing legacy path. A present but malformed or mismatched
manifest must fail closed. Legacy sessions must preserve their existing cleanup
behavior; their directories cannot be reclassified as recoverable based on a
filename or process age alone.

The managed directory component is exactly:

```text
worker-<32 lowercase hex owner ID>-1-<32 lowercase hex session ID>
```

This is 74 ASCII characters. The schema binds the interpretation of that
component to the verified native cohort. `.rdp-worker-owned` retains its
existing ten bytes, `runtime-v1`, so ownership bookkeeping introduces no session
secret file and no RDP wire change. A separate owner JSON file is unnecessary.

## Safe recovery

The native schema-1 lease pins the directory handle and holds its marker until
worker teardown. On Linux it uses `openat`/`O_NOFOLLOW` and a nonblocking
exclusive `flock`; on Windows it uses a non-inheritable marker handle without
sharing. A marker must be a single-link regular file containing exactly
`runtime-v1`. The Linux directory must belong to the service UID with mode 0700;
group/other-writable markers are refused. Windows requires a protected directory
DACL and owner, and permits marker/directory grants only to the current service
user and LocalSystem, matching the existing private-directory helper. Reparse
points and unsafe ACLs are refused. Rejected acquisition closes both handles,
does not delete metadata and returns only a fixed IPC failure before HELLO.

Normal teardown releases the lease before removing the marker and empty
directory. A hard kill leaves metadata but lets the OS release the lease, so a
replacement can acquire it. Legacy names retain the earlier marker-only path.
The SDK opens its ownership endpoint before creating a managed directory and
keeps it until child retirement and owned-directory cleanup are joined. Startup
cancellation closes that endpoint without allowing a late child. A mismatched
cohort is refused before creating the runtime root or spawning a child. An
absent manifest preserves legacy names and cleanup; arbitrary synthetic worker
basenames do not adopt metadata belonging to a colocated real worker.

The host supplies a trusted runtime root and trusted ancestors. Linux admission
already refuses symlinks, a foreign UID and group/other write permission, without
repairing existing objects. Windows continues using its protected private
directory helper; the recovery helper must independently validate its handles,
ownership and ACL boundary before any deletion.

Recovery will enumerate a bounded number of entries within a finite operation
budget. It will consider only verified schema-1 names under that root. Native
code must pin root/directory/marker identities with OS handles, reject links and
reparse points, check owner/type/size/link counts and recheck the Node endpoint.
Only then may it attempt the worker's exclusive marker lock.

Recovery is for the current metadata-only runtime layout. It may remove only
the exact owned marker and an otherwise empty confirmed directory. Unknown
files or nested directories are retained; there is no recursive cleanup of
arbitrary content. Managed drives and print-spool retention require their own
later policy and acceptance. Recovery never kills a process.

Empty or partially prepared managed directories need coverage too: if both
owners die before the marker write finishes, recovery must establish that no
connected worker could have reached readiness before deleting only known
metadata. The native schema-1 startup path must require successful marker
validation/locking before HELLO, configuration or credentials. An unsupported
legacy worker cannot receive schema-1 ownership authority.

The proposed SDK operation will report bounded content-free counters for
removed, active and retained entries, and whether scanning completed. Standalone
will run it before accepting sessions. Embedded projects will be able to invoke
the same operation explicitly. Missing capabilities and incomplete scans must
remain visible; they are not successful cleanup claims.

## Native helper contract

`rdp-runtime-recovery[.exe] <absolute-root> <schema-1-component>` is an internal
trusted-host operation; neither argument contains a credential. It returns one
fixed JSON object, `{ "v": 1, "status": "removed|busy|retained" }`, with a single
status value. Invalid argument counts return exit 2, output failure exit 3.
Operational refusal returns `retained`; uncertain ownership never means removal.
There is no recursive delete, process termination, arbitrary file selector or
payload echo. SDK consumers must verify the binary cohort before invoking it.

The helper probes the Node endpoint independently before opening the root and
again immediately before deletion. Linux connects to the abstract socket with a
bounded 250 ms nonblocking probe. Windows checks the named pipe without waiting;
an existing or busy pipe preserves the directory. Permission and ambiguous
errors retain it on either OS.

Linux pins the root/directory using no-follow handles, checks service UID and
root write permissions, obtains a nonblocking directory lock to serialize
reapers, and locks the marker against a surviving worker. It rechecks inode/device
and link counts immediately before `unlinkat`. Windows pins root/directory
handles against replacement, acquires DELETE access without delete sharing, and
uses handle disposition for the known marker and empty directory. A live worker
or another reaper prevents that exclusive acquisition. Both paths check fixed
marker bytes, size/type, single-link ownership and directory contents first.

Windows roots may be owned by the service user, LocalSystem or Administrators,
matching service-installed roots. They may grant access to the service user, LocalSystem and trusted
Administrators; other principals may have read-only grants. A write grant to
another principal is refused. Session directories retain the stricter protected
service-user/LocalSystem DACL. The helper never changes either ACL. The test
host's temporary directory inherits sandbox-user write grants, so positive
fixtures explicitly create protected roots with the existing private-directory
helper. An explicit Everyone-write root test remains a negative case.

Directory enumeration uses fixed bounded storage: at most five `readdir`
results on Linux or four 4096-byte handle-enumeration pages/four entries on
Windows. Anything except `.`/`..` and the known marker retains the directory.
Missing markers and exact prefixes of `runtime-v1` are recoverable only in a
validated schema-1 directory with absent Node ownership and no native lock.
Malformed bytes, links, FIFOs, reparse points and unknown contents are retained.

Manifest generation is part of ordinary CMake build/install and binds exact
colocated executable names and hashes. The clean native driver verifies the
manifest against both binaries, requires both ownership/recovery CTest targets,
runs the actual process scenarios and records the helper/manifest hashes.
This is compatibility metadata inside a trusted installation, not a signature.

## SDK and application startup

The following API is available in the development source, pending release. It
is re-exported by the Fastify, HTTP, Express and NestJS adapters, so a host does
not need a separate direct dependency on the lower-level Node package.

```js
import {
  resolveNativeRuntime,
  recoverRuntimeSessions,
} from '@freerdp-bridge/express';

const worker = await resolveNativeRuntime({
  runtimeRoot: '/var/lib/my-portal/rdp-runtime',
});
const recovery = await recoverRuntimeSessions({
  ...worker,
  timeoutMs: 10_000,
  maxEntries: 128,
});
if (!recovery.supported || !recovery.complete) {
  throw new Error('RDP_RUNTIME_RECOVERY_INCOMPLETE');
}
// Create/register your adapter with `worker`, then start the application's HTTP server.
```

The runtime root must be an absolute dedicated local directory with trusted
ancestors and the OS ownership boundary described above. On Windows use a drive
path and create/protect the root during trusted installation; neither recovery
nor startup repairs an existing root's ownership. Missing roots are reported as
an empty completed scan; the operation does not create a root. Creating sessions
remains the worker startup path's responsibility.

The result contains only `supported`, `complete`, `scanned`, `removed`, `active`
and `retained`. `active` includes a live Node owner or a busy native lock.
`retained` includes unknown names/content and uncertain ownership; a completed
scan does not claim that every directory was deleted or every retained object
was safe. Missing legacy capability returns `supported: false, complete: false`
with zero counters and no filesystem changes. Invalid/mismatched present
metadata produces a fixed `RuntimeRecoveryError`, never a fallback delete.

`maxEntries` is 1..1024 (default 128), counting all directory entries, including
unknown names. Reaching it before EOF returns `complete: false`. Enumeration
uses a 16-entry buffer and dispatches helpers sequentially. `timeoutMs` is
1..60000 (default 10000), including admission, manifest/hash checks and scanning.
An `AbortSignal` is optional; its reason is never emitted. Expiry/cancellation
stops further dispatch and joins the current helper's termination. Individual
helpers have a three-second operation cap and a separate two-second close cap;
unconfirmed physical retirement is `RUNTIME_RECOVERY_CLOSE_FAILED`, never a
successful or merely cancelled result. Recovery operations share four active
slots and at most 64 waiting callers, with a two-second admission cap.
The helper owner separately caps physical children at four. A logical timeout
or an `exit` event does not release a child slot: it remains reserved until the
actual `close` event confirms process/stdio retirement. While all four slots
remain uncertain, new helper dispatch returns the fixed
`RUNTIME_RECOVERY_UNAVAILABLE`; confirmed closure permits replacement.

Standalone runs the operation after installed-runtime resolution and before
creating/listening on HTTP. It emits one `STANDALONE_RUNTIME_RECOVERY` record
with these counters, then requires `supported && complete`; unsupported or
incomplete recovery prevents readiness. Retained entries stay visible in that
record. Operators can inspect retained legacy/unknown objects under their own
retention policy; recovery will not turn them into recursive deletion targets.

## Acceptance

Acceptance requires actual native lock exclusion and crash release;
parent-only, worker-only and simultaneous hard kill; active sibling preservation;
two live Node owners sharing a root; foreign users; links/reparse points; unknown
content; malformed/partial metadata; concurrent recovery; bounded cancellation;
legacy compatibility; and recovery after service restart on Windows/Linux.
Process-only tests do not accept actual RDP behavior or installed service upgrades.

Current evidence: `runtime-root-acceptance.json` records five Linux admission
cases under UID1000, including a real UID1001 root, plus actual native
HELLO/heartbeat/shutdown. The same admission tests fail four cases before the
change. Native CTest passes 36/36 and Windows lifecycle/private-directory tests
22/22. The internal endpoint tests pass 5/5 on each OS, including a 64-probe burst,
joined closure, cancellation, Linux descriptor cleanup and real parent hard kill
with a surviving child. Receipts/logs live under `build/current-validation`.
These results do not yet accept deletion, crash recovery or a new release.

The schema-1 native component additionally passes fresh linked MSVC CTest
37/37 and Linux GCC12 ASan/UBSan foundation CTest 21/21. Real managed worker
tests pass 2/2 without skips on each OS: concurrent claim is refused before
HELLO, hard kill leaves the marker and releases the OS lock, replacement startup
then graceful shutdown removes the empty directory, and four malformed/partial
markers are preserved without HELLO. Windows tests explicitly observe `EBUSY`
while the owner holds its non-shared marker. Native unit cases also reject hard
links, unsafe modes/ACLs, and Linux symlinks/FIFOs. Exact GCC 8.3.0 compiles the
component with warnings as errors; this is a compiler result, not Astra or
RED OS installed acceptance. The linked legacy lifecycle/clipboard subset passes
27 tests with one explicitly unavailable Linux-transport skip on Windows.

Full Windows `pnpm check` on the new linked worker passes build, lint, formatting
and Node 1013/68 skips/0 failures, including the new runtime-owner and native
ownership tests. Linux-only root-admission cases remain explicit Windows skips;
their separate actual Linux evidence is retained above.

Evidence is `runtime-ownership-{linked-build,windows,linux,gcc83}.log` and the
fresh `build/native-clean-8tgnj6/receipt.json`. The initial Windows fixture tried
to read an intentionally non-shared live marker and failed with `EBUSY`; its
corrected assertion and original log are retained. The first foundation build
passed CTest but refused its final receipt after formatting changed the source;
the successful linked build above verifies unchanged source. The full check is
`runtime-ownership-check.log`; `runtime-ownership-acceptance.json` binds component
sources and logs. Automatic recovery, SDK cohort activation, broader Linux
regression and installed OS acceptance remain
separate gates.

The native cleanup helper now passes fresh linked MSVC CTest **38/38**, with
manifest hashes checked against the actual worker and helper. Its clean-build
Node subset passes **36/2 skips/0 failures**, including managed directory and
legacy lifecycle/clipboard checks. Separate Windows recovery/ownership scenarios
pass **9/1 skip/0 failures**; only the explicitly Linux foreign-UID test skips.
Exact GCC 8.3.0 Release passes foundation CTest **22/22** and the current process
scenarios **10/10** without skips under UID1000, including an actual UID1001 root.
GCC12 ASan/UBSan foundation passes **22/22** and **9/9** process scenarios; the
later added parent-only case is covered by GCC 8.3 and Windows above. These are
local process/filesystem checks, not an RDP connection or installed OS upgrade.

The failure before private-root fixture setup is retained: the Windows test
host inherits write grants for other sandbox principals and the helper refused
it. Positive fixtures now use the real protected-directory helper. A dedicated
Everyone-write root case still proves refusal. An initial parent-only fixture
also omitted the SDK's Windows `detached` mode, so host process grouping killed
the child before cleanup; matching the actual spawn contract restores the
existing parent-death cleanup and leaves the hard-kill recovery test independent.
Both failed logs are retained rather than reported as successful acceptance.

Evidence: `runtime-recovery-{foundation,foundation-after,foundation-final,
windows-initial,windows-parent-initial,windows-final,linux,gcc83,linked-build}.log`
under `build/current-validation`, and `build/native-clean-1SGVJ5/receipt.json`.
Full Windows workspace regression for this helper revision passes build, lint,
formatting and **1020 tests / 69 explicit skips / 0 failures**, logged in
`runtime-recovery-check.log`; `runtime-recovery-acceptance.json` binds source and
artifact hashes to these results. No SDK
directory selection, automatic recovery or new release is accepted yet.

The following SDK revision now activates ownership for verified cohorts and
passes fresh linked Windows CTest **38/38**, full Windows `pnpm check`
**1036/70 skips/0 failures**, and Linux GCC12 ASan/UBSan foundation CTest **22/22**
plus SDK/process checks **27/27** without skips. These cover both real SDK owner
crashes, two live SDK owners, all adapter exports, malformed cohort rejection
before filesystem/spawn, finite scans, foreign UID and joined helper cancellation.
The Linux test process runs as UID1000 with zero effective capabilities.
Current helper linking/refusal also passes exact GCC 8.3.0 with warnings as errors.
The unchanged native source snapshot is `0311fca2f65d8d59432a1495b759b7d12e3d29642ebc83b2fe144ca4926bb1c2`.

Evidence: `runtime-recovery-sdk-{linked-build,check-complete,linux-validated,
gcc83}.log` and `runtime-recovery-sdk-acceptance.json` under
`build/current-validation`, plus `build/native-clean-5rx8dd/receipt.json`.
Initial full Windows validation retained one obsolete private-directory fixture
assertion (1035 pass/70 skips/one failure); the updated fixture verifies the
marker before spawn and the exclusive lock after readiness. The next attempt
refused formatting before tests, then the complete run above passed. The Linux
stand initially omitted NestJS dependencies and loaded the SDK through a slow
Windows bind mount. A complete public dependency graph on native Linux storage
passes with unchanged process deadlines; all original failures are retained.
Standalone main contains the pre-listen call, but actual portable/installed
restart, aligned release artifacts, merge and publication are not accepted by
these source/component results.

Windows standalone integration now passes a fresh service-host build and its
startup-record CTest **1/1**, actual supervisor checks **9/9**, portable ZIP
acceptance **1/1**, and full workspace check **1036/70 skips/0 failures**.
The supervisor admits one bounded, content-free recovery report before READY;
unknown records are refused. Its legacy cleanup leaves schema-1 directories to
the verified SDK helper. Tests seed an orphan, observe its removal before READY,
hold a real native worker at a local TLS certificate prompt, and verify joined
shutdown and empty-runtime cleanup. This TLS fixture is not a desktop/RDP
application acceptance claim.

The first portable attempt exposed the old startup parser and legacy directory
admission rule. A subsequent positive restart fixture inherited sandbox write
grants and correctly refused removal; positive fixtures now create protected
roots with the native helper, while the unsafe-root refusal case stays intact.
Evidence under `build/current-validation` is
`runtime-recovery-{service-host-final,standalone-windows-final,portable-final,
standalone-check}.log` and `runtime-recovery-standalone-windows-acceptance.json`.
The isolated ZIP still has development version 0.2.5 and is **not a release**:
accepted public 0.2.5 bytes are unchanged. Linux standalone, MSI/DEB/RPM upgrade,
aligned new-version artifacts, merge and publication remain separate gates.

The actual Linux portable test initially refused startup with
`RUNTIME_RECOVERY_MISMATCH`: installation replaced ELF RPATH bytes after the
build-tree manifest had been generated. Installation now regenerates the
manifest after installing both executables, including DESTDIR/CPack staging.
The npm packager verifies the installed and flattened cohorts before accepting
an archive; the old stage is explicitly refused before archive creation.
Neither hash comparison nor legacy/mismatch admission is relaxed.

The corrected complete GCC **8.3.0** linked Release build passes CTest **39/39**,
SDK/process recovery **27/27** without skips under UID1000/zero effective
capabilities, and an actual UID1001 root. Linux portable passes **1/1**, including
seeded orphan removal before READY, JWT/HTTP, native TLS and joined shutdown.
Windows fresh linked CTest passes **38/38**. Installed bundle relocation passes
**1/1** on each OS without dependency PATH/LD_LIBRARY_PATH; both exact native
npm archives are verified locally and remain unpublished development artifacts.
The SDK build-tree checks use their private SDK library paths separately; their
first missing-library-path failure remains recorded. No actual desktop or
installed Astra/RED OS acceptance is inferred from these component results.

The identical current native source snapshot on both OSes is
`4ca56a1f907282f3626a869107f1b1f2c5bfce8d0db9c16b7da0334f570fedf3`.
Evidence under `build/current-validation` includes
`runtime-recovery-install-cohort-{linux-build,linux-relocate-complete,
windows-build,windows-install,windows-relocate,windows-npm}.log`,
`runtime-recovery-gcc83-linked-sdk-complete.log`,
`runtime-recovery-linux-portable-installed-cohort.log` and
`runtime-recovery-linux-artifacts.json`; Windows source/CTest evidence is
`build/native-clean-r7d1M8/receipt.json`. First-attempt source-graph and ESM
diagnostic fixture failures remain available alongside the product failure.
Final Windows `pnpm check` also passes **1036/70 skips/0 failures**, logged in
`runtime-recovery-install-cohort-check.log`. CPack's actual native TGZ passes
worker/helper hash comparison inside the archive,
`runtime-recovery-install-cohort-cpack.log`. New-version installer/upgrade
acceptance, merge and publication remain pending.

A separate synthetic process-owner regression now proves that four unresolved
helper closures retain capacity after the close deadline, repeated calls cannot
spawn a fifth child, `exit` alone does not free a slot, and confirmed `close`
allows a successful replacement. It fails before the SDK correction and passes
after it on Windows/Linux. This is an explicitly modeled child lifecycle, not
a claim that an unkillable OS process was created. Actual helper cancellation,
deadline, hard-kill and recovery cases still pass: focused Windows **16/1
Linux-only skip/0 failures**, Linux GCC 8.3 linked SDK **28/28**, including the
new model. Native source/binaries are unchanged from the installed-cohort
snapshot above. Evidence is `runtime-recovery-capacity-{before,after,windows,
linux}.log`. The updated full workspace checks pass Windows **1037/70 skips/0
failures** and Linux **1017/92 skips/0 failures** under UID1000, recorded in
`runtime-recovery-capacity-check.log` and
`runtime-recovery-capacity-linux-check-complete.log`. The first complete Linux
attempt passed 1006 tests but failed eleven cases because its exported source
fixture lacked an empty `build/` scratch parent. After creating that parent,
the focused cases pass **16/16** and the full command above exits successfully;
no product code or test condition was changed to bypass those failures.

## 0.3.0 public delivery

2026-10-25: runtime recovery is completed and published. Private feature
`51283d1`, release `1b92332` and delivery repairs `e071e11`/`275a7ea` are merged
into shared `master`. Immutable private `v0.3.0` targets `4ce88b3`; its exported
public product tag targets `9e8b229`. No accepted archive or tag was replaced.
Public `main` includes the accepted candidate history through merge `c00ab44`;
the `release/0.3.0` ref is retained as a merged historical reference.

All ten npm versions are public at the exact accepted SHA-512 integrity.
The five GitHub Releases and OIDC workflows succeed:

| Repository | OIDC run |
| --- | --- |
| [Core](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.3.0) | [40189465774](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40189465774) |
| [Fastify](https://github.com/SensNyaha/freerdp-bridge-fastify/releases/tag/v0.3.0) | [40191085664](https://github.com/SensNyaha/freerdp-bridge-fastify/actions/runs/40191085664) |
| [NestJS](https://github.com/SensNyaha/freerdp-bridge-nestjs/releases/tag/v0.3.0) | [40191225980](https://github.com/SensNyaha/freerdp-bridge-nestjs/actions/runs/40191225980) |
| [HTTP](https://github.com/SensNyaha/freerdp-bridge-http/releases/tag/v0.3.0) | [40191226417](https://github.com/SensNyaha/freerdp-bridge-http/actions/runs/40191226417) |
| [Express](https://github.com/SensNyaha/freerdp-bridge-express/releases/tag/v0.3.0) | [40191962627](https://github.com/SensNyaha/freerdp-bridge-express/actions/runs/40191962627) |

Four fresh registry-only consumer projects on each OS pass strict TypeScript,
HTTP/HTTPS/WS integration, installed browser assets, actual native strict-TLS
refusal and actual orphan runtime recovery. No checkout imports or local
tarball overrides are used in these eight projects.

The immutable-tag [registry-only standalone build](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40191077916)
passes both portable formats, Windows Server 2025/Ubuntu 24.04 installed
0.2.5-to-0.3.0 upgrades and combined verification. The corrected trusted-main
[publisher](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40192059608)
ships those exact retained files without rebuilding. All seven public files,
the manifest and checksum list have been downloaded and independently verified.
Final public DEB/RPM upgrades pass separately on Astra Linux 1.7.5 and RED OS 7.3:
non-root service identity, old-worker retirement, native TLS, crash recovery,
config-preserving reinstall and uninstall. These installed checks do not claim
a real desktop; the eight accepted actual RDP profiles are recorded in local
acceptance below.

[Machine-readable public evidence](evidence/RUNTIME_RECOVERY_0.3.0_PUBLIC.json)
preserves the exact final hashes, successful workflows and safe local log hashes.
The temporary retained-run pointer is retired after successful publication;
ordinary future builds use current-source publication guards. Full original
Stage 1/V1, multi-user isolation and the extended Node/addon sanitizer matrix
remain open. No HTML clipboard implementation is included.

Additional publisher-main source CI first exposed an unchanged Linux stream
lifecycle fixture: a nonblocking codec-selection attempt returned the supported
`busy` result while the test immediately required `accepted`. The first failed
log is retained in public evidence. One repeat of its failed/cancelled jobs
passes Windows and both Linux compiler profiles on the same source; sanitizers
and fuzz also pass. No assertion, deadline or product binary was changed. The
immutable product-tag source CI had already passed all its jobs. The final
documentation merge changes no product, native, test or workflow input.

## 0.3.0 local release acceptance

2026-10-25: all local, candidate installer, named Astra/RED OS upgrade and eight
actual desktop gates above pass. [Machine-readable evidence](evidence/RUNTIME_RECOVERY_0.3.0.json)
binds the exact archives, native source, CI and profiles. Source CI succeeds on
Windows/both Linux compiler profiles, sanitizers/fuzz and exact GCC 8.3.
The first Windows browser timeout and Astra issuer-clock failure remain recorded.
This accepts the recovery feature delivery scope; full Stage 1 remains open.
This report precedes merge/tag and public delivery; their completed acceptance
is recorded in [public delivery](#030-public-delivery).

The following exact archives are frozen for this release; do not repack them.

| Package | Bytes | SHA-256 |
| --- | --- | --- |
| `@freerdp-bridge/api@0.3.0` | 99613 | `57102f36cdb09b23a82e4f8fa0d077722cb3333c928d1fc60bbb92bc55c31b77` |
| `@freerdp-bridge/config@0.3.0` | 9342 | `7c7c801a91464feb4264159c3fc1945e52060330950fe45ba88642e0b5ac8407` |
| `@freerdp-bridge/express@0.3.0` | 5025 | `c4f2bfeebce5eedc027560b07251b0374017c226f4de450e40d2bd1a69e2b5df` |
| `@freerdp-bridge/fastify@0.3.0` | 3621 | `eedfdc61b71122739d0213bcbf76636de1e7f354643df188448a2c1b8d5b6f56` |
| `@freerdp-bridge/http@0.3.0` | 7564 | `bae549c5534c77713f9ed792590b384ff1ac9d73a2f04f4eb88b40818d88f4b0` |
| `@freerdp-bridge/nestjs@0.3.0` | 8326 | `ebf70d13b06d7a694de4023c82bda824e50567c5c6970b1c09c386007a650e8d` |
| `@freerdp-bridge/node@0.3.0` | 120825 | `8344113de7c9fd2ae792581c51134dab3fac68f5f6dea4f7d8783389108d1fa2` |
| `@freerdp-bridge/protocol@0.3.0` | 38903 | `52e2df5d6da9c03bf8cd8df128349b338fc5f446d79c965999d30872ce7ff730` |
| `@freerdp-bridge/runtime-linux-x64-gnu@0.3.0` | 76515246 | `1ac6478f5d2954452bfc7cf9af2f54447dffb4a2762c012399b7f9c243390d87` |
| `@freerdp-bridge/runtime-win32-x64@0.3.0` | 6924657 | `e6853af5a8804b595ece3008970588e58f8be8c4b3d85cd21924384a8abfb53f` |
