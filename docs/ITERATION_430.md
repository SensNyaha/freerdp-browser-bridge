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
