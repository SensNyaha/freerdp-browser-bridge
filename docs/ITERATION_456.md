# Iteration 456 — public 0.2.5 npm delivery and installer preparation

Follow-up: final main-push installer publication, downloaded bytes and actual
public DEB/RPM installed upgrades on Astra/RED OS now pass;
[complete public delivery acceptance](ITERATION_457.md). Pending statements in
the checkpoint narrative below describe the earlier execution phase.

The verified local standalone release is accepted/tagged as immutable **v0.2.5**
at root commit `231bda2db297d4d4061cb13e3843c6f4bffc5b0b`. Branch
feature/public-delivery-0.2.5 records external publication separately. Do not
read this checkpoint as complete npm/standalone public delivery.

## Verified source exports and remote refs

Bundle `build/github-delivery-0.2.5-8Pn5wr` contains all ten exact accepted
archives and five independently verified source repositories. Their commits
continue existing public main histories; builds, strict declarations, integration
guards and byte-for-byte compiled/archive comparisons pass. Core additionally
passes installed native smoke/TLS/lifecycle. The source/export tag is distinct
from the original workspace tag; its manifest records that immutable upstream.

| Repository | Accepted exported commit |
| --- | --- |
| SensNyaha/freerdp-browser-bridge | c408783ccdb39380d985586e017fe0c994912ee1 |
| SensNyaha/freerdp-bridge-fastify | 0f3904a167f0f31f70d1a6dde0c212cf4471b1f1 |
| SensNyaha/freerdp-bridge-nestjs | 2c75f906085a5ff8952cf03f1f1293861914f3a3 |
| SensNyaha/freerdp-bridge-http | c41d652d3691d4c7aba20441edc59eab7cb38e71 |
| SensNyaha/freerdp-bridge-express | 23c68d1093858a589219250df341dbe4b70da2bc |

All five annotated v0.2.5 tags and corresponding pushed branches match. All five
old v0.2.4 tag commits are independently read back unchanged. Receipt:
`build/iteration-455-remote-refs.json`.

An initial atomic core push to release/0.2.5 is rejected because that branch
already contains the original candidate source history. Atomic rejection changes
neither ref; no force or history mixing follows. The exported core is instead
pushed to the checked-empty **delivery/0.2.5** and its annotated v0.2.5 tag.
The four adapter main branches advance normally. Core public main initially stays
`b67d472e1830045a5ac4bd0bbcccceb6df0c185b` until exact core npm publication.

## Actual core release and OIDC execution

Core Release **422316927**, v0.2.5, is public with the six exact core/runtime
archives and source-bound manifest. Each server size/SHA-256 is verified before
publication; accepted bytes are not rebuilt. The first bootstrap creates one
draft but its immediate read-back cannot find it, so it stops safely before
upload. A fresh independent list proves exactly one matching draft and zero
assets; the next invocation resumes that same draft and publishes after complete
verification. The API wrapper requests fresh reads thereafter. No duplicate
create, clobber or retry of an uncertain write occurs.

Receipt: `build/iteration-455-core-release-api.json`. Core npm workflow
**40025748000** from exact exported commit c408783 **completes successfully**:
both Windows/Ubuntu source/native validations and publish job **120662018628**
pass. All six public core/runtime 0.2.5 integrity values equal the accepted
archives. Receipt: `build/iteration-456-core-watch.json`, final read at
2026-10-23T21:34:33Z. There is no local npm token fallback or manual stage/approve
queue. GitHub identity uses the existing system credential in memory/HTTPS
headers only, never argv, environment, files or output.

Fastify, NestJS and HTTP GitHub Releases are now public with their unchanged
accepted archives. Their real OIDC workflows are respectively **40027842570**,
**40027929435** and **40028010808**; all three complete successfully and their
public npm integrities match. Express GitHub Release is also public, workflow
**40028442236** also completes successfully. All ten public 0.2.5 integrities
match the accepted archive audit; final read **2026-10-23T21:43:38Z**. Express
performs its first actual OIDC write, without a token fallback or interactive
approve. This supersedes the earlier bootstrap-only proof for that package.
Receipts: `build/iteration-455-{fastify,nestjs,http}-release-api.json` and
`build/iteration-456-delivery-watch.json`. HTTP is verified before Express starts.

Remaining: complete actual main-push registry-only installer execution and
read back/verify its final assets and installed OS acceptance, then perform the
authorized project-owned cleanup and documentation consolidation. The final
installer production lock also needs public HTTP, so main is advanced only after
that dependency is verified (six core packages alone are insufficient). Continue TODO
feature development afterwards under the user's 2026-10-24 instruction.

## Maintained registry-only Fastify acceptance helper

The delivery feature adds `node scripts/test-fastify-package.mjs --registry-only`,
matching the other three adapters' clean-public-install workflow. It uses npm,
an empty user/global configuration, exactly two direct bridge dependencies
(adapter and platform runtime), no local archives/overrides and the existing
strict TypeScript/HTTP/WS/assets/native TLS/cleanup fixture. Archive flags cannot
be combined with registry-only mode. Product packages and accepted archive bytes
are unchanged; this is a test-helper/docs change after the immutable tag.

Regression of the exact-archive mode passes on Windows
(`build/fastify-consumer-1MPuIi/receipt.json`) and Linux
(`/work/build/release-453-consumers/build/fastify-consumer-CNO6uS/receipt.json`).
Every reported package SHA-256 still equals the accepted 0.2.5 audit. The actual
new registry-only mode passes in Windows `build/fastify-consumer-B6pbRG/consumer`
and Linux `/work/build/release-453-consumers/build/fastify-consumer-H0Csrg/consumer`.
Their lockfiles and installed manifests independently match all six accepted
package integrities with exactly two direct bridge dependencies and no overrides.

Full linked **Windows pnpm check passes: 1004 pass / 63 skips / zero failures**,
actual child exit zero. Receipt/log:
`build/iteration-456-check-win32-final.{json,log}`. Native source is unchanged;
the accepted local CTest results remain separately recorded in iteration 455.

## Actual main push and registry-only payloads

After public HTTP and the six core/runtime integrities pass, standalone
preflight confirms `alreadyPublished: false` with no partial installer assets.
Core main advances normally from b67d472 to exact exported/tagged c408783; old
tags remain unchanged and the exported checkout is clean. Automatic main-push
installer run **40028484992** starts, with Windows **120670593620** and Ubuntu
**120670593636** building. Final installer publication remains pending.

Fresh standalone builds use independent empty npm caches and the original
production lock, without candidate archives or URL substitutions. Both complete
regular-file inventories match the already accepted candidate **byte for byte**:

| Platform | Candidate payload | Registry-only payload | Files |
| --- | --- | --- | --- |
| Windows | build/standalone-payload-ccelo6 | build/standalone-payload-k2yuyh | 4100 |
| Linux | /work/source/build/standalone-payload-KoqxL2 | /work/source/build/standalone-payload-A4LXi4 | 4208 |

Linux paths are in owned container freerdp-bridge-payload-449. Receipts:
`build/iteration-456-payload-comparison-{win32,linux}.json`. The first Linux
invocation supplies an absent /opt archive path and stops before building;
the corrected invocation uses the existing hash-verified /work archive.
Build-only public CA remains scoped to npm children, absent from the payload.
This proves payload equality, not reproducible installer metadata or acceptance
of yet-unpublished final CI installer files.

Fresh HTTP and NestJS registry-only consumers also pass strict types and their
10/10 and 15/15 integration matrices on both platforms. Windows fixtures are
`build/http-consumer-UY4AGX` / `build/nestjs-consumer-RD7mtH`; Linux fixtures are
`build/http-consumer-9J5NCz` / `build/nestjs-consumer-JcDtyX` under the existing
release-453-consumers checkout. Each installed graph independently matches all
six accepted integrities; the per-consumer `registry-integrity-456.json` records
the complete public lock check. Express also passes strict TypeScript and
**11/11** on both platforms: Windows `build/express-consumer-DDXAAx/consumer`,
Linux `/work/build/release-453-consumers/build/express-consumer-Rywo40/consumer`.
Both complete seven-package installed graphs match accepted integrity, with no
overrides and only adapter/runtime as direct bridge dependencies. All four
fresh registry-only adapters therefore pass on both OSes. Process logs and
aggregate receipts are in `build/registry-456-{win32,linux}` of the corresponding
checkout. Final public installer files/installed-OS read-back remain separate.
