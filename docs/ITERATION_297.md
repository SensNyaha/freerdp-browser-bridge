# Iteration 297 — restored authorized RDP lab regression

2026-10-18. The user restored access to `192.168.21.149` and explicitly asked
to revisit functions pending lab availability. This supersedes the access
block recorded in iteration 275. Historical results remain intact. Runs use
existing helpers, current Node build after `6752257` and the existing bundled
Windows worker; no production code, Release setting or dependency pin changes.

## Actual observations

The target TCP port is reachable. Strict certificate verification still fails
with exact `RDP_CERTIFICATE_REJECTED`. The separately prompted session-only
connection accepts only the previously approved exact fingerprint; it is
unchanged. No certificate verification bypass or new persistent trust is used.
Credentials are read from ignored authorized local files and sent through
private IPC; no credentials enter argv/env/output/commits.

| Existing helper / profile | Observed result |
| --- | --- |
| Core connection | Connected, heartbeat, 1024×768 JPEG; 40 changed captures and one unchanged capture. |
| Native Display Control | 1920×1080 → 1280×720 → 1920×1080 applied; fresh H.264 IDRs, JPEG and heartbeat. |
| Edge H.264 resize | Nonblank 1080p, 7 rendered frames before resize, cursor replay, fresh-token reattach, both resize generations rendered. |
| Edge JPEG resize | Nonblank 1080p, 8 rendered frames before resize, cursor replay, fresh-token reattach, both resize generations rendered. |
| Controlled transport loss | Seven browser frames before interruption of only the owned local proxy connection; exact `RDP_DISCONNECTED`, viewer retirement and empty runtime. |
| CLIPRDR inventory | Ready, both text directions, 65,536-byte maximum, heartbeat; zero reads/writes/revokes or host Clipboard API access. |
| RDPEI inventory | Ready with ten contacts at 1920×1080, heartbeat/frame; zero touch events sent. |
| RDPSND PCM / 120 ms | Ten-second observation stays waiting; zero format negotiation/configs/packets. Heartbeat/frame/close pass. |
| RDPSND Opus / 200 ms | Same waiting/no-formats/no-packets observation; ready reset is not exercised. Heartbeat/frame/close pass. |
| AUDIN PCM and Opus / output off | Both waiting at epoch 0; all channel/version/format/Open counters zero. No capture or sample submission. Heartbeat/frame/close pass. |

All helper invocations exit zero for their named inventory/regression scope.
An inventory exit zero does **not** establish usable audio or recording.
No fault is observed in the named graphics/connection regressions. No new
audio negotiation is observed; the cause is not diagnosed by these counters.
Output audibility/quality/reset, ready microphone/recording and measured LAN
latency remain open, along with actual keyboard/button/wheel/touch application
effects, clipboard consumption/readback, Windows-server and soak/resource gates.
No remote application commands, physical capture or security research occur.

## Retained evidence

`build/iteration-297-lab-{strict,connect,display,viewer-h264,viewer-jpeg,
transport-loss,clipboard,touch,audio-pcm,audio-opus,microphone-pcm,
microphone-opus}.log` retain bounded scalar results. Ignored existing screenshot,
metric and audio/microphone reports are refreshed by their ordinary helpers.
Browser stats `closed:false` are captured before teardown; helper exit zero
and subsequent directory checks establish teardown separately.

All named `.runtime` roots are checked empty after sequential runs. The
unchanged worker SHA-256 is
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
Full Windows/Linux `pnpm check` and native CTest had passed immediately before
this documentation-only block in iteration 296; they are not rerun for lab
observations. Documentation links and `git diff --check` pass.

Development continues with the restored lab available; unavailable physical
devices or absent server channel negotiation are retained acceptance gaps.
