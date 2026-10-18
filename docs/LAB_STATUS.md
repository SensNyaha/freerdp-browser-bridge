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

PCM/Opus output has no server Formats/config/packets during the bounded runs;
PCM/Opus AUDIN has no channel/Open negotiation and remains waiting at epoch 0.
Closing the wizard resolves that desktop precondition, not a proven audio root cause.
Ready-source reset, audibility, physical microphone/recording and latency
acceptance remain open. The desktop-ready repeat still observes no Formats/
packets for either output codec and no AUDIN Open for either input codec.
[Repeat evidence](ITERATION_302.md). The audio cause remains unverified.

Further application/input/clipboard and device tests require an available
desktop plus explicit device/capture policy. The restored network access does
not accept these functions by itself. No dependency versions, Release settings,
persistent certificate trust or security mechanisms are changed.

The subsequent user-prepared Notepad smoke now passes the named committed
Unicode, small physical-key/reset, left-button and private bidirectional
clipboard application/readback cases, followed by unsaved-window cleanup.
[Exact scope and retained broader gates](ITERATION_303.md).
