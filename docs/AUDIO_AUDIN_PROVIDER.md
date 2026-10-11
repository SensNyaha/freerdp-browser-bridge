# Scoped virtual microphone backend loading

Current update — iteration 100: an explicitly bound AudinRegistration now enables
the guarded pinned DVC entry, fixed internal arguments and controlled native /
listener retirement. The backend-only scope still refuses channel loading;
worker/public microphone remains disabled. [Current owner contract](AUDIO_AUDIN_PLUGIN.md).

Iteration 97 targets SPECIFICATION §2.6 / ARCHITECTURE §5 / MEDIA_PIPELINE §7
through pinned public FREERDP_AUDIN_DEVICE_ENTRY_POINTS. It builds on
[the device ABI adapter](AUDIO_AUDIN_ADAPTER.md). This scope is preparatory;
worker/public microphone support stays disabled.

AudinProvider binds one source/context on its serialized owner thread with
synchronous dynamic channels and no async channel/update mode. It joins the
existing fixed eight-record AddinScope chain and preserves other channels'
previous provider. RDPSND/AUDIN scopes compose in either order; an outer close
cannot retire resources underneath an attached child.

The only backend entry admitted is audin/browser, no type, flags zero, the exact
bound context and fixed internal arguments {audin, sys:browser}. Missing/wrong
fields are refused before registrar dispatch. Registration is attempted once;
even a failed/throwing registrar may have transferred ownership, so it is never
retried. Reentrant registration/provider close and foreign-thread calls fail.
Retirement wipes capture resources before restoring the previous provider;
the context and source ABI wrapper remain alive until delayed host termination.

All AUDIN backend selectors other than this exact entry return a non-null typed
refusal, preventing dynamic-library fallback to a host microphone. Top-level
AUDIN dynamic/static/legacy channel entries also return typed refusal until a
bounded DVC gate is available. This is a scoped AUDIN policy, not a general
dynamic-library policy for other channels. Cached entries recheck owner/context /
lifetime state before handoff.

Actual linked-channel fixtures deliberately obtain the pinned static AUDIN DVC
entry directly, with fixed browser arguments, while its backend loads through
this provider. Only DVC transport is fake. They verify Version/Formats/Open,
exact stereo PCM payload, mono projection, fresh capture epoch on Format Change,
stale input refusal, checked write failure, failed RegisterPlugin cleanup and
owner retirement before delayed foreign-thread callback/plugin termination.
Provider fixtures additionally cover malformed selectors/entry points, uncertain
registrar failure, reentrancy and reverse-order RDPSND composition. These are not
guarded production DVC or hardware/browser/remote microphone acceptance.

Remaining work includes pre-parser format/record limits, supported-only offer
filtering (pinned AUDIN also accepts DSP formats), guarded listener/plugin /
transport lifetime and detach/close readiness, finite scheduling/IPC/control,
browser permission/capture/resampling and real audible microphone/LAN acceptance.
Earlier core drdynvc reassembly/decompression and DSP allocations remain audited
gaps; device/backend bounds do not establish their limits. No wire contract or
advertised microphone capability changes in this iteration.

Protocol review uses Microsoft's [Open PDU definition](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpeai/97db7244-249b-4a79-ad50-7e45e2f760a0):
capture-format preference follows the initial format index; the fixture includes
its full descriptor even though pinned audin_process_open reads only the first
eight body bytes. Future ingress validation must inspect the complete record.
