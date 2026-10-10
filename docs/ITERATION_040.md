# Iteration 40 — bounded audio SVC assembly and pre-parser validation

Date: 2026-10-10. Continues SPECIFICATION §2.6 and resource-limit requirements with
fixed 64 KiB SVC assembly, fragment-count/ordering checks, and bounded RDPSND PDU
validation before upstream parser entry. [Contract](AUDIO_PCM.md#bounded-audio-ingress-foundation).
Worker playback and guard installation remain disabled.
Implementation commit: `a2a62e8`.

Portable tests cover advertised size before copying, exact capacity, ordering,
total/last mismatch, empty fragment flooding, randomized splits, bounded format
descriptors/extras, baseline controls, Wave2 metadata, legacy ordered Wave pairs,
terminal rejection and explicit reset.

The actual pinned static RDPSND fixture now receives validated assembled records
from its fake SVC host. It verifies fragmented PCM Wave2 and legacy Wave dispatch,
and that giant peer total/count claims yield zero upstream deliveries/writes.
This is actual linked channel + simulated transport; no remote audio is sent.

Verification:

- Portable audio **24 cases / 14,606 assertions**, including eight new ingress
  cases with independent vectors, flood bounds and randomized splitting.
- RDPSND **16 cases / 541 assertions**, including actual linked static channel
  Wave2/legacy dispatch and pre-upstream giant total/count refusal.
- Foundation CTest **5/5**, bundled **12/12**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **102.94 s**; TypeScript,
  lint/format and native/fake/Edge regressions passed.

Logs: ignored build/iteration-040-*.log.

Remaining work is explicit: production public SVC wrapper, raw transport flag
mapping, earlier core and compressed-DSP allocation audit, supported format policy,
timestamp/discontinuity/Close handling, worker media path and browser playback.
The parser metadata alone does not solve those gaps or the Stage 6 audible/LAN gate.
