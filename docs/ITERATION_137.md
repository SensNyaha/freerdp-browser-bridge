# Iteration 137 — typed private Node Opus microphone

Date: 2026-10-12. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after raw worker activation `b4529b2`. Optional fixed HELLO
schema-1 suffix bit 1 reports opusInput only alongside microphoneReset,
base pcmInput and connectCore. Legacy absence is false; invalid dependencies
and unknown bits fail before configure/secrets. Guarded Windows CLI/build REST
agree with HELLO; foundation reports false.

WorkerProcess selects immutable PCM/Opus input independently of output before
private credentials/connect. Typed Opus send shares one flight with capture
reset, rejects wrong codec/stale epochs, pauses a scheduled old epoch and wipes
its encoded payload/transport copy without changing caller storage. Neither
refusal nor malformed/duplicate completion retries a predictive packet. Input
source metadata remains normalized PCM; acceptance is admission, not recording.

Focused protocol **2/2** and integration **35/35** pass on pinned Node 24.
Synthetic IPC covers copied/frozen state, shared send/reset ownership, fresh
epoch recovery, profile/legacy refusal and malformed/duplicate completion.
Three actual private Node/native/local TLS cases select Opus input with output
off/PCM/Opus, then reject the untrusted certificate with closed epoch 0,
zero application bytes and bounded heartbeat/shutdown/runtime cleanup. These
are not ready AUDIN, physical capture or remote recording acceptance.

Initial full `pnpm check` was **432/433**: an existing Edge Worklet fixture
timed out waiting for its synthetic button click at the unchanged 3 s deadline.
The isolated unchanged fixture passes **1/1**; the cause is not established.
No deadline, test assertion or antivirus policy was relaxed. Foundation native
Node lifecycle/configuration checks pass **2/2**. CTest bundled **17/17** and
foundation **6/6** pass; /analyze /WX, formatting and diff checks pass.

The unchanged full recheck was **432/433**, this time with a timeout launching
the existing fixture-opus-tone executable within 5 s; the earlier click passed.
The isolated unchanged PCM/Opus viewer recheck passes **2/2**. Every test passes
across the two full runs, but neither is a clean whole-suite gate; this remains
an explicit validation gap to recheck with the next block rather than declaring
433/433. Neither failure establishes a product regression or an antivirus cause.
Subsequent iteration 138 full `pnpm check` passes **439/439** on unchanged
fixture assertions/deadlines, closing the clean whole-suite validation gap.
Public
NativeSessionWorker/media/browser Opus input remains unsupported; actual
audio/device/LAN/platform/resource/failure injection and soak gates stay open.
[Contract](MICROPHONE_OPUS_WORKER.md).
