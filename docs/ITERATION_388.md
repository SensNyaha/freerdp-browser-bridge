# Iteration 388 — current Windows 1080p H.264 observation

2026-10-21. Runs the user's separately approved one-session 30-minute check
against the Windows lab, using the exact approved session-only certificate
fingerprint and existing `--soak-test` scenario. Code snapshot is `6415d9c`.
The receipt-selected linked Debug worker is from [378](ITERATION_378.md),
including [371](ITERATION_371.md)'s audio scheduling correction. Audio and
Clipboard are off in this scenario. No application, source command, remote
text, settings change, persistent trust or additional connection is introduced.

The public API and reference Edge viewer establish a nonblank 1920×1080 H.264
desktop. The existing collector samples scalar viewer queues, protected render
credit, worker working set and parent Node RSS every 30 seconds. It checks
connection state and finite queue bounds; it stores fixed maxima, not frame or
sample content history. The private worker remains separate from Node.

## Result

The helper exits **0** after **1,800,145 ms** of observation and **61** samples.
The sampled maxima are:

| Measurement                          | Observed maximum                                                      |
| ------------------------------------ | --------------------------------------------------------------------- |
| Worker working set                   | 249,630,720 bytes / 238.1 MiB, below the explicit 256 MiB fixture cap |
| Parent Node RSS                      | 127,848,448 bytes / 121.9 MiB                                         |
| Queued video frames / bytes          | 0 / 0                                                                 |
| Decoder queue / media buffered bytes | 0 / 0                                                                 |
| Decode p95                           | 35.70 ms                                                              |

The unchanged desktop renders 10 frames / 292,936 encoded bytes during the
observation. After the full interval, confirmed resize to 1280×720 and restore
to 1920×1080 advance display generations 3/4 and configurations 3/4, with fresh
keyframes and nonblank images. Fresh-token viewer reattachment replays display
and cursor. Five native cursor shapes are observed; one pointer move and four
reset events are sent, with no text or application action. Clipboard stays off:
zero native source events, zero browser API requests, disabled/empty controls.

The final native pipeline has 65,205 RDP checks, 23 paints and 18 encoded frames;
encode mean/p95/max are 109,954 / 217,440 / 217,440 µs. These lifetime diagnostics
include resize/replay work and are not a moving-video throughput benchmark.
The browser receipt's `closed:false` is a pre-cleanup snapshot, not a retained
session claim. Server/browser/native close joins before the helper exits; the
existing runtime-empty assertion passes. Independent post-exit inventory finds
no `rdp-worker` process and zero entries in `.runtime/viewer-lab`.
Retained complete log: `build/iteration-388-windows-soak.log`.

The desktop is static during the observation; its unchanged image does not
require repeated frame encoding. This is a named live connection/queue/resource
observation followed by the existing display/replay checks. It is not a moving
desktop/video benchmark, CPU or whole-session memory measurement, active audio /
clipboard soak, all mouse/keyboard acceptance or a full Stage 4/10 gate.

Post-run audit matches all 353 native inputs, both linked Debug artifacts and
seven protected inputs. Documentation links/format and `git diff --check` pass.
No native/project code, Release profile/artifact, pinned dependency or parser /
protocol changes are made. Current linked CTest 34/34 and full Node 890 / 51
skips are recorded in [387](ITERATION_387.md); documentation-only changes do not
require repeating them.

The user also starts Docker Desktop during observation. Ordinary sandbox Docker
config/pipe access is refused, while the standard approved user-context tool
call reaches Docker 29.7.2. No endpoint/config/ACL/security setting is changed.
The existing local Ubuntu GCC 12 image and hash-bound offline Node cache are
available. A fresh tracked-source Linux foundation/Node regression is prepared
for after this observation, avoiding competing compilation/test load during
the RDP check. WSL's separate access refusal is not bypassed.
