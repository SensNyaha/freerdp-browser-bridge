# Iteration 127 — reference-viewer microphone selection

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
production startup owner `e2a16a1`.

Explicit PCM selection negotiates microphone metadata and installs gesture-only
enable/stop controls, scalar diagnostics and independent microphone JSON/ACK
routing. Waiting sources never request a device. Detach stops tracks, joins
finite cleanup with microphone replies still available, then closes media.
Reattachment cannot overlap old cleanup/unresolved permission.

Focused **6/6** pass: four actual Edge/viewer/WS/Worklet cases with synthetic
capture/fake RDP and two existing PCM/Opus output viewer cases. The microphone
cases verify delivered synthetic signal, stop/restart/detach, source change,
permission denial and late permission after detach/reattachment. No physical
device is accessed.

The first fixture run refused its browser Origin because the allowlist was
missing; exact loopback origins are now supplied without weakening production
Origin validation. A subsequent run found the detached diagnostic still marked
retiring after cleanup; final snapshot now follows barrier release. The source
change fixture incorrectly expected a redundant reset after already observing
a fresh epoch; it now checks completed retirement without that reset. The
corrected focused set passes.

Full `pnpm check`: **401/401** pass. Native CTest: bundled **17/17** and
foundation **6/6** pass; native sources are unchanged in this block.

Native selection, actual negotiated AUDIN/remote/physical/LAN/platform/soak,
native resampling, Opus input and upstream resource gates remain open.
[Current viewer contract](MICROPHONE_VIEWER.md).
