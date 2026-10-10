# Iteration 47 — fixed connection format table and source switching

Date: 2026-10-10. Continues SPECIFICATION §2.6 format correctness and
ARCHITECTURE §5 virtual sink ownership. [Connection policy](AUDIO_PCM.md#connection-format-table-policy).

The guarded baseline fixes the negotiated table for the connection. A later valid
Formats record fails explicitly as unsupported before upstream table mutation,
clears queued PCM and produces no new reply. This closes the same-index old-Open
interpretation gap without modifying private FreeRDP fields or accepting a table
the device cannot safely reopen. Broader server table renegotiation remains an
explicit future capability, not silently accepted or claimed complete.

Per-packet source switching within the initial table remains supported. Actual
linked RDPSND + fake SVC tests move from 48 kHz stereo PCM16 to 8 kHz mono PCM8 or
PCM16, verify exact 48 kHz stereo samples and rational frame counts, discard old
PCM, mark discontinuity and preserve confirmations. Repeated identical pre-Open
and changed post-Open tables fail with a stable unsupported status, with no further
PCM accepted. Portable clocks additionally check exact 100 ms source caps and
duration-plus-gap boundaries at 8, 44.1 and 48 kHz.

Verification:

- Portable audio **40 cases / 414,520 assertions**.
- Native RDPSND **38 cases / 1,443 assertions**.
- Foundation CTest **5/5**, bundled **12/12**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **125.01 s**.

Logs are ignored build/iteration-047-*.log. Worker audio remains disabled. Larger
valid server bursts, earlier core allocations, upstream overrun, worker/provider
composition/shutdown, media transport/PTS/browser playback, microphone and actual
Stage 5/6 acceptance remain open.
