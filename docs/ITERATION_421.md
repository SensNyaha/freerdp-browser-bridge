# Iteration 421 — Installed npm packages against current RDP labs

2026-10-22, `feature/fastify-0.2.1`, after native npm checkpoint `12cb6f0`.
The user changes the lab addresses in the ignored profiles: RED OS 7.3 is now
`192.168.56.21`, Astra Linux 1.7.5 is `192.168.56.20`. Both TCP 3389 probes
connect from the owned loopback-published viewer container. RDP certificate
pins remain unchanged. No credentials are placed in argv/environment/logs or
copied with the public package dependencies.

## Actual installed-package acceptance

The lab host imports Fastify, the bridge adapter, native resolver and reference
browser assets from the external installed npm consumer. Its native worker and
all private libraries/helpers come from the installed runtime npm package,
without LD_LIBRARY_PATH. The source checkout supplies only lab instrumentation;
it does not supply the application's bridge modules or worker executable.

Both current remote nodes pass actual public HTTP/WebSocket Edge desktop tests:

| Target / profile | Evidence under ignored build/ | Result |
| --- | --- | --- |
| RED OS / JPEG / direct API | `iteration-421-redos-npm-api-jpeg.log` | Nonuniform desktop, both sizes, reattach, cleanup |
| RED OS / H.264 / direct API | `iteration-421-redos-current-npm-h264.log` | Fresh configurations/keyframes, both sizes, reattach, cleanup |
| Astra / JPEG / direct API | `iteration-421-astra-current-npm-jpeg.log` | Nonuniform desktop, both sizes, reattach, cleanup |
| Astra / H.264 / reference form | `iteration-421-astra-current-npm-h264-form.log` | Manual creation/cleared password, both sizes, reattach, cleanup |
| RED OS / JPEG / reference form, wallpaper=true | `iteration-421-redos-form-wallpaper-jpeg.log` | Manual creation/cleared password, both sizes, reattach, cleanup |

The sizes are 1920×1080 initially, 1280×720 and restored 1920×1080. Reattach
uses fresh control/media tokens. Host application HTTP remains available; plugin
diagnostics observe one session and two WS connections. All rows join native
and runtime retirement. Separate external-consumer tests cover host WS survival
and actual native strict certificate rejection on Windows/Linux
[420](ITERATION_420.md). These results do not add audible audio, devices,
remote application input, Clipboard or installed security-profile claims.

## Failed observations and the image oracle

Earlier attempts against the previous 10.0.77.105/106 addresses stop while
connecting; the user subsequently reports the address change. Those attempts
remain recorded in iteration 420. They are not attributed to a product fix.

On the current RED OS address, two reference-form JPEG attempts connect,
render the initial desktop and acknowledge the first resize, but do not pass
the nonuniform-image predicate. One later observes RDP_DISCONNECTED, another
closed state; cleanup passes. These attempts remain failures. An identical
direct-API source-runtime control passes the whole gate without a product
change (`iteration-421-redos-source-control.log`), followed by a passing
installed-package direct-API control.

The form explicitly supplies quality.profile=balanced, which selects
wallpaper=false in resolveRdpPerformance. A direct request without quality
leaves those appearance settings unselected. Requiring a nonuniform image
cannot on its own distinguish an intentionally plain desktop from a broken
pipeline. A form repeat changes only the session's explicit wallpaper override
to true and then passes the unchanged nonuniform/fresh-frame/resize/reattach
gate. Product defaults and deadlines are unchanged. This supports an oracle
assumption as the explanation for the flat-image observation; it does not
establish every earlier disconnect's cause or silently waive those failures.

A read-only RED OS SSH inventory verifies the same pinned host key through its
new address alias, observes active xrdp/xrdp-sesman, and cannot read their log
files. It changes no server configuration and weakens no host-key policy.

## Feature and release boundaries

The Fastify implementation, explicit native npm package installation/resolution,
strict TypeScript declarations, isolated HTTP/WS ownership and named real RDP
profiles now have evidence. Foundation full checks and native CTest pass as
recorded in iteration 420. The supported install path explicitly includes the
platform runtime package; automatic optionalDependencies installation is a
future convenience, not a capability implied by the JS adapter alone.

This completes the implementation acceptance checkpoint on its feature branch.
It does not accept a 0.2.1 release: product/native version stamping, fresh native
artifacts and their external/runtime/RDP checks still follow in release/0.2.1.
npm publication and prepared separate local Git delivery repositories remain
part of the active goal. The user will push/synchronize GitHub themselves.
