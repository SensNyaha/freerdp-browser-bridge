# Iteration 207 — separate idle wait from packet assembly deadline

2026-10-14. Fixes the Linux primary carrier's original deadline interpretation
under STACK 3 / PROTOCOL 6. The endpoint previously measured a first record
against the beginning of an idle poll. A message arriving near the 1-second
heartbeat/poll boundary could therefore be refused; a delayed first partial
chunk also inherited only the remaining idle budget.

The whole-record deadline now begins when the first datagram is received.
Later chunks retain that original deadline; neither progress nor another read
extends it. Idle waiting stays bounded, and truncation/ancillary/malformed/EOF /
expired partial refusal remain unchanged. No timeout value is raised and no
inspection or body bound is disabled.

The real-socket regression waits 400 ms before the first chunk, then 700 ms
before the tail under a 1-second assembly budget. Old code fails with Invalid
worker IPC record; corrected code passes. Full endpoint suite is 8 cases /93
assertions. A real Node/native case repeats three idle worker lifetimes with
default 1-second automatic heartbeat and joined cleanup. Focused supervisor /
Linux audio native/TLS tests pass 18/18, retaining both 100-worker sequences.
Linked Linux CTest 24/24 and local non-PIE ASan/UBSan CTest 12/12 pass; the
documented sanitizer environment and open addon sanitizer gate are unchanged.

Actual primary XRDP PCM receives 78 packets with nonzero PCM, scheduled ready
reset and fresh config/data, healthy heartbeat and 1080p capture/cleanup. A first
Opus run receives one packet but later RDP_PROTOCOL_ERROR; the repeat receives
58 packets, scheduled reset/fresh config/data and normal heartbeat/capture/close.
The repeat establishes actual Linux primary PCM/Opus source delivery and reset
on this lab. It does not explain the remaining RDP protocol failure or prove
uninterrupted output, browser admission, measured LAN latency or sustained soak.
The safe preexisting numeric RDP failure parser is composed into the audio helper
for future failures; no raw diagnostic text is retained.

Full Linux bundled Node passes 509 /70 platform skips, 579 cases, zero failures.
Windows Node remains 545 /34 skips and linked/foundation CTest 23/23 /11/11;
Linux-only endpoint code does not change the Windows native path. Logs preserve
before/after regression and failed/successful actual RDP runs in
`build/iteration-207-*`. Required browser, resource, platform and full stage
acceptance remain open.
