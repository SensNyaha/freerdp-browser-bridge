# Iteration 141 — unissued microphone codec preparation

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after public
Opus transport `e39b1eb`. The existing browser sender reserves one preparation /
issued-input operation and one latest unencoded PCM block. Optional bounded
provider preparation copies before return, validates Opus completion correlation
and distinguishes unissued cancellation from actual network ACK ownership.

Freshness expires across preparation at 120 ms. Epoch/revoke/expiry clears only
unissued work; actual issued old-epoch correlation survives until its real ACK.
Definite no-write discards prepared prediction and forces latest discontinuity;
uncertain send, early/synchronous/malformed/duplicate completion or asynchronous
cancellation fails closed. The sender owns no provider/device/socket/timer.
The host must close all provider resources on revoke, even after issued output.

Focused portable sender/media/graph/preparation checks pass **28/28**, including
seven new preparation cases. Real Edge/Worklet and loopback-WS/fake-RDP PCM
regression passes **4/4** with synthetic input and finite graph/track retirement.
No physical getUserMedia, selected Opus encoding, ready AUDIN/recording or LAN
acceptance is claimed. Fixture asset maps include the shared bounded Opus parser.

Full `pnpm check` passes **462/462** on pinned Node 24. CTest bundled **17/17**
and foundation **6/6**, formatting and diff checks pass. Opus provider/sender /
permission/graph/client/viewer composition and actual device/platform/resource /
failure injection/soak gates remain open. [Contract](MICROPHONE_PREPARATION.md).
