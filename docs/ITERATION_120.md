# Iteration 120 — bounded browser microphone sender

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
explicit media routing `aed3442`.

The isolated browser sender binds capture callbacks to a local permission token
and current source epoch. It owns one copied latest unsent PCM block, expires it
after 120 ms and permits one issued sequence/epoch ACK. Source progress, local
revocation, no-write handling, discontinuities, deadlines and sequence exhaustion
fail closed without replaying issued samples. Cleanup callbacks cannot restore
old authority; a late old-epoch refusal cannot pause an already observed new
epoch. No device, socket, timer or viewer activation is introduced.

Eight pure synthetic cases pass. They cover canonical metadata, copy ownership,
latest replacement, no-write/expiry, old/new epoch ACK ordering, permission revoke
and replacement, typed refusals, malformed/replayed input, deadlines, exhaustion
and reentrant transport/capture/cleanup. They do not establish actual browser
permission, capture, Worklet or WebSocket composition, ready AUDIN, physical,
remote or LAN acceptance. Native selection and Opus input remain open.

Final bundled `pnpm check` passes **354/354**, without skips, after the late
old-epoch refusal correction. Unchanged bundled CTest passes **17/17**,
foundation **6/6**. Formatting and diff checks pass.

[Current contract](MICROPHONE_SENDER.md).
