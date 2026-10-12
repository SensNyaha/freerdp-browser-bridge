# Iteration 138 — bounded selected Opus microphone ingress

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after typed
private activation `d7e0ee7`. One ingress chooses immutable PCM/default or Opus
profile and owns exactly one 3,840/1,275-byte slot plus one backend operation.
Matching RWB1 validation precedes copying; producer storage is released before
asynchronous submit and the full owned slot is wiped after settlement/drain.

Opus requires a fresh discontinuity, exact predictive 20 ms PTS and unchanged
lookahead between discontinuities. Fresh refused/busy records and sequence
gaps interrupt prediction. Accepted older discontinuity cannot erase an
interruption received during its flight. Source/grant/epoch checks and native
reset responsibility remain shared with PCM; no replay/SDK/second queue is added.

Focused portable PCM/Opus/ownership checks pass **19/19**, including five new
Opus cases. One synthetic Node process projects RWB1 Opus to private kind 44,
closes/drains pending admission, resets epoch and permits a new discontinuous
owner only against fresh authority. No public route, device permission,
ready RDP/AUDIN, recording or latency acceptance is claimed.

Full `pnpm check` passes **439/439** on pinned Node 24, closing iteration 137's
clean whole-suite validation gap without relaxing test assertions/deadlines.
CTest bundled **17/17** and foundation **6/6**, formatting and diff checks pass.
Public
ownership/WS/browser selection, actual audio/device/LAN/platform/resource /
failure injection and soak gates remain open. [Contract](MICROPHONE_OPUS_INGRESS.md).
