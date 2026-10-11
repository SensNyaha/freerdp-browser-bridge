# Iteration 80 — native audio session codec and retirement ownership

Date: 2026-10-11. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6 after
output preparation `d6ad8cd`.

The AudioSession constructor selects one owned PCM/Opus publisher while retaining
one RDPSND source/gate/provider, the shared common statistics and finite retirement
procedure. Unsupported mode is rejected before binding. PCM stays default and
does not instantiate an Opus encoder. Native-only codec/count/cache diagnostics
contain no samples or session identifiers. The worker links the private provider
but still uses its default PCM session and dispatcher; no settings/HELLO/public
selection is enabled.

Two new cases pass **50 assertions** with the actual pinned static RDPSND and
fake SVC. Wave2 reaches the selected Opus publisher with correct state/config,
epoch/PTS, source/silence total, stereo/960-frame SDK packet queries and one encoded
packet. Close metadata precedes cancelled confirmation drainage; later owner
retirement releases resources, restores the provider and remains idempotent.
Unknown mode rejection and default PCM zero Opus counters pass.

Bundled CTest **16/16**, foundation **6/6**, full `pnpm check` **225/225** and
private ZIP relocation **1/1** pass. Relocation matters here because the worker
now imports the already bundled private Opus DLL. MSVC /W4 /WX, /analyze,
clang-format, strict TypeScript, lint, format and `git diff --check` pass.

These are linked channel fixtures with simulated transport, not audible RDP or
public Opus. Private worker IPC/Node selection, public negotiation, microphone,
loss fidelity, core/codec resource limits, platforms, LAN latency, A/V scheduling
and soak remain open. [Session contract](AUDIO_SESSION_CODECS.md).
