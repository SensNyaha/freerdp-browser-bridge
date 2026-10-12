# Iteration 139 — exclusive Opus microphone retirement

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
selected ingress `cd01a7c`. MicrophoneOwnership chooses PCM/default or Opus once
and reuses the single grant/drain/reset/fresh-publication barrier. Profile is
stable across external backend metadata changes; delegate access occurs only
after reservations, preventing reentrant capture acquisition.

Portable PCM/Opus ingress/ownership checks pass **25/25**. Five new Opus owner
cases verify exclusivity, immutable selection, stale grant immunity, pending
borrow/wipe before reset, scheduled-but-not-published pause, newer server epoch
proof, waiting-source refusal, empty release, finite reset/publication failure
and termination once. Reentrant delegate getter cannot create a second owner.
One additional ingress case verifies malformed input during a pending boundary
interrupts prediction without trusting/consuming its sequence.

Private worker checks pass **22/22**, including an additional synthetic Opus
owner→ingress→kind-44 process case. Grant transfer waits for old flight drain,
private reset and observed new epoch; stale ingress cannot affect replacement,
and source listeners are reclaimed. This is fake IPC source/transport rather
than actual ready RDP/AUDIN or device capture; existing actual local TLS cases
retain strict refusal/closed-source acceptance only.

Full `pnpm check` passes **446/446** on pinned Node 24. CTest bundled **17/17**
and foundation **6/6**, formatting and diff checks pass.

Actual XRDP/API/Edge regression could not reconnect: viewer stopped in the
certificate phase with zero frames/bytes, closed microphone epoch 0 and zero
permission/graph/offered/sent samples. Independent TCP check to the authorized
192.168.21.149:3389 returned false. This is an explicit current environment
block, not new real RDP acceptance; earlier iteration-136 regression remains
the latest passing actual desktop evidence. No certificate/credential policy
was changed and no physical capture was requested. Local evidence:
`build/iteration-139-xrdp-viewer.log`.

Public session/WS /
browser encoder/capture selection, actual recording/LAN/platform/resource /
failure injection and soak gates remain open. [Contract](MICROPHONE_OWNERSHIP.md).
