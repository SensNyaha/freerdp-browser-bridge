# Iteration 148 — public drdynvc receive adapter

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after outer
assembly `e906569`. Public SVC arguments now route through one scoped adapter
without private FreeRDP casts. Complete inspected DVC messages normalize framing;
other SVC arguments pass unchanged. Empty suspension notifications do not extend
deadlines. Flags, pointers, ID lifetime, provider faults and reentrant retirement
have seven new fixture cases. This block does not install the worker hook yet.

Linked suite **23 cases / 3,220 assertions**, bundled CTest **18/18**, foundation
CTest **7/7** pass under MSVC /analyze and /W4 /WX. The initial callback-close test
exposed a false provider failure and passes after preserving the provider's actual
return. No warning suppression, dependency/source/pin/ABI/wire change. Actual host
and remote resource/compatibility acceptance remain open.
Full bundled `pnpm check` passes **498/498** Node cases.
[Contract and retained gates](DVC_RECEIVE_GUARD.md).
