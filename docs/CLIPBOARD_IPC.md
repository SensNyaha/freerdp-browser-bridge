# Clipboard private payload schemas

HTML development adds the bounded inner item below and an explicit private
worker/Node handoff. Schema-1/2 text command/result bytes and their maximum
envelope size remain unchanged. The new private schema-3 selection is described
after the inner item. Shared public ownership/control and the browser byte client
are implemented on `feature/html-clipboard`, along with reference ClipboardItem
actions and inert selected-context conversion. Named Windows/Edge OS ClipboardItem
acceptance now passes separately; actual RDP rich-application/peer acceptance
remains pending.

## HTML inner item in development

`native/ipc/clipboard_html.*` and `packages/protocol/src/clipboard-html.ts`
independently encode one HTML item for SPECIFICATION §2.7. It contains a checked
UTF-8 body, optional context, separate fragment/selection byte ranges and optional
UTF-8 text fallback. An absent fallback and a present empty text value are
distinct. CF_HTML headers, `SourceURL`, terminators and padding do not enter this
representation. HTML syntax is opaque; decoding never evaluates or sanitizes it.

All integers are big-endian. The fixed inner header is 32 bytes:

| Offset | Size | Value |
| --- | --- | --- |
| 0 | 2 | Inner item schema 1; distinct from outer text command schema 1 |
| 2 | 2 | Flags: text present=1, context=2, selection=4; no other bits |
| 4 | 4 | HTML body byte count |
| 8 | 4 | Text byte count; zero when absent |
| 12 | 4 | Fragment offset relative to body |
| 16 | 4 | Fragment byte count |
| 20 | 4 | Selection offset relative to body; zero when absent |
| 24 | 4 | Selection byte count; zero when absent |
| 28 | 4 | Reserved zero |
| 32 | body count | UTF-8 HTML body |
| after body | text count | Optional UTF-8 text fallback |

Declared lengths must exhaust the packet exactly. No-context items have the
whole body as their fragment; an empty fragment without context is valid.
Context requires a nonempty body. Selection must stay inside the fragment; fragment stays inside
the body. All boundaries must fall between complete UTF-8 scalars. Embedded NUL,
invalid/overlong UTF-8, unpaired surrogates, noncanonical absent fields, unknown
versions/flags, nonzero reserved bytes and trailing content are refused.

Body plus text fit the configured 1..16 MiB item maximum. The item including its
32-byte header additionally fits the existing 16 MiB outer payload reservation,
so useful content cannot exceed 16 MiB minus 32 bytes. Outer RWI1 command/result
metadata remains separately bounded by its existing 24 bytes. No parser-limit or
queue increase is introduced. Text also fits its terminated/normalized UTF-16
limit; the outgoing native owner separately admits the sum of both actual RDP
representations before encoding them. The item codec alone confers no direction,
controller, generation/revision, capability, transport-credit or deadline authority.

Encoders validate the complete immutable input before allocating/copying one
packet. Decoders borrow body and text after fixed-header/length/quota admission;
owners must copy only after all outer authority checks and wipe retained content
on retirement. Context may contain unselected text: later browser conversion
must preserve the distinction between context and the actual selection.

Shared independently specified golden bytes cover HTML plus text and distinguish
empty/absent fallback. C++ and TypeScript tests exercise contextual Unicode,
fragment/selection boundaries, every golden truncation, overflowed lengths,
reserved bits, malformed UTF-8 and the exact 16 MiB transport ceiling. The existing
clipboard wire fuzzer additionally roundtrips this inner item with seeded valid
and malformed samples. These checks are codec evidence, not real remote HTML
or browser clipboard acceptance.

The 41-byte golden item is `<b>X</b>` with text `X`, no context and no separate
selection. Its exact bytes are:

```text
00010001000000080000000100000000000000080000000000000000000000003c623e583c2f623e58
```

The item checkpoint `68cebfc` passes complete Windows linked `pnpm check`: 1056 passed,
71 explicit skips, zero failures. MSVC `/WX` + `/analyze` linked CTest passes
39/39 and exact GCC 8.3 linked CTest 40/40. The Clang 18 wire suite passes under
ASan/UBSan; the instrumented wire fuzzer completes 936,689 runs in 61 seconds
without a crash or sanitizer failure. Final native/sanitizer runs also include
additional corrupted body/fallback input assertions added during the Node run;
production codec bytes are unchanged. This is synthetic codec acceptance only.
Hash-bound source/log evidence: `build/current-validation/html-item-acceptance.json`.

## Private worker HTML negotiation and handoff in development

The pinned CLIPRDR-enabled worker advertises HELLO extension bit **256**,
`clipboardHtml`, only with connection-core, text bit 8 and revoke bit 16. Node
refuses an incomplete combination. Older peers omit the optional property;
explicit HTML selection refuses before CONFIGURE/SECRET when unsupported.
Foundation workers do not advertise HTML and return content-free unavailable
for otherwise structurally valid schema-3 commands. This private capability
does not accept browser/remote-application HTML integration.

Raw connection schema **13** retains all schema-12 fields and adds flag **512**
for HTML in the existing four-byte feature word. The word admits only 0..1023,
retains exclusive audio/input and compatibility-buffer constraints, and HTML
requires at least one clipboard direction. The maximum remains 1..16 MiB. The
performance pair and IP triple are mandatory even when omitted by the caller:
both then contain zeroes. Earlier schemas retain their masks and byte layouts.

Selected HTML source state remains 24 bytes with schema **3**. Existing flag
meanings are retained; **128=HTML selected**, **256=remote HTML available**,
**512=local HTML accepted**. Schema 3 requires selection bit 128. Remote HTML
requires ready, from-server and a nonzero revision. Local HTML accepted requires
ready, to-server and local-accepted. State without HTML selection still emits
exact schema 1. A typed Node source must match its immutable selected policy;
unsolicited HTML selection cannot enable a session.

Command/result metadata remains the existing 24-byte layout, with schema **3**
only for **read-html=4** and **set-html=5**. A read uses the current nonzero
generation/revision and no command body. A set uses nonzero generation, revision
zero and one encoded inner item. Set accepts a no-context complete fragment and
optional text; contextual read items are refused as writes rather than silently
losing context/selection. Accepted reads return one inner item. Set results and
every negative result are content-free. Status values and outer RWI1 correlation
and allocation bounds are unchanged. Schema-3 revoke is invalid: the existing
content-free schema-2 operation revokes both local formats together.

`WorkerSession` retains one shared producer reservation for all five operations.
Input admission checks published generation/revision, explicit HTML policy,
directions and quotas before moving a payload. Dispatch rechecks the real owner
and the existing 250 ms arrival deadline. HTML writes wait for the one native
format-list ACK, and successful revoke waits for its empty-list ACK. No format
is served before that ACK. Unknown/failing/legacy selection never becomes a
successful write or an automatic downgrade to text.

Rich reads request HTML by the current peer's named ID. When that same offer
also advertises Unicode, the worker retains the bounded HTML item and requests
Unicode after the first callback returns, within the same producer reservation.
There is never more than one uncorrelated CLIPRDR response outstanding. The
aggregate original UTF-8 and the original admitted CF_HTML wire bytes plus the
canonical terminated Unicode representation must fit the configured maximum.
Inner-item metadata must still fit the existing absolute private transport cap.
Quota refusal, a refused fallback or a changed offer returns no partial item.
The old flight is drained before any replacement; a result held under output
backpressure becomes stale without content if its offer changes.

The pair has a ten-second absolute deadline in addition to each native
five-second response budget. Both callbacks and polling check the absolute
deadline; a late second response before the next poll cannot revive it. Existing
one-second output-publication and channel-retirement barriers remain. Node uses
a finite twelve-second completion timeout for rich reads, seven seconds for
other clipboard calls, and never retries. Retained HTML/text bytes are wiped on
completion/retirement, including partial pair and result buffers. This bounds
owned slots; SDK copies and whole-process resource acceptance remain separate.

The private `WorkerProcess` adds `readClipboardHtml(revision)` and
`writeClipboardHtml(item)`. HTML is explicitly selected with
`clipboard: {mode, html:true, maxItemBytes}` alongside baseline Unicode support;
`text:false`, images and files remain refused. Reads return `{status,item?}`;
only accepted reads include a checked item, with owned backing storage shared
by its body/text views. A retaining caller must clear both content views after
use. Writes copy only after authority/size/busy admission and leave caller-owned
buffers unchanged. `revokeClipboardText()` keeps its historical name and revokes
the entire item. No method accesses an OS clipboard, evaluates markup or fetches
URLs. The public session manager/adapters and reference browser still need their
HTML integration and acceptance before release.

Native component tests use the real pinned parser with a synthetic SVC peer.
Actual native process/TLS tests prove only schema/capability admission, strict
certificate refusal or cancellation, heartbeat and joined shutdown on the test
machine. Synthetic private-IPC tests prove typed Node ownership and validation.
Neither establishes successful HTML exchange with a remote application.

The private handoff checkpoint `fd091a5` passes Windows linked CTest **39/39** and exact
GCC 8.3 linked CTest **40/40**. Complete `pnpm check` passes Windows **1068/71
skips** and Linux UID1000 with no effective capabilities **1049/93 skips**, zero
failures. GNU 13.3 ASan/UBSan passes the four touched wire/IPC/owner/worker suites
without suppressions, using the existing pinned SDK dependencies. Clang 18's
instrumented wire fuzzer completes **905,341 runs in 61 seconds** without errors.

The Node focus passes 23/23. Three extra typed native HTML direction cases pass
on each OS, and a separate current Node test observes the actual twelve-second
timeout without retries; these tests were added during the full runs and have
their own receipts. The native aggregate-deadline negative control removes only
the second response callback guard in a disposable source copy: the late response
then succeeds and the assertion fails (Catch2 exit 42). Restoring the exact
current source bytes makes the assertion pass. No suppression, timeout extension
or published artifact change is used. Hash-bound evidence is
`build/current-validation/html-worker-acceptance.json`.

## Existing text transport

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
or establish total resource acceptance. The named actual offer/revoke ACK slice
now passes on [Linux primary/framed IPC](history/iterations/201-250.md#iteration-241) and through the
[Windows/Edge public control path](history/iterations/201-250.md#iteration-240); remote application
consumption and reverse readback remain open.

`NativeSessionWorker` now accepts explicit text policy only with a matching
numeric item reservation and both HELLO capabilities (Iteration 237). Missing /
mismatched reservations refuse before spawn; old/read-set-only peers refuse
before CONFIGURE/SECRET. Prepared
[controller ownership](CLIPBOARD_SESSION.md) now binds manager operations to the
current control lease and joins drain/revoke before replacement. Server
[control framing/credit](CLIPBOARD_CONTROL.md) is implemented for explicit backend
hooks and the selected native adapter. [Browser integration](CLIPBOARD_BROWSER.md)
now passes Edge/mocked-permission fixtures; actual browser/OS permission and remote
transfer remain required. The inventory lab helper never reads clipboard
contents; optional `set-sentinel` explicitly writes one fixed synthetic value,
waits for the server ACK and clears it. It does not establish application reads.
No content enters errors, metrics or logs; total RSS and network latency remain
separate acceptance gates.
