# Experimental RWC1 control clipboard

Implements the server control transport portion of SPECIFICATION §2.7. It is
available only with explicit text policy and complete session backend hooks.
Production native selection and reference browser integration remain gated at
Iteration 236. Fake RDP/actual socket evidence does not establish remote clipboard
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
and wiped. No automatic read, retransmission, retry, HTML/image/file or OS
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
