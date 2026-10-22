# Iteration 427 — NestJS adapter feature acceptance

2026-10-22, `feature/nestjs-0.2.2`. Implements SPECIFICATION §2.1, §2.11,
§2.12, §3.1/3.2 and ADR-001/005/007/008. This accepts the named adapter
implementation and development-consumer profiles. Product manifests still use
the last stable **0.2.1**; no published NestJS 0.2.1, aligned 0.2.2 release,
new immutable tag or npm publication is asserted by this checkpoint.

Verified implementation commit: `a8afefb`. The accepted feature is subsequently
merged into shared master before creating the separate `release/0.2.2` branch.

## Implementation

`@freerdp-bridge/nestjs` provides `RdpBridgeModule.forRoot/forRootAsync`,
configuration through Nest DI and `RdpBridgeService`. Express mounts the raw
prefix before Nest's default body parser, using the existing bounded Fastify
router without another listener. FastifyAdapter registers the existing engine
on the actual host instance. One C++ worker remains outside Node per session.
Private IPC, strict certificate verification, identity/Origin/ownership checks,
single-use attach tokens, bounded media/control and diagnostic contracts remain.

The service supports selective automatic upgrades or manual delegation by the
host dispatcher. Independent close preserves host HTTP/foreign WS. Nest close
joins workers and bridge WS through the module lifecycle. Early close avoids
native allocation; failed admission cleans acquired resources. Configuration
factory errors expose a fixed code without original messages or causes.

Node.js 24, Nest 12.2.0, Express 5.3.0 and FastifyAdapter/Fastify 5.12.7 are
the tested framework profiles; the internal engine pins Fastify 5.12.5.
HTTP/1.1, including host-owned HTTPS/WSS with verified CA/hostname, is covered.
Other framework versions and HTTP/2 are not accepted by similarity.

## Verification

| Check | Windows x64 | Linux x64 |
| --- | --- | --- |
| Final focused module matrix | 14/14 | 14/14 |
| Fresh external npm tarball consumer | strict TypeScript and 15/15 | strict TypeScript and 15/15 |
| Full linked `pnpm check` | 930 pass / 61 skips / zero failures | 907 pass / 87 skips / zero failures |
| Linked native CTest, unchanged source | MSVC 36/36 | exact GCC 8.3.0 37/37 |
| Clean offline source/declaration build | covered by strict workspace build | all six discovered packages, production deploy/import, unchanged lockfile |

Full checks include the original 12 module cases. Two later HTTPS/WSS cases
are verified by the final focused 14-case and external 15-case matrices on
both OSs, followed by narrow ESLint/Prettier checks. No production code changed
after those full runs. Native compiler/source, pinned FreeRDP commit, dependency
recipes and Release flags remain unchanged. This is a CTest repeat, not a new
compiler port, installed-Astra or remote RED OS/GCC 11 compiler acceptance.

Tests distinguish fake session/binary-media fixtures from actual native
certificate-rejection integration. The external helper refuses an unlinked
runtime, checks each packed JS root README, installs into an isolated npm
project, compiles declarations with `skipLibCheck: false` and verifies installed
browser assets. No file import reaches the source checkout. Development JS
archives are explicitly overridden as a complete graph; the native runtime
comes from the unchanged accepted public 0.2.1 platform package. This is not
registry-only NestJS acceptance or new-runtime README acceptance.

Evidence under `build/`:

- `iteration-427-windows-linked-check-final.log`, `iteration-427-linux-check-final.log`;
- `iteration-427-nestjs-https-win32.log`, `iteration-427-nestjs-https-linux.log`;
- `iteration-427-native-ctest-win32-alias.log`, `iteration-427-native-ctest-linux-final.log`;
- `iteration-427-clean-node-linux.log`;
- `iteration-427-nestjs-consumer-win32-https.log`, project `nestjs-consumer-eJqdDT`;
- `iteration-427-nestjs-consumer-linux-https.log`, receipt `iteration-427-nestjs-consumer-linux.json`.

## Actual installed-package RDP

An external npm project imports the installed public NestJS module and resolves
the native worker from the installed runtime. Its disposable Nest application
uses the selected real HTTP adapter. Edge reaches the public prefixed HTTP,
control and media endpoints on the same host port. Only lab instrumentation
comes from the checkout. No worker SDK paths or LD_LIBRARY_PATH are used in
this installed-package test. Credentials remain in authorized ignored helpers
and private worker IPC; no credential files enter the source or npm archives.

| Confirmed target | Express | FastifyAdapter |
| --- | --- | --- |
| Astra Linux 1.7.5, .56.20 | H.264 form + JPEG API pass | H.264 form + JPEG API pass |
| RED OS 7.3, .56.21 | H.264 form + JPEG API pass | H.264 form + JPEG API pass |

All eight profiles pass nonuniform 1920x1080 rendering, confirmed 1280x720
resize, restored 1920x1080, fresh configuration/keyframe where applicable,
fresh-token reattach, surviving host HTTP and bounded diagnostics of one
session/two WS, then joined worker/runtime cleanup. Approved certificate pins
are unchanged. No application is launched, no text/device/clipboard operation
is added and no new audio-quality result is inferred.

The complete success matrix is `iteration-427-nest-rdp-index-assets-matrix.log`;
individual `iteration-427-{astra,redos}-nest-{express,fastify}-{h264,jpeg}-index-assets.log`
receipts retain the scalar results. This is named remote desktop acceptance,
not blanket distro/security-policy or all locked-screen acceptance.

## Retained failures and setup corrections

The initial Windows full run used the unlinked foundation default and failed
Fastify's actual native TLS case with `RDP_NOT_IMPLEMENTED`. The final full run
uses the existing verified linked worker and passes without changing assertions.
The initial CTest repeat lacked the original R: build alias; restoring that
temporary alias makes its unchanged 36 tests pass.

The compiler container is intentionally network-isolated. New Nest packages
are installed using a separate network-enabled lab container with strict TLS
and the already verified public registry CA, then source/dependencies are
transferred for the offline build. The minimal viewer image initially lacks
pnpm/tar/sed/gzip; only test tools from the existing toolchain are added under
its private build directory. No production image or runtime payload is changed.
The first Linux full run also lacks the local `build/` fixture parent and fails
11 mkdtemp cases; creating that directory permits the unchanged complete suite.

Initial actual-browser probes stop before RDP creation: the test controller
returns Buffer as serialized JSON, then Fastify does not match `/harness/`
after Nest's trailing-slash normalization. Returning text HTML/JS and serving
explicit `/harness/index.html` fixes the lab host, with no bridge changes or
weakened image predicates. Earlier `*-text-assets*`, initial and repeat logs
remain distinguishable from final `*-index-assets*` successes. These lessons
are included in the real-project [usage guide](NESTJS_USAGE.md).

PowerShell may report a nonzero outer tool status after npm writes a deprecation
warning to stderr, even though the guarded helper reaches its success receipt
only after all child exit statuses pass. The Windows external receipt and
15/15 summary are retained; an installed-project repeat explicitly preserves
Node's exit status. No failed child result is waived.

## Remaining work

Align 0.2.2 JS/native versions on its separate release branch, produce new
README-complete native/JS archives and corresponding-source companions, run
versioned release/native/consumer/RDP gates, then publish exact accepted archives
and verify public integrity plus fresh registry-only consumers. Existing tags
and 0.2.1 bytes stay immutable. Only after this checkpoint may node:http 0.2.3
and Express 0.2.4 proceed on their own branches. Delivery repositories and
standalone installers remain separate requested work, as does the original V1.
