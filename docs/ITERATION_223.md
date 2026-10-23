# Iteration 223 — synchronized runtime and release inventory checkpoint

2026-10-15. Reassembles the current Linux native archive with embedded provenance
and the unchanged production Node archive from the logger correction. This is
a concrete reviewable runtime checkpoint after Iterations 219/222, separate
from their SDK/native tests and the completed browser soak.

Exact inputs:

- native TGZ 6abd82c01dfe7409284a23e23c6abc3fb8cbfa297c9e4754a2cc7c95c762012d,
  24,836,026 bytes;
- Node TGZ 3f7f3d9ca4751b86ace4795b9d4fe62830a1ad4b8a8389bb62ecc557733a5288,
  3,369,644 bytes;
- application/native companion
  210c7c7f660001aa770eac9c52e23af831e60edd9fb54f4400810495ac498e32.

Runtime freerdp-bridge-service:223 is
sha256:cc76394330ff93f2ee1e1d9cb7a6230ba26514af73adbd27d2c8c9f73202731e,
109,927,343 Docker-reported bytes. This number is Docker's size receipt, not
an installer or installed-filesystem size promise. Digest-bound local Syft
still finds 303 packages (89 deb / 208 npm / five binary / image source),
1,274 files and 1,152 relationships. Root SPDX passes official schema/reference
checks with SHA-256
2f5fd748ba67912de8444549831bdc5f689a69f11537e18657c168f4b9695b72.
Saved image archive SHA-256 is unchanged across scanning:
6567d36e6d9c8b6fe5753536fba3a08c7cc9a74799bad9a775532d5e88e56c6a.

The separate verification target passes API, default authentication denial,
actual private worker/primary IPC/native failure lifecycle and empty-runtime
cleanup under Node 24.21.0, UID1000, read-only root, no network, no capabilities
and no-new-privileges. No lab configuration or SDK enters the final target.
Known-password audits pass again for the four current Linux artifacts and both
current Windows ZIPs, including embedded provenance; no password is printed.
The current Windows native/SBOM identities are in Iteration 222 and the scalar
audit logs. Host application/native companion export is also refreshed.

Evidence: build/iteration-223-*. Production code is unchanged by this checkpoint;
current full regression remains Windows 567/48 platform skips and Linux 561/54
(615 cases), linked CTest 23/23 and 24/24, relocation 1/1 each. Image :217 and
its earlier checks remain historical receipts, not this later archive set.
No image is pushed or externally deployed. Remaining installer/distro/security /
native graph/licensing/device/network/load gates are unchanged.
