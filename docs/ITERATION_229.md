# Iteration 229 — clipboard item refusal and classic fragmentation

2026-10-15. Implements the configured clipboard size policy from SPECIFICATION
§2.7 without turning a valid over-quota item into an RDP transport fault.
[Ingress contract](CLIPBOARD_INGRESS.md). Transport foundation: `ec531fc`.

The guard drains successful responses above the configured quota but within the
absolute 16 MiB wire cap using fixed header storage. Exact complete framing
produces a synthetic failed data response. No original body reaches the pinned
parser. Whole/fragmented linked CLIPRDR fixtures complete the pending read as
refused, preserve long-name negotiation and successfully read a fresh offer.
Malformed/global-excess records, incomplete drains and original deadlines remain
hard faults. The 16,384-fragment budget now admits the full wire maximum at
classic 1,600-byte fragment sizes; a deterministic native test verifies equality
and released storage. This is not a network throughput/deadline acceptance test.

Windows foundation CTest passes 14/14, linked Windows 28/28 and linked Linux
29/29. Full bundled Windows `pnpm check` passes 575 with 49 platform skips /
624 cases. Focused local non-PIE ASan/UBSan passes all five clipboard executables;
the first command omitted two executable build targets, producing two Not Run
results, then both were built and the complete focus passed. Linked SDK libraries
are not sanitizer-instrumented. Seeded ingress fuzz completes 1,435,484 executions
in 21 seconds, coverage 816 / 1,395 features and peak RSS 266 MiB, exit zero.
Evidence: `build/iteration-229-*`.

No worker selection, clipboard permission, browser transport or actual remote
clipboard access is enabled by this correction. Total process memory, earlier
core allocations, standard PIE/CI sanitizer and remote acceptance remain open.
