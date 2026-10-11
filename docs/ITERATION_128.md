# Iteration 128 — explicit native PCM microphone selection

Date: 2026-10-12. Implements SPECIFICATION §2.6 / ARCHITECTURE §2/5 /
MEDIA_PIPELINE §7 after reference viewer `1dc526a`.

NativeSessionWorker now accepts explicit PCM input only after HELLO confirms
both PCM dispatch and observed-epoch microphone reset support. Opus input still
refuses before process startup; peers missing either capability refuse before
private configuration/credentials/connect. No wire/settings contract changed.
Source/readiness, PCM and reset use the previously bounded private APIs; browser
permission/control/media ownership remains required for capture admission.

Focused **20/20** pass. Added legacy-adapter checks cover missing PCM/reset and
empty-runtime cleanup. Three actual NativeSessionWorker/SessionManager/TLS
fixtures (output off/PCM/Opus) reject the untrusted certificate with
RDP_CERTIFICATE_REJECTED, no TLS application bytes, closed input epoch 0 and
reclaimed directories. Existing fake/private/native checks remain separate.

The first full check passed **404/405**: held PCM/controller-loss exposed a
poll-order race. The graph observed ordinary authorization loss before the
startup owner and notified a fault, which incorrectly latched startup failure.
Forcing graph.poll immediately after control.close reproduced it deterministically.
The owner now treats loss of its current authority as cancellation, stops tracks
and joins the same cleanup. Actual graph/client/cleanup failures still latch
failure. Added pure cases and the forced Edge ordering pass; combined focused
set is **35/35**. No deadline was increased or acceptance assertion removed.

Corrected full `pnpm check`: **406/406** pass.
Native CTest: bundled **17/17**, foundation **6/6** pass. Native source/build
is unchanged in this block; the next isolated decoder is not linked here.

The restored authorized XRDP also passes the real NativeSessionWorker/API/Edge
H.264 viewer smoke and source replay: **52 frames, 1920×1080**, connected,
microphone enabled/waiting revision 1 / epoch 0, zero browser requests/offered/
sent PCM and no microphone graph/context. The existing guard sent only one
pointer motion and one input reset. Cursor replay, reattachment, graceful close
and empty runtime pass. Certificate trust used the previously approved exact
session fingerprint. `build/iteration-128-xrdp-viewer.log` is local evidence.
This is not ready AUDIN, physical capture or remote microphone acceptance.

The lab helper adds --microphone-manual (PCM input, output off),
--microphone-pcm-manual and --microphone-opus-manual (PCM input with indicated
output). Only the separate viewer button can request a local device, and only
after ready source metadata. Automated --microphone-test never presses that
button and replaces getUserMedia with a rejecting sentinel.

Ready AUDIN/remote application/device/LAN/platform/soak, native resampling,
Opus input and upstream resource limits remain open. No broader capability or
audio acceptance is claimed. [Viewer ownership](MICROPHONE_VIEWER.md).
