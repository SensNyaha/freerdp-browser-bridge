# Iteration 91 — bounded media lease reset ownership

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §6 after isolated
Opus sender `0be1dd1`.

Current media lease now schedules a trusted optional backend reset with one
session reservation and expected-epoch/readiness guards. Control/stale leases
never dispatch. A detached operation keeps the slot busy until completion and
cannot reply as the replacement owner; current source events retain normal lease
delivery. Unknown result, untrusted exception and three-second uncertain deadline
fail bounded backend ownership. Native adapter maps private capability/results
without adding a public browser command or enabling Opus startup.

Five new manager cases and one fake-native/private IPC handoff pass. Narrow audio
manager/lease checks total **15/15**, including the real three-second deadline and
late completion refusal. The handoff validates current media authority through
the native adapter to a fake private PCM worker, then fresh waiting/ready/config /
marked samples and healthy session. No actual remote/audio acceptance is claimed.

Full bundled `pnpm check` passes **260/260** Node cases without skips. Existing
native bundled CTest passes **16/16**, foundation **6/6**; native implementation/wire
is unchanged. Managed Opus source types and socket/browser activation, actual
ready-source reset and audible RDP/microphone, resource/platform/LAN/A/V/soak
acceptance remain open. [Contract](AUDIO_RESET_LEASE.md).
