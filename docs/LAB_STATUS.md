# Current authorized RDP lab

2026-10-18: the user confirms `192.168.21.149` is now the **Windows lab**.
Current runs must identify it as a Windows RDP endpoint. Historical XRDP
results retain their original scope; using helpers named `test-xrdp-*` does
not make a new run XRDP acceptance. The helper names are retained for command
compatibility and read the ignored authorized target configuration.

After access was restored, the Windows worker/Edge paths pass strict
certificate refusal, prompted connection with the previously approved exact
fingerprint, JPEG/H.264 rendering, confirmed resize/restoration, fresh-token
cursor/display replay and controlled owned-connection loss with cleanup.
CLIPRDR/RDPEI inventories are ready; no clipboard reads or touch events were
sent. [Exact runs](ITERATION_297.md), [connected RSS smoke](ITERATION_298.md).
This is the Windows endpoint/client profile, not a Windows Server SKU/version
matrix, complete NLA/authentication categories or remote application acceptance.

The initial captured native RDP image showed the Windows backup/Windows 11
preparation wizard. The user then closed it themselves and confirmed access
to the desktop. The agent did not choose backup/account settings. The image
is an existing ignored native JPEG artifact, not a new GUI-capture implementation.

PCM/Opus output had no server Formats/config/packets during those idle runs;
PCM/Opus AUDIN has no channel/Open negotiation and remains waiting at epoch 0.
Closing the wizard resolves that desktop precondition, not a proven audio root cause.
Ready-source reset, audibility, physical microphone/recording and latency
acceptance remain open. The desktop-ready repeat still observes no Formats/
packets for either output codec and no AUDIN Open for either input codec.
[Repeat evidence](ITERATION_302.md). The audio cause remains unverified.

On 2026-10-19, a subsequent fixed system-sound attempt observes ready PCM/Opus
output, actual Formats/Training/Waves and private packet delivery; PCM includes
nonzero samples. Config/epoch churn is substantial. Browser/audible/quality,
latency, reset and sustained acceptance remain open. AUDIN still has no Open
negotiation for either codec. [Source observation](ITERATION_305.md).
For future source/application launches, ask the user to run them on the host;
the user prefers that to repeated agent screenshot interaction.

With the user's subsequently running source, current Windows/Edge PCM and
Opus/200 ms now pass actual Worklet rendering and fresh-token audio replay;
Opus includes decoding and one scheduled native reset. Separate private
PCM/Opus ready resets also return fresh config/data. Frequent resets, gaps,
buffering silence and underflows remain visible; uninterrupted audible quality,
LAN latency, sustained budgets and recording are not accepted.
[Browser/recovery evidence and numeric diagnostics](ITERATION_307.md).
The user confirms that this source consists of short sounds with pauses.
Observed gaps are not a continuous-stream quality measurement; source pauses
can contribute to the counters. No full root cause or quality acceptance is claimed.

Further application/input/clipboard and device tests require an available
desktop plus explicit device/capture policy. The restored network access does
not accept these functions by itself. No dependency versions, Release settings,
persistent certificate trust or security mechanisms are changed.

The subsequent user-prepared Notepad smoke now passes the named committed
Unicode, small physical-key/reset, left-button and private bidirectional
clipboard application/readback cases, followed by unsaved-window cleanup.
[Exact scope and retained broader gates](ITERATION_303.md).

During [iteration 317](ITERATION_317.md), a later connected-manager check and
the previously passing direct healthy control no longer reach the certificate
prompt. A single TCP connection to port 3389 does not complete within five
seconds. The user's requested retry then restores TCP/RDP access. After a
test-only cleanup-wait correction, the named connected native-adapter/manager
RSS failure, token/lease retirement and joined cleanup pass; public HTTP/WS
resource-error delivery and connected siblings remain open. The earlier named connected CPU/RSS results in
iterations [315](ITERATION_315.md) and [316](ITERATION_316.md) remain historical
evidence. No server/network policy or alternate target is used.
