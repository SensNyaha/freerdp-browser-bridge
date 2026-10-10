# Pinned static RDPSND core/lifetime audit

Date: 2026-10-10. Authority: FreeRDP 3.32.1 commit
`bf217a504e54cc719880c228e82353382cd7d4fa`, as locked in
[dependencies.json](../native/dependencies.json). No source/pin change.
This narrow source audit does not establish full transport, sanitizer, resource
watchdog or audible audio acceptance.

## Incoming static channel placement

`libfreerdp/core/transport.c::transport_parse_pdu` reads the post-authentication
TPKT length as uint16 and checks its range before the transport read ensures
capacity for that packet. `core/channels.c::freerdp_channel_process` reads the
8-byte static-channel header, checks the actual fragment against the packet
length and forwards its pointer, fragment length, flags and advertised total.
`core/client.c::freerdp_channels_data` resolves the channel and directly invokes
the public open callback; it does not assemble an advertised multi-fragment
static-channel total before the bridge callback.

Thus the guarded static callback can check the advertised total before RDPSND's
own assembler uses it. This is narrower than a bound on all authentication,
gateway, codec, cryptographic and transport paths. Those earlier allocations and
actual hostile/lost-transport verification remain retained requirements. The
pinned static RDPSND channel requests initialized/encrypted options without static
channel compression; the bridge rejects unsupported raw compression flags.
Dynamic RDPSND remains refused. The existing 64 KiB/4,096-fragment, fixed format
table, supported PCM, whole-frame/100 ms and DSP policy guards remain necessary.

## Completion and final callback ownership

`core/client.c::FreeRDP_VirtualChannelCloseEx` marks the channel closed but retains
its open callback. When a queued write is processed for that closed handle,
`freerdp_channels_process_message` calls WRITE_CANCELLED. The completion helper
invokes the retained callback without requiring the open flag. The queue's free
callback also cancels records. The pinned RDPSND completion handler frees the
confirmation stream for both WRITE_COMPLETE and WRITE_CANCELLED.

The public `freerdp_channels_process_pending_messages` can return -1 after such
cancellation while ownership has actually drained. A retirement owner must record
that result and retry/check its provider ownership; it cannot equate drain error
with undelivered completion or replay the buffer. The helper drains the native
queue/registered callbacks; it is not an interruptible per-record deadline API.
It must be used after active RDP disconnect, when producers/transport writes stop,
and remain inside the worker's outer process supervision boundary.

`rdpsnd_virtual_channel_event_disconnected` closes the device/host handle and, on
success, frees the backend. Device Free can retire the sink before the guarded
provider's remaining confirmations finish. Source retirement and full channel
ownership are therefore separate states.

`core/freerdp.c::freerdp_disconnect` invokes `freerdp_channels_close`, which emits
the final host TERMINATED callback. `freerdp_context_free` only frees channel
storage; it does **not** synthesize TERMINATED. Call public disconnect even for
registered channels whose connection did not activate before freeing the context.
The wrapper must stay alive until that final callback. An unactivated registration
can retire its delegated resources first and receive final disconnect later;
after retirement the wrapper callback is an atomic no-op.

## Evidence and remaining acceptance

[Iteration 65](ITERATION_065.md) tests actual pinned public core channel registration,
public pending-message processing, retirement and public disconnect/context-free
on a later thread. It does not connect a socket or exchange actual core audio
fragments. Actual linked RDPSND with fake SVC covers cancelled confirmations,
close faults, missing-completion deadlines and publication failure recovery.
Real transport shutdown/cancellation, pre-authentication/core resource limits,
worker selection and audible remote/browser integration remain open.
