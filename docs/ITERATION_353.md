# Iteration 353 — Windows RDP JPEG browser resize and restoration

2026-10-20. With the user's approval for one JPEG browser resize session and
the same exact session-only certificate fingerprint, the reference viewer
passes its public API/Edge/WebSocket path against the Windows RDP lab. Edge
Chromium renders a nonblank 1920×1080 JPEG desktop, resizes it to 1280×720 and
restores 1920×1080. Each observed display generation advances and each change
produces a fresh JPEG configuration. Display replay, cursor shape replay after
motion and viewer reattachment pass.

The run reports **28 frames** and **17,560,487 encoded bytes** at the initial
1080p state. Resize reaches generation 3/configuration 2; restoration reaches
generation 4/configuration 3. Mean/p95 browser decode time is 26.28/42.4 ms.
Queued frames/bytes and decoder queue are zero at the final sample. The session
sends one pointer move and reset events only; audio and clipboard are not
selected.

The helper exits zero, loopback port 47999 is closed and `.runtime/viewer-lab`
is empty. The unchanged bundled Release worker hash is
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`. No
Release build, dependency, server setting, or saved desktop image changed.

This accepts the named public JPEG single-display resize/restoration slice on
the Windows RDP profile. Broader Windows server profiles, GFX/DVC resource
limits, concurrent/sustained load, full interactive input, audio and devices
remain separate gates. H.264 evidence is in [iteration 352](ITERATION_352.md);
the private native and local transport evidence are in [350](ITERATION_350.md)
and [351](ITERATION_351.md).
