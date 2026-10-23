# Iteration 203 — Linux connected RDP loss, primary and fallback

2026-10-14. Verifies the named SPECIFICATION 3.1 / Stage 1/3/10 connected loss
case on Linux amd64 after `bc0c244`. Two independent actual XRDP runs select
automatic paired RWS1 and explicit `framed-pipes`, respectively. Each requires
actual JPEG/H.264 IDR at 1920×1080 and confirmed resize/restoration before loss.

A single bounded loopback test relay then destroys only its own RDP TCP sockets.
Both workers report exact `RDP_DISCONNECTED` in a failed RDP state, still answer
a private heartbeat and close with an empty runtime directory. Each relay
observes one accepted upstream connection, no replacement, and joined close.
Neither worker crash nor IPC failure satisfies this acceptance check. No remote
operational input, device permission, audio generation or microphone capture is
performed. The native worker continues owning TLS/RDP; Node relays opaque bytes
without payload inspection/history.

The shared helper mode parser permits only strict, approved-fingerprint connect /
loss and optional explicit `--framed`; unknown, duplicate and misplaced options
are refused before reading credentials. One portable mode case and the existing
two actual echo-socket relay cases pass **3/3**. Lint/format pass. A separate
actual framed strict run still returns exact `RDP_CERTIFICATE_REJECTED`, usable
heartbeat and empty runtime. The immediately preceding complete bundled suites
pass Windows 538/25 skipped, Linux 488/75 skipped; the new mode unit is recorded
separately. Native code is unchanged. Local logs: `build/iteration-203-*`.

This accepts controlled connected RDP loss and private IPC health/cleanup for
this Linux/XRDP pair in both transports. Browser failure-state observation,
held-key/contact/device/audio remote release, reconnect, hostile traffic,
sustained resource budgets and general platform isolation remain separate gates.
