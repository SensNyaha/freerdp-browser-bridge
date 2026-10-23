# Iteration 142 — selected browser Opus sender composition

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after browser
preparation `b606e46`. A lazy Opus provider now shares preparation/network credit,
latest unencoded PCM replacement and source/permission ownership. Epoch loss
retires codec resources without inventing an issued network ACK. Definite
no-write drops prediction; uncertain write or codec/retirement failure closes
admission without replay. Already reported failure is not counted twice during
cleanup. A reentrant permission loss closes a late codec before input.

Focused portable/preparation/encoder and actual Edge composition pass **22/22**,
including seven new portable sender cases and one Edge case. Edge encodes five
synthetic packets across held credit, coalescing and source epochs. It never calls
physical getUserMedia, creates no graph and closes every codec without flush.
Client/viewer selection, ready AUDIN/recording/LAN/platform/resource/failure
injection and soak acceptance remain open. [Contract](MICROPHONE_OPUS_SENDER.md).

Full `pnpm check` passes **470/470** on pinned Node 24. CTest bundled **17/17**
and foundation **6/6** pass. The local XRDP helper now serves the shared bounded
Opus parser required by the existing PCM sender; its route correction passes
format/syntax checks and the actual lab run.

The user-restored authorized XRDP lab passes actual Edge H.264 rendering:
**57 frames, 1920×1080**, cursor motion/replay and reattachment. One motion/reset
is sent; no keyboard/button/wheel/touch or physical capture occurs. Microphone
source stays waiting revision 1 / epoch 0, permission requests and samples remain
zero. Helper exits successfully and its runtime root is empty. This closes the
desktop availability regression from iteration 139, not ready AUDIN/recording
acceptance. Formatting and diff checks pass.
