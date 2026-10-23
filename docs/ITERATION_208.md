# Iteration 208 — actual Linux audio to Edge and attachment recovery

2026-10-15. Verifies SPECIFICATION 2.6 / MEDIA_PIPELINE 6 after `788331d` through
actual Linux amd64 FreeRDP 3.32.1 / Node primary IPC / public API and Windows
Edge. The authorized lab user started playback. No sound-generation command or
physical microphone request is sent. The helper explicitly selects PCM/Opus and
the accepted 200 ms native buffer in the manual connection form, then activates
browser output through the existing gesture button and approved certificate.

Actual PCM passes nonblank 1080p H.264, audio packet admission and Worklet sample
rendering: first snapshot 18 records /12 Worklet packets /8,704 played frames;
reattachment 30 /15 /9,216. Public resize to 1280×720 and restoration require
fresh video config/IDR, then fresh control/media credentials reattach normally.
Server/worker cleanup joins with empty runtime.

The first Opus browser attempt does not reach the active-audio condition within
its finite deadline and is retained as failure, not audible acceptance. A repeat
passes with 22 decoded packets before detach and 28 after reattachment. A further
run adds observation of actual NativeSessionWorker.resetAudio completion through
an authenticated lab-only fixed-counter endpoint: exactly one additional reset
is scheduled during attachment replacement, saved source epoch 8 becomes 10,
20 packets decode and the Worklet reports 7,680 played frames after replay.
The counter is observational and does not alter production API/reset ownership.
Initial playback in that run decodes 13 packets /5,760 played frames. All runs
retain separate video/audio credit and request no microphone or operational
remote input. Successful receipts exit 0 with joined cleanup.

The new helper modes require ready source, actual packets, played frames and
zero Worklet invalid calls; Opus also requires decoded packets and a new epoch
on reattachment. Missing/idle source cannot satisfy these gates. Failure output
contains only copied source/decoder/Worklet scalar metadata. Raw diagnostics,
tokens, passwords and real desktop/audio recordings are not saved.

Lint/format and focused helper/config/diagnostic cases pass 8/8. Full preceding
Node baseline is Windows 545/34 platform skips and Linux 509/70, 579 cases,
zero failures; linked CTest Linux 24/24, Windows 23/23 and Linux local portable
ASan/UBSan 12/12. This block changes only lab helpers; native code is unchanged.
Logs: `build/iteration-208-*`.

This accepts the named Linux-producer / Windows-Edge PCM/Opus admission and
observed Opus native reattachment recovery smoke. It does not claim human audible
quality, uninterrupted output, measured LAN delay, prolonged Linux soak or an
explanation for previous RDP protocol failures. Those and Linux/physical/remote
microphone/platform gates remain open.
