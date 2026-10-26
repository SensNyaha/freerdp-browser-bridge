# Experimental RWC1 control clipboard

Implements the server control transport portion of SPECIFICATION §2.7. It is
available only with explicit text policy and complete session backend hooks.
Native selection requires the explicit reservation and both HELLO capabilities
from Iteration 237. The [explicit reference client](CLIPBOARD_BROWSER.md) is
implemented in Iteration 238. Fake RDP/actual
socket evidence does not establish remote clipboard
or physical/OS clipboard access. [Ownership](CLIPBOARD_SESSION.md),
[binary record layout](CLIPBOARD_CHUNKS.md).

The existing current control WebSocket carries small v1 JSON commands and RWC1
binary blocks; no extra socket/token/channel is introduced. Its 4,096-byte
message limit, 64 KiB output backlog, 256 total messages/s and 32 non-input
commands/s remain. Binary clipboard has a further 128-message/s ceiling. All
commands use the ordinary monotonically increasing control sequence. Generation
and remote revision are nonzero decimal u64 strings. Item byte counts are finite
0..configured maximum, never over 16 MiB.

`clipboard.offer` announces `{protocol:"RWC1", version:1, chunkBytes:4076, window:8,
granted, retiring, state?}`. State contains known scalar flags, maximum and
generation/revision strings only; it is absent until native metadata exists.
An offer never triggers a read. Operations lazily acquire current control
authority when the source is ready; retiring/unavailable ownership cannot allocate
an item or dispatch RDP work. Exactly one item may transfer; concurrent commands
return busy without a content queue.

## Browser to server

`clipboard.set` has exactly `{generation, bytes}`. A validated current source,
direction and quota precede one exact-size item allocation. Server
`clipboard.set.ready` carries `{requestSeq, bytes, creditEnd}`; the original
command sequence correlates every binary block. Blocks have contiguous offsets
and exactly 4,076 bytes except the final remainder. Eight blocks or the final
remainder fill the issued window. For a nonfinal window `clipboard.set.ack`
returns `{requestSeq, offset, creditEnd}` and grants the next window. Clients
must wait for issued credit; malformed or unsolicited binary data closes control.

After exact assembly the entire UTF-8/no-NUL and normalized/terminated UTF-16 quota
is validated atomically. Invalid text returns `clipboard.set.result` status
invalid without RDP dispatch. The backend copies text synchronously before the
server item buffer is wiped. `clipboard.set.result` `{requestSeq,status,bytes:0}`
follows actual native completion, not remote application consumption. Empty text
has no chunks and still needs native completion; it remains different from the
ownership layer's no-format revoke.

## Server to browser

`clipboard.request` has exactly `{generation, revision}`. A negative
`clipboard.data` `{requestSeq,status,bytes:0}` is terminal and needs no ACK.
An accepted native read sends `clipboard.data` with requestSeq, accepted status,
total bytes, original generation/revision and initial creditEnd. It then sends
at most eight RWC1 records, with one copied record borrowed by the transport at
a time. Sender windows start at least 64 ms apart. The receiver assembles exact
bytes and sends `clipboard.ack` `{requestSeq,offset}` only after the complete
issued window. Early, duplicate, wrong-correlation or wrong-offset ACKs close
control. A zero-byte accepted read requires exactly one offset-zero ACK.

`clipboard.data.complete` `{requestSeq,status:"accepted",bytes:0}` follows the
final ACK and transport-write completion. A receiver must validate the complete
text and wait for this event before exposing it. An accepted native read is a
captured item: a later remote offer can announce another revision, but does not
retarget that item's bytes. Offer changes during the native read return stale
without bytes. Controller/generation/source loss revokes transfer authority.
ACKs establish receiver progress, not OS clipboard writes or application pastes.

## Bounds, deadlines and cleanup

`ClipboardTransfer` retains one item buffer, scalar state, one native operation
and at most one 4 KiB copied transport borrow. It has no content/history queue.
Upload buffers are wiped after native admission/copy; download buffers after
completion or retirement. A pending copied block survives until its write
callback, then is wiped. Late backend results after close/timeout are discarded
and wiped. No automatic read, retransmission, retry, image/file or OS
clipboard operation is introduced.

One host timer services the earliest deadline: 60 seconds for the whole item,
two seconds for each issued data/ACK window, eight seconds for native completion,
or the next paced window. Partial records, input and unrelated traffic cannot
renew the window or whole deadline. Monotonic time is checked on dispatch,
receive, ACK and asynchronous completion as well as timer service. Credit/rate /
protocol/progress failure closes the control attachment and invokes existing
input reset/clipboard retirement. RDP survives when that retirement is safe;
uncertain native drain/revoke may still fail the session under its own contract.

Tests distinguish both-way 16 MiB virtual-clock ownership from actual sockets
carrying multi-window Unicode with a fake RDP backend. Socket tests cover input
interleave, direction refusal, malformed body, 4 KiB preallocation boundary,
wrong ACK, independent stalls, flooding, old-write/revoke replacement barrier,
metadata/log privacy and cleanup. These do not close actual remote transfer,
total memory/CPU, measured input/media latency, lossy-network or platform gates.

## HTML control extension in development

On `feature/html-clipboard`, explicit `clipboard.html:true` selection adds
`html:{version:1,itemMetadataBytes:32}` to `clipboard.offer` alongside scalar
state flags `html`, `remoteHtml` and `localHtmlAccepted`. This descriptor is
absent from text-only offers. Missing backend hooks or native capability refuse
selection before connection settings/secrets are submitted. Existing text
commands and RWC1 version-1 binary framing keep their original meaning.

`clipboard.html.set` has exactly `{generation,bytes}` and
`clipboard.html.request` exactly `{generation,revision}`. Their events use
`clipboard.html.set.ready`, `.set.ack`, `.set.result`, `.data` and
`.data.complete`, with the same fields/credit rules as the text equivalents.
Both formats share `clipboard.ack`, correlation sequences, one item/flight and
the existing controller authority. There is no parallel rich-content lane or
automatic text fallback after HTML refusal.

The binary item is the independently versioned
[32-byte HTML item plus UTF-8 body/optional text](CLIPBOARD_IPC.md#html-inner-item-in-development).
The declared length is at least 32 and at most
`min(16 MiB, configured maximum + 32)`, checked before allocation. Body and
optional fallback share the configured content quota. Complete upload validation
also checks the encoded CF_HTML/CF_UNICODETEXT aggregate before native dispatch.
Uploads are fragment-only: context or selection flags are invalid. Downloads
preserve checked context/fragment/selection byte ranges for explicit browser
conversion; the server does not parse or render HTML.

HTML reads have a finite 13-second native-progress ceiling covering the bounded
two-format private read. Text reads and both writes retain eight seconds; issued
windows retain two seconds and the whole item 60 seconds. Accepted backend body
and fallback buffers are wiped after encoding; stale/late/refused results and
retired encoded items are wiped too. No content enters offers, logs or status.

Current tests use synthetic backends with real HTTP/WebSocket transport and
actual native-process strict-TLS refusal/cleanup. Browser ClipboardItem handling
and real remote HTML application acceptance remain open; this extension is not
yet an accepted public release.

Implementation checkpoint `7ccef0a` passes full `pnpm check` on Windows
**1092 passed / 71 skipped / 0 failed** and Linux under UID1000 with zero
effective capabilities **1075 / 93 / 0**. Linked MSVC `/WX` + `/analyze` native
CTest passes **39/39**. Focused ownership/manager/transfer, actual socket and
native strict-TLS checks pass **31/31**; the three actual WebSocket HTML cases
also pass independently. Current C++ source is unchanged from the accepted
private handoff checkpoint; its GCC 8.3, sanitizer and fuzz evidence remains
separate in [private IPC](CLIPBOARD_IPC.md#private-worker-html-negotiation-and-handoff-in-development).

`build/current-validation/html-public-acceptance.json` binds current product/test
source and terminal logs by SHA256. The initial narrow regression caught an
accidentally widened explicit retirement override range; the original maximum
was restored before these passing full runs. No suppression or skipped failure
was added. Browser ClipboardItem and real RDP HTML acceptance remain open.
