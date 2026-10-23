# Iteration 177 — distinguish raw trim from encoded prediction loss

2026-10-13. Implements SPECIFICATION §2.6 and ARCHITECTURE §6 on `7d0497c`.
Trimming source PCM before packet timestamps/encoding still counts skipped frames
but does not invalidate already delivered Opus prediction. An existing source
reset marker survives the trim. Timestamped interval skips and transport/encoded
loss retain their discontinuity and epoch recovery rules.

Pure queue tests cover reset-marker ownership and invalid requests. PCM publisher
checks unchanged epoch/config on raw trim, followed by a real late-interval reset.
Actual SDK Opus output matches an independent continuous encoder byte-for-byte
and still resets for missed timeline intervals. Storage remains bounded.

Foundation CTest 10/10 and bundled CTest 22/22 pass. An actual XRDP Opus probe
keeps heartbeat, ready-source reset/new config/data and 1080p capture/cleanup;
it reports 332 packets, 11 large callbacks and 36,636 skipped source frames.
This establishes the ownership correction, not loss-free/perceptual quality or
LAN latency. The user subsequently chose the separately implemented 200 ms
compatibility profile; it does not remove the ordinary 120 ms profile.
