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

The subsequent [public connected RSS control](ITERATION_319.md) also passes
actual Windows 1080p JPEG over media WS, one exact resource error over control
WS, terminal channel closes, failed HTTP snapshot, token retirement and joined
PID/runtime/query cleanup. It uses a Node transport receiver; browser rendering,
siblings and complete resource/soak gates remain open.

The [connected public CPU control](ITERATION_320.md) then passes the named
Windows CPU-failure slice with real counters after public JPEG, bounded local
IPC load, exact public CPU error, both channel closes, token retirement and
joined cleanup. The original RSS mode passes again. Complete CPU/session-total
budgets, other producer/server profiles, browser terminal display, connected
siblings, OS-failure and soak gates remain open.

On 2026-10-20, the user asked for another access attempt. TCP 3389 succeeds;
the native FreeRDP inspect helper reaches a certificate prompt, and the strict
helper rejects the endpoint as `RDP_CERTIFICATE_REJECTED`. It now presents
`sha256:7a826b7c5f71b03b67866a63d03e15279aefb6638a36cfc9c7209e349d5e75ed`
with a hostname mismatch. The strict run joins worker close and leaves the
runtime directory empty. No trust was persisted. The user then explicitly
approved this exact fingerprint for one session; the native helper connected,
captured a 1024×768 JPEG, exchanged heartbeat and joined cleanup with an empty
runtime directory. A subsequent one-session private Display Control check
negotiates the 1920×1080 → 1280×720 → 1920×1080 resize/restoration and obtains
fresh H.264 IDRs plus intermediate JPEG. The public Edge/H.264 viewer also
renders the Windows desktop, resizes/restores it with fresh configurations and
keyframes, and passes display/cursor replay and reattachment with joined cleanup.
Acceptance covers these named Windows endpoint/profile slices. Remaining gates
include a Windows Server matrix, application/audio/device, resource and soak
verification.
[Strict refusal](ITERATION_344.md), [approved activation](ITERATION_346.md),
[private resize](ITERATION_350.md), [local transport regression](ITERATION_351.md),
[public Edge/H.264 resize](ITERATION_352.md), [public Edge/JPEG resize](ITERATION_353.md).

A subsequent separately authorized Opus/200 ms browser recovery attempt renders
1080p H.264 but receives only an enabled/waiting audio source, with zero
configurations, packets, decoded or played frames. It fails the active-source
precondition and joins cleanup. This does not verify current playback/recovery
or identify a source/transport root cause; the earlier active-source results
remain historical. The user is preparing a continuous local source before a
repeat. [Current observation](ITERATION_362.md).
