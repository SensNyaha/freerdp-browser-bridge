# Iteration 61 — explicit native PCM source availability

Date: 2026-10-10. Implements SPECIFICATION §2.6, ARCHITECTURE §5 and
MEDIA_PIPELINE §6/8 source discontinuity metadata, after status codec `e77a0e0`.

RDPSND sink owner snapshots now distinguish waiting, ready samples, suspended,
closed, failed and unavailable sources from usable open-device ownership. Only
accepted nonempty normalized samples mark ready. Guarded static Close, raw
suspend/resume, disconnect, malformed records and no-common-format negotiation
set explicit states and clear backlog even without a subsequent wave. Failed Open
preserves existing state; malformed Play and bounded overflow have documented
recoverable states. Retirement retains closed metadata for the owner.

One new native case plus expanded public-ABI and actual linked RDPSND/fake-SVC
fixtures verify state/revision independence, invalid/foreign-thread reset refusal,
closed-but-open device ownership, fresh Wave recovery, suspend/resume, invalid
records, overflow and unavailable offers. RDPSND **52 cases / 8,508 assertions**
pass. No new storage queue, wire layout or audio activation is introduced.

Bundled CTest **14/14**, foundation CTest **6/6**, bundled `pnpm check`
**166/166** (no skips, 118.10 s), /W4 /WX /analyze, clang-format, strict
TypeScript, ESLint, Prettier and diff checks pass. Logs are ignored
`build/iteration-061-*.log`. No actual remote audio or audible playback is tested.

Status/epoch ownership,
worker configuration/selection, Node/browser delivery, real audible RDP,
microphone, upstream core allocation limits and LAN latency remain open.
