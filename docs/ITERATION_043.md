# Iteration 43 — supported PCM offers before RDPSND negotiation

Date: 2026-10-10. Continues SPECIFICATION §2.6 / resource correctness requirements.
The guarded static path rewrites only validated format offers into fixed storage,
retaining supported PCM8/PCM16 mono/stereo 8..48 kHz descriptors. Unsupported/compressed
offers are excluded before upstream's permissive DSP predicate can select them.
Negotiated client indices are checked before Wave dispatch.
[Policy and rationale](AUDIO_PCM.md#supported-pcm-offer-policy).

Portable fixtures verify independent PCM descriptors, stable filtering, full header
metadata preservation, width/rate/layout/alignment/average/extra-data limits,
64-offer capacity, failure before destination mutation and a valid empty response.
Actual linked guarded RDPSND + fake SVC fixtures cover mixed PCM24/PCM16 selection,
correct client index 0, rejected index 1 and no-common-format without sink Open.
The zero-count fixture exposed the pinned parser's 30-byte check for a 20-byte
fixed body. The adapter pads only internal dispatch by ten zero bytes; the exact
24-byte empty client wire reply and closed sink are verified. No synthetic format
or dependency source change is used.

Verification:

- Portable audio: **30 cases / 14,693 assertions**; foundation CTest **5/5**.
- Actual linked guarded RDPSND + fake SVC: **30 cases / 914 assertions**.
- Bundled CTest **12/12**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **120.90 s**.

Logs are ignored build/iteration-043-*.log. Worker audio remains disabled; no
actual remote/browser audio test or public wire/capability change.

Broader formats/codecs, earlier core allocations, host close faults, packet-clock
discontinuity, worker IPC/scheduling and browser playback/microphone acceptance
remain open. Static baseline negotiation no longer depends on compressed DSP fallback.
