# Iteration 145 — protected microphone transport telemetry

Date: 2026-10-12. Implements PERFORMANCE §8 / SPECIFICATION §2.6 after explicit
Opus viewer `daf3ba7`. Protected metrics now count fixed PCM/Opus validated input
bytes/packets and local decisions, measure active valid backend admission and
safe explicit-stop round trips, and retain outstanding packet/stop gauges until
actual promise settlement. Detach/deadline cannot manufacture backend completion.
Labels are fixed enums only; no source/session/device/credential/sample metadata
or extra queue/timer/codec is introduced. Public wire and native ABI are unchanged.

Two portable deadline/failure cases and six actual loopback-WS/fake-RDP cases
cover both profiles, held packet plus stop, logical bytes, result/histogram
counts, actual server detach, late completion, malformed input and label/privacy
bounds. The new fixtures initially passed an options object to the existing
positional setup API; this was corrected. The detach fixture now waits for the
server's observed attachment release rather than assuming client close implies
server revocation. No production deadline or check was weakened.

Native/browser jitter, underflow/encode/host queue metrics and actual ready
AUDIN/device/recording/LAN/platform/resource/soak acceptance remain open.
[Contract](MICROPHONE_METRICS.md).

Focused microphone socket/actual-WS and protected HTTP/API regression passes
**34/34**, including the eight new telemetry cases. TypeScript build and diff
checks pass. These are synthetic data/fake-RDP checks, separate from actual
source/channel/device acceptance.

Full pinned-Node-24 `pnpm check` passes **498/498**. Native CTest bundled
**17/17** and foundation **6/6**, formatting and diff checks pass. The previous
actual XRDP selection/waiting inventory is `daf3ba7`; this telemetry block adds
no remote input/capture test or ready-source acceptance claim.
