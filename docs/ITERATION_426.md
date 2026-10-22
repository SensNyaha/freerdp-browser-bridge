# Iteration 426 — completing the accepted npm 0.2.1 set

User's subsequent explicit instruction: first finish uploading all ready 0.2.1
versions to npmjs.org. Work is isolated in `feature/npm-publication-0.2.1`.
This supersedes the README stop for that existing immutable set only; future
releases still require the root package README checks accepted in `4153070`.
The updated README files are not injected into already accepted/tagged archives.
NestJS development is deferred until this publication is verified.

## Exact immutable inputs

The clean detached publication worktree uses
`v0.2.1 = release/0.2.1 = 4d183d586cba2a3e694ab0157eabad08b6f87f95`.
All seven original tarballs are rehashed against the accepted artifact audit
and matching npm dry-run SHA-512 before any write. No release tags, native
binaries, dependency pins, package versions or accepted bytes are replaced.

The publisher checks authenticated ownership of the existing organization,
then selects the explicit public npm registry for both general and scope
configuration. It publishes dependencies before the adapter. Existing matching
versions are skipped; different registry integrity refuses. A recorded successful
publish is not repeated when metadata is temporarily unavailable.

## Actual publication outcomes

The Windows runtime was already public with accepted integrity. The first
Linux-runtime upload exhausted a 20-second HTTP deadline (`FETCH_ERROR`).
A read confirms E404 before the authorized repeat with a longer upload deadline.
Official npm CLI browser 2FA is opened and the user confirms it; codes/tokens
are not read from chat, put in argv/environment or recorded in project files.
The larger upload then receives npm's success response.

The official CLI subsequently accepts protocol, config, node, api and fastify.
All seven entries appear in the organization's package access list. This proves
the writes were accepted; it does not by itself prove that every public read or
consumer installation already succeeds. The acceptance receipt is
`build/release-426-npm-publication-accepted.json`.

Immediate public registry reads return E404 for some newly accepted versions.
Those results are retained separately from successful CLI writes; the original
bounded verification stops without republishing. A public unauthenticated
metadata verifier compares name/version and `dist.integrity` with every exact
accepted archive. Its latest receipt is
`build/release-426-public-registry-verification.json`.

[npm's official publish-time scanning notice](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)
documents delayed availability, typically about five minutes and sometimes 15
minutes or more depending on load/content/size. The observed success-then-404
sequence is consistent with that flow; no specific internal scan verdict or
queue status is inferred from a 404. Public read verification continues without
new registry writes.

Public unauthenticated verification now passes for all seven versions: every
name/version and `dist.integrity` exactly matches the accepted artifact audit.
The read-only watcher completes successfully with 7/7 verified. No additional
staged approval is waiting (`npm stage list @freerdp-bridge/api` returns `[]`).

| Public package | Version |
| --- | --- |
| [@freerdp-bridge/runtime-win32-x64](https://www.npmjs.com/package/@freerdp-bridge/runtime-win32-x64/v/0.2.1) | 0.2.1 |
| [@freerdp-bridge/runtime-linux-x64-gnu](https://www.npmjs.com/package/@freerdp-bridge/runtime-linux-x64-gnu/v/0.2.1) | 0.2.1 |
| [@freerdp-bridge/protocol](https://www.npmjs.com/package/@freerdp-bridge/protocol/v/0.2.1) | 0.2.1 |
| [@freerdp-bridge/config](https://www.npmjs.com/package/@freerdp-bridge/config/v/0.2.1) | 0.2.1 |
| [@freerdp-bridge/node](https://www.npmjs.com/package/@freerdp-bridge/node/v/0.2.1) | 0.2.1 |
| [@freerdp-bridge/api](https://www.npmjs.com/package/@freerdp-bridge/api/v/0.2.1) | 0.2.1 |
| [@freerdp-bridge/fastify](https://www.npmjs.com/package/@freerdp-bridge/fastify/v/0.2.1) | 0.2.1 |

Fresh registry-only Windows and Linux consumers both pass after this public
gate. No source checkout imports, file/workspace overrides, cached local tarball
substitutions or install scripts are used. Each fresh lockfile contains the six
appropriate JS/runtime packages from the public registry with the exact accepted
integrity. Each platform installs 63 packages into a new project with an empty
cache (Windows 8 seconds, Linux 24 seconds), then passes strict TypeScript, host
HTTP/WS composition, fake binary media, actual native TLS refusal and joined
cleanup. Reference browser assets are also resolved from installed packages.

| Evidence | Windows | Linux |
| --- | --- | --- |
| Fresh project | `build/npm-registry-426-NDLt0h` | `/work/build/registry-426-check/build/npm-registry-426-qkFLP4` |
| Host log | `build/iteration-426-registry-consumer-win32.log` | `build/iteration-426-registry-consumer-linux.log` |
| Receipt copied to host | `build/release-426-registry-consumer-win32.json` | `build/release-426-registry-consumer-linux.json` |

Linux initially lacks the network's trusted root CA (`SELF_SIGNED_CERT_IN_CHAIN`).
The consumer uses a scoped public root certificate from the already verified
Windows system TLS chain via `NODE_EXTRA_CA_CERTS`; no private keys or account
settings are copied. TLS and hostname verification stay enabled. No system-wide
trust store or deployed RDP certificate policy is changed.

The aggregate success receipt is `build/release-426-npm-publication-success.json`:
7/7 public exact-integrity versions plus both successful registry consumers.
Finalization rehashes the seven original local archives once more and confirms
that every accepted byte remains unchanged. Historical accepted/early-pending
receipts remain distinguishable from this final verified success.

This block adds no C++/wire/capability change. The earlier full check and real
Astra/RED OS acceptance apply to the unchanged accepted bytes; this publication
does not claim new device or platform acceptance. The existing tags remain
immutable, and upcoming adapter versions remain 0.2.2 / 0.2.3 / 0.2.4.
