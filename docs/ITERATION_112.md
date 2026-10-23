# Iteration 112 — browser PCM microphone wire foundation

Date: 2026-10-11. Implements SPECIFICATION §2.6 / PROTOCOL §6 /
MEDIA_PIPELINE §7 after private owner reset `028cb6e`.

Prepared RWB1 type 7/stream 4 has fixed captured PCM and input epoch, independent
of output audio. Node/browser codecs validate exact lengths/profile/clock and
nonzero sequence before allocation; decoders borrow samples without retention.
No public socket/capture capability or permission activation is introduced.

Three new portable wire cases cover independent vectors, Node/browser agreement,
private projection, every truncation, malformed fields and ownership/boundaries.
The focused codec run passes **10/10**. Full bundled `pnpm check` passes
**306/306**, without skips; unchanged bundled CTest passes **17/17**, foundation
**6/6**. Formatting and diff checks pass.
Native implementation is unchanged in this block.

Public ownership/reset/credit/permission/capture/resampling/Opus and actual remote /
physical/LAN/platform/core-limit gates remain open. [Wire contract](MICROPHONE_WIRE.md).
