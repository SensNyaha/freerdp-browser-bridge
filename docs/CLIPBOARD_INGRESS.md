# Guarded CLIPRDR ingress

Prepares SPECIFICATION §2.7 and the parser/allocation requirements of SECURITY.
The worker does not yet select this channel path or advertise clipboard support.

`ClipboardIngress` stages the eight-byte CLIPRDR header in fixed storage before
allocating a fragmented body. The complete outer length must match `dataLen`.
Data responses have an explicit 1..16 MiB item cap; format/capability controls
have a separate 64 KiB cap. Unsupported file/lock/temp-directory records are
refused. A whole message is borrowed without staging allocation. Fragmented
messages own one bounded vector, at most 4,096 fragments and a fixed two-second
deadline (configurable to at most five seconds). Neither traffic nor notification
resets that deadline. Completion, rejection and retirement clear/free storage.
Reentrant retirement preserves a borrowed span until the delegate returns.

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
guard through delegated callbacks. There is no worker installation yet.

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
