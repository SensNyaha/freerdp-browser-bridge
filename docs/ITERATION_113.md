# Iteration 113 — bounded microphone admission

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 /
ADR-008 after wire foundation `123d8e3`.

The isolated Node owner copies validated captured PCM into one fixed slot,
consumes valid sequences without retry, enforces first discontinuity/continuity,
and rechecks current grant and native source authority after completion.
Revocation is permanent and drains the operation before wiping the slot.
Native reset remains a separate mandatory host barrier before ownership transfer.
No public socket, device capture or permission activation is introduced.

Seven portable cases and one synthetic-process integration case were added.
The focused run passes **19/19**. The process fixture demonstrates public record
projection into private PCM, old-owner drain, native epoch reset and fresh-owner
admission; it is an explicit Node IPC peer, not actual RDP or microphone capture.
Real-native TLS refusal/cleanup remains a separate integration fixture.
Unchanged bundled CTest passes **17/17**, foundation **6/6**.
Full bundled `pnpm check` passes **314/314**, without skips. The first full run
passed 313/314 with one BUILD_FEATURE_REPORT_UNAVAILABLE during API-server
construction; the separate API retry passed **8/8**, and the subsequent full
run passed 314/314. The transient probe failure's cause is not established.
Formatting and diff checks pass; native implementation is unchanged.

Public finite retirement/lease/reset/ACK, permission/capture/resampling/Opus input,
actual remote/physical/LAN/platform and upstream core/lost-write limits remain
open. [Admission contract](MICROPHONE_INGRESS.md).
