# Public CLIPRDR Unicode text owner

Implements the native text/channel ownership portion of SPECIFICATION §2.7.
`TextSession` composes with [guarded ingress](CLIPBOARD_INGRESS.md) and the
[Unicode codec](CLIPBOARD_TEXT.md). It remains unselected by the worker; there
is no public/browser clipboard capability yet.

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
