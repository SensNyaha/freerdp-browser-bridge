# Explicit browser microphone permission and track ownership

Iteration 122 implements the permission/track lifetime foundation for
SPECIFICATION §2.6 / MEDIA_PIPELINE §7. It is separate from capture/sender,
WebSocket negotiation and native public activation; the viewer does not yet
select it.

Iteration 123 adds the [capture graph scope](MICROPHONE_GRAPH.md), verified with
this owner in an actual Edge synthetic fixture. Public server-grant/WebSocket
and startup context ownership remain open.

`MicrophonePermission.start(epoch)` requires a valid nonzero u64 epoch, current
host eligibility and transient browser user activation before its sole
getUserMedia call. Defaults request audio only, with 48 kHz/stereo preferences
and echo cancellation/noise suppression/automatic gain preferences disabled.
Preferences are not a negotiated format guarantee. No device ID/path is accepted.
The returned stream must contain exactly one live audio track before the host
activation scope is constructed. Default browser APIs are never called merely
by importing or constructing this module.

The host backend supplies `eligible(epoch)` and `begin(stream, epoch)`. Begin
runs only after explicit permission and owns its graph/server-grant scope:
`{ready: Promise<boolean>, current(): boolean, close(): Promise<void>}`. Close
must synchronously revoke its admission before awaiting bounded cleanup and
cancel partial initialization; failures before returning a scope must clean up
their partial resources. The stream is borrowed while this owner retains track
ownership. This adapter alone does not implement that graph/server scope.

One attempt waits for permission/activation for at most 30 s (copied configurable
20..30,000 ms deadline). Stop, close, source/grant eligibility loss, track ended,
activation refusal or deadline resolve the attempt false, remove owned listeners
and stop tracks synchronously before asynchronous scope retirement. A late
permission stream is stopped without activating. Unresolved browser permission
or activation promises remain single-flight guards after cancellation: another
prompt/activation cannot accumulate behind them. The module cannot dismiss an
underlying browser permission dialog; late settlement is explicitly handled.

Retirement has one shared promise and a copied 20..5,000 ms deadline (3 s default).
Failure, exception, unknown completion or expiry latches a fault and prevents
another acquisition. Track/listener cleanup failures also latch a fault. Scope
callbacks cannot resurrect cancelled attempts, overlap prompts or retire a
replacement. Poll rechecks host authority; the enclosing owner must call it on
metadata/lease changes and while active. Close permanently prevents acquisition.
Errors expose no device details and statistics contain copied scalar counters.

Eight pure fake-API cases and one actual Edge fixture pass. Edge uses a replaced
getUserMedia returning a synthetic MediaStreamDestination track, observes real
userActivation expiry/click admission, stops a late track after cancellation and
checks grant-loss cleanup. It never calls the original getUserMedia or touches a
physical microphone. The synthetic destination contexts are fixture resources,
not production graph integration.

Capture/sender/port/context composition and wall-clock watchdog, server-grant
scope, viewer/native selection, physical permission/device loss, ready AUDIN,
remote microphone, Opus input, resampling/LAN/platform acceptance remain open.
