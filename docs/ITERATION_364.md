# Iteration 364 — browser audio negotiation diagnostics across stderr chunks

2026-10-20. Following the waiting-source observations in
[362](ITERATION_362.md) and [363](ITERATION_363.md), both local audio helpers
now feed a shared incremental parser for the worker's existing
`bridge.audio.negotiation v=1` record. A complete record no longer has to arrive
in one stderr chunk. The parser retains only one fixed numeric draft and one
copied latest receipt, accepts exact uint16/uint64 ranges and LF/CRLF, and
discards unrelated or invalid lines without retaining their text. Missing or
truncated receipts remain absent instead of becoming fabricated zero counts.

The browser helper emits a schema-1 `lab.browser.audio-negotiation` record
after joined server/native cleanup, including the receipt or explicit `null`
and its empty-runtime result. This makes Formats/Training/Waves and
write/completion/cancellation/failure counters available for both successful
and failed browser audio attempts. Existing native counter definitions and
production behavior are unchanged. The private helper retains its current
negotiation property names and decimal-string values.

The recovery source precondition is now labelled `audio-source-ready` and
checked before a desktop snapshot. `reattach` starts only after that check and
the snapshot complete. A waiting-source failure therefore cannot be described
as a failed reattachment or trigger an unnecessary snapshot.

Focused parser/RDP-diagnostic/viewer-option tests pass 8/8, including every
split position, bytewise input, CRLF, exact counter limits, missing versus zero
and copied latest ownership. Both helper syntax checks, focused ESLint and
Prettier pass. Full `pnpm check` then passes build/lint/format and 750 Node
tests / 101 profile/platform skips / 851 total, zero failures. The initial
format-check refusal was corrected and its log retained separately from the
successful repeat. Existing linked CTest passes 29/29 without a rebuild; the
focused actual generic RDPSND loader fixture passes 1 case / 15 assertions,
including enabled playback after static registration and absent dynamic RDPSND.
The repository's temporary native-test drive alias is removed after CTest.
Actual RDP execution of the changed helper and the current
source endpoint/negotiation cause remain unverified. No new host session,
source application, Release configuration or dependency change is needed for
this local instrumentation work.
