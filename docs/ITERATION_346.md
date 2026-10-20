# Iteration 346 — approved Windows endpoint activation retry

2026-10-20. After the strict refusal recorded in [iteration 344](ITERATION_344.md),
the user explicitly approved the newly presented exact certificate fingerprint
for one session. The bundled native FreeRDP helper accepted it only through its
prompt callback; no persistent trust policy was changed. The Windows endpoint
then reached `connected`, delivered a **1024×768** JPEG frame and answered
heartbeat checks. Across the bounded capture loop it observed seven changed
frames and 34 unchanged responses. The helper joined worker close and the
runtime directory was empty afterward.

This confirms current network/certificate-approved activation and a decoded
desktop on this endpoint. It does not establish 1080p, resize, browser rendering,
input, audio, clipboard, device, resource or sustained regression against the
new certificate. No frame was visually inspected or retained as report evidence.
