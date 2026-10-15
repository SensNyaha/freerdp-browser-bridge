# Guarded CLIPRDR ingress

Prepares SPECIFICATION §2.7 and the parser/allocation requirements of SECURITY.
The worker selects this path only through explicit schema-10 opt-in, now exposed
by capability-gated private `WorkerProcess` (Iteration 232). Public/browser
selection is not yet enabled.

`ClipboardIngress` stages the eight-byte CLIPRDR header in fixed storage before
allocating a fragmented body. The complete outer length must match `dataLen`.
Data responses have an absolute 16 MiB wire cap and a configured 1..16 MiB item
quota; format/capability controls have a separate 64 KiB cap. Unsupported file/lock/temp-directory records are
refused. A whole message is borrowed without staging allocation. Fragmented
messages own one bounded vector, at most 16,384 fragments and a fixed two-second
deadline (configurable to at most five seconds). Neither traffic nor notification
resets that deadline. Completion, rejection and retirement clear/free storage.
Reentrant retirement preserves a borrowed span until the delegate returns.

A structurally valid successful data response above the configured item quota
is drained without allocating or copying its body. Only after exact complete
framing does the guard forward a fixed eight-byte failed data response, so the
pending text read completes as refused and the channel remains usable. The
allocation-free inspector marks this case `quota_refused`; callers must replace
the original response rather than forwarding it. Scalar counters expose quota
refusals and whether a drain is active, without contents. Malformed framing,
the absolute cap, fragment-count excess and the original deadline remain hard
faults. A partial discarded response never completes a read. The fragment budget
admits a full 16 MiB response in classic 1,600-byte fragments; this does not prove
that a slow network can transfer it within the configured deadline.

Allocation-free inspection precedes the pinned parser. Short names use fixed
36-byte records, including the bounded unterminated names emitted by mstsc/RDSH.
Long names require a terminator, at most 512 name bytes excluding NUL, at most
64 formats, and only zero trailing padding of up to three bytes. The pinned
client supports the fixed general capability set; repeated/unknown/mis-sized
sets and versions outside 1/2 are refused. Negotiated long-name state advances
only after successful forwarding. This is a bounded initial text-channel profile;
broader format compatibility remains required work rather than a claimed feature.

`ClipboardReceiveGuard` adapts public `ReceiveChannelData`. It resolves `cliprdr`,
retains its channel identity, validates framing/notification/metadata flags and
normalizes only inspected complete messages. Other channel arguments pass through.
The RDP owner must serialize and route callbacks, poll deadlines and retain the
guard through delegated callbacks. Connection installs/polls/retires it only for
the explicitly selected native profile.

The pinned CLIPRDR helper creates an internal message thread unless public setting
`FreeRDP_ThreadingFlags` includes `THREADING_FLAGS_DISABLE_THREADS`; setting
`SynchronousStaticChannels` alone is insufficient. Linked fixtures explicitly
select the synchronous profile. Production activation must enforce the same
condition before accepting callbacks. Earlier core transport/decompression
allocations and total RSS are not established by this guard.

Ingress verifies structural bounds, not format ownership or Unicode semantics of
a requested response. A text owner must enforce direction policy, outstanding
request/offer lifetime, Unicode conversion, finite completion and attachment loss
before public/browser activation. No record contents enter diagnostics or metrics.
