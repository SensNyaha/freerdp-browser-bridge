# Iteration 44 — perceptual RDPSND volume

Date: 2026-10-10. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 volume
correctness in the virtual sink. Primary Microsoft protocol/API documents require
logarithmic interpretation. The previous linear amplitude law was a known gap
found during the format audit; it was never activated in the worker and is now
superseded. [Contract and policy](AUDIO_PCM.md#perceptual-volume).
Implementation commit: `46c3e6a`.

Nonzero left/right codes map uniformly over a documented -60..0 dB device range;
zero mutes. The range is bridge policy, not a protocol-mandated value. Coefficients
are computed at SetVolume and applied with Q30 signed integer arithmetic in Play.
The full-scale path is bit exact, packed GetVolume is preserved, and stereo
controls are independent after normalization. Fixed buffers and queue caps remain.

Portable fixtures check every S16 value at full gain, all 65,536 volume codes for
monotonicity/bounds/polarity, independent amplitude vectors, equal dB increments
and exact mute. Native public callback tests verify normalized mono/stereo bytes;
actual linked RDPSND + fake SVC covers Volume PDUs before device Open and independent
attenuation/mute through the negotiated guarded PCM path.

Verification:

- Portable audio **33 cases / 407,939 assertions**.
- Native RDPSND **31 cases / 950 assertions**, including actual linked channel
  Volume PDU attenuation/mute through fake SVC.
- Foundation CTest **5/5**, bundled **12/12**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **106.02 s**.

Logs are ignored build/iteration-044-*.log. Worker audio remains disabled;
clocks, host close faults, earlier core limits, worker/media scheduling, browser
playback, microphone and actual Stage 5/6 acceptance remain open.
