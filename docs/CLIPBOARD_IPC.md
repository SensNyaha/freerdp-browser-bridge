# Clipboard private payload schemas

Prepares the private Node/worker portion of SPECIFICATION §2.7. The payload
codecs are implemented independently in C++20 and strict TypeScript. Iteration
227 prepared these payloads; Iteration 228 assigns additive RWI1 kinds below
and bounded output/carrier storage. Both workers validate unselected commands
and return unavailable. Iteration 231 selects guarded native dispatch through
explicit raw schema 10. Iteration 232 adds capability-gated typed `WorkerProcess`
selection/read/write. Iteration 233 adds separately gated schema-2 offer
revocation; public session/browser selection remains disabled.
Unselected workers still return unavailable.

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
is nonzero for reads and zero for local sets/revocation. Codecs validate structure only;
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

Command/result metadata is also 24 bytes, followed by raw UTF-8 text. Schema 1
retains read/set; the content-free revoke operation below requires schema 2:

| Offset | Size | Value |
| --- | --- | --- |
| 0 | 2 | schema = 1 for read/set; 2 for revoke |
| 2 | 2 | operation: read=1, set=2, revoke=3 |
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
builds refuse selection before secret/connect. This was raw private activation;
the typed selection below supersedes the historical HELLO/Node restriction.

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

## Private typed Node selection (Iteration 232)

The optional fixed schema-1 HELLO extension adds bit 8 `clipboardText`, requiring
connectCore. CLI/build diagnostics agree; old workers with no bit report false.
Unknown extension bits remain rejected. Old strict Node decoders reject the new
flag; install the matching worker/Node packages together. This is a private native
capability, not a public session/browser or host clipboard claim.

`WorkerProcess.connect` requires an explicit clipboard mode: bidirectional,
server-to-browser or browser-to-server. Omitted/off stays disabled. The selected
initial profile accepts text/Unicode only; text=false, HTML/images/files or an
absent explicit mode fail before CONFIGURE/SECRET. Its maximum defaults to 1 MiB
and permits the schema's 1..16 MiB range. No arbitrary channel arguments or OS
clipboard backend are exposed. A maximum below the Unicode terminator cannot
accept a text item. Existing Node write budgets still apply; larger private sets
need an explicit finite `maxWriteBytes`, with no automatic budget increase.

`clipboardState` and `clipboard` events expose copied scalar metadata. Policy,
maximum and generation remain immutable; revisions never move backwards. Ready
authority requires an actual connected RDP session. `readClipboardText(revision)`
and `writeClipboardText(Buffer)` share one flight, recheck current authority and
never retry content. The seven-second private deadline covers native dispatch /
peer completion / publication and fails uncertain IPC. Set accepted means native
peer ACK, not confirmation of a remote application's consumption.

Read returns `{status, text: Buffer}`; negative results have empty text. An
accepted read copies text only after matching operation/generation/revision and
current policy/offer checks. The caller owns and should clear that returned
buffer after use. Transport payloads are cleared after copying/discard; caller
write buffers are preserved. RDP/source retirement immediately rejects the one
pending read/write as disconnected, retains one scalar late-reply correlation
and drains its text without delivery. Already queued ready events cannot revive
retired authority. Wrong/duplicate/malformed replies fail IPC without text in
diagnostics. Process close retains its existing finite cleanup contract.

## Native offer revocation (Iteration 233)

The optional HELLO extension adds bit 16 `clipboardRevoke`, requiring bit 8
`clipboardText`. Old read/set-only peers remain usable privately; the revoke
method refuses before dispatch if this capability is absent. Matching packages
are required for new worker extension bits. State/read/set bytes remain schema 1.
Revoke command/result are exactly 24 bytes with schema 2, operation 3, generation
and zero revision; no text, reserved flags or other schema/operation combinations
are accepted. Envelope/carrier maxima and output slots do not change.

`revokeClipboardText()` shares the existing single flight. A pending local ACK
or another operation returns busy; no second uncorrelated request is queued and
the caller must drain its previous operation before revoking. On the RDP thread,
revocation wipes the retained value before transport work. It advertises no
formats, unlike `writeClipboardText(Buffer.alloc(0))`, which offers empty Unicode.
Successful completion requires the empty-list peer ACK and a published state
with local accepted/pending both false. Receive-only profiles, which cannot own
local text, complete without changing the remote clipboard after their initial
empty-list ACK. Negative ACK leaves no retained value and returns refused;
uncertain send, timeout or channel identity failure retires the native owner.

Pinned FreeRDP 3.32.1 `cliprdr_client_format_list` silently skips empty lists after
the first one while returning success. Therefore this one fixed 8-byte PDU uses
public `SendChannelData`, on the RDP thread, with a nonzero stable public
`cliprdr` channel ID and checked return. Before it sends, the public SDK channel
dispatcher drains previously accepted queued replies; the empty-list ACK must
not be overtaken by an older queued value response. Retirement and channel ID are
rechecked after that dispatch. No SDK structs, private plugin fields or arbitrary
raw channel data are exposed to callers. This does not bound SDK queues/CPU/RSS
or establish actual remote revocation; those acceptance gates remain open.

`NativeSessionWorker` now accepts explicit text policy only with a matching
numeric item reservation and both HELLO capabilities (Iteration 237). Missing /
mismatched reservations refuse before spawn; old/read-set-only peers refuse
before CONFIGURE/SECRET. Prepared
[controller ownership](CLIPBOARD_SESSION.md) now binds manager operations to the
current control lease and joins drain/revoke before replacement. Server
[control framing/credit](CLIPBOARD_CONTROL.md) is implemented for explicit backend
hooks and the selected native adapter; browser permission/gesture integration and actual
remote transfer remain required. The inventory lab helper never reads clipboard
contents; optional `set-sentinel` explicitly writes one fixed synthetic value,
waits for the server ACK and clears it. It does not establish application reads.
No content enters errors, metrics or logs; total RSS and network latency remain
separate acceptance gates.
