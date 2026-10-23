# Iteration 252 — isolated Linux private dependency source rebuild

2026-10-16. Continues Stage 0 after `a3b9975` and BUILD_AND_DEPLOY §2. The new
`build-dependencies.mjs --clean-local` mode creates separate installed,
buildtrees and packages roots. Binary sources are explicitly clear in both
environment and command line; `--no-downloads` plus the existing container's
disabled network require cached source/tool inputs. Concurrency is two, with a
finite one-hour command budget. The ordinary cached build remains available;
the existing installed dependency/SDK prefixes are not replaced.

The actual Linux build finishes all 20 planned packages in 14 minutes under
`build/dependencies-source-clean-w2PFkb`. It recompiles the target ZLIB 1.3.2,
OpenSSL 3.6.5, libusb 1.0.30/private eudev 3.2.14, libjpeg-turbo 3.2.0, libspng
0.7.4, OpenH264 2.6.0, Opus 1.6.1, Kerberos 1.22.2, ICU 78.3, CUPS 2.4.20,
libfuse 3.18.3 and numactl 2.0.19. Host ICU/tools and helper ports complete the
plan. The status database has 22 installed records including features.
Compiler/CMake/Ninja/vcpkg tools and cached source archives remain declared
inputs; no compiled library/package binary cache is reused.

The vcpkg source is clean at exact `2750401336fb7c95f6619657a46a7e798661341c`
before/after. A bounded shared fingerprint covers native/dependencies.json and
the manifest/overlay/triplet tree, rejects links/special objects and limits
depth/count/per-file/aggregate bytes. The completed receipt binds unchanged
recipes, status, required roots, source-only settings and the new prefix.
Its reader refuses changed pin/recipes/status, foreign prefix, binary-cache or
download claims, oversized/malformed input and paths outside the build namespace.
Parse/status failures disclose no payload contents. Portable metadata fixtures
pass on Windows/Linux; these are separate from real dependency compilation.

The final shared reader independently accepts the actual completed receipt,
including the same fingerprint extracted from the driver:

| Evidence | SHA-256 |
| --- | --- |
| recipes | `254706cc81dcf4c9a9df488fe6a50c4731c0b8684324a5d456d3d11fc5904791` |
| normalized installed status | `22c9fde86e4bd932858c0104aa6ff9a8eb1211dadce6053a8caff9d45f648357` |
| receipt | `20783b8d6cc5daf079e2f4ff9bd9a190be69814cb1088eb7afb4fe4ca3c0a32c` |

Log: `build/iteration-252-linux-source-dependencies.log`. Completed receipt:
`build/dependencies-source-clean-w2PFkb/installed/bridge-dependency-build.json`.
A separate new FreeRDP SDK consumes this exact prefix and passes its public
runtime identity/inventory/CTest smoke; that handoff belongs to Iteration 253.

This accepts the named local Linux cached-source dependency rebuild and bound
metadata input. Windows cold rebuild, complete fresh checkout/distro/CI,
standard PIE sanitizer, final packaging/installers and actual RDP/device/resource
acceptance remain open. Stage 0 remains IN PROGRESS.
