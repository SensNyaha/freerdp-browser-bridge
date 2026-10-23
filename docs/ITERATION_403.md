# Iteration 403 — joint Windows MVP acceptance

2026-10-21. The same prepared Windows/Edge scenario from
[402](ITERATION_402.md) completes on the combined Release worker. Production
code, dependency pins, Release configuration and transfer deadlines are
unchanged. The helper adds only fixed last-read status/revisions; it does not
retry a failed operation. Source commit: `7781e1d`.

## Actual public browser/application result

`build/iteration-403-windows-joint.log` exits **0**:

- H.264/WebCodecs 1920×1080, Opus/200 ms and bidirectional Unicode Clipboard
  coexist for **1,801,272 ms / 59 observations**. Each observation exercises
  physical edit/backspace and exact copied Notepad readback.
- Both Browser Clipboard API ↔ CLIPRDR ↔ Notepad directions pass with
  Cyrillic/Japanese/emoji/multiline data; the local OS API is not mocked.
  One native write, 61 reads and 879 physical key events; local Paste sends no
  native write. Last Get is accepted at request/start/completion revision 62.
- 321 rendered frames / 5,475,365 bytes; sampled video/decoder/outbound queues
  are zero, maximum sampled decode p95 1.5 ms. These are not latency metrics.
- Peak worker RSS **225,964,032 bytes** under the unchanged 256 MiB cap;
  Node RSS peaks at 142,999,552 bytes.
- Confirmed 1280×720 resize and restoration to 1920×1080 pass. Actual browser
  permission denial, no-format revoke and cleared viewer fields pass.
- Fresh-token viewer reattachment receives H.264/cursor replay and fresh Opus
  playback: 23,552 played frames, zero invalid calls in that replay snapshot.
- Final detach and joined close pass. The helper records retired worker and
  empty runtime. Independent host inventory also finds **zero workers** and
  **zero entries** in `.runtime/windows-browser-clipboard`.

Own-document clearing keystrokes follow verified text; empty remote application
content is not separately read back. `nativeState: connected` in the report is
the last unsubscribed observer value, not a retained native process.

## Audible quality and measured discontinuities

The user explicitly reports after 27 minutes of this invocation:
“Ровный звук, регулярных прерываний нет”. This accepts the named audible
scenario alongside its measurements, not every audio profile or zero loss.

The Worklet rendered-frame delta is **1,796.923 seconds** over the observed
1,801.272-second gate. Initial/final counters remain visible:

| Counter | Initial | Final | Delta |
| --- | ---: | ---: | ---: |
| Configurations | 7 | 108 | 101 |
| Underflows | 2 | 24 | 22 |
| Underflow frames | 128 | 1,792 | 1,664 |
| Buffering silence frames | 1,074,176 | 1,225,472 | 151,296 |
| Reset-discarded frames | 1,408 | 67,584 | 66,176 |
| Overflow-skipped frames | 0 | 0 | 0 |

Maximum sampled Worklet high-water mark is 2,944 frames; invalid calls are zero.
The numerical report deliberately keeps `audibleAcceptance: false`: automated
sampling cannot make a listening judgment. The separate explicit user reply
provides that acceptance. PCM/Opus and 120/200 ms remain unchanged; full
[ADR-012](adr/ADR-012-audio-compatibility-buffer.md) latency/profile gates stay open.

## Audit and boundaries

`build/iteration-403-mvp-receipt.json` binds the log SHA-256
`00d116cbed54fd9826995addd324392afe653f9a4bab3e9796dc2ccabba053bc`, exact
result and separate user assessment. All **353** current native inputs match
the Release source snapshot byte for byte, aggregate SHA-256
`4ed895de6cb0e2e2efd45b9b277be6e5e90e7acf4b847a537043cc220b367ad1`.
Worker SHA-256:
`8bebcb649d41244976417f953e353aaa3d027b42c0d62505f0d82553abb3a171`;
runtime helper:
`026a770d89a8651581f44b6ccdc39bd737cd7937290585c0b8823146f2497f4f`.
Build/preset/dependency/lock manifests have no diff against `dd30d01`.

The exact runbook command also passes `--smoke`: the reference form selects
this source worker, opens with empty host/password fields, creates no RDP
session and joins browser/server/runtime cleanup. Evidence:
`build/iteration-403-launch-smoke.log`, exit 0. Final format check passes
(`build/iteration-403-final-format.log`).

Current linked Release CTest 34/34 and active owned-XRDP 30-minute evidence are
[401](ITERATION_401.md). Linux linked CTest 35/35, Node 870 / 82 skips and
Windows Node 891 / 61 skips are [402](ITERATION_402.md); the later fixed-status
helper change passes narrow lint/format and 12 focused cases, then this actual
repeat. No heavy build/test workload overlaps this listening gate.

The preceding 625-second Get stop and older epoch/fixture failures are retained
in [402](ITERATION_402.md). This passing repeat does **not** establish their
cause or claim a product Clipboard defect was fixed. The earlier Get's exact
terminal status remains unknown; recurrence requires its now-retained status
and revision evidence. No operation-refusal-free guarantee is made.

The required named practical MVP gates now have passing evidence in
[MVP acceptance](MVP_ACCEPTANCE.md). XRDP clipboard re-offer, broader profiles,
physical devices and the full V1 matrix remain unaccepted. Use the
[runbook](MVP_RUNBOOK.md); the separate [V1 plan](V1_NEXT_STEPS.md) preserves
the original scope without starting that implementation.
