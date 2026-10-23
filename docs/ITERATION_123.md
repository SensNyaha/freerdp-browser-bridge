# Iteration 123 — browser microphone graph and bounded sender

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
permission/track ownership `7158121`.

The graph scope owns the silent capture Worklet, source/node/port and its
prepared AudioContext. Port packets copy into the sender's latest slot and are
wiped before independent port credit returns. One main-thread poll checks
authority, sender ACK deadline and module/port stall. Finite retirement joins
context close, host barrier and initialization; late resources cannot reconnect.
Permission owner retains the device track and must close on graph fault.

Focused **7/7** pass: six pure graph/real-sender cases and one actual Edge
synthetic permission/stream/Worklet/RWB1 case. Held simulated network credit
replaces latest PCM; release sends a discontinuous fresh block. Stop closes
context/track/port and produces no late records. No original getUserMedia,
physical microphone, actual network/RDP admission or ready AUDIN is involved.

Bundled `pnpm check` passes **379/379**, without skips. Unchanged bundled CTest
passes **17/17**, foundation **6/6**. Formatting and diff checks pass.

Public command/socket ownership, context cleanup before permission/graph startup,
viewer/native selection and actual physical/remote/LAN/platform microphone,
native resampling and Opus input remain open.
[Current contract](MICROPHONE_GRAPH.md).
