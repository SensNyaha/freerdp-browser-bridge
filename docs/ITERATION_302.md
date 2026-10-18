# Iteration 302 — Windows desktop-ready audio inventory repeat

2026-10-18. After confirming the current lab is Windows (`5fccd4e`), the user
closes its initial backup/preparation wizard and reports desktop access.
Existing helpers are rerun sequentially with the same approved fingerprint,
current Node build and unchanged bundled Windows worker.

The core helper connects, preserves heartbeat and captures the Windows desktop
with its Start menu. The existing native JPEG is viewed in place; no desktop
settings, account choices or remote application commands are issued.

Both RDPSND PCM/120 ms and Opus/200 ms ten-second observations remain waiting:
zero server/client Formats, Training, configs, packets or Waves. Heartbeat,
1920×1080 frame and native close pass; no ready-source reset can be exercised.
AUDIN PCM/Opus with output off also remains waiting epoch 0 with all channel,
version/format/Open counters zero, no sample submission and no physical capture.
Heartbeat, native close and empty runtime pass for both microphone profiles.

All helpers exit zero for their named bounded inventory scope. This is not
audio playback/recording acceptance. Desktop availability alone has not produced
ready audio; the cause remains unverified. No certificate policy, device access,
Release profile or dependency version is changed.

Evidence: `build/iteration-302-windows-desktop.log`,
`iteration-302-windows-audio-{pcm,opus}.log` and
`iteration-302-windows-microphone-{pcm,opus}.log`. Scalar-only reports in ignored
`.local-tests` are refreshed by existing helpers. No remote or host clipboard
content is read. Local documentation links and `git diff --check` pass.
This changes documentation only; full build/Node/CTest baselines are iteration
300's Windows/Linux checks, not new repeated suite claims.

Continue Stage 5/7 controlled application tests on the now available desktop
and retain the Stage 6 ready-source/audible/recording/platform gates.
