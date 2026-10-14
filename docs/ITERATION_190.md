# Iteration 190 — independent restricted Linux native archive

2026-10-14. Implements the Stage 0/10 native clean-runtime acceptance slice after
`8a51dc3`. This checks the native TGZ; the complete Node API/service image and
installers remain separate work.

The archive is copied into a dedicated Docker context containing only the TGZ,
pinned verification Dockerfile and dependency-free test probe. An explicit
Docker ignore whitelist excludes everything else. The preparation helper accepts
only a bounded project-local build archive and refuses a symbolic context alias.
No SDK, source checkout, Node workspace dependencies, lab credentials or user
certificate store enters this image.

The pinned official Node 24 Bookworm slim base includes an incidental system
libudev. The first absence check correctly fails. The verifier removes only its
two known fallback files inside that disposable image before extracting the
archive; no host or production device service is changed. System FreeRDP and
the `/work` build tree are absent. This test image is not a production service
distribution or a replacement for the host OS package manager.

The extracted archive runs under UID 1000 with read-only root, no network, all
capabilities dropped, no-new-privileges, default Docker seccomp and init. Its
only writable directory is a 16 MiB noexec/nosuid/nodev runtime tmpfs. Normal
HOME remains unchanged. The independent probe:

- checks Node 24 and actual FreeRDP 3.32.1;
- verifies JPEG, OpenH264, incoming AVC420, Opus and public libudev context
  roundtrips, with six canonical module paths inside the extracted archive;
- sends fixed HELLO/heartbeat/shutdown wire vectors through a real worker;
- checks exact envelope kind/correlation/bounds and graceful exit;
- confirms worker-owned directory and marker cleanup.

The fixture joins its owned child before cleanup even after failure, with finite
execution/termination deadlines. It connects to no RDP server, requests no audio
permission and enumerates no devices. The successful actual receipt is:

```json
{"node":"v24.21.0","uid":1000,"freerdp":"3.32.1","modules":6,"acknowledgements":3,"cleanup":true}
```

TGZ SHA-256:
`27528fb0d01620fc9a02fc2dee12e90db69dae46dbc77129b3083c8177e5225c`.
Archive size: 24,735,901 bytes, excluding Node.js. Logs:
`build/iteration-190-native-image.log` (retained first refusal),
`iteration-190-native-image-retry.log`, `iteration-190-native-clean.log`.
Changed helper lint/format pass. Implementation/provider regressions remain the
passing Windows/Linux Node, CTest and relocation gates recorded in iteration 189.

The manual bundled workflow now includes this exact context/build/run check;
actual GitHub CI has not run. Independent Debian Bookworm native runtime smoke
is complete. Fresh-checkout build, Ubuntu/distro matrix, Node service image,
installers, Linux primary IPC/priority output and actual RDP/device/resource/soak
acceptance remain open. The next implementation block is bounded Linux output.
