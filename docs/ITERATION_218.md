# Iteration 218 — restored actual Linux XRDP input/output inventory

2026-10-15. TCP 3389 is reachable again. The existing private inventory helper
connects using the previously authorized lab credentials and exact approved
session-only fingerprint, without changing strict certificate defaults.
Credentials reach the Linux host/worker through private stdin/IPC, never argv,
environment, image snapshots or committed reports.

All twelve sequential actual XRDP connections pass: PCM/Opus microphone input
times off/PCM/Opus output times primary unix-seqpacket-rws1 / explicit framed-pipe
fallback. Each connects, survives heartbeat, captures a 1920x1080 JPEG, closes
and leaves its private runtime empty before the next connection begins.
No permission request, physical capture, microphone sample, remote input or
remote sound-generation command is issued.

Every microphone source remains waiting at epoch 0; no ready input is observed.
Enabled output sources also remain waiting during these three-second inventory
windows. This establishes actual selected-channel/lifecycle composition on the
restored server, not successful AUDIN Open, recording, audible output, ready-source
reset, latency or long soak. It does not identify why the server has not opened
input. The pending optional request for active playback does not block unrelated
development. Source data and audible acceptance remain separate gates.

Actual scalar reports: build/iteration-218-xrdp-{pcm,opus}-{off,pcm,opus}-
{auto,framed}.log. An additional initial Opus/Opus primary probe also passes.
No production or test code changes are needed for this inventory. Current full
regressions remain Windows bundled 557/47 skips and Linux 550/54 (604 cases),
plus the later full 353-case unit suite for artifact scanning. The exact current
release artifacts and their known-password scan are recorded in Iteration 217.
