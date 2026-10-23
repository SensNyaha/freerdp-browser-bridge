# Iteration 202 — Edge with actual Linux XRDP/API/primary IPC

2026-10-14. Extends the private connected gate in `bc0c244` to SPECIFICATION
2.3 and the public media/control paths. The producer is Linux amd64 Release
FreeRDP 3.32.1, Node 24 and the automatic paired RWS1 carrier; the consuming
browser is actual Edge on Windows. This is not a Linux-browser acceptance claim.

Two separate authorized XRDP runs pass, H.264/WebCodecs and JPEG/canvas. Each
requires nonblank actual pixels at 1920×1080, current rendered display generation,
public control resize to 1280×720 and restoration to 1920×1080. Both resizes
require fresh media configurations; H.264 additionally requires fresh IDRs.
The H.264 run observes configuration counts 3/4 and keyframe counts 6/8 across
the two changes; JPEG observes configurations 3/4. Exact counts are observations,
not required timing or frame-rate guarantees.

Both runs detach and obtain fresh control/media credentials through REST,
reattach, and decode a new nonblank 1920×1080 frame. H.264 replay starts with one
configuration and one keyframe; JPEG starts with one configuration. Ordinary
DELETE/server/worker cleanup is joined and the Linux private runtime is empty.
No raw desktop files are saved. No microphone permission, audio activation or
operational remote keyboard/mouse input is requested.

The disposable Docker API is published exclusively as
`127.0.0.1:47998:47999`. The host helper checks actual Docker port bindings before
generating authentication material; wildcard, additional, duplicate and wrong
port mappings are refused. One unit case covers these refusal boundaries. A
private bootstrap carries only the ephemeral host bearer; lab credentials reach
the Linux API through its ordinary authenticated loopback REST creation, then
the worker through separate private IPC. API logs/upstream stderr are discarded;
only fixed scalar receipts are printed. No tokens/passwords enter argv/env,
container files, images or committed output. The helper bounds startup, requests,
stdout and whole-run lifetime; the server has its own 90-second cleanup deadline.

The first attempt failed before session creation because the new helper used
`platform` instead of the actual build-report `os` field. Cleanup fell back to
the server deadline because an empty POST incorrectly declared a JSON body.
Both helper errors are corrected and the failed receipt is retained, rather
than counted as RDP failure or acceptance. Local logs: `build/iteration-202-*`.

The named actual Linux producer / Windows Edge graphics, resize and replay
smoke is accepted. Other browsers, prolonged Linux interactive/resource/soak,
Windows RDP servers, Linux audio/devices and full Stage 4 remain open.

Lint/format and full bundled `pnpm check` pass: Windows **538 passed / 25
platform skips**, Linux **488 passed / 75 platform skips**, 563 cases, zero
failures. The new loopback-publication refusal test passes independently; both
actual browser/RDP receipts exit 0. Native code is unchanged, retaining the
preceding CTest baselines. Subsequent transport-loss helper work is verified
separately rather than attributed to this browser smoke.
