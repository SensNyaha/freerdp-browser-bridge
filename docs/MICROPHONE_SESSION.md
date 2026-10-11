# Preparatory microphone session attachment ownership

Current update — iteration 128: NativeSessionWorker accepts explicit PCM input
after HELLO confirms PCM dispatch and microphoneReset. The reference viewer
selects its complete gesture/permission/grant/graph path. Actual restored XRDP
passes native/API/Edge H.264 and metadata replay, but the source is waiting at
epoch 0; no capture was requested or PCM sent. Ready AUDIN/device/remote/LAN
acceptance remains open. [Evidence](ITERATION_128.md).

Current update — iteration 119: optional media.hello selection now calls these
typed methods through a bounded WebSocket adapter, with actual loopback/fake-RDP
transport evidence. Native selection and browser permission/capture stay gated.
[Current socket contract](MICROPHONE_SOCKET.md). Earlier no-routing statements
below describe iteration 116.

Iteration 116 connects [exclusive capture ownership](MICROPHONE_OWNERSHIP.md)
to the SessionManager for SPECIFICATION §2.6 / ARCHITECTURE §2/5 /
MEDIA_PIPELINE §7. No WebSocket command or browser permission/capture is enabled.
Normal NativeSessionWorker creation still refuses non-off microphone before
process startup. Its typed forwarding methods prepare the backend boundary;
the new manager path is exercised with explicit fake backends only.

Current update — iteration 117: the media lease additionally exposes copied
`microphoneSnapshot` (`state`, `granted`, `retiring`), `microphoneFailed` and one
future-only `onMicrophone` subscription. `granted` describes server admission
ownership, never physical capture or browser permission. Consumers obtain
initial replay from the getter; no sample/notification history is retained.

Source progress, grant start, immediate revoke and retirement completion deliver
immutable copied scalar snapshots to the current subscriber. Controller loss
delivers granted=false synchronously before native reset starts. Retirement
remains visible until fresh authority completes the barrier. Reentrant release
during start prevents a successful start reply. Media detach and cleanup remove
the subscriber; stale unregister/release cannot affect a replacement.

Unregistering the current subscriber or a callback exception revokes its grant
and initiates retirement. A throwing receiver is marked failed for that lease
and cannot resubscribe/start/send. A fresh media attachment can recover only
after proven native retirement. If the source is no longer ready at the attempted
epoch and no newer authority proves cleanup, retirement fails the session;
receiver isolation does not waive the privacy barrier. Fixed errors do not
disclose callback diagnostics. Session lifecycle close remains the host's
separate signal for stopping a physical capture owner.

SessionWorker optionally supplies source callbacks, PCM submission and input
reset. Explicit PCM selection requires all three functions before startup;
Opus input remains unsupported. Unselected/disabled, malformed, replayed or
regressed source metadata fails the session with WORKER_INVALID_STATE. Ready
metadata requires connected state. Waiting metadata may precede connection.
The manager retains one scalar source snapshot and one retirement listener.

Only the current media attachment can read a copied `microphone` snapshot,
call `startMicrophone`, `stopMicrophone` or `sendMicrophone`. Start requires a
connected session and current control attachment and binds the exclusive grant
to both opaque attachment identities. A second start or an unfinished retirement
returns false. This method is a library admission operation, not proof of browser
permission: future socket/harness callers must obtain explicit permission first.

Loss of either attachment removes the grant synchronously and starts the one
drain/reset/new-epoch barrier. A replacement cannot acquire while that barrier
is pending. An old release cannot revoke a replacement. Explicit stop joins the
same retirement promise; a scheduled reset reply alone does not complete stop.
Waiting at a fresh epoch permits clean ownership transfer but never PCM admission
until ready. Malformed records are mapped to a fixed MEDIA_FAILED error and
never copied to the worker. Backend admission faults fail the session with a
sanitized WORKER_FAILED. Samples are not retried or retained as history.

Session cleanup revokes capture before asynchronous backend close, removes source
metadata/listeners and joins capture drain within the existing shutdown deadline.
Failure requests normal manager cleanup/forced termination; process capacity
ownership and trusted-backend timeout limitations are unchanged. A closing or
terminal session cannot send or start capture. No new packet queue, source timer,
JSON status event, socket selector or permission prompt is introduced.

Seven explicit fake-manager cases cover backend selection, metadata copies,
control/media binding, both detach races, late ACK suppression, fresh-epoch
restart, waiting readiness, malformed progress, sanitized backend faults and
cleanup drain. Private IPC, real-native TLS and restored XRDP idle inventory
remain separate evidence. Public socket/status/ACK, permission/capture/resampling/
Opus input and actual remote/physical/LAN/platform/core-limit gates remain open.
