# Iteration 125 — actual Edge microphone socket composition

Date: 2026-10-12. Implements SPECIFICATION §2.6 / PROTOCOL §6 /
MEDIA_PIPELINE §7 acceptance fixtures after media client `5fa9631`.

Two actual Edge / loopback WebSocket cases compose replaced getUserMedia,
synthetic MediaStreamDestination signal, permission owner, real Worklet, bounded
sender, media client, public Node microphone adapter and fake RDP worker API.
No physical getUserMedia, actual RDP worker/AUDIN or graphics rendering is used.

Focused **2/2** pass. Explicit click precedes the sole permission request and
server grant. Synthetic S16LE packets reach fake worker admission. Ordinary
stop closes track/context/graph, observes one fake worker reset and fresh epoch,
keeps media open and sends no late samples. Controller-loss case holds one
borrowed worker API PCM completion: track/context end while reset count remains
zero, then release permits exact one reset/fresh epoch and graceful barrier
completion. This verifies public Node worker-API ownership, not private RWI1
dispatch or actual native AUDIN transport.

The first full check stopped at formatting of the updated held-completion test
comment. The fixture was formatted before repeating the full checks.

Final bundled `pnpm check` passes **389/389**, without skips. Unchanged bundled
CTest passes **17/17**, foundation **6/6**. Formatting and diff checks pass.

The fixture's activation/startup orchestration is test code. Production startup
context cleanup/owner, reference-viewer/native selection, physical/browser
permission dialog and device loss, negotiated remote microphone, LAN/soak /
platform, native resampling, Opus input and upstream limits remain open.
