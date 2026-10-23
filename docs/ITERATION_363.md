# Iteration 363 — Windows browser audio with user-started continuous tone

2026-10-20. After the user started a continuous local tone and explicitly
approved one repeat, the unchanged Opus/200 ms Edge recovery helper again
connected and rendered H.264 1920×1080. The retained sample contains 12 frames,
1,352,101 encoded bytes, two video configurations and seven keyframes.

Audio remained enabled/waiting at revision/epoch 1, awaiting configuration.
Configurations, packets, decoded and played frames were zero; buffering
silence reached 739,712 frames. The active-source precondition failed before
detachment. No replay, tone audibility or continuous-output quality pass is
claimed. The helper again labels the failure `reattach`, although it had not
detached. The fact that a tone was running does not establish that its selected
Windows audio endpoint/session was redirected into this connection.

The helper exited 1 and joined cleanup. Runtime `.runtime/viewer-lab` is empty,
port 47999 has no listener and the bundled worker SHA-256 remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
The ignored log is `build/iteration-363-windows-audio-opus-tone.log`.
No additional remote application, device capture or server setting was changed
by the agent. Release configuration and dependency pins are unchanged.

Local pinned-source review rules out a premature `AudioPlayback=FALSE` fix:
`freerdp_client_load_addins()` enables playback after finding the declared
static RDPSND descriptor. The existing actual-loader fixture in
`native/audio/rdpsnd_provider_tests.cpp` checks that playback is enabled and no
dynamic RDPSND is added. This source/test inspection is not a new runtime pass
or proof of the current audio cause. Browser failure evidence currently lacks
the native negotiation counters that would distinguish server Formats/Training
from browser delivery; collecting those fixed counters is the next local task.
