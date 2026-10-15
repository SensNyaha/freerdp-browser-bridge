# Iteration 215 — digest-bound final Linux image SBOM

2026-10-15. Implements the Stage 10 final Linux image inventory slice. Syft
1.54.1 Windows/Linux archives are pinned by their upstream release SHA-256.
Actual Windows retrieval verifies the 29,839,434-byte archive before extraction
and checks the executable's reported version. This is checksum verification;
no binary signature verification is claimed. Scanning disables updates and
enrichment and uses the saved local runtime image rather than a registry pull.

Actual final image freerdp-bridge-service:211 is
sha256:fc306575ede89e8d685d5d30d8a9b3d01d742a6e6978cc0317d7e7b8ebfa9d17,
109,876,863 Docker-reported bytes. Docker's OCI index ID differs from the config
digest reported by Syft. The first exact-equality guard correctly refused this
case. The final verifier follows and hashes the index/manifest/config chain,
checks ordered rootfs diff IDs against inspect, then matches Syft's config
identity. No container is started by the scan. Config digest:
sha256:56af7506d773cc5092d5644b0cd74a6539ae9c8749da03c5c72e395bec206db3.

Actual SPDX 2.3 passes the pinned official schema and reference checks:
303 packages (89 deb, 208 npm, five binary and the image source), 1,274 files,
1,152 relationships. The Debian inventory and Node binary 24.21.0 are present.
The base image's npm/yarn dependencies are retained rather than confused with
the application's 58 Node package records. Scanner output does not establish
the complete dependency graph embedded in Node or the private native libraries;
the precise application artifact/vcpkg companion from Iteration 214 is retained.
Windows runtime/CRT, license review, vulnerability scanning and release gates
remain open. No production application, IPC or native code changes are made.

Four pure cases cover immutable target restrictions, classic config/OCI chain,
blob corruption/size/depth, platform/size/digest refusal, source/config/layer
mismatch and missing OS/Node inventory. Actual scanner and full-check evidence:
build/iteration-215-*. Manual bundled CI now invokes the Linux-host scanner after
building the final runtime target; actual GitHub execution remains unrun.

Final saved-image archive SHA-256 is
2cbf1979aeaf812d5e8f9dac82b34c194d4022a76925f67fa398363561095c09,
unchanged before/after scanning. Published SPDX SHA-256 is
0d05c46cc18f9c6485b9a670880aab1efb3b92eafe20359576c997ed441211ba;
its creation timestamp varies between scans. Linux full pnpm check passes
549 cases / 54 platform skips (603 total). Windows full check passes using the
foundation worker; bundled Windows checks are repeated with the subsequent
logging correction. The nine focused SPDX/model tests pass on Windows. Native
code is unchanged from the previous Linux 24/24, Windows 23/23 CTest baseline.

The application companion's previously blocked host export also succeeded
after b26d66c; Iteration 214 records both the initial review-service failure and
the subsequent exact exported collection.
