# Iteration 64 — bounded browser PCM source reset ownership

Date: 2026-10-10. Implements SPECIFICATION §2.6, PROTOCOL §4 and
MEDIA_PIPELINE §6/8 source discontinuity handling after public codec `91578d0`.

Opt-in isolated PCM source mode accepts ordered AUDIO_STATE, validates source
progress, drops pending samples/config and schedules a coalesced Worklet reset
before fresh config/PCM. Source stop needs no new samples. Ready with matching
epoch/config is required for recovery; source observation and PCM capture clocks
keep their separate monotonic rules. There is still one posted command and one
latest pending sample, now with one pending reset flag. Default packet-only mode
preserves prior behavior and refuses the extension. No worker/API activation.

Five new pure cases cover no-sample Close/recovery, stale pending storage behind
old in-flight commands, 101-status coalescing, config/stop/epoch bypass refusal,
revision/clock/mode replay and cleanup. One new actual Edge/AudioContext/Worklet
case confirms Close discards the 960-frame prebuffer with no new PCM, then
suspend/wait/ready recovers the reserved epoch. Revision replay closes context/
port. These are actual browser callbacks with synthetic PCM, not audible RDP.
Focused audio-state/old-port/new-port/Edge regression **19/19**, no skips, passes.
Bundled `pnpm check` **174/174** (no skips, 142.74 s), strict TypeScript,
ESLint, Prettier and diff checks pass. Native code is unchanged; preceding
iteration 63 verified bundled CTest **14/14** and foundation CTest **6/6**.
Logs: ignored `build/iteration-064-*.log`.

Worker/provider selection, Node listeners/replay, public media negotiation,
remote audible output/microphone, upstream allocation and LAN latency remain open.
