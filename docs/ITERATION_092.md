# Iteration 92 — fixed typed managed audio profiles

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 following
media-lease reset ownership `2b6b955`.

The trusted backend event and lease metadata contracts now describe PCM/Opus
explicitly. SessionAudioSource fixes one profile, delegates strict clock/epoch
validation and retains no sample bytes. Wrong-codec and ambiguous packets are
refused atomically. Current managed creation/socket remain PCM and public Opus
gates remain in place until delivery/browser ownership is connected.

Four new isolated cases and existing manager/PCM socket/private IPC checks pass
**22/22** narrow tests. Full bundled `pnpm check` passes **264/264** Node cases
without skips; existing native bundled CTest passes **16/16**, foundation **6/6**.
Native implementation/wire is unchanged. These
are framing/ownership fixtures, not actual Opus entropy or audible RDP evidence.
[Contract and retained gates](SESSION_AUDIO.md).
