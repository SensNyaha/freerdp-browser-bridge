# Iteration 135 — guarded AUDIN/Opus source owner

Date: 2026-10-12. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after private envelope `5c051c6`. A serialized RDP-thread owner
composes bounded Opus compensation and the existing source. Actual gate/open /
admitted ready epoch is checked before SDK allocation/decode. Source loss/reset
clears partial prediction; invalid packets preserve a current stream, downstream
uncertain admission is never retried, and failed ownership remains closed.

Five actual-linked AUDIN/public-channel fake-DVC cases pass **211 assertions**.
They cover publication gating, actual PCM callback, priming, current/new epoch,
first boundary, foreign thread, malformed-clock continuation, downstream invalid
admission, explicit retirement and channel Close preceding status publication.
These are synthetic SDK/channel integration, not real RDP/microphone acceptance.

The first build exposed Windows headers' `max` macro collision. The standard
parenthesized numeric_limits call fixes it; no warning was suppressed or SDK
header modified. /analyze /WX, native formatting and diff checks pass after fix.
Full `pnpm check`: **424/424** pass on pinned Node 24. CTest bundled **17/17**
and foundation **6/6** pass. No worker Opus selection changes in this block.

Worker dispatch/capability/selection and failure propagation stay disabled in
this block; Node/browser ownership, actual capture/LAN/resource/platform/soak
acceptance remain open. [Owner contract](MICROPHONE_OPUS_OWNER.md).
