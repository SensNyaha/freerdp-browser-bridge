# Iteration 132 — Opus input delay compensation and browser/native composition

Date: 2026-10-12. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after packet codecs `f7ec72a`. Native `OpusCaptureDecoder`
removes measured pre-skip once per encoder generation, owns fixed partial/output
PCM and preserves the original capture clock. Invalid metadata/time/epoch
does not advance prediction or replace borrowed PCM. Reset clears retained tail.

Three native cases / 689 assertions pass; combined pinned Opus encoder/decoder /
capture tests are 13 cases / 79,868 assertions. A test-only bounded native codec
probe and actual Edge synthetic AudioEncoder case pass full browser record →
Node projection → libopus → compensated stereo PCM. Eight compressed inputs
across two generations yield six correctly timed PCM units with expected tone
alignment. No microphone permission, RDP, device or host sound backend is used.

The initial native test compile failed due to a missing namespace alias in the
fixture; it was corrected before successful narrow/full native checks. No
production warning or assertion was suppressed. Both native builds use /analyze
and warnings as errors; formatting/diff checks pass.

Full `pnpm check`: **420/420** pass. No Opus input
capability, config or dispatch selection is activated; worker handoff, bounded
network admission, permission/AUDIN composition, actual recording/LAN/platform /
resource/soak gates remain open.

Native CTest: bundled **17/17**, foundation **6/6** pass. Bundled ZIP is rebuilt;
the synthetic codec probe remains a test target and is not installed in it.

[Compensation contract](MICROPHONE_OPUS_CAPTURE.md).
