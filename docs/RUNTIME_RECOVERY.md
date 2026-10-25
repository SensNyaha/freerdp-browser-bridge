# Runtime recovery

Release preparation now targets **0.3.0** on `release/0.3.0`, from the feature
implementation at `51283d1`. The public stable version remains 0.2.5. Fresh
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
