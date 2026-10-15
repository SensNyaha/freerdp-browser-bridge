# Controller clipboard ownership

Implements the private session/controller portion of SPECIFICATION §2.7, using
the [typed native API and revoke barrier](CLIPBOARD_IPC.md). This is prepared
manager/native-adapter plumbing. Public WebSocket commands, browser activation
and actual remote/application ownership acceptance remain open. The production
`NativeSessionWorker` still refuses non-off clipboard before worker startup.

Selection requires an explicit direction mode, text enabled, no unsupported
HTML/images/files and a finite item maximum (default 1 MiB, range 1..16 MiB).
Missing backend read/write/revoke/source hooks refuse before backend start.
Omitted/off selection requires none of these hooks. Current control attachment
methods are `clipboardSnapshot`, `onClipboard`, `startClipboard`, `stopClipboard`,
`readClipboardText` and `writeClipboardText`; a media or stale control lease
cannot call them. No public wire grammar or larger control body is added here.
The factory can now receive a frozen nonsecret item-size reservation and pass it
to `NativeSessionWorker`; [chunk/reservation scope](CLIPBOARD_CHUNKS.md) documents
its finite IPC budget. This reservation alone does not enable public selection.

`ClipboardOwnership` keeps one opaque grant, one optional in-flight operation,
scalar source state and one retirement promise. It keeps no content queue or
clipboard history. Acquisition requires ready scalar state without a previous
local accepted/pending offer. Every operation rechecks the current lease,
connected state, immutable policy/generation and current remote revision.
Source snapshots copy known scalar fields only; unexpected backend fields cannot
be retained or exposed as clipboard metadata. Ready-source loss, generation /
policy changes or backwards revision cannot resurrect authority.

Read and write share one flight; concurrent attempts return busy without backend
dispatch. Unicode/item validation precedes write submission. The trusted backend
must copy borrowed write text before returning, as `WorkerProcess` does, and own
a finite per-operation deadline (seven seconds for the native API). Caller write
buffers remain caller-owned. Accepted read buffers transfer to the caller only
after current source/lease checks; stale, malformed or late content is wiped.
The session lease rechecks authority again after awaiting the grant. Consumers
own accepted read buffers and must clear them after use; content never appears
in scalar status, session snapshots, errors, metrics or manager events.

Stop, control detach or subscriber loss revokes JS authority synchronously.
Replacement acquisition waits for the existing native operation to drain. If
this owner attempted any local write, including an uncertain/refused write,
retirement issues one native revoke and requires accepted completion plus a
current ready source with local accepted/pending both false. Empty text is not
used as a substitute. Read-only use needs no remote mutation. Retirement never
retries or starts a read, and has one nonrenewing 15-second ceiling covering
drain and revoke. Timeout, refusal, lost source or backend fault permanently
fails this owner and asks the host to terminate the session once; a hanging or
throwing termination callback cannot grant a replacement.

The manager binds the grant to the exact control attachment symbol. A new
controller may use other supported session functions while clipboard is retiring,
but cannot acquire the old clipboard grant. Removing an old subscriber cannot
remove a later registration. Callback failure retires clipboard authority;
malformed backend metadata or unsafe native retirement fails the session with
fixed `WORKER_INVALID_STATE` / `CLIPBOARD_FAILED`, without backend diagnostics.
Selected clipboard cannot continue through an unsupported connection reconnect.

Session shutdown revokes grants and joins ownership retirement alongside the
existing worker close/forced-termination lifecycle. Its global shutdown deadline
takes precedence; the native worker must be joined even if a faulty backend does
not settle a clipboard promise. Whole-connection disconnect is distinct from
successful remote no-format ACK. Upstream retained copies/CPU/RSS, actual remote
revoke and network-loss cleanup remain separate acceptance work.

Evidence distinguishes pure fake-backend ownership/manager fixtures, an actual
Node child/private-IPC synthetic peer, linked pinned-CLIPRDR simulated transport
and the single authorized XRDP offer/empty-text ACK from Iteration 232. The latter
does not establish remote data consumption or revoke, and is not repeated here.
