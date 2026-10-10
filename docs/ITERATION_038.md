# Iteration 38 — native public RDPSND sink adapter

Date: 2026-10-10. Continues SPECIFICATION §2.6 / ARCHITECTURE §5 with an isolated
public `rdpsndDevicePlugin` adapter compiled against pinned FreeRDP 3.32.1.
No private upstream struct casts, host audio or worker playback activation.
Implementation commit: `62c0f68`.
[Callback/ownership contract](AUDIO_PCM.md#public-rdpsnd-device-adapter).

The callbacks validate PCM descriptors, normalize and apply independent stereo
volume gains, enqueue within 120 ms, return latency according to public Play
semantics, reset on loss, and retire resources before delayed host Free. Legacy
Play avoids interpreting upstream decoded bytes through its compressed PlayEx
format. Compressed decoding and actual format negotiation remain unverified.

Verification:

- Native public-callback **9 cases / 341 assertions** cover descriptor validation, DefaultFormat ownership,
  PCM identity/low-rate conversion, independent volume, overflow recovery, malformed
  packets, close/reopen and foreign-thread/delayed-Free lifetime.
- Bundled CTest **12/12**, foundation **5/5**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **117.04 s**; TypeScript,
  lint/format and native/fake/Edge regressions passed.

Logs: ignored build/iteration-038-*.log. These are native public ABI fixtures, not
actual upstream channel loading/dispatch, remote audible output or browser tests.
Worker backend registration, upstream resource audit, transport, AudioWorklet,
Opus, microphone and actual Stage 5/6 acceptance gates remain open.
