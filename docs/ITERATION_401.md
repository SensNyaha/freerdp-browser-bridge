# Iteration 401 — current Release and active XRDP 30-minute acceptance

2026-10-21. Verifies the combined native input correction `1ffbfeb` and bounded
CLIPRDR compatibility `d34cb74`, under SPECIFICATION §2.3/2.12 and the practical
MVP active-soak gate. Original Release artifacts/configuration and pins remain.

The new source-only linked Release consumer uses the existing receipt-bound
FreeRDP/WinPR SDK and private dependency inputs. CTest passes 34/34 in 27.94 s,
followed by lifecycle 27 / one skip / 28 total in 44.91 s. The first preparation
refuses Git ownership through the temporary subst path; the repeat supplies
only exact project/SDK safe-directory values to that command's environment.
No global Git setting, source/dependency content or certificate policy changes.
Logs: `build/iteration-401-combined-native.log`,
`iteration-401-combined-native-repeat.log`.

Receipt: `build/native-clean-RKqCuA/receipt.json`, 353 native inputs, source hash
`4ed895de6cb0e2e2efd45b9b277be6e5e90e7acf4b847a537043cc220b367ad1`.
Worker SHA-256:
`8bebcb649d41244976417f953e353aaa3d027b42c0d62505f0d82553abb3a171`.

The actual owned Debian XRDP/Xorg prepared one-Hz desktop and headed Edge use
the ordinary public Node API and that Windows Release worker. H.264/WebCodecs
1920×1080 completes **1,800,105 ms / 61 observations**, exit 0:

- 5,781 rendered frames / 59,021,811 bytes at the final soak observation;
- maximum worker RSS 152,342,528 bytes and Node RSS 130,449,408 bytes;
- at most one queued frame / 63,132 queued bytes, decoder queue zero,
  media buffered bytes at most 51 and maximum sampled decode p95 4.5 ms;
- unchanged 256 MiB worker limit passes; no sampled lifecycle/media error;
- subsequent confirmed 1280×720 resize and restoration to 1920×1080 produce
  fresh display generations/configurations/keyframes and rendered images;
- cursor motion/shape replay, fresh-token viewer reattachment and display
  replay pass, then joined server/browser close and empty owned runtime;
- after completion, the actual `.runtime/owned-viewer-lab` is empty and the
  host process inventory has no `rdp-worker`. The old abandoned runtime and
  incomplete 26.14-minute log from [398](ITERATION_398.md) remain preserved.

Evidence: `build/iteration-401-owned-active-soak.log`. The marker continuously
changes actual desktop pixels; this is active desktop acceptance, with audio,
clipboard and physical devices off. It is not the joint Windows sound/input/
clipboard gate, LAN latency measurement or sustained concurrent-session load.
The named short two-account coexistence result remains [398](ITERATION_398.md).
Linux current-code regression and the joint Windows gate remain separate work.
