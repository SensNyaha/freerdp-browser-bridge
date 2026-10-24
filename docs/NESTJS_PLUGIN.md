# NestJS module — 0.2.2

Implements the user's next adapter request in `feature/nestjs-0.2.2`, using
SPECIFICATION §2.1/2.11/3.1/3.2, ADR-001 and the accepted Fastify session/media
engine. The implementation and aligned 0.2.2 release checks are accepted through
separate feature/release branches. [Final release evidence](ITERATION_429.md).
Registry publication is a separate pending step. The immutable published 0.2.1
set is unchanged.

## Interface

`@freerdp-bridge/nestjs` exports `RdpBridgeModule`, `RdpBridgeService`,
`RdpBridgeModuleOptions` and `RdpBridgeModuleAsyncOptions`, plus native runtime
resolution and common worker/session types. The optional `./browser` export
provides the same installed reference browser assets as the existing adapter.

`RdpBridgeModule.forRoot(options)` registers trusted ready options.
`forRootAsync({ imports, inject, useFactory })` obtains those options through
Nest dependency injection. The factory must return a prefix, worker options and
verified host `authenticate(IncomingMessage)` callback; no default identity is
created. Async option-factory errors are replaced by `NEST_BRIDGE_OPTIONS_FAILED`
without the original message/cause. There is no new configuration persistence.

Initial profile: Node.js 24, NestJS 12.2.0, its standard Express 5.3.0 adapter
or FastifyAdapter (Fastify 5.12.7), HTTP/1.1 including host-owned HTTPS. The shared
engine/internal router uses pinned Fastify 5.12.5. Other Nest/adapter versions
and HTTP/2 are not accepted by similarity.

## Routing and lifecycle

The explicit absolute bridge prefix is independent of Nest's controller global
prefix. Limits remain 128 ASCII characters, 16 components, 16 non-overlapping
mounts per host framework instance. All routes, identity, certificate policy,
single-use attach tokens, media credit and diagnostics reuse the existing
bridge core and wire contract. Nest controller guards, pipes, interceptors and
middleware installed after the raw mount are not implicit bridge protection.
Supply the verified identity callback explicitly. Cookie identity stays refused.

For Express, the provider installs a prefix-selective raw middleware before
Nest installs its default body parser. It does not read foreign bodies or
rewrite URLs. A bridge-only Fastify router never calls listen; the original
request/response pass directly into its bounded parser. A body consumed by
earlier custom host middleware refuses with `BRIDGE_RAW_BODY_REQUIRED`, rather
than being reserialized after an unbounded host parse. Bridge bodies, including
chunked requests, retain the 64-KiB limit while host routes keep their own limits.

For FastifyAdapter the same plugin is installed on the actual host instance.
Its scope preserves the strict validator/body limit and silent request logger.
No extra HTTP listener or proxy port is opened by either adapter profile.

The provider prepares Express routing, but core admission/resource allocation
waits for `onModuleInit`, after dependency construction. Failed core admission
retires acquired resources. Early close skips admission; close during admission
joins its initialization before retirement. `onModuleDestroy` awaits the same
idempotent `close()` promise. Raw HTTP before initialization/after independent
close refuses; readiness diagnostics are available after `app.init()`/listen.

`RdpBridgeService.handleUpgrade` selects only its own prefix and returns false
without touching a foreign socket/head. Automatic mode installs one selective
listener on the actual host server. A catch-all host WS dispatcher uses
`upgradeMode: 'manual'` and delegates first to this service. Retain the closed
service until host shutdown to refuse late owned upgrades. Independent service
close removes only its listener and preserves host routes/foreign WS. The host
continues owning its own WebSocket shutdown when closing the whole application.
Remounting a closed module on a listening host is not a supported lifecycle.

## Verification boundary

Windows and Linux linked focused tests pass 14/14: both adapters and both upgrade modes,
DI, host global prefix, strict/no-coercion JSON admission, Origin/cookie refusal,
fixed-length and chunked body limits, host large-body survival, fake binary
media, bounded diagnostics and log canaries, independent close, whole-Nest
close with an active fake worker/control socket, early close, failed admission,
preparsed-body refusal and native strict certificate rejection on both adapters.
Host-owned HTTPS/WSS also passes for both adapters with explicit fixture CA and
hostname verification; no insecure TLS option is used.

The fixture's initial binary-only expectation was wrong: the existing media
protocol sends JSON `media.ready` before binary configuration/frame records.
That initial failure is retained; corrected bounded event waits assert both
parts of the protocol. No production protocol or assertion was waived.

Fresh Windows/Linux external npm projects pass strict declarations, all 15
installed-package checks and browser-asset resolution without checkout imports.
The helper refuses an unlinked native runtime rather than counting skipped TLS
tests as successful consumer acceptance. Clean Linux offline source build now
discovers all six publishable workspace packages, including this module.

Full linked checks pass Windows 930 / 61 skips and Linux 907 / 87 skips, zero
failures; those full runs contain the original 12-test module matrix. The two
later HTTPS/WSS cases pass in the final 14-test focused and 15-test external
matrices on both platforms. Native linked CTest passes MSVC 36/36 and exact
GCC 8.3 37/37. Compiler/foundation checks remain distinct from distro acceptance.

Actual installed-package Astra Linux 1.7.5 and RED OS 7.3 Edge desktop profiles
pass through both Express and FastifyAdapter with H.264 and JPEG: nonuniform
1920x1080 rendering, 1280x720 resize, restoration, fresh-token reattachment,
same-port host HTTP, bounded diagnostics and joined cleanup. Native runtime is
the unchanged accepted 0.2.1 package; this is development adapter acceptance,
not an aligned 0.2.2 release. [Evidence and retained setup failures](history/iterations/401-450.md#iteration-427).

Feature acceptance does not imply new devices, sound quality, platform families
or complete V1. Subsequent aligned native/JS 0.2.2 archives and all eight
versioned RDP profiles pass; [release acceptance](ITERATION_429.md). npm 0.2.2
publication remains separate required work.
