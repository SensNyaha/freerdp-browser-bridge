# Preparatory microphone session attachment ownership

Iteration 116 connects [exclusive capture ownership](MICROPHONE_OWNERSHIP.md)
to the SessionManager for SPECIFICATION §2.6 / ARCHITECTURE §2/5 /
MEDIA_PIPELINE §7. No WebSocket command or browser permission/capture is enabled.
Normal NativeSessionWorker creation still refuses non-off microphone before
process startup. Its typed forwarding methods prepare the backend boundary;
the new manager path is exercised with explicit fake backends only.

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
