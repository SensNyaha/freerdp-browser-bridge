# Iteration 72 — PCM consumer metrics

Date: 2026-10-10. Implements PERFORMANCE instrumentation and Stage 6 bounded
audio queue/backpressure visibility after public viewer `31bbfd6`.

The protected Prometheus endpoint now aggregates PCM records/bytes by fixed
state/config/packet kinds, receiver credit and in-flight record bytes, and the
latest copied unsent sample bytes. Saturating owner counters distinguish sample
replacement, source reset and retirement, including pending samples erased by a
failed owner before route cleanup. Each route applies scalar ledger deltas;
ACK/detach/fault return storage gauges exactly once to zero.

Two fixed histogram stages measure successful active local socket forwarding and
valid receiver admission-credit round trips in seconds. Abandoned/wrong/expired
credit is excluded from successful ACK observations. Fixed failure reasons are
ack, protocol, receiver_deadline, admission_deadline and consumer. Shared media
rate/transport closure still uses its existing route behavior; these counters
do not represent every global socket/session failure. No session/host/credential,
source revision/epoch/PTS or sample content appears in labels. No sample history,
new queue/timer, browser/native jitter metrics or audible attestation is added.

Two real local WebSocket/fake-backend cases verify exact admitted lengths,
independent credit, pending bytes, replacement/source reset, detach, wrong ACK,
receiver timeout, retirement accounting and fixed label content. They pass **2/2**.
Seven existing record-owner and three socket-owner pure cases pass **10/10**,
including local admission deadline, consumer loss, throwing write and duplicate
close with balanced storage/discard counters. Full `pnpm check` passes **213/213**;
strict TypeScript, lint, format and `git diff --check` pass. Actual legacy XRDP/Edge
JPEG passes with **42 frames**, real pixels, cursor/display replay, reattachment
and 1920×1080 → 1280×720 → 1920×1080 resize/restoration. Only one authorized
motion and four resets were sent. No audio was selected in that legacy regression.
Native code/layout is unchanged from clean iteration 71 CTest **14/14** bundled,
**6/6** foundation and relocation **1/1** evidence.

Metrics distinguish local congestion from acknowledged receiver admission; they
cannot prove audible playback, actual RDP audio or LAN latency. Actual samples,
microphone/Opus, source/browser jitter/underflow export and resource/soak/platform
acceptance remain open.
