# Iteration 435 — Express adapter feature acceptance

2026-10-23, `feature/express-0.2.4`, based on accepted `v0.2.3`
(`7e49004a097eac809371283703a79b6f657e598f`). Implements SPECIFICATION
§2.1/2.11/2.12 and §3.1/3.2 with ADR-001/005/007/008. This accepts the named
feature profiles; aligned 0.2.4 release/native archives and npm publication
remain separate gates. All manifests/native runtime retain stable 0.2.3 during
development. The new Express adapter is not published as 0.2.3.

## Implementation

`createRdpBridgeExpress()` wraps the accepted HTTP adapter for Express 5.3.0 on
Node.js 24.21.0. It exposes typed root middleware, selective manual upgrades,
diagnostics and idempotent joined close. It uses the same HTTP/HTTPS listener,
bounded routing/session engine and separate native workers. No native/wire
contract changes, URL rewriting, body reserialization or host limit changes.

Middleware ownership uses Express's external `originalUrl`; stripped mounts
and upstream rewrites of owned paths fail with fixed
`EXPRESS_BRIDGE_ROOT_REQUIRED`. A root Router works. Foreign rewrites cannot
redirect a foreign request into the bridge namespace. Raw-body admission and
the 64-KiB fixed/chunked limit remain enforced before session creation.
All 16 non-overlapping mounts retain the HTTP core's one shared observer and
automatic upgrade listener, without increasing the host's listener limit.
Independent close preserves host HTTP and foreign WebSockets; coordinated
close joins live bridge control, workers and private runtime cleanup.

Public exports include browser/native resolution and declarations referring
to pinned `@types/express@5.0.6`. Express is a peer (`^5.3.0`); only the named
5.3.0 profile is credited. Guides describe body-parser placement, root namespace,
host verification/cookie restrictions, proxy/TLS, browser assets, manual foreign
WS dispatch, shutdown and capability boundaries:
[contract](EXPRESS_PLUGIN.md), [real-project guide](EXPRESS_USAGE.md).

## Verification

| Check | Windows x64 | Linux x64 |
| --- | --- | --- |
| Express-focused integration matrix | 10/10 | 10/10 within full check |
| Independent npm tarball project | strict TS; 11/11 | strict TS; 11/11 |
| Uninstall, missing import, reinstall | strict TS; 11/11 again | strict TS; 11/11 again |
| Full linked `pnpm check` | 951 pass / 61 skips / 0 fail | 928 pass / 87 skips / 0 fail |
| Unchanged linked 0.2.3 native CTest | MSVC 36/36 | exact GCC 8.3.0 37/37 |
| Clean offline source/declaration build | strict workspace build | eight discovered packages, production deploy/import; unchanged lockfile |

Coverage includes automatic/manual shared-port HTTP/WS, schema/no-coercion
admission, fixed/chunked bounds, host 70-KiB JSON survival, Cookie/Origin refusal,
fake binary media/diagnostic/log canaries, foreign response/socket untouched,
live coordinated close, real express.json ordering refusal, root and mounted
Router behavior, URL-rewrite boundaries, all 16 mounts/listener preservation,
invalid HTTP2/options, failed/closed startup and actual native strict TLS refusal.
HTTPS/WSS uses a trusted fixture CA and hostname verification, not disabled TLS.
Fake RDP/media remain distinct from actual native TLS and desktop evidence.

Independent consumers use six local JS tarballs plus the accepted local native
0.2.3 tarball, npm `--ignore-scripts`, and strict TypeScript with
`skipLibCheck: false`; checkout imports and unlinked workers are refused.
Windows: `build/express-consumer-NlW03P`; Linux:
`/work/build/nestjs-427-check/build/express-consumer-qrJ3Vd` in the owned viewer
container. Browser assets resolve inside their installed node_modules.
These are development tarball consumers, not public registry acceptance.

Logs under `build/`: `iteration-435-windows-check.log`,
`iteration-435-linux-check.log`, `iteration-435-express-win32-repeat.log`,
`iteration-435-express-consumer-{win32,linux}-path-corrected.log`,
`iteration-435-express-reinstall-{win32,linux}.log`,
`iteration-435-native-ctest-{win32,linux}.log`,
`iteration-435-clean-node-linux.log`.

Native source/version, SDK/dependency receipts and compiler flags are unchanged
from v0.2.3. These CTest repeats are not new installed-Astra/compiler-port or
RED OS/GCC 11 acceptance. Mandatory previously accepted platform/compiler
support remains separate and is not reduced by the Express feature.

## Actual installed-package desktop profiles

All **eight** real RDP profiles pass through the installed public Express API:
Astra Linux 1.7.5 and RED OS 7.3 targets, automatic/manual upgrades, H.264/JPEG.
The external Linux Node process resolves the accepted private 0.2.3 native
package with no global library environment. Headless Edge checks nonuniform
1920×1080 output, confirmed 1280×720 resize and 1920×1080 restoration,
fresh-token reattach, host HTTP, diagnostics (one session/two bridge sockets)
and joined server/native PID/runtime cleanup. H.264 also uses the reference
session form. The library does not run FreeRDP in Node or capture a GUI.

Evidence: `iteration-435-express-rdp-matrix.log` and
`iteration-435-{astra,redos}-express-{automatic,manual}-{h264,jpeg}.log`.
Authorized lab credentials are read only by ignored local helpers and travel
to the worker through private IPC; no credentials enter argv/env/logs/artifacts.
This is desktop acceptance against those OS targets, not native deployment or
device acceptance on those installed OS profiles.

## Retained setup failures and remaining gates

The first focused Windows command names `foundation/rdp-worker.exe` inside a
clean build whose actual output is `out/`; it fails ENOENT before any test.
The unchanged matrix passes with the correct directory. The first Windows
external command omits the native package's `archives/` path; the first Linux
command names a GCC-container path absent from the viewer container. Both fail
ENOENT before installation. Correct repeats use existing accepted archives
inside each consumer's guarded build directory. Original logs are retained as
`iteration-435-express-win32.log` and
`iteration-435-express-consumer-{win32,linux}.log`. No production assertion,
deadline, certificate or feature requirement is relaxed.

Aligned 0.2.4 fresh native builds, ten exact release archives, exact consumer
regressions, versioned RDP profiles, tag and public npm acceptance remain next.
Local delivery repositories and standalone installers remain in the user goal.
Full original V1 requirements are preserved in TODO and are not claimed here.
