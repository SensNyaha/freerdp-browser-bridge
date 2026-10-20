# Iteration 350 — Windows RDP Display Control resize and restoration

2026-10-20. With the user's approval for one session and the exact
session-only certificate fingerprint, the existing bundled Windows worker
connects to the authorized RDP endpoint and negotiates Display Control for a
single primary display. The native helper changes the observed desktop from
1920×1080 to 1280×720 and restores 1920×1080. The resize produces a fresh AVC
IDR and a JPEG at 1280×720; restoration produces a fresh AVC IDR at the original
dimensions. The unchanged-size and invalid-size controls also return their
expected results. The helper sends only reset/heartbeat beyond the resize
requests.

The worker reports generations **2 → 3 → 4**, with negotiated bounds
3840×2160 and maximum area 8,294,400 pixels. The helper exits successfully and
`.runtime/display-lab` is empty. The reused bundled Release worker SHA-256 is
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`, matching
the previously recorded artifact; no Release rebuild, source change, or
dependency change occurred.

This accepts the named private native Windows RDP Display Control slice. It is
not the public browser resize path, Windows-server profile matrix, GFX/DVC
resource audit, multi-session soak, or general graphics/input/audio/device
acceptance. The test contract is in [Development](DEVELOPMENT.md#private-xrdp-display-control-check).
