# Iteration 115 — restored XRDP microphone profile inventory

Date: 2026-10-11. Actual authorized XRDP 192.168.21.149:3389, restored by the
user, was checked with private PCM input and output off, PCM and Opus separately.
Uses SPECIFICATION §2.6 / MICROPHONE_WORKER and the exact previously approved
certificate fingerprint. Credentials stay in ignored lab files/private IPC.

All three actual native connections pass activation, heartbeat, JPEG 1920×1080,
graceful close and empty owned runtime. Private HELLO reports pcmInput and
microphoneReset. Each input source stays enabled/waiting at revision 1, epoch 0.
PCM/Opus output stays waiting at revision 1, epoch 1; output-off has no audio
states. No ready capture source or negotiated remote application capture is
established by this idle inventory.

The reproducible helper is `scripts/test-xrdp-microphone.mjs`, with one optional
output selector off/pcm/opus. Bounded reports go to ignored
`.local-tests/xrdp-microphone-<mode>-report.json`. It requests no browser/host
capture permission, sends no captured or synthetic PCM, performs no reset and
sends no remote input/application/sound-generation commands. No secret enters
argv, env, report or output. Other certificate fingerprints are never accepted
within a run.

Evidence: ignored `build/iteration-115-xrdp-microphone-{off,pcm,opus}.log` and
the bounded reports. Script lint/format checks pass. No foundation/native code
changes; preceding `47c80f7` verification remains 322/322 Node and CTest 17/17,
6/6, without claiming a new full run for this helper-only block.

Public microphone selection/lease/socket/permission/capture, ready-source reset,
actual remote/physical/LAN/platform/core-limit acceptance remain open.
