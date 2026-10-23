# Iteration 226 — public CLIPRDR Unicode text ownership

2026-10-15. Implements the native callback ownership portion of SPECIFICATION
§2.7. [Contract](CLIPBOARD_TEXT_SESSION.md). Ingress implementation: `69d1690`.

Seven cases / 556 assertions use actual pinned CLIPRDR with simulated SVC
transport. They cover independent Unicode round trips in both directions,
optional server capabilities/short names, exact outgoing capabilities without
file features, local ACK/negative ACK, direction policies, current revisions,
one pending request, stale response disposal, empty/malformed text, finite waits,
clock reversal, binding conflicts and asynchronous-profile refusal.
Consumer-fault, reentrant/foreign access and uncertain client-write tests include
typed callback faults; one local response-borrow fault fixture replaces the
outgoing public client function to read its span after synchronous close.
These fault fixtures are distinguished from actual linked packet serialization.

Windows linked CTest passes 27/27; Linux linked CTest passes 28/28. MSVC /W4 /WX
and analysis remain enabled. The initial compile needed the full public
`freerdp/freerdp.h` definition rather than the context forward declaration;
no SDK source or private header changes were made. Evidence:
`build/iteration-226-*`. The shared fake-SVC host was extracted from the existing
receive tests; their four cases / 190 assertions still pass.
Full bundled Windows `pnpm check` passes 567 cases, with 48 platform skips and
zero failures / 615 total. Both linked clipboard executables also pass a focused
ASan/UBSan build of bridge code against the actual SDK. This uses the existing
local non-PIE workaround; the dependency DLLs themselves are not instrumented,
and the standard PIE/CI/Node-addon sanitizer gates remain open.

The owner is not activated by the worker or a browser. Private settings/IPC,
typed Node ownership, attachment revocation, browser controls and actual remote
clipboard acceptance remain open, along with retained HTML/image/ANSI/drive work.
An outstanding uncorrelated response requires channel teardown before replacement;
no reusable same-channel handoff is claimed.
