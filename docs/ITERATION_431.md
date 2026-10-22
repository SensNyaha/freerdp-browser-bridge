# Iteration 431 — node:http adapter feature acceptance

2026-10-23, `feature/node-http-0.2.3`, following accepted `v0.2.2`. Implements
SPECIFICATION §2.1/2.11/2.12 and §3.1/3.2 with ADR-001/005/007/008. This accepts
the named implementation/development profiles, not an aligned 0.2.3 release,
new tag or npm publication. Source manifests/native runtime remain 0.2.2 during
development; `@freerdp-bridge/http@0.2.2` is not declared a published adapter.

## Implementation

`createRdpBridgeHttp` prepares routing for a real Node.js 24 HTTP/1.1 or HTTPS
server, returning explicit HTTP/WS dispatch, bounded diagnostics and joined
close. It does not add a competing request listener, listen on another port,
rewrite URLs or change host limits/logging/error handlers. Existing session,
media, ownership, Origin and certificate policies use the accepted engine.
FreeRDP remains in one separate C++ worker per session over private IPC.

Automatic WS ownership and the host-close observer share a bounded per-host
pool: at most 16 non-overlapping prefixes and one listener of each kind.
Manual mode delegates to the host's one dispatcher. Independent close preserves
other mounts and foreign HTTP/WS. Prefix release is idempotent and pool-identity
checked. Failed/closed admission retires its resources and observers. Raw JSON
retains the 64-KiB bound, including chunked bodies; preparsed/consumed input
refuses before reserialization. Public wire records and native inputs do not
change. [Interface](NODE_HTTP_PLUGIN.md), [real-project guide](NODE_HTTP_USAGE.md).

## Verification

| Check | Windows x64 | Linux x64 |
| --- | --- | --- |
| Focused HTTP/HTTPS matrix | 9/9 | 9/9 |
| Fresh external npm tarball project | strict TS and 10/10 | strict TS and 10/10 |
| Full linked `pnpm check` | 941 pass / 61 skips / zero fail | 918 pass / 87 skips / zero fail |
| Unchanged linked 0.2.2 native CTest | MSVC 36/36 | exact GCC 8.3.0 37/37 |
| Clean offline source/declaration build | strict workspace build | all seven discovered packages; production deploy/import; unchanged lockfile |

Focused coverage includes both upgrade modes, foreign HTTP/WS preservation,
strict schemas/no coercion, fixed/chunked body bounds, host large-body survival,
Origin/cookie refusal, fake binary media and diagnostic/log canaries, coordinated
shutdown with live control, already parsed bodies, all 16 prefixes with listener
preservation, invalid options/HTTP2, failed admission, host close during startup,
actual native strict TLS refusal and host-owned HTTPS/WSS with fixture CA and
hostname verification. Fake RDP/media are explicitly separate from native TLS
and the actual desktop checks below.

External projects pack the full development JS graph, verify names/versions and
root README, install with npm `--ignore-scripts`, compile declarations with
`skipLibCheck: false`, refuse an unlinked runtime and resolve browser/native
assets from installed modules. Windows final project is
`build/http-consumer-ZK8zOg`; Linux is
`/work/build/nestjs-427-check/build/http-consumer-v6SVlM` in the owned viewer
container. Matching accepted **local 0.2.2 native tarballs** are explicit:
registry publication of that runtime is still pending npm owner confirmation.
There are no checkout imports and no registry-only HTTP acceptance claim.

Logs under `build/`: `iteration-431-windows-check-readme.log`,
`iteration-431-linux-check-tools.log`, `iteration-431-http-focused-win32-https.log`,
`iteration-431-http-focused-linux.log`, `iteration-431-http-consumer-win32-isolated.log`,
`iteration-431-http-consumer-linux.log`, `iteration-431-native-ctest-{win32,linux}.log`
and `iteration-431-clean-node-linux.log`. Native source/version, SDK/dependency
receipts, Release flags and FreeRDP pin are unchanged from v0.2.2. CTest repeats
are not new compiler-port, installed-Astra/security-profile or RED OS/GCC 11
compiler acceptance; mandatory previously accepted support remains separate.

## Actual installed-package RDP

An external Node application imports the installed public HTTP package and
resolves the accepted native package. Its real node:http listener serves host
HTTP, the explicit bridge request dispatcher and the selected automatic/manual
upgrade path on one port. Edge renders the actual remote desktop through the
public prefixed control/media API. Only lab instrumentation comes from source.
Approved certificate pins and authorized lab target identities are unchanged.
Credentials stay in ignored lab helpers and private IPC, never argv/env/logs.

| Target | Automatic upgrades | Manual upgrades |
| --- | --- | --- |
| Astra Linux 1.7.5, .56.20 | H.264 form + JPEG API pass | H.264 form + JPEG API pass |
| RED OS 7.3, .56.21 | H.264 form + JPEG API pass | H.264 form + JPEG API pass |

All eight profiles pass nonuniform 1920x1080 output, confirmed 1280x720 resize,
restored 1920x1080, new configuration/keyframes where applicable, fresh-token
reattach, host HTTP and one-session/two-WS diagnostics, then joined worker/PID/
runtime cleanup. Library paths/SDKs are absent from this installed-package host.
No application launch, text/clipboard/device operation or new sound quality is
inferred. Complete matrix: `iteration-431-http-rdp-matrix.log`; individual logs
are `iteration-431-{astra,redos}-http-{automatic,manual}-{h264,jpeg}.log`.

## Retained failures and setup corrections

The first shutdown test awaits the host close callback while its upgraded WS
is still open and times out. The owned runner is terminated after identifying
its exact PIDs; no unrelated process is stopped. The corrected test explicitly
joins bridge close before awaiting that callback, and its fixture has a bounded
scenario watchdog so failure still reaches cleanup. This clarifies the raw Node
API ownership contract; no production timeout or assertion is waived.

Initial combined README headings fail the mandatory separate-section guard;
the final package has all required headings. Initial source dependency setup
requires the new workspace lockfile importer and an authorized network restore
when the local offline store is unavailable. Linux receives only pnpm package
store content from the network-enabled test container, without account settings
or lab files; its frozen install/build then succeeds offline.

An initial external Windows run defaults to unpublished native 0.2.2 in the
registry and receives ETARGET; final consumers explicitly install the accepted
local runtime archive. The next Windows external run has one `ECONNRESET` in
the automatic fake-HTTP case. Its failure remains recorded in
`iteration-431-http-consumer-win32-local-runtime.log`. An instrumented isolated
repeat and five further unchanged automatic-case repeats pass; then a fresh
unmodified consumer passes all 10 cases. No cause or production repair is
claimed, and response/schema/deadline assertions are unchanged. This observation
is distinct from all eight successful actual RDP profiles.

The first full Linux run omits CMake/Ninja from PATH. Two existing DSP guard
fixtures receive null subprocess exit status instead of the expected CMake
refusal. Restoring the original toolchain PATH permits the unchanged full
1005-test suite. Those failures are not counted as passes or removed from history.

## Remaining work

Merge only this accepted feature, then prepare separate `release/0.2.3`: align
all JS/native versions, generate new version-stamped native runtimes and nine
README-complete npm archives, run aligned native/full/exact-consumer/RDP gates,
then create its immutable tag. npm publication and fresh public registry-only
consumers remain separate. Express 0.2.4 follows on its own branch after that
acceptance; additional framework support needs a concrete unmet requirement.
Separate delivery repositories and standalone installers remain requested work.
