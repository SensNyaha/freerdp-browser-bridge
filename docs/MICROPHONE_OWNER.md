# Browser microphone startup and capture ownership

Iteration 126 implements production startup orchestration for SPECIFICATION
§2.6 / MEDIA_PIPELINE §7. The owner composes permission, graph and negotiated
media client. It is not yet selected by the reference viewer/native backend.

`MicrophoneOwner.start()` requires current controller ownership, ready source,
no inherited server grant and transient browser activation before creating an
AudioContext or requesting a device. The gesture creates/resumes one 48 kHz
context before the sole getUserMedia call. Only after permission and running
context does the activation scope request the server grant, acquire its local
sender token and initialize the Worklet graph. No device is automatically
acquired on metadata, import, construction or connection.

Denial, cancellation, timeout and source/controller loss close the prepared
context even if no graph/scope was constructed. Late permission tracks remain
owned by the permission layer and are stopped instead of activated. One
prepared context and the existing unresolved permission/activation guards
prevent overlapping prompts/resources. Cancellation reserves cleanup before
callbacks, so a context returned by a reentrant factory is closed as well.

An owned 20 ms poll covers authority changes while permission is still pending.
After activation, graph/media polls continue their separate port/network
deadlines. Track ownership remains with the permission owner. Stop synchronously
stops tracks before joining graph/context, server retirement, resume and
activation completion. Incomplete resume/initialization cannot accumulate behind
new starts: finite cleanup failure latches failed admission.

Permission/start deadline defaults to 30 s; prepared cleanup is 4.5 s, graph
cleanup 4.5 s and outer permission-scope retirement 5 s. Copied trusted-host test
overrides allow permission 20..30,000 and cleanup 20..4,500 ms, with the outer
500 ms margin. Denial is a recoverable false result; resource/initialization or
cleanup failure stops the owner and reports only fixed diagnostics. Close is
permanent. Duplicate stops share underlying cleanup and do not create another
server request. A stop with no owned resources emits no fresh notification,
preventing recursive observer-stop cycles.

The enclosing media host forwards scalar source/controller changes to changed(),
owns the socket and continues media ACK handling through stop. Backend controller
must describe the actual control attachment; changed updates local UI and failed
owns its feature/socket policy. The owner receives no credentials or device IDs.

Seven pure cases and three actual Edge/WebSocket/fake RDP cases pass. Edge uses
this production owner with injected synthetic stream/context factories and
replaced getUserMedia: successful capture/stop, held worker API completion during
controller loss, and denied permission without server grant/samples/reset. These
are not physical capture, OS permission dialog or native RWI1/AUDIN acceptance.

Reference-viewer/native activation, actual hardware/device loss, negotiated RDP
microphone, LAN/soak/platform, native resampling, Opus input and upstream limits
remain open.
