# Iteration 368 — complete native audio loss and cause receipts

2026-10-20. The user confirms that the audible tone in
[367](ITERATION_367.md) contains Morse-like pauses. That run's browser counters
show frequent epochs and buffering, but its native footer collected only
negotiation. The worker already emits separate fixed lifetime loss/reset and
clock/format/Close counters; the browser helper previously ignored them.
The private helper's old per-chunk matching could lose either receipt when
stderr split it. No retained raw stderr exists to reconstruct the prior run.

Both helpers now collect the existing `bridge.audio.summary` and
`bridge.audio.causes` lines with the same fixed numeric streaming state machine
as negotiation. Complete LF/CRLF records alone publish copied scalar receipts;
each field is bounded to 20 digits / uint64, and unknown or malformed lines
are discarded without retaining their text. Missing receipts remain absent
(private helper) or `null` (browser footer); they are never synthesized as zeros.
The common parser is private; exported classes select only fixed code-owned
schemas. Existing negotiation fields and validation remain unchanged.

The browser's local schema-1 footer adds `nativeCounters` and `nativeCauses`.
The private helper preserves its existing property names. These lifetime
counters can distinguish observations of different loss/reset paths; they do
not identify a particular audible pause without new actual evidence. No codec,
queue, reset policy, public protocol, worker artifact, Release setting or
dependency version changes. Audio continuity and the other Stage 6 gates remain
open.

Focused numeric grammar, every split/bytewise LF/CRLF replay, exact uint64
ceilings and overflow for every source field, zero/missing/refusal distinction,
mixed-record isolation and copied latest receipts pass. Together with tone
input, options, window lifetime and the synthetic Edge observation control,
the focused suites pass 15/15. The source definitions are checked against
`native/rdp-worker/connection.cpp` retirement records. Real diagnostic collection
in a new RDP session remains pending separate session authorization; this block
does not claim an actual-source cause or audio fix.

Repository-wide ESLint and formatting, both helper syntax checks, documentation
formatting and `git diff --check` pass. Production/native code remains unchanged;
the preceding full Node 753 / 101 skips is scoped in
[366](ITERATION_366.md), not represented as a full rerun of this collector change.
