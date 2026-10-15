# Iteration 210 — private Linux microphone lab bootstrap and archive recheck

2026-10-15. Provides a reproducible actual-lab follow-up to SPECIFICATION 2.6 /
MEDIA_PIPELINE 7 and the Linux activation in `edb6524`. The microphone inventory
helper accepts an explicit private-stdin mode with primary or framed IPC. The
host wrapper reads only authorized ignored lab files and passes at most 8 KiB
over inherited Docker exec stdin; credentials enter neither argv/env nor
container files. The child emits copied scalar status/cleanup receipts only,
sends no microphone samples or operational input and never requests permission.

Audio and microphone lab helpers share one bounded bootstrap reader. Received
chunks and fixed staging storage are wiped on normal/error/overflow paths;
malformed JSON, bad field bounds and iterator faults produce one fixed error.
Immutable JavaScript strings remain subject to the documented lifetime limit;
this does not claim complete memory zeroization. The wrapper retains its finite
50 s CLI lifetime and 16 KiB output cap. No production API or protocol changes.

Actual XRDP attempts are unsuccessful: the current host TCP probe times out,
and the selected Linux input closes at epoch 0 with RDP_CONNECT_TIMEOUT.
The repeated receipt confirms normal closed worker and empty runtime. No ready
AUDIN/recording acceptance is inferred. Logs: `build/iteration-210-linux-xrdp-*`.

Two new bootstrap tests cover fragmented projection/wiping, oversized first and
continuation chunks, malformed input, field bounds and iterator faults. Focused
lab tests pass 5/5; changed-file lint/format passes. Preceding complete activation
regressions remain Windows 545/46 skips, Linux 537/54, zero failures (591 cases),
linked CTest Windows 23/23 and Linux 24/24, foundation 11/11 and relocation 1/1.

The current Linux native archive is exported and independently checked again
under UID1000, read-only root, no network, cap-drop/no-new-privileges and runtime
tmpfs. It has no SDK/system FreeRDP/libudev fallback. Six private module probes,
codec roundtrips, IPC addon/pair manifest, three actual lifecycle replies and
owned-directory cleanup pass. Logs: `build/iteration-210-linux-clean-*`.

TGZ SHA-256:
`ffeb66a24b4c08221dc776d13cc30e9c54e558bd06188fce4a50ac58fb760c15`,
24,781,412 bytes excluding Node.js. This archive smoke does not establish
negotiated AUDIN, a complete Node service image, installers or distro matrix.
