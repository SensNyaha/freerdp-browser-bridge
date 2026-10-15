# Public CLIPRDR Unicode text owner

Implements the native text/channel ownership portion of SPECIFICATION §2.7.
`TextSession` composes with [guarded ingress](CLIPBOARD_INGRESS.md) and the
[Unicode codec](CLIPBOARD_TEXT.md). Explicit schema-10 worker opt-in and private
typed Node selection now use it; public/browser clipboard selection remains open.

The constructing RDP thread exclusively binds one otherwise unowned public
`CliprdrClientContext`. Binding refuses existing callbacks/custom ownership,
missing client functions, asynchronous channels and an SDK message-thread
profile. `THREADING_FLAGS_DISABLE_THREADS` is required. Context and owner must
remain alive through callbacks; close must precede SDK context destruction.
No host clipboard API, filesystem path or default GUI client is used.

The immutable policy independently permits browser→server and server→browser
and bounds both converted input/output to 1..16 MiB. Only CF_UNICODETEXT 13 is
advertised/requested. ANSI/codepages, HTML, images and files are not claimed.
Monitor Ready sends intersected long-name capabilities without file/locking
features and an initially empty local list. One local advertisement awaits its
exact next format-list response; replacements are refused meanwhile. Local text
is served only after an OK response and only for format 13. Refusal clears local
text. Empty text remains a valid terminated Unicode value.

Remote lists advance a monotonic local offer revision and notify only scalar
availability. Reading requires an explicit current revision and nonzero local
request ID. Exactly one request can await the uncorrelated RDP response. A newer
offer leaves that request outstanding; its eventual response completes as stale
with no text. Fresh requests wait until it is consumed. Valid current responses
convert to UTF-8; the consumer borrows the bounded text only until callback return.
Peer refusal reports refused without fabricating text. Unsolicited/malformed
responses, uncertain writes, consumer errors and clock/response deadlines retire
ownership. Commands and consumer callbacks never automatically retry text.

Local-list ACK and remote-data waits each expire after five seconds; every
operation checks the monotonic clock and the caller also polls on the RDP loop.
A timeout permanently retires this owner because RDP carries no request ID with
which a late response could be safely reassigned. This object cannot rebind.
**The containing channel must be torn down before creating a replacement owner
after retirement; callback unbinding alone does not make the channel reusable.**
Control/media attachment revocation and a finite channel/connection retirement
barrier remain required before public activation. No transfer between browser
owners is implemented by this component.

Reentrant commands are refused. Reentrant close defers text clearing and callback
restoration until the current borrow returns. Foreign-thread commands cannot
change ownership. Close restores only owned server callbacks/custom state and
preserves the SDK client functions. Content is never included in result codes,
diagnostics or metrics. Buffers are cleared on consumption/retirement; total
process/core memory and SDK-internal copies remain separate acceptance work.

## Serialized worker handoff

`WorkerSession` composes this owner with the bounded private clipboard records.
It is selected only by explicit raw schema-10 `Connection` configuration.
Construction may occur on the IPC thread;
start/bind/pump/retire run on one RDP thread. Retirement destroys the inner public
callback owner there, before joining the thread or freeing the SDK context. The
wrapper can then be destroyed on the original thread. Clock callbacks must be
thread-safe, side-effect-free monotonic millisecond queries.

Producer admission uses a try-lock, only successfully published scalar authority,
immutable direction/size policy and one shared read/set reservation. Successful
admission moves one IPC payload; failures leave it with the caller for wiping.
Dispatch rechecks actual readiness/revision and a fixed 250 ms arrival deadline.
Expiry before dispatch returns timeout without issuing RDP work. Local set waits
for the actual peer format-list ACK; read waits for the requested response.

The read callback copies once into one prepared result. Busy output retains this
result and its correlation without another remote request. A changed offer turns
a waiting result into stale without text. Source state must reach the output
queue before new producer authority is granted. State and result backpressure
share a fixed one-second publication deadline which traffic does not extend.
Transport callbacks run outside the producer mutex. Exceptions, clock regression,
native timeout or publication expiry retire authority and clear owned text.
Reentrant retirement waits until the output borrow returns.

Retirement does not invent an unobserved remote completion: the containing worker
lifecycle must reject pending private calls when the RDP connection ends. The
wrapper cannot restart or move a live callback owner to another thread. No public
control/media transfer, browser clipboard API or automatic OS clipboard access is
introduced. Linked fake-SVC evidence is distinct from actual remote acceptance.
