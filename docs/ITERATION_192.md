# Iteration 192 — Linux worker bounded output activation

2026-10-14. Implements Stage 1 / ARCHITECTURE priority output by selecting the
tested `9b4618f` Linux stream owner in foundation and linked workers. No public
wire fields, capabilities, RDP settings or audio selection change.

Inherited Linux stdout FIFO/Unix stream now uses the same fixed OutputDispatcher
lanes as Windows. Control producers have bounded try-lock admission; pipe writes
run in the dedicated owner thread. Connection producers retire before graceful
output drain. Write/drain failure preserves fixed failure state and returns a
nonzero owned-worker outcome. Other unsupported platforms keep the old fallback;
their integration is not claimed.

The paused-output/adversarial-parent fixture now runs on Linux and Windows. It
sends one HELLO and a fixed 12,000-heartbeat flood beyond the normal supervisor's
32-request bound, holds stdout consumption and requires native exit code 2 before
the five-second forced-kill fallback. Owned runtime directories must be empty.
This actual Linux gate passes; it does not substitute for connected-RDP loss or
physical input release acceptance.

Verification:

- Focused Linux lifecycle file **13/13**, including 100 sequential workers,
  parent death, real queued-output flood and explicit fake-peer cases.
- Linux full Node check **453 passed / 75 skipped / zero failures**, 528 cases;
  one former Windows-only case is now a Linux pass.
- Linked Linux CTest **21/21**, all portable foundation ASan/UBSan CTest **9/9**
  using the previously documented local non-PIE workaround. No standard PIE or
  actual CI acceptance is added.
- Windows foundation CTest **10/10**, linked CTest **22/22**, full Node **528/528**.
- Linux pre-CPack ELF closure **33 files / 268 edges**, canonical relocation
  **1/1**, plus independent TGZ under UID 1000/read-only/no-network/init/cap-drop
  confirms six private modules, codec/context roundtrips, three IPC replies and
  native marker/directory cleanup.

Updated Linux TGZ SHA-256:
`6f487c5f8d9fdd54865cd20af951dc6a5dd449ff166ecba625270e34e741597f`;
24,745,250 bytes. Local logs: `build/iteration-192-*`.

Linux bounded stream fallback is active for the verified lifecycle/queue slice.
Primary SOCK_SEQPACKET, actual connected media/backpressure/release, Linux audio
activation and broader platform/resource/soak remain open. The next Stage 1 block
addresses the primary transport without moving FreeRDP into Node.
