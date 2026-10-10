# Iteration 31 — actual XRDP public touch readiness and replay

Date: 2026-10-10. Verifies the public path from SPECIFICATION §2.5 / PROTOCOL §3
under ADR-008 / ADR-009 / ADR-011; no new remote touch acceptance claim.
Implementation commit: `1f73a98`.

The local viewer helper has an explicit --touch-inventory mode, and the harness
exposes a copy of current readiness plus rendered-input eligibility for checking.
The helper checks negotiated readiness and reattachment replay using real native
worker → Node session manager → control WS → Edge harness, with both media codecs.

Actual authorized XRDP results:

- H.264/WebCodecs: **52 frames**, 1920×1080, ready ten contacts, generation **2**,
  rendered eligibility true, reattachment replay and cursor/motion/reset passed.
- JPEG: **43 frames**, same geometry/readiness/generation, rendered eligibility,
  reattachment replay and cursor/motion/reset passed.
- Both runs sent exactly one motion and one reset, **no touch/key/button/wheel/text**.
  API/browser/runtime cleanup succeeded. Pixel-range validation and encoded media
  decode passed; negotiated capability is distinct from remote contact consumption.
- Narrow ESLint/Prettier/diff checks passed. The preceding full regression is
  139/139 plus bundled CTest 10/10 and foundation 4/4. This helper/getter change
  was exercised by both actual browser runs; no native implementation changed.

Logs: ignored build/iteration-031-xrdp-h264.log and iteration-031-xrdp-jpeg.log.
Screenshots and bounded media metrics remain in ignored .local-tests files.
Physical device and actual application touch/no-stuck acceptance, RDPEI compatibility
and resource/reassembly audits, Linux/sanitizers/soak remain open. Stage 5 is not done.
