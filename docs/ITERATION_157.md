# Iteration 157 — public DVC plugin lifecycle proxy

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after
`270c695`. The public plugin proxy resolves a common listener manager before
initialization, preserves original callback identity and cleanup notifications,
and handles once-only self-deleting/throwing termination without reading the
freed plugin. It does not register plugins or activate production aggregate limits.
[Contract and remaining owner requirements](DVC_PLUGIN_PROXY.md).

Six public lifecycle fixtures and one actual drdynvc/fake-SVC fixture pass.
Linked DVC suite **97 cases / 6,777 assertions**, bundled CTest **18/18**,
MSVC /analyze /W4 /WX. Production entry-point interception, shared manager
identity/lifetime, worker fault polling and actual remote resource acceptance
remain open. No dependency/source/pin/ABI/wire/capability changes.

Foundation CTest passes **7/7**. Full bundled `pnpm check` passes **498/498**,
zero failures/cancellations.
