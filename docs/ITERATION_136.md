# Iteration 136 — raw native Opus microphone activation

Date: 2026-10-12. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after owner `907a5dd`. Guarded Windows raw CONFIGURE selects
the single Opus handoff and RDP-thread source/decoder composition. Actual source
readiness and epochs are rechecked; reset/loss/ending clears codec state, and
failed decoder ownership propagates after correlated completion. Public/typed
Opus input and HELLO advertisement remain disabled.

Focused **11/11** native lifecycle/local TLS cases pass on pinned Node 24.
Six raw input/output combinations verify independent selection and wrong-codec
refusal, strict certificate rejection, closed input epoch 0, no RDP application
bytes/audio, heartbeat and graceful shutdown. No real ready AUDIN/device/capture
acceptance is claimed; ready source composition uses prior linked fake-DVC tests.

Initial compile exposed `audio` namespace ambiguity after importing IPC names;
the constructor/enum are qualified as bridge::audio. An early fixture launch
ran against the prior binary after that failed build and correctly refused new
raw selection; those four failures are not counted as new dispatch evidence.
After a successful rebuild, all eleven focused cases pass. /analyze /WX and
formatting/diff checks pass; no warning/deadline/antivirus policy was relaxed.

Full `pnpm check`: **427/427** pass on pinned Node 24. CTest bundled **17/17**
and foundation **6/6** pass. Existing PCM-selection XRDP/API/Edge H.264
regression passes **49 frames at 1920×1080**, cursor replay/reattachment and
empty runtime teardown. Source remains waiting revision 1 / epoch 0 with
zero permission requests, graph/physical capture or offered/sent PCM. Existing
lab guard sends one motion and one reset only. It does not establish successful
remote Opus/AUDIN input. Local evidence: `build/iteration-136-xrdp-viewer.log`.

Node/browser/capability,
permission/lease/credit, failure injection/resource/platform and actual remote
microphone/LAN/soak gates remain open. [Worker contract](MICROPHONE_OPUS_WORKER.md).
