# Clipboard private payload schema 1

Prepares the private Node/worker portion of SPECIFICATION §2.7. The payload
codecs are implemented independently in C++20 and strict TypeScript. Iteration
227 prepared these payloads; Iteration 228 assigns additive RWI1 kinds below
and bounded output/carrier storage. Both workers validate unselected commands
and return unavailable. Iteration 231 selects guarded native dispatch through
explicit raw schema 10; clipboard HELLO, typed Node and public/browser selection
remain disabled. Unselected workers still return unavailable.

| RWI1 kind | Request ID | Payload bound |
| --- | --- | --- |
| 45 CLIPBOARD_STATE | zero | exactly 24 bytes |
| 46 CLIPBOARD_COMMAND | nonzero | 24..16,777,240 bytes |
| 47 CLIPBOARD_RESULT | matching nonzero command ID | 24..16,777,240 bytes |

Bounds/correlation are checked in the envelope before body allocation. Source
state is not emitted by the unselected worker. Commands are single-flight;
negative replies contain no text. The framed/RWS1 carriers now accept the maximum
logical clipboard command; public control/media WebSocket limits are unchanged.
Caller-side Node write budgets still apply (default 64 KiB); a larger private
packet owner needs an explicit finite budget. No write-budget bypass is added.

All integers are big-endian. Identity fields are unsigned 64-bit (Node bigint).
Generation is nonzero and identifies one native channel lifetime. Offer revision
is nonzero for reads and zero for local sets. Codecs validate structure only;
the eventual active owner must separately verify observed generation/revision, capability,
current attachment/grant, direction policy, rate/queue/size and finite deadlines.
Ready metadata alone confers no clipboard authority.

Scalar source state is exactly 24 bytes:

| Offset | Size | Value |
| --- | --- | --- |
| 0 | 2 | schema = 1 |
| 2 | 2 | flags: ready=1, to-server=2, from-server=4, remote-text=8, local-accepted=16, local-pending=32, remote-pending=64 |
| 4 | 4 | configured item maximum, 1..16 MiB |
| 8 | 8 | generation |
| 16 | 8 | current remote offer revision; initially zero |

At least one direction is selected. Ready/direction are required for their
available/pending flags. Local accepted and pending cannot coexist. Remote text
or a pending remote request requires a nonzero revision; a later offer without
Unicode may clear remote-text while the old response remains pending.

Command/result metadata is also 24 bytes, followed by raw UTF-8 text:

| Offset | Size | Value |
| --- | --- | --- |
| 0 | 2 | schema = 1 |
| 2 | 2 | operation: read=1, set=2 |
| 4 | 2 | command: zero; result status below |
| 6 | 2 | reserved zero |
| 8 | 8 | expected/native generation |
| 16 | 8 | expected/requested remote revision for read; zero for set |
| 24 | remaining | raw UTF-8 text |

Statuses 0..7 are accepted, refused, stale, unavailable, busy, invalid, timeout,
disconnected. A command carries text only for set; a result carries text only
for an accepted read. Empty set/read text is valid. Accepted is protocol/native
completion, not confirmation that a remote application consumed the value.
Negative results never carry clipboard content. The future outer transport must
provide nonzero command/result request correlation independently of these fields.

Text must be strict UTF-8 without NUL. Its byte count and its normalized,
terminated CF_UNICODETEXT size both fit 16 MiB, following the native conversion
contract. Payload bytes are preserved: conversion/CRLF normalization belongs to
the native text owner. Encoders validate before allocation/copy. Decoders return
a borrowed span/subarray; a retaining owner must copy only after admission and
clear retained content on retirement. The maximum logical record is 16 MiB + 24
bytes. The scalar state path never contains text.

## Raw native selection (Iteration 231)

Guarded Windows/Linux workers accept connection schema 10. It retains schema-9
fields, extends the four-byte flag mask to 511, adds bit 128 browser-to-server /
bit 256 server-to-browser and appends one big-endian u32 maximum. A selected
direction requires 1..16 MiB; both directions off requires zero. Earlier schema
masks and exclusive audio profiles remain unchanged. Foundation/non-channel
builds refuse selection before secret/connect. This is raw private activation;
HELLO and typed Node selection are not yet enabled.

Explicit selection enables only the custom public Unicode callback owner and
guarded receive route. It forces synchronous public channel dispatch, independently
maps direction feature bits and polls ingress/owner deadlines on the RDP thread.
No host clipboard backend is instantiated. IPC moves one accepted command into
the owner and wakes the RDP loop. Native readiness, current generation/revision,
policy and completion credit apply separately from the envelope. Unselected,
pre-connect, stopping and retired owners return unavailable without text.

Retirement destroys text callbacks on the RDP thread before SDK channel/context
cleanup and the enclosing terminal lifecycle settles any pending call. A queued
scalar state is not proof of a live source after terminal state. UTF-8 expansion
above the item quota also completes a read as refused without channel failure.
Whole-session/total-RSS and real remote clipboard acceptance remain open.

No secrets/content may enter errors, metrics or logs. Ownership/revocation,
publication credit, native source progression, channel retirement, active IPC
header/carrier bounds, public framing and actual remote tests remain required.
