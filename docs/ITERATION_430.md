# Iteration 430 — npm 0.2.2 publication checkpoint

2026-10-23, separate `feature/npm-publication-0.2.2`. The accepted release is
`v0.2.2 = release/0.2.2 = acba657014788ed950dc9b1b40d10c5598c9f9b4`, merged into
shared master at `0c5ef8f`. [Acceptance and archive digests](ITERATION_429.md).
Previous annotated tags are unchanged.

The guarded publisher checks the clean source tree, tag/branch identity,
authenticated organization ownership, complete eight-archive set, README
acceptance, npm dry-run SHA-512 and freshly rehashed exact archive bytes.
Public reads use no authorization. Existing matching versions are skipped;
different integrity refuses. Accepted or uncertain uploads are not repeated
solely because a later public read returns 404. Publication follows dependency
order and uses the official local npm CLI; no token or OTP is recorded.

The first actual upload, `@freerdp-bridge/runtime-win32-x64@0.2.2`, receives
**E503 / Service Unavailable** from registry PUT. It is not credited as accepted.
The receipt contains zero accepted writes. Subsequent public unauthenticated
metadata checks return 404 for all eight versions, separately recorded in
`build/release-430-public-registry-verification.json`. The official npm status
endpoint reports operational at that observation; no cause or general outage
is inferred from the individual PUT failure.

An authorized repeat of the unconfirmed upload follows that read-only check,
with unchanged archives and tag. Its result remains pending at this checkpoint.
Original receipt is retained in `release-430-npm-publication-attempt1.json`;
the current receipt is `release-430-npm-publication.json`. CLI output is not
redirected to credential-bearing npm log files (`--logs-max=0`).

Registry availability and fresh registry-only Windows/Linux consumers remain
required before publication is complete. Native/adapter acceptance is unchanged;
node:http 0.2.3 work may proceed independently after the accepted NestJS release
checkpoint. No new tag, repacked bytes or unsupported capability is introduced
by this publication-only checkpoint.

## Later official staging acceptance

The direct retry reaches the official npm browser authentication prompt, but
the CLI deadline expires before an accepted publication result. It remains an
unconfirmed historical attempt, not a successful public release. A later
read-only stage list is empty before the staging workflow begins.

All **eight exact accepted 0.2.2 archives** are now submitted successfully with
official `npm stage publish`, in the clean isolated publication worktree
`build/npm-publication-430`. Each server stage record matches the expected
name/version/shasum. Every staged archive is downloaded again and its SHA-512
matches the original accepted audit. No artifact is rebuilt or repacked, no
existing stage/version is overwritten and no account configuration is copied.

The accepted staging receipt is
`build/npm-publication-430/build/npm-staging-0.2.2.json` in the main workspace;
its download evidence is in that worktree's `build/staged-0.2.2-downloads/`.
The filtered progress log is `build/npm-staging-0.2.2.log` inside the worktree.
All eight are staged/download-verified; zero are credited as public by the
staging receipt. Stage IDs remain in ignored local receipts, not this report.

This follows the official [npm staged publishing workflow](https://docs.npmjs.com/staged-publishing/):
staging does not require 2FA, but approving a stage does. A newly staged package
may expose npm's `0.0.0-stage` placeholder; that is not the requested 0.2.2
release or a usable adapter. Do not repeat direct `npm publish` for these
versions. The owner reviews/approves the existing stages in npm's Staged
Packages UI or through official `npm stage approve <stage-id>` with 2FA.

Final owner approval, public exact integrity and fresh registry-only
Windows/Linux consumers remain pending. Staging is concrete publication
preparation and does not complete that gate. The pending owner interaction is
an npm account requirement, not a sandbox or automatic approval-review block.

## Superseding public acceptance

All eight existing stages are subsequently approved by the owner. Public
integrity is exact for 8/8 and fresh registry-only Windows/Linux NestJS
consumers pass strict TypeScript and all 15 installed-package cases on each.
[Iteration 437](ITERATION_437.md) supersedes the pending-publication status above;
the original attempts/timeouts and staged-only checkpoint remain preserved.
