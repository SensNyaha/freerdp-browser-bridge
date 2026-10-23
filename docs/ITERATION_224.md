# Iteration 224 — bounded clipboard Unicode conversion

2026-10-15. Implements the Unicode conversion portion of SPECIFICATION §2.7,
preparing Stage 7 without advertising an unconnected clipboard feature.
[Contract](CLIPBOARD_TEXT.md).

Four native cases / 108 assertions cover independent Cyrillic/Han/supplementary
vectors, CRLF, padding, BOM/noncharacters, malformed UTF-8/surrogates, hidden
trailing content, exact size/capacity limits, overlap and atomic refusal.
Windows foundation CTest passes 12/12 under /W4 /WX and MSVC analysis;
Linux linked CTest passes 25/25. The existing local non-PIE ASan/UBSan profile
passes 13/13; this does not close the standard PIE/CI or Node addon sanitizer gate.

The new Clang ASan/UBSan libFuzzer target completes a seeded 21-second run:
29,260 executions, coverage 319, 1,298 features, peak RSS 45 MiB, exit zero.
Earlier attempts exited before emitting diagnostics (one explicit exit 139);
the startup failure is unresolved and is not counted as a passing run.
The successful run used the same instrumented binary without disabling checks.
The workflow includes the bounded seeded job; actual GitHub CI remains unrun.
Full bundled Windows `pnpm check` passes: 567 passed, 48 platform skips,
zero failures / 615 cases. No Node behavior or public wire contract changes.

Evidence: `build/iteration-224-*`. CLIPRDR negotiation, direction/lease ownership,
IPC/browser transport and actual remote clipboard acceptance remain open.
