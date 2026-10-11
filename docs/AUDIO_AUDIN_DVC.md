# Guarded AUDIN public DVC callback

Iteration 99 implements AudinDvcGate for SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7. The gate owns one delegated channel callback behind public
IWTSListenerCallback/IWTSVirtualChannelCallback/IWTSVirtualChannel wrappers and
places [bounded ingress](AUDIO_AUDIN_INGRESS.md) before the pinned AUDIN parser.
It is not yet selected by a plugin/listener owner or worker; general provider
channel loading remains refused and microphone capability remains disabled.

Open requires one serialized source/context owner, synchronous DVC and no async
channel/update mode. An accepted channel has one lifetime and cannot reopen on
the same gate, so old callbacks cannot target a later generation. The owner
retains the wrapper through delayed host callbacks and retires it before plugin
termination/thread join. Endpoint Close is explicitly unsupported: channel /
transport lifetime belongs to the host and guarded owner, not the device.

Every incoming PDU passes the bounded validator before delegated parsing. Pending
reply state exists only during synchronous dispatch; packet spans are released
on return. Outgoing Version, Incoming/Formats, Format Change and Open Reply must
match the expected order, selected indices/table and exact sizes. Success is
recorded only after the checked transport Write returns. No-common-format sends
a bounded Incoming plus zero-count Formats reply without entering the upstream
zero-count parser, leaves capture closed and exposes unsupported phase.

Recording readiness requires all Open/Format Change replies and a freshly opened
source epoch. The owner calls gate.pump at the negotiated cadence; the gate adds
no timer/thread/wait/catch-up queue. Each pump must emit exactly one Incoming /
Data pair with the negotiated PCM size, at most 19,201 bytes including its header.
Frames include bounded silence/prebuffer/underflow from the capture source.
Partial/failed/throwing writes stop source capture without sample retry. A receiver
returning success without its expected data pair also fails: this catches pinned
AUDIN's detached-success behavior rather than treating it as delivery.

Malformed ingress stops capture and puts the gate in failed phase. Quiescence
checks refuse close/retire/reentry during active callbacks or pumping; they cannot
free borrowed source bytes or the active delegated callback. Close consumes the
pinned callback's OnClose once, wipes capture/metadata and releases transport
ownership. Retire runs on the owner and publishes only cached no-op cleanup for
later foreign-thread OnClose. This is serialized lifetime ownership, not support
for concurrent context destruction.

Actual pinned AUDIN/fake-DVC fixtures verify Open/write completion, stereo/mono
payloads and source epochs, no-common-format, malformed preferences/indices,
failed first/second data and Open writes, exceptions, detached success, reentrant
close, foreign calls, no channel reuse and delayed host cleanup. Synthetic PCM
is used; no browser/host/remote microphone capture is involved.

The current gate checks success reported at the public Write surface; it cannot
prove delivery if earlier drdynvc maps a lost transport write to success. Earlier
core allocation/decompression and DSP limits remain open. Next work is the scoped
plugin/listener owner, orderly Detached/disconnect/termination integration and
provider selection. Same-plugin DVC reopening, cadence/resource scheduling,
worker/IPC/control/browser permission/capture/Opus input and actual microphone /
LAN/platform acceptance remain retained requirements. No wire or capability
change is claimed by this callback-only foundation.
