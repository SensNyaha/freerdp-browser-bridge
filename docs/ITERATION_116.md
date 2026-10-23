# Iteration 116 — microphone session attachment ownership

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §2/5 /
MEDIA_PIPELINE §7 after isolated owner `47c80f7` and XRDP inventory `7c397ed`.

SessionWorker has typed source/submission/reset methods. SessionManager validates
selected source progression, exposes copied metadata to the current media lease
and binds one explicit input grant to both control and media attachments.
Either detach revokes immediately; repeated stop joins retirement and a new
grant waits for observed native epoch cleanup. Session cleanup joins pending
sample drain under the existing host deadline. Invalid backend/source state
fails with sanitized codes. Native forwarding prepares the boundary while
normal native non-off input selection remains refused before spawning.

Seven new fake-manager cases pass. The focused manager/ownership/ingress/private
process run passes **46/46**. Fake-manager data does not establish FreeRDP,
browser permission, socket capture or remote/physical microphone acceptance.
Existing actual-native refusal/private IPC fixtures remain distinct.
Full bundled `pnpm check` passes **329/329**, without skips. Unchanged bundled
CTest passes **17/17**, foundation **6/6**. Formatting and diff checks pass.

Public socket/status/ACK, permission/capture/resampling/Opus input, actual ready
source/remote/physical/LAN/platform and upstream core/lost-write gates remain
open. [Contract](MICROPHONE_SESSION.md).
