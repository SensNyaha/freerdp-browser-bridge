# Iteration 87 — bounded private audio reset codec

Date: 2026-10-11. Implements preparatory recovery framing for SPECIFICATION §2.6
and MEDIA_PIPELINE §6 after serialized owner reset `3935d88`.

RWI1 kinds 37/38 add fixed schema/reserved/expected-epoch and typed-result bodies.
Both require nonzero request correlation. Native/TypeScript reject wrong lengths
before body allocation and reject invalid schema, reserved bytes, zero epochs and
unknown results. Replies use the existing 64-slot typed control FIFO, preserving
copies/order and startup audio selection. No audio capability, queue or timer is
added. HELLO-ready workers explicitly return unavailable without session activity.

Three new native cases pass **1,897 assertions**; total IPC is **63 cases / 9,567
assertions**. TypeScript has three new golden/boundary/fragmentation cases. The raw
lifecycle case passes on bundled and foundation workers: correlated unavailable,
healthy heartbeat, orderly shutdown and no connection or input. Bundled CTest
**16/16** and foundation CTest **6/6** pass. Full `pnpm check` is **240/240**, with
no skipped tests. /W4 /WX, /analyze, clang-format, strict TypeScript, lint, format
and `git diff --check` pass.

libFuzzer dispatch includes both decoders, but local Clang/libFuzzer execution
remains unverified. RDP-thread request placement, private Node API, public Opus
delivery/recovery, audible remote sound, microphone and resource/platform/LAN/soak
acceptance remain open. No new actual XRDP acceptance is claimed.
[Wire contract](AUDIO_RESET.md).
