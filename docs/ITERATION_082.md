# Iteration 82 — private Opus connection flag preparation

Date: 2026-10-11. Implements SPECIFICATION §2.6 and versioned private configuration
after startup output selection `52aa5a7`.

CONFIGURE schema 6 preserves schema-5 body lengths and adds bit 3 for Opus.
PCM/Opus are mutually exclusive; unknown bits, truncation and trailing bytes
are refused. Previous schemas retain their masks and default audio off.
TypeScript checks boolean options before assembly and preserves old bytes when
Opus is false/omitted. Native Connection explicitly refuses the preparatory
Opus flag before settings mapping, avoiding a silent audio-off substitution.
No new HELLO/public capability is enabled.

One new native case passes **358 assertions**, including all 256 low-byte flag
values, every truncation, high reserved flag bytes, old schemas and trailing data.
Complete IPC now passes **60 cases / 7,670 assertions**. The TypeScript golden
settings case passes independent schema-6 bytes, all touch/display combinations,
legacy byte identity and malformed/mixed boolean options.

A raw IPC lifecycle fixture passes against both bundled and foundation workers:
HELLO completes, then a synthetic non-secret Opus CONFIGURE is refused with exit
code 2, with no CONFIGURE/SECRET/CONNECT acknowledgement or audio activation.
No password, connect command or remote RDP activity is sent by this fixture.
Bundled CTest **16/16**, foundation **6/6** and full `pnpm check` **226/226**
pass with no skipped tests. MSVC /W4 /WX, /analyze, clang-format, strict TypeScript,
lint, format and `git diff --check` pass.

Worker/Node activation and source ownership, public media negotiation, audible
RDP/microphone, loss fidelity, resource/platform/LAN latency/A/V scheduling and
soak acceptance remain open.
[Wire contract](IPC_FOUNDATION.md#preparatory-connection-schema-6-iteration-82).
