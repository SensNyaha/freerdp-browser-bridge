# RDP-owner microphone session

Current update — iteration 107: the owner selects the bounded callback profile
and exposes an authority/epoch-checked deadline for future worker polling.
[Profile contract](AUDIO_AUDIN_PROFILE.md).

Iteration 106 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7. MicrophoneSession owns the virtual source, guarded AUDIN
plugin/listener/provider, scheduled PCM callback and latest input-status
publication on one constructing RDP thread. It does not change worker settings,
load a physical capture backend, emit public status or advertise a capability.

Pump uses a monotonic microsecond clock and a nonblocking status callback. Only
transport-admitted ready metadata matching the actual open source epoch permits
sample admission and scheduled capture. Backpressure preserves old authority;
the source can be ready before input is admissible. Reset preserves the native
receiver, wipes old samples and advances the source epoch. Old packets become
stale and fresh packets remain unavailable until replacement metadata is admitted.
Accepted means a copy into the bounded source queue, not remote consumption.

Only the RDP owner may pump, submit, reset, retire or read snapshots. Nested calls
cannot mutate a borrowed publication; nested submission is busy. Foreign calls
refuse without reading live source metadata. Regressing time or insufficient u64
deadline room is invalid without changing the channel. An uncertain publication
exception stops capture and disables authority; the status is never replayed.

Retirement immediately closes capture even below another provider scope. Each
owner call retries native provider/listener release once, retaining failed
ownership. Provider scopes must still retire in reverse binding order. Closed
metadata can remain pending independently of already released native resources.
The fixed 20 ms..1 s retirement window expires at its exact deadline; done, failed
and expired outcomes are terminal. Expiry is an outer worker cleanup fault, not
permission to destroy live delegated handles. Preserve the session wrapper
through final context/host Terminated callbacks after successful owner retirement.

Tests use the actual linked AUDIN addin with fake DVC transport and synthetic PCM.
They cover admission/reset/cadence, failed-listener retry, closed-status expiry
after successful native release, uncertain publication, provider composition,
foreign/reentrant/clock refusal and delayed host termination. Live-handle expiry
and real transport shutdown are not established by the closed-status fixture.

The class does not own the private IPC handoff or a mutex. Future Connection
integration must serialize producer admission with status publication/snapshot
updates, wake the RDP owner, drain correlated results and enforce finite cleanup.
Production callback/CPU profile, earlier core lost-write/allocation limits,
worker activation, browser permission/capture/resampling/Opus input and actual
microphone/platform/LAN acceptance remain open.
