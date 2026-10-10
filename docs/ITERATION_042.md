# Iteration 42 — guarded RDPSND selection through the public addin loader

Date: 2026-10-10. Continues SPECIFICATION §2.6 / ARCHITECTURE §5 preparation.
An optional matching static gate is selected by the scoped public addin provider;
the prior linked entry runs through guarded public callbacks. Internal fixed
browser/PCM arguments replace caller backend/device argv. Unsupported dynamic and
legacy paths are explicitly refused in this profile.
[Contract](AUDIO_PCM.md#guarded-top-level-loader-selection).
Implementation commit: `7cabb98`.

Actual linked RDPSND + fake SVC fixtures cover general loader selection through
the wrapper into PCM, caller backend override, cached-entry replay refusal,
dynamic/legacy/type/foreign-thread gating, context/sink match and retaining provider
ownership until native write completions drain. CMake separates sink, public static
adapter and provider into acyclic native libraries.

Verification:

- RDPSND **28 cases / 847 assertions**, including four new guarded-loader cases.
- Portable audio **24 cases / 14,606 assertions** remain green.
- Bundled CTest **12/12**, foundation **5/5**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **105.23 s**; TypeScript,
  lint/format and native/fake/Edge regressions passed.

Logs are ignored build/iteration-042-*.log. No actual remote/browser audio test or
worker activation.

PCM-tag negotiation alone does not cover supported widths/rates/layouts: the
upstream DSP branch can accept formats beyond the sink, so a supported-offer policy
is still required. Earlier core buffers, close faults, stream clocks/discontinuity,
worker IPC/scheduling, browser playback and actual Stage 5/6 acceptance remain open.
