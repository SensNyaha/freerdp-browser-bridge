# Scoped AUDIN plugin and listener ownership

Iteration 100 implements the pinned static AUDIN plugin/listener owner for
SPECIFICATION §2.6 / ARCHITECTURE §5 / MEDIA_PIPELINE §7. With an explicitly bound
AudinRegistration, AudinProvider can select the guarded dynamic-channel entry.
Without it, channel loading stays refused. No worker activation, wire change,
browser capture or advertised microphone capability is added.

The registration belongs to one constructing RDP owner/context/source. Native
entry points are borrowed only through install; their GetPluginData always
returns fixed internal {audin, sys:browser}, never host/user arguments. Host
context/settings and existing plugin checks run under a reentrancy guard. The
actual pinned entry constructs its native plugin/device behind intercepted
RegisterPlugin, then the owner hands one wrapper to the host. Initial plugin
construction uses pinned cleanup-on-failure semantics. An uncertain host
registration error/exception consumes the attempt and retires native resources;
the wrapper remains available for any eventual host callback.

Initialize runs once. Wrapped manager/listener APIs validate the exact AUDIO_INPUT
endpoint and retain a partial host listener even if creation fails. An internal
fallback keeps upstream's returned listener pointer valid during error cleanup.
The host receives the wrapped listener; accepted channels always enter
[AudinDvcGate](AUDIO_AUDIN_DVC.md), so input limits/reply completion and PCM pairs
are checked on the full public loader path rather than by a fixture-only filter.
Only one channel lifetime is admitted.

Detached/disconnect close capture and the delegated channel callback before
forwarding the native notification. Attached cannot silently restart capture on
the retired channel: same-plugin DVC reopen/resume remains unimplemented. Native
source readiness stays false until a future supported channel lifecycle. Owner /
foreign/reentrant checks prevent notifications or termination during active
receive/write/pump, preserving borrowed callback bytes.

Retire closes the gate, ends the native plugin and its device on the RDP thread,
then clears delegated listener/context references. The wrapper survives until
the host's delayed Terminated, which reads only cached cleanup after atomic
publication. Source and context wrappers must outlive that host callback; there
is no concurrent context destruction contract.

DestroyListener status/exception is recorded even though pinned AUDIN ignores
the return. A failed host handle remains owned, disables new connection dispatch
and prevents provider detachment. Each subsequent owner close retries it once.
After successful release, retirement is published and the provider chain can
detach. If the host never recovers, the caller must enforce a finite worker
cleanup deadline; that integration is still pending. The owner must not destroy
a bound/unfinished wrapper. This is bounded handle retention, not proven cleanup
on every real host failure.

Actual linked AUDIN/fake-DVC fixtures cover fixed backend arguments despite host
sys:winmm data, full guarded Open/PCM, partial listener creation, uncertain host
registration, repeated/throwing DestroyListener with one retry per call, stale
listener refusal after native termination, Detached/disconnect, reentrant and
foreign callbacks, delayed host cleanup and guarded RDPSND composition in both
binding orders. They use synthetic PCM/silence; they establish the public native
ownership path, not host/browser/remote microphone or LAN acceptance.

Cadence/resource scheduling, same-plugin reopening, earlier core/DSP and real
transport lost-write limits, finite worker teardown, private IPC/control/browser
permission/capture/resampling/Opus input and platform/remote acceptance remain
open. Microphone modes continue to fail explicitly at the worker boundary.
