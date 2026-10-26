# Public CLIPRDR Unicode text owner

The original text-only owner checkpoint below retains its implementation scope.
Named actual Unicode/browser profiles are accepted separately in
[browser clipboard](CLIPBOARD_BROWSER.md). The additional HTML owner in
`feature/html-clipboard` is described at the end of this document. Its
[private worker/Node handoff](CLIPBOARD_IPC.md#private-worker-html-negotiation-and-handoff-in-development)
is now implemented; public ownership/control/browser HTML integration remains pending.

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
immutable direction/size policy and one shared read/set/revoke reservation. Successful
admission moves one IPC payload; failures leave it with the caller for wiping.
Dispatch rechecks actual readiness/revision and a fixed 250 ms arrival deadline.
Expiry before dispatch returns timeout without issuing RDP work. Local set waits
for the actual peer format-list ACK; read waits for the requested response.
Revoke wipes the local value and sends no formats through the checked public
channel path described in [the private contract](CLIPBOARD_IPC.md#native-offer-revocation-iteration-233).
It waits for that list's ACK; empty Unicode set remains a distinct operation.
The old local ACK must be drained before revocation. This primitive alone does
not transfer controller ownership.

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

## HTML and Unicode share one native owner

The in-development `TextSession` extension implements the native owner portion
of SPECIFICATION §2.7. It keeps one public `CliprdrClientContext` callback owner,
the same RDP thread, direction policy, monotonic clock and retirement barrier.
`TextPolicy.html` defaults to false. A receive-enabled HTML policy requires a
complete HTML reply callback at construction; partial setup is refused. No new
public worker capability or HTML selection is enabled by this component alone.

Remote HTML is selected by the registered name `HTML Format`, with bounded
ASCII case-insensitive matching consistent with
[Windows registration](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerclipboardformatw).
The numerical ID comes from each remote format list; it is never copied from
this host's local ID or constrained to the Windows registered-ID range when
talking to another OS. MS-RDPECLIP requires requests to use the
[ID in the peer's list](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpeclip/b4c6e5c8-27dd-4d07-b15f-d7e40302a870).
Zero, CF_UNICODETEXT 13, duplicate HTML names and another format sharing the HTML
ID are refused as ambiguous. Each new list replaces both availability flags
and the HTML mapping together, under one revision.

`request` and `request_html` share the single outstanding RDP response slot.
A new list leaves the old flight outstanding; its eventual response completes
as stale without exposing or parsing old contents. Unknown, disabled or stale
formats cannot issue a remote request. Current successful HTML responses pass
the allocation-free [CF_HTML codec](CLIPBOARD_TEXT.md#html-codec-in-development).
`HtmlView` borrows only the UTF-8 body with relative fragment/selection offsets,
including the optional context flag. CF_HTML headers, `SourceURL`, NUL and zero
padding are excluded. The consumer must copy before callback return; it must
not insert untrusted markup into a live DOM. Context and the selected fragment
remain distinct for later table/list handling. The legacy offer callback still
reports Unicode availability; the RDP loop obtains HTML availability from the
scalar snapshot after callbacks return.

`set_local_html(fragment, optionalText)` replaces one item atomically. It advertises
HTML first using the bridge-local named ID 0xC001, followed by CF_UNICODETEXT only
when a fallback is present. Empty text remains distinct from no text. Both the
original aggregate UTF-8 size and the sum of the complete encoded CF_HTML and
terminated UTF-16 representations must fit the same configured maximum before
either buffer is allocated. Invalid replacement leaves the preceding accepted
item usable. No format is served until the one format-list ACK succeeds. ACK
refusal wipes both buffers. Unicode-only replacement removes old HTML, and
no-format revoke wipes both before sending the existing checked empty-list PDU.
The peer ACK barrier applies to the entire item.

Callbacks borrow buffers only until return. Reentrant close defers wiping until
the SDK borrow ends, while reentrant commands are refused. Consumer faults,
malformed current HTML, uncertain writes and deadlines retire both formats.
A structurally valid response above the ingress quota is drained as a refusal
without poisoning the channel. Incoming headers/content never enter diagnostics.

The linked tests use the pinned real FreeRDP CLIPRDR parser and SDK callbacks
with synthetic SVC packets, not a remote RDP server or an OS clipboard. They
exercise short/long format names, different 32-bit peer IDs, combined and absent/
empty fallbacks, rich Unicode context/selection, ACK/revoke, stale cross-format
responses, ambiguity, quota, timeout, callback failure, foreign-thread refusal
and borrowed local data during close. Actual browser/remote rich-application
acceptance, worker handoff and versioned IPC/control negotiation remain required
before the HTML TODO item or a 0.4.0 release can be accepted.

The native owner checkpoint `5de031a` passes MSVC `/WX` + `/analyze` linked CTest 39/39,
exact GCC 8.3 linked CTest 40/40, and GNU 13.3 ASan/UBSan owner/worker suites 2/2
without suppressions. The latter instruments bridge code and reuses the pinned
SDK; it does not claim that all SDK dependencies were sanitizer-built. Complete
Windows linked `pnpm check` passes 1051 tests, 71 explicit skips, zero failures.
The final native checks include the aggregate UTF-8 guard and volatile buffer
wipes added during the preceding Node run; public HTML selection remains off.

The aggregate-quota counterexample removes only its new admission guard from
the disposable Linux source: a 1150-byte UTF-8 item whose two RDP forms total
1022 bytes incorrectly succeeds under a 1024-byte policy. The new assertion
fails with Catch2 exit 42 and actual `0 == 13`; restoring the guard passes.
Initial controller checks expecting exit 1/an unexpanded WinPR macro and the
initial MSVC signedness warning in test expectations are retained in local logs.
Hash-bound evidence is `build/current-validation/html-session-acceptance.json`.
