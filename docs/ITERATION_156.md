# Iteration 156 — bounded public DVC listener manager

Date: 2026-10-12. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §12 after
`960feae`. A fixed listener owner automatically installs accepted callback proxies,
refuses duplicate names/slot overflow, normalizes creation failure and retains
uncertain destruction until final host unpublication. The actual pinned generic
factory also exposed an acceptance-default mismatch, now corrected to match the
host's TRUE in/out default. [Contract and retained gates](DVC_LISTENER_MANAGER.md).

Six new public fixtures and one actual linked drdynvc/fake-SVC fixture pass.
Linked DVC suite **90 cases / 6,683 assertions**, bundled CTest **18/18**, foundation
**7/7**, MSVC /analyze /W4 /WX. Initial compile attempts caught unsigned comparison
and member-shadow warnings in new tests; corrected before all native gates passed.
No dependency/source/pin/public ABI/wire/capability changes. Production aggregate
admission and remote resource acceptance remain open.

Full bundled `pnpm check` passes **498/498**, zero failures/cancellations.
