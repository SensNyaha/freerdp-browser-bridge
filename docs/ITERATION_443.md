# Iteration 443 — standalone browser and private-Node lifecycle

2026-10-23, `feature/standalone-installers-0.2.5`, following the service
foundation `de8a9f7`. Development manifests remain 0.2.4; this is not a 0.2.5
installer/release acceptance.

## Implemented and checked

The standalone serves the packaged reference browser at `/viewer/`, with its
own bounded in-memory asset map, fixed 404 responses, no-store/referrer headers
and a restrictive CSP. Disk paths never come from request paths. Startup bounds
asset count, individual file size and aggregate bytes before allocation.
The browser uses the existing connection owner and `/rdp` endpoints. Its
application JWT is kept only in module memory; the token/password inputs clear
after use. Pagehide joins the authenticated owner DELETE before retiring the
in-memory identity. A disabled POST form avoids fallback GET submission when
JavaScript has not loaded.

An actual Edge test against the standalone and linked native worker verifies
JWT application, authenticated session creation, exactly one authenticated
pagehide DELETE, empty inputs/storage, no token/password in request URLs, no
page errors, zero TLS-peer application bytes and joined runtime cleanup. The
TLS endpoint is an adversarial synthetic peer, not an RDP desktop. Static
route/traversal, CSP and no-reflection assertions also pass.

The CLI supports an optional `--supervised` private stdin lifetime pipe: one
byte `01` or EOF requests shutdown; malformed/oversized/error input fails closed.
Unit tests cover idempotent retirement. An actual private-Node prototype starts
the compiled CLI with only Windows System32 on PATH, authenticates over real
HTTP, reaches a native certificate prompt, accepts the shutdown byte, exits
zero and leaves an empty runtime. The fixed ready record follows listener
startup. This proves no dependency on global Node/SDK tools for that prototype.

The earlier public-production-graph prototype also passes original/relocated
private-Node server-factory checks, strict TLS rejection and cleanup. These
prototypes use public 0.2.4 runtimes; neither is an aligned 0.2.5 distribution.

## Complete verification

| Complete pnpm check with accepted linked worker | Pass | Skip | Fail |
| --- | --- | --- | --- |
| Windows x64 | 978 | 63 | 0 |
| Linux x64 / GCC 8.3 worker | 954 | 90 | 0 |

Both include version/README guards, build, lint, formatting and the entire Node
suite. Child exits are zero. No native foundation/production wire code changes;
the accepted linked workers are reused. The Edge case skips on Linux; the
unlinked foundation case remains separately named and capability gated.

Local receipts/logs:

- `build/iteration-443-check-win32-final.log` and `.json`;
- `build/iteration-443-check-linux-final.log` and `.json`;
- `build/iteration-443-private-node-relocation-win32.json`;
- `build/iteration-443-cli-supervisor-win32.json`.

The first browser attempt fails because its test tries to select a control
inside closed HTML details; opening that section fixes the test without a
product change. The initial Linux full run fails two module loads because a
copy accidentally replaces Linux dependency links with Windows junction targets.
Only the isolated checkout's generated package links are removed and restored
through frozen offline installation. The failed log is retained as
`build/iteration-443-check-linux-copy-failed.log`; the complete corrected run
above passes. No failing product assertion is removed.

## Remaining delivery gates

The Windows supervisor is a separate following block. SCM/service identity,
MSI, portable ZIP/TGZ, DEB/RPM, installed OS/browser/RDP profiles, upgrade and
uninstall, aligned version preparation and hosted automatic core releases remain
open. Final scope is the requested standalone service/installers, then project
cleanup and stop; no desktop GUI or additional product feature is added.
