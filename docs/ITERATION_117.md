# Iteration 117 — microphone admission notifications

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §2/5 /
MEDIA_PIPELINE §7 after session ownership `5313726`.

The current media lease has one future-only immutable scalar status subscriber
and copied initial snapshot. Source/grant/retirement changes notify it; control
loss reports revocation synchronously before native reset dispatch. Subscriber
removal/fault revokes capture and requires the same native privacy barrier.
Reentrant/stale callbacks cannot remove or fault a replacement receiver.
`granted` means server admission, not browser permission or physical capture.

Four new fake-manager cases pass with the session suite **11/11**. They cover
immutable snapshots, immediate revoke, native retirement ordering, receiver
failure and reentrant replacement. Source uncertainty still fails the session;
a receiver fault permits recovery only after proven native retirement.
No RDP, physical/browser capture, public status/ACK/socket or microphone device
acceptance is claimed. Full bundled `pnpm check` passes **333/333**, without
skips. Unchanged bundled CTest passes **17/17**, foundation **6/6**. Formatting
and diff checks pass.

Public routing, permission/capture/resampling/Opus input, real ready-source reset,
remote/physical/LAN/platform and upstream core/lost-write gates remain open.
[Current contract](MICROPHONE_SESSION.md).
