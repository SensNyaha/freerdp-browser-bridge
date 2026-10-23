# Iteration 352 — Windows RDP H.264 browser resize and restoration

2026-10-20. With the user's approval for one H.264 browser resize session and
the same exact session-only certificate fingerprint, the existing reference
viewer passes its public API/Edge/WebSocket path against the Windows RDP lab.
The Edge Chromium viewer renders a nonblank 1920×1080 H.264 desktop, applies
1280×720 and restores 1920×1080. Both observed display generations advance;
the resize and restoration each deliver a new H.264 configuration and keyframe.

The run reports 42 frames, 2,803,583 encoded bytes, 11 total keyframes and two
configurations at the initial 1080p state. After resize the viewer reports
generation 3, configuration 3 and keyframe count 13; after restoration it
reports generation 4, configuration 4 and keyframe count 14. Display replay,
cursor shape replay after motion, and viewer reattachment pass. Queued frame/
byte and decoder queue counts are zero at the final sample. The session sends
one pointer move and reset events only; audio and clipboard are not selected.

The helper exits zero, loopback port 47999 is closed and `.runtime/viewer-lab`
is empty. The unchanged bundled Release worker hash is
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`. No
Release build, dependency, server setting, or saved desktop image changed.

This accepts the named public H.264 single-display resize/restoration slice on
the Windows RDP profile. JPEG on this server profile, other server profiles,
broader interactive input, full GFX/DVC resource limits, concurrent/sustained
load, audio and devices remain separate gates. The actual private native
control result is in [iteration 350](ITERATION_350.md), and the local transport
regression is in [iteration 351](ITERATION_351.md).
