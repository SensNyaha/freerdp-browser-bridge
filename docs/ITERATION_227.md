# Iteration 227 — prepared versioned clipboard payloads

2026-10-15. Implements private payload preparation for SPECIFICATION §2.7.
[Contract](CLIPBOARD_IPC.md). Native text ownership implementation: `4f976ac`.

Independent native/TypeScript vectors agree for fixed scalar state and Unicode
set/read/result records. Four native cases / 163 assertions and four Node cases
cover metadata truncation, schema/reserved/enum/uint64/direction invariants,
borrowed decode/copied encode, malformed UTF-8/NUL, negative-result privacy,
empty/BOM/newline values and exact normalized UTF-16 size including terminator.
No data is printed on refusal.
The same four new Node cases also pass under Linux Node 24.

Windows foundation CTest passes 14/14; linked Linux CTest 29/29. The existing
local non-PIE ASan/UBSan foundation profile passes 15/15. Full bundled Windows
`pnpm check` passes 571 with 48 platform skips / 619 cases, zero failures.
Standard PIE/CI/addon sanitizer acceptance remains open.

The seeded Clang fuzz target directly instruments the new parser and Unicode
converter with fuzzer/ASan/UBSan. A bounded 21-second run completes 1,101,170
executions without a finding. The workflow is prepared, not counted as run.
Final coverage is 663 counters / 1,853 features, with peak reported RSS 301 MiB.
Evidence: `build/iteration-227-*`.

This changes no active RWI1 kind/HELLO/settings or public/browser routing. The
prepared 16 MiB logical payload limit is not a claim that the current smaller
packet carrier/control WebSocket supports it. Carrier admission, bounded producer
handoff/publication, typed selection/revocation and actual remote acceptance
remain open; file/HTML/image/ANSI and managed-drive requirements are preserved.
