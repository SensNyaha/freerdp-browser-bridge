# Iteration 271 — corrected native archive in independent runtimes

2026-10-16. Continues Stage 0 / BUILD_AND_DEPLOY runtime verification after the
DSP ownership correction and [artifact provenance work](ITERATION_270.md).
The latter is committed as `f9ba513`.
No production code changes in this block.

The new Linux CPack archive SHA-256 is
`e85ab7bcaa21166e14301041f923ff1326be41143e407d8341d78731e93cfd5e`.
A separate whitelist context, `build/native-runtime-271`, contains only this
archive, the existing independent probe and the two verifier Dockerfiles.
No workspace, SDK, source checkout or local credentials are copied. The archive
hash is checked after copying it out of the Linux builder.

New verifier images `freerdp-bridge-native-check:271` and
`freerdp-bridge-native-ubuntu-check:271` build with network disabled on build
steps, using the existing pinned Node 24 Bookworm and Ubuntu 24.04 Dockerfiles.
The known system libudev fallback is removed inside each disposable image;
system FreeRDP is absent. The earlier images and release artifacts are retained.
Docker inspect image IDs are
`sha256:55acfc98b8f6dc8e07216ecc89eab324fdf1803bb7d453bf85669c56e930a164`
(Bookworm) and
`sha256:cfc551bf69a1c3c47afd88d891ee01d7294c124ba32b3b53bf00a78e6e1dae86`
(Ubuntu).

Both actual runs pass under UID/GID 1000, read-only root, no network, init,
dropped capabilities, no-new-privileges and a 16 MiB private noexec runtime
tmpfs. Each reports Node 24.21.0, FreeRDP 3.32.1, six canonical private loaded
modules, codec/libudev-context roundtrips, exact worker/addon pairing hashes,
one actual RWS1 pair record, three HELLO/heartbeat/shutdown acknowledgements and
joined empty-runtime cleanup. This validates relocation of the new corrected
runtime, separately from the sanitizer reset regression in iteration 269.

Evidence: `build/iteration-271-bookworm-image.log`,
`build/iteration-271-ubuntu-image.log`,
`build/iteration-271-bookworm-runtime.log`,
`build/iteration-271-ubuntu-runtime.log`.

These are native artifact smoke checks, not Ubuntu source compilation, a full
service image, clean-machine installers, actual RDP/device integration or a
sustained resource/CI acceptance gate. Stage 0 remains IN PROGRESS.
