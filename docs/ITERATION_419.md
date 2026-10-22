# Iteration 419 — Fastify same-port embedding checkpoint

2026-10-22, `feature/fastify-0.2.1`. Implements SPECIFICATION §2.1/2.11/3.1/3.2
and ADR-001 with the existing separate native worker. This is an unreleased
feature checkpoint. Product manifests remain 0.2.0 until release preparation;
stable tags and their bytes are unchanged.

## Implemented

The encapsulated Fastify 5 plugin installs prefixed build/session/metrics and
diagnostics routes without listening or closing the host server. Automatic
upgrades select only their mount; manual mode composes with one host dispatcher.
Strict validation, identity/Origin policy, bounded bodies/control messages,
installation rollback and joined idempotent shutdown retain existing owners.
The reference browser supports basePath and its assets accompany npm archives.
Optional control diagnostics have an additive schema in PROTOCOL.

Project-owned packages carry the user-selected MIT license. Third-party notices
are unchanged. Public wrapper `@freerdp-bridge/fastify` re-exports the adapter;
actual pnpm tarballs contain production dependencies/declarations/browser assets.
No package has been published to npm and no 0.2.1 tag is accepted yet.

## Verification

- Focused native/API/fake-media suite: 40/40, no skips
  (`build/iteration-419-plugin-native-focus.log`).
- A regression deliberately supplies a canary query token to an unmapped path
  under `/rdp`. It initially exposed that token through Fastify request logging.
  A scoped silent child logger fixes this, including scoped 404. Host logger
  behavior stays intact. Final focused plugin suite 4/4, including actual native
  strict certificate refusal (`iteration-419-unknown-log-green.log`).
- Full Windows `pnpm check`: 909 passed / 61 skipped / 970 total, no failures
  (`iteration-419-windows-check.log`). This run preceded the final scoped-404
  logger correction and the external TypeScript fixture; final full repeat is
  still required. Native CTest MSVC 36/36 (`iteration-419-windows-ctest.log`).
- Full GCC 8.3 Linux `pnpm check`: 886 passed / 87 skipped / 973 total, no
  failures (`iteration-419-linux-check.log`), including the logger correction.
  Native CTest 37/37 (`iteration-419-linux-package-ctest2.log`).
- External Linux pnpm consumer: offline installation, strict TypeScript with
  skipLibCheck=false, fake binary media, same-port host WS survival, packaged
  browser assets, native probe and actual native strict TLS rejection pass
  (`iteration-419-linux-package3.log`, fixture `build/fastify-consumer-hJTR9Q`).
  Fake JPEG record bytes establish transport, not browser image decode.
- Windows npm installation/native rejection passed an earlier external fixture
  (`iteration-419-external-npm-final.log`). Final npm repeat also passes strict
  TypeScript with skipLibCheck=false and actual native TLS rejection
  (`iteration-419-external-types-npm2.log`, `build/fastify-consumer-aF6ESc`). Registry TLS stays strict using Node's
  system CA support, never strict-ssl=false.
- Actual approved Astra Linux 1.7.5: Edge/reference form at `/rdp`, H.264
  nonuniform desktop, 1280×720 then restored 1920×1080, fresh configurations,
  reattachment and empty-runtime cleanup pass. Host route remains available;
  plugin diagnostic observes one active session and two WS connections
  (`iteration-419-astra-fastify-browser3.log`). JPEG independently passes the
  same desktop/resize/reattach/cleanup checks (`iteration-419-astra-fastify-jpeg.log`). The private Linux 0.2.0 worker
  uses unix-seqpacket-rws1; this is adapter evidence, not new release packaging.
- Actual RED OS 7.3 attempts through form and direct API remain connecting before
  the certificate event and fail that deadline; cleanup passes. No accepted
  plugin RED OS desktop result is inferred from historical 0.2.0 acceptance
  (`iteration-419-redos-fastify-browser.log`, `...browser2.log`). A bounded
  TCP-only probe to both previously approved RED OS endpoint addresses also
  times out on 3389 (`iteration-419-redos-network2.log`). The remote host is not
  modified to make this gate pass.

The network-none compiler container lacked public pnpm caches. All 152 dev/prod
tarballs were fetched on the host, checked against exact lockfile SHA-512 pins,
then imported through a bounded loopback cache server. External resolution also
needed public registry metadata: only the exact pinned versions with matching
dist integrity/tarball URL were transferred (145 package names). No production
registry credentials, session secrets or lab files were transferred. The first
external offline attempt failed for absent metadata and is retained as a failed
attempt. Stopped lab/compiler containers were confirmed terminal before restart.

## Remaining acceptance

Native npm runtime packages/resolution, final version-stamped 0.2.1 native
artifacts, final external consumer repeats, broader declared real RDP/browser
profiles and final full Windows/Linux checks remain required. The feature is not
merged. NestJS 0.2.2, node:http 0.2.3 and the user's added Express 0.2.4 each
follow accepted predecessors on separate branches. Full real-project Markdown
usage guides are required; [Fastify guide](FASTIFY_USAGE.md) describes the
current interface and explicitly identifies unpublished/runtime gaps.

The user created the npm organization `freerdp-bridge` and confirmed the
`@freerdp-bridge/*` package names. This is namespace selection, not publication.
The user will push the prepared local delivery Git repositories to GitHub;
paths must be reported after preparation. npm publication and subsequent
standalone OS installers remain part of the active objective.
