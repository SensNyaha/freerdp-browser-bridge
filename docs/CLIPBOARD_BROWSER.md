# Explicit reference browser clipboard

Iteration 238, 2026-10-16. Implements the reference client portion of
SPECIFICATION §2.7 over [current RWC1 control transfer](CLIPBOARD_CONTROL.md) and
[controller/native ownership](CLIPBOARD_SESSION.md). Text selection is opt-in;
the connection form defaults to off, checks both native clipboard capabilities
and supplies a finite 1..16 MiB item maximum. HTML/images/files remain unsupported
and required follow-up work. Stage 7 remains in progress.

The quota input is disabled while off, so an empty draft quota cannot block an
ordinary clipboard-disabled connection. Current actual XRDP JPEG/H.264 desktop
regression verifies the disabled panel and zero native/browser clipboard events
with mocked-refusal OS APIs. [Scope/evidence](ITERATION_239.md).

The viewer shares the existing authenticated control socket and its sequence
with input. It sets binaryType to arraybuffer and routes only clipboard messages
to one ClipboardClient. Offers contain scalar metadata and never trigger reads,
permission prompts or OS clipboard operations. Current connected attachment,
source generation/directions/maximum, revision, request correlation, exact sizes /
offsets and issued credit are checked before allocation or delivery.
Operation readiness additionally checks native local/remote pending flags. A
fresh grant cannot start while an earlier native local offer is accepted or
awaiting ACK; an existing current grant may replace its accepted offer after the
shared flight drains. Send/Get remain disabled until their admission is ready.

One upload/download owns one byte item and at most eight copied 4 KiB records.
Upload windows start at least 64 ms apart. The client waits for server credit,
keeps local bufferedAmount plus each send at most 8 KiB, and polls a stalled
outbound queue using one finite host timer. Sent records remain owned until the
server's window ACK/result, then are wiped. The whole upload buffer is wiped
after its final record is prepared; the result still waits for native completion.
No item/history/retry queue is introduced.

Downloads assemble exact bytes, ACK complete windows (including offset zero for
an empty item) and expose no text before clipboard.data.complete. The accepted
native item remains a frozen snapshot when later offers announce a revision.
Generation/source/controller loss invalidates it. Whole UTF-8 is decoded strictly,
with a leading U+FEFF preserved; both UTF-8 and normalized/terminated UTF-16 quotas
are checked. Local strings are measured before encoding, reject NUL/lone
surrogates, and preserve complete Unicode scalars across chunk boundaries.
This follows the [Encoding Standard's BOM option](https://encoding.spec.whatwg.org/#interface-textdecoder).

The client uses original monotonic deadlines: 60 seconds for the item, two
seconds for an issued window/terminal read completion, eight seconds for native
completion. Partial records, input and unrelated offers cannot renew them.
Protocol, clock, deadline or backlog failure closes the viewer/control owner;
existing input reset and finite native drain/revoke apply. One timer services
the earliest transfer/pacing deadline and is cleared on disposal.

## Local actions and permission

The panel has a draft and a received field, with explicit send/get/local paste /
local copy/clear buttons. A local paste fills the draft only; the user separately
sends it to RDP. A remote read fills the received field only; copying it to the OS
clipboard is a separate click, including a valid empty result. Local clear erases
the fields and invalidates pending UI delivery; it does not send an RDP operation.
During a transfer the wire owner still drains through completion or disconnect.

The [Clipboard API](https://www.w3.org/TR/clipboard-apis/) is secure-context and
permission controlled. readText/writeText are invoked directly within their
respective click, before any await or remote request. Unavailable APIs disable
those two buttons; ordinary manual paste/copy in the fields remains available.
Denial uses a fixed message. One expiring permission token and a five-second
deadline reject late results after clear, expiry, source loss or detach. A
cancellable promise race releases UI continuations even if the browser request
does not settle. The owner does not query permission in advance or retry it.

Detach/source loss clears fields, owned byte buffers, timers and listeners. No
localStorage, persistence, logging, metrics content or automatic synchronization
is added. Browser/OS APIs and immutable JS strings can retain upstream copies;
an already invoked OS write cannot be rolled back by detach. This is not a full
memory-zeroization or physical clipboard acceptance claim. The two bounded UI
fields and an active item also require total-memory/CPU acceptance separately.

## Evidence boundaries

Pure composition tests use the actual Node transfer owner with virtual time,
full 16 MiB both ways, byte hashes, BOM/CRLF/scalar/quota boundaries, malformed
credit/identity/data, original deadlines, source loss, stalled backlog and wipe
checks. Actual Edge/HTTP/control WS/reference-viewer tests use a fake RDP backend
and mocked Clipboard API. They exercise all three directions, multi-window text,
input, explicit local actions, denial, expiry, clear/detach late results, empty
copy, native-revoke replacement cleanup and one JPEG frame.

These fixtures access no real OS clipboard or remote clipboard. A separately
authorized [Windows/XRDP/Edge probe](ITERATION_240.md) now passes fixed Unicode
offer ACK, no-format revoke ACK while ready, fresh-token replay and cleanup,
with zero remote reads or host Clipboard API requests. Actual application data
consumption/readback, browser permission/device behavior, latency/network,
total RSS/CPU and managed-drive release gates remain open. The one-test XRDP
mutation permission consumed in Iteration 232 is not reused.
