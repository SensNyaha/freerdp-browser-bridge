# Iteration 441 — public 0.2.4 and five GitHub deliveries

2026-10-23, `feature/npm-publication-0.2.4`, after immutable original
`v0.2.4` (`4b018fc406af148dbde8651282149d32b507a4f6`). The ten accepted
archives from [iteration 438](ITERATION_438.md) are public without repacking,
unpublish, tag movement or changes to their native binaries.

## Public packages and provenance

Independent unauthenticated registry reads verify name, version and accepted
SHA-512 for **10/10** packages: protocol, config, node, api, fastify, nestjs,
http, express, runtime-win32-x64 and runtime-linux-x64-gnu. Main-workspace
receipt: `build/iteration-440-public-registry-024.json`. Accepted SHA-256 and
archive authority remain in iteration 438; the registry does not replace them.

All five public GitHub Releases contain their exact archives plus a delivery
manifest. Uploaded asset sizes and server SHA-256 digests match before the
draft is published. A temporarily invisible draft is found through the bounded
authenticated release listing and resumed; no duplicate is created.

| Delivery                                                                           | Actual successful npm workflow run                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Core](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.2.4)    | [39920657127](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/39920657127), attempt 7 |
| [Fastify](https://github.com/SensNyaha/freerdp-bridge-fastify/releases/tag/v0.2.4) | [39924720121](https://github.com/SensNyaha/freerdp-bridge-fastify/actions/runs/39924720121), attempt 2 |
| [NestJS](https://github.com/SensNyaha/freerdp-bridge-nestjs/releases/tag/v0.2.4)   | [39924848219](https://github.com/SensNyaha/freerdp-bridge-nestjs/actions/runs/39924848219), attempt 2  |
| [HTTP](https://github.com/SensNyaha/freerdp-bridge-http/releases/tag/v0.2.4)       | [39925012610](https://github.com/SensNyaha/freerdp-bridge-http/actions/runs/39925012610), attempt 2    |
| [Express](https://github.com/SensNyaha/freerdp-bridge-express/releases/tag/v0.2.4) | [39925922267](https://github.com/SensNyaha/freerdp-bridge-express/actions/runs/39925922267), attempt 1 |

Every workflow validates Windows and Linux before its publication job. The nine
existing names are actually published through GitHub OIDC, without a local
per-package owner approval. The immutable workflow's short visibility poll
can end before npm exposes an accepted upload. Only after terminal failure
and an independent exact public read is the failed job rerun; it skips matching
public versions. No uncertain upload is blindly repeated. Future publisher
code has a longer bounded read window; historical tags remain unchanged.

The owner separately authorizes **one** initial Express approval. Its exact
stage `df36c3b9-2b42-4849-9736-956495651a31` is approved only after core and HTTP
are public; official npm reports success and public integrity matches. Express
Trusted Publishing is then created and read-back verified for
`SensNyaha/freerdp-bridge-express`, `npm-publish.yml`, direct publish permission.
Its workflow validates and skips the already matching version; this is not
claimed as an actual first Express OIDC write. An unused new trust expires if
not used within npm's documented two-day window; check/recreate it just before
the next new-version publication if necessary. No long-lived publish token is
introduced. The separate old 0.2.3 approval queue remains stopped.

## Fresh registry-only projects

Windows worktree `build/npm-publication-441` starts at original v0.2.4. Linux
source-only checkout `/work/build/registry-024-441` comes from `git archive
v0.2.4`. Each consumer is newly created and installs public npm packages only:
the selected adapter, explicit platform runtime and host/dev dependencies.
There are no workspace/file overrides or direct common JS dependencies.

| Check                                                                 | Windows x64 | Linux x64 |
| --------------------------------------------------------------------- | ----------- | --------- |
| All four public declaration consumers, strict TS / skipLibCheck false | pass        | pass      |
| Fastify installed fixture, HTTP/WS/assets/native TLS/lifecycle        | pass        | pass      |
| Nest Express and FastifyAdapter matrix                                | 15/15       | 15/15     |
| Built-in HTTP/HTTPS matrix                                            | 10/10       | 10/10     |
| Express HTTP/HTTPS matrix                                             | 11/11       | 11/11     |
| All installed bridge lockfile SHA-512 vs accepted archive audit       | exact       | exact     |

The final audit reads actual installed package metadata and lockfiles: exact
0.2.4 versions, official registry URLs, no links, accepted SHA-512 and exactly
two direct bridge dependencies (adapter and platform runtime). Reports:
`build/npm-publication-441/build/iteration-441-consumer-summary-win32.json` and
Linux `build/iteration-441-consumer-summary-linux.json` in its source checkout.
Each consumer also has `registry-integrity-441.json`.

Original PowerShell redirection reports a failure status on npm's deprecation
warning despite passing fixture output. Retained logs are not hidden. The
final HTTP/Nest/Express checks use a Node runner capturing the actual child
exit status; all six exit zero. The first Linux Fastify helper lacks an output
directory in the clean checkout; after making that directory explicitly, its
new consumer passes. Neither correction changes product sources.

These checks distinguish fake-worker media from actual linked native strict
TLS refusal and joined cleanup. They do not claim new desktop/device testing.
Exact public archive identity preserves the eight accepted versioned
Astra/RED OS Express desktop profiles from iteration 438.

## Remaining work

0.2.2 remains fully public. Historical 0.2.3 still has seven JS stages pending;
publishing 0.2.4 does not silently complete that separate version's gate.
Standalone installers must follow in Releases of the existing core repository,
automatically on pushes to main/master, with their own OS installation checks.
Final project-owned artifact cleanup and documentation consolidation follow
those earlier delivery gates. Original full V1 requirements remain preserved.
