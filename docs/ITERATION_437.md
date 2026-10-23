# Iteration 437 — public 0.2.2 registry acceptance

2026-10-23, `feature/npm-publication-0.2.2`, after accepted immutable `v0.2.2`
commit `acba657014788ed950dc9b1b40d10c5598c9f9b4`. Official stage approvals
complete for all eight already accepted archives. No repacking, unpublish,
tag movement, new binaries or installation script is involved.

All eight versions are public at exact accepted SHA-512 integrity:

- [protocol](https://www.npmjs.com/package/@freerdp-bridge/protocol/v/0.2.2);
- [config](https://www.npmjs.com/package/@freerdp-bridge/config/v/0.2.2);
- [node](https://www.npmjs.com/package/@freerdp-bridge/node/v/0.2.2);
- [api](https://www.npmjs.com/package/@freerdp-bridge/api/v/0.2.2);
- [fastify](https://www.npmjs.com/package/@freerdp-bridge/fastify/v/0.2.2);
- [nestjs](https://www.npmjs.com/package/@freerdp-bridge/nestjs/v/0.2.2);
- [runtime-win32-x64](https://www.npmjs.com/package/@freerdp-bridge/runtime-win32-x64/v/0.2.2);
- [runtime-linux-x64-gnu](https://www.npmjs.com/package/@freerdp-bridge/runtime-linux-x64-gnu/v/0.2.2).

An independent unauthenticated, cache-bypassed public registry read verifies
name/version/dist.integrity for **8/8**; recorded as
`build/release-430-public-registry-verification.json` and
`build/iteration-437-public-registry.log` in the main workspace. Accepted
archive digests remain [iteration 429](ITERATION_429.md).

## Fresh public consumers

Both new Node.js 24 projects run the accepted public helper with
`--registry-only`. They install the npm adapter plus explicit platform runtime
and host/dev dependencies, with no file/workspace overrides and no direct
listing of the four common JS packages. npm resolves api/node/config/protocol
transitively from public dependencies. Root README/browser/native assets are
provided by the installed graph, without checkout imports.

| Check | Windows x64 | Linux x64 |
| --- | --- | --- |
| Strict public declaration compilation | pass; skipLibCheck false | pass; skipLibCheck false |
| Installed Nest Express/FastifyAdapter matrix | 15/15 | 15/15 |
| Actual linked native strict TLS refusal | pass | pass |
| Verified host HTTPS/WSS, ownership/limits/cleanup | pass | pass |
| Installed browser assets | pass | pass |

Windows fixture relative to main workspace:
`build/npm-publication-430/build/nestjs-consumer-SysfLj/consumer`;
its receipt is in its parent directory. Log:
`build/npm-publication-430/build/iteration-437-nestjs-registry-win32.log`.
Linux fixture in the owned viewer container:
`/work/build/registry-0.2.2-437/build/nestjs-consumer-tARBd0/consumer`;
main-workspace log `build/iteration-437-nestjs-registry-linux.log`.
The Linux source snapshot comes directly from `git archive v0.2.2`.
The Windows tool junction references pinned Node binaries only, not account
configuration; no lab files or credentials enter either project.

These are new registry-only checks, distinct from prior local-tarball desktop
acceptance and from fake-worker media. Exact public archive identity preserves
the accepted versioned real RDP evidence; no new device/OS/compiler profile is
claimed. Full original V1 and later installer gates remain unchanged.

## Subsequent publication direction

The user stops the rapid manual approval queue after both 0.2.3 runtimes are
public. Its seven remaining JS stages are pending; 0.2.3 is not fully public.
No new approval window is opened automatically. Future direct publishing is to
use GitHub OIDC with explicit npm publish permission and correct repository
binding. Final GitHub owner is `SensNyaha`; npm scope remains `freerdp-bridge`.
This does not alter or invalidate the completed 0.2.2 public acceptance.
