# Iteration 95 — bounded virtual microphone source

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after public Opus output `a585970`.

PcmCaptureSource accepts exact epoch-bound 20 ms normalized stereo input and
provides bounded PCM16 48 kHz mono/stereo callbacks without waits or per-call
allocation. The 120 ms queue skips oldest excess frames; capped prebuffer and
separate silence/underflow accounting preserve fresh capture. Timestamp/epoch /
boundary validation is atomic; stop wipes queue/scratch. Supported projection
and future public AUDIN ABI are explicit, with earlier allocation/DSP gaps recorded.

Six new pure cases pass **51,668 assertions**, including independent FIFO burst /
wrap and signed/partial-padding sample verification. Foundation CTest passes
**6/6** with /W4 /WX and MSVC /analyze. Initial test compilation caught a signed /
unsigned loop-bound warning; the test bound was corrected and the rerun passed.
Bundled CTest passes **16/16**, including the same six capture cases. Full bundled
`pnpm check` passes **276/276** Node cases without skips, relocated private ZIP
probe **1/1** and clang-format checks pass. Microphone is still
unsupported on worker/public API; no host device or actual remote input was used.
[Contract and retained integration gates](AUDIO_CAPTURE.md).
