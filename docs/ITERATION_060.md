# Iteration 60 — bounded PCM source status codec

Date: 2026-10-10. Implements SPECIFICATION §2.6, ARCHITECTURE §5/11 and
MEDIA_PIPELINE §8 discontinuity metadata. Continues source discard barrier
`844ee44`. This block does not emit worker status or activate audio.

Versioned private AUDIO_STATE kind 35 is exactly 40 bytes. It carries immutable
session opt-in, availability, nonzero revision, stream epoch and worker timestamp,
plus the fixed normalized PCM descriptor. It can represent source stop/reset
without waiting for new samples. Native/TypeScript encoders/decoders check all
fields; envelope limits reject body sizes before allocation. The output queue
validates status bodies/request ID 0 and schedules them as bounded control FIFO.
The pure TypeScript progress rule refuses revision replay, epoch/time regression
and mutation of the immutable connection opt-in.

Three native cases plus three Node cases use independent network-order vectors,
all illegal mode/flag values, every truncation, descriptor/reserved-byte mutations,
64-bit limits, whole-record fragmentation and queue priority/direction refusal.
IPC now **44 cases / 5,895 assertions**. Foundation CTest **6/6** and focused Node
**3/3** pass. Fuzz target/corpus include source status; seed generation passes,
local Clang execution remains unavailable. Bundled CTest **14/14** and bundled
`pnpm check` **166/166** (no skips, 119.93 s) pass. /W4 /WX /analyze,
clang-format, strict TypeScript, ESLint, Prettier and diff checks pass.
Logs: ignored `build/iteration-060-*.log`.

Status publisher/provider scheduling, epoch reservation/reset ordering, negotiated
worker capability/config selection, Node supervision/listeners, public browser
reset/playback and actual audible RDP/microphone/latency remain open. Current
workers do not emit or accept incoming AUDIO_STATE as commands; no HELLO bit or
public control event is introduced here. RWB1 config/sample layouts are unchanged.
