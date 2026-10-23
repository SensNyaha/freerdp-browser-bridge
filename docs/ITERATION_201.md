# Iteration 201 — actual Linux XRDP over the primary IPC

2026-10-14. Verifies SPECIFICATION sections 2.2/2.3 and STACK section 3 after
`c63d51a` against the user-authorized XRDP lab, from the local Linux amd64
Release worker and Node 24.21.0. This is actual RDP integration, not a fake
backend or a TLS-only lifecycle fixture. The automatically paired carrier is
`unix-seqpacket-rws1`.

Strict certificate validation rejects the lab's untrusted certificate with
exact `RDP_CERTIFICATE_REJECTED`; heartbeat remains usable and runtime cleanup
passes. A separate connection accepts only the SHA-256 fingerprint already
approved by the user, for that session. No certificate policy is weakened.

The connected check obtains an actual 1920×1080 JPEG (33,267 bytes) and H.264
IDR (6,333 bytes). Negotiated Display Control confirms 1280×720 and restoration
to 1920×1080; each changed desktop produces a fresh H.264 IDR with the matching
dimensions. Heartbeat, graceful close and empty runtime directory pass. No
worker remains in the owned lab container after these runs.

The reproducible helper receives at most 8 KiB of private stdin and uses the
existing separate RWI1 credential class. The host wrapper reads only the
explicitly authorized ignored lab files, passes no password in argv/env and
creates no credential files in the container. It bounds diagnostic output,
prints only scalar test receipts, and drains upstream stderr. Encoded desktop
bytes are not saved. The helper bounds readiness polling, total runtime and
the recorded state list; resize restoration is attempted before cleanup on
failure. Immutable JavaScript credential strings retain the previously recorded
zeroization limitation.

Failed attempts are preserved locally. Before access was restored, both host
and container TCP checks timed out; the corrected strict test reported
`RDP_CONNECT_TIMEOUT`, which is not certificate rejection. An earlier helper
mistakenly counted any failed state as strict rejection; that qualification was
corrected before acceptance. The first connected capture ran before desktop
readiness and failed. Bounded polling now requires both actual encoded frames
and negotiated display caps; absent caps cannot silently pass the resize check.
Logs: `build/iteration-201-*`.

Helper lint/format and full `pnpm check` pass: Linux linked **487 passed /
75 platform skips**, Windows foundation **506 passed / 56 platform/capability
skips**, 562 cases and zero failures. Native code is unchanged in this block;
the preceding linked/foundation CTest baselines remain 24/24 on Linux and
23/23 linked, 11/11 foundation on Windows.

This establishes private Node/native connected graphics, trust-once, resize and
cleanup on this Linux/XRDP pair. It does not establish browser decode, Windows
RDP server compatibility, input/device/audio integration, hostile transport,
resource bounds under sustained load or the full Stage 1/3/4 gates. Those remain
open.
