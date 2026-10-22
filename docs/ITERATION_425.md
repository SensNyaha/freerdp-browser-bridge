# Iteration 425 — explanatory npm README files

User requirement, 2026-10-22: every npm package release must carry explanatory
documentation on npmjs.org. Work is isolated in `feature/npm-package-readmes`,
from shared `c781d60`. Existing NestJS dependency preparation is excluded from
this change and remains on its own feature branch.

Implementation commit: `4153070a2cb8b7894902ed2de1b20f643270467f`.

## Delivered scope

All five currently publishable JS packages have a root README: protocol,
config, node, api and fastify. Each describes purpose, installation,
dependencies/platform requirements, a usage example, limits and licensing.
Public imports in examples match the package exports. Config and protocol
examples execute against the built packages; adapter identity verification is
explicitly provided by the application, not a supplied demo identity.

Both native platform packages get their own README from tracked templates in
`docs/npm/`. These distinguish the server host from the remote RDP target,
explain compiled C++/private FreeRDP/IPC components and the absence of install
compilation, and retain OS/CPU/libc, same-version and third-party license limits.
Nested LGPL rebuilding instructions do not replace the root package README.

`pnpm npm:readme:check`, included in `pnpm check`, discovers publishable workspace
packages instead of keeping a list that would miss future adapters. Both native
templates are checked too. Actual native packaging and the external Fastify
consumer check the root README from the resulting `.tgz`. The bounded checker
also rejects missing sections, a different package's README and oversized text.
The [publication contract](NPM_PUBLISHING.md) requires checking every exact
archive before any publish. Version/tag immutability remains unchanged.

## Evidence

- Narrow README tests: Windows 3/3 and Linux 3/3; missing root README with only
  a nested source README, oversized actual tar members, and detection of a new
  publishable adapter without documentation are exercised.
- All five JS archives pass the actual shipped README check. Local receipt:
  `build/readme-package-check-doq3fb/receipt.json` contains the final README text.
- Windows native packaging passes inventory, native version/codec relocation
  probes and archive README validation using the accepted unchanged stage.
  Log: `build/iteration-425-native-readme-pack.log`.
- Linux native packaging passes the same generated archive check from its
  accepted unchanged stage in the GCC 8.3 container. Log:
  `build/iteration-425-linux-readme-pack.log`.
- Linux narrow test log: `build/iteration-425-linux-readme-tests.log`.
- First Windows full check used the default foundation worker without linked
  FreeRDP: 867 pass / 111 skips / 1 fail. The real native Fastify TLS-refusal
  test received `RDP_NOT_IMPLEMENTED` rather than `RDP_CERTIFICATE_REJECTED`.
  The incorrect test invocation is retained in
  `build/iteration-425-npm-readmes-check.log`; assertions/implementation stay
  unchanged. A narrow repeat using the accepted linked worker succeeds 7/7, log
  `build/iteration-425-readme-and-fastify-linked.log`.
- Full current Windows `pnpm check` with `BRIDGE_TEST_BINARY_DIR` set to the
  accepted `build/native-clean-9il5P0/out`: **918 pass / 61 skips / 0 fail**,
  979 total, 350452 ms. Version/source-README guards, build, lint, formatting
  and all Node tests pass. Log: `build/iteration-425-npm-readmes-check-linked.log`.

These are development packaging probes retaining the current source version,
not replacement 0.2.1 release artifacts and not published candidates. No C++ or
wire contract changes are made; this block does not claim new compiler, actual
RDP or device acceptance. No new native CTest run is attributed to this change.
The seven accepted 0.2.1 archives retain their recorded SHA-512 values.

## Publication checkpoint

After the user's browser 2FA confirmation, read-only npm checks confirm
`@freerdp-bridge/runtime-win32-x64@0.2.1` is public and has the exact accepted
SHA-512. Receipt: `build/release-425-npm-publication-partial.json`. Its old
archive has no root README. Earlier immediate 404/empty-receipt outcomes are
retained as history; they do not override this later successful verification.

The remaining six old archives are not published. Their original preparation
predates the new requirement (only the Fastify archive has a root README).
The old local publication helpers now refuse that set before a registry write.
Updated READMEs ship in a new aligned release; `v0.2.1` and published bytes are
not replaced. The full registry dependency graph and a registry-only consumer
remain unverified. Reserved targets remain NestJS 0.2.2, node:http 0.2.3 and
Express 0.2.4, each with its own feature branch and acceptance gates.

Later user instruction explicitly requests completing publication of all ready
0.2.1 packages first. That authorizes sending the original accepted set without
repacking, despite its historical README gap. The general README requirement
for new releases remains. The stop described above records this iteration's
checkpoint and is superseded only for that immutable set by the later request.
