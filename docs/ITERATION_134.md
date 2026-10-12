# Iteration 134 — bounded private Opus microphone envelope/configuration

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after selected
handoff `2644f62`. RWI1 kind 44 accepts only 26..1,299-byte correlated input;
CONFIGURE schema 8 adds mutually exclusive Opus/PCM input flags while retaining
independent output modes. Current native workers validate input and reply
unavailable; Opus settings fail before secret/connect. No capability or active
Opus microphone selection is claimed.

Focused Node **11/11** pass on explicit Node.js **24.21.0**, including two actual
native lifecycle cases. Focused native parser/config tests pass **5 cases / 850
assertions**. Those cases distinguish parser/lifecycle from actual RDP or devices.
Native builds use /analyze /WX; formatting/diff checks and generated fuzz seeds
are checked. Linux fuzz/sanitizer execution remains open.

Initial direct fixture import named the existing decoder incorrectly and used
system Node 22; it was corrected to `decodeBuild`, and direct checks now use the
pinned Node 24 binary. A subsequent multi-file direct run timed out on one HELLO;
serial fixture retry and serial full narrow set passed without changing deadlines.
Early process/parser failure now reports a fixed fixture diagnostic, while
already received expected replies remain consumable after worker exit. The first
timeout's cause is not established; the required serial full run remains the
acceptance check. No antivirus setting or heuristic bypass was used.

Full `pnpm check`: **424/424** pass on pinned Node 24. Native CTest bundled
**17/17** and foundation **6/6** pass. The two new native lifecycle cases also
pass **2/2** against foundation on explicit Node 24.

Explicit Node.js 24.21.0 XRDP/API/Edge H.264 regression passes: **47 frames at
1920×1080**, cursor replay/reattachment and clean runtime teardown. Microphone
source stays waiting revision 1 / epoch 0 with zero permission requests, graph,
offered/sent PCM or physical capture. Existing guard sends only one motion and
one reset, with no keys/buttons/wheel/touch/apps/sound generation. Local evidence
is `build/iteration-134-xrdp-viewer-node24.log`; this establishes the required
Node-24 lab gate that prior direct system-Node exploratory runs did not.

Owner-thread decoder/AUDIN dispatch, permission/lease/network,
actual capture, platforms/resources/LAN/soak remain open.

[IPC contract](MICROPHONE_OPUS_IPC.md).
