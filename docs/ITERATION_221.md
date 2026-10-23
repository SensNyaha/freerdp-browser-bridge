# Iteration 221 — exact Windows native and CRT SPDX inventory

2026-10-15. Extends the Stage 10 artifact inventory to the actual Windows x64
native ZIP. Common bounded extraction/hash/provenance/file collection retains
the Linux application report; Windows deliberately omits a nonexistent Node
application archive and describes only its native artifact. Build/output paths
must be canonical inside the workspace before recursive generated-path cleanup.
Node 24 is required on both platforms.

Windows file version resources are read by a fixed PowerShell file using
Get-Item/VersionInfo, without Invoke-Expression, dynamic compilation or running
the packaged code. The helper allows eight expected CRT filenames; native files
are separately canonicalized inside the exact extracted archive. A pure model
checks the complete unique expected set, four uint16 version components and
one matching hashed file identity per DLL. Different file versions get separate
CRT groups. Metadata does not attest an installer version or publisher signature.
No license interpretation is inferred from the version resources.

Actual native archive SHA-256:
3c721b667d0bafcc181b52b386872e1977aae2a17a0afb12a549cd3a745a439b.
All eight CRT DLLs report file version 14.44.35211.0. The resulting native SPDX
passes the official schema/reference checks with 11 packages, 7 unmodified
upstream vcpkg documents, 24 runtime file hashes and 50 relationships.
Final companion ZIP SHA-256:
f2ee488ce58eee0aa4399cc23acd7bb3ff183f50b68ca7dd10fc5c3f2c6d111e.
The vcpkg documents retain complete SDK-package scope. CRT licensing and precise
native edges remain NOASSERTION/open rather than being silently concluded.

The explicit local --windows secret-audit profile streams both ZIPs using the
host's archive reader and the same bounded known-password matcher. It checks
compressed hashes before/after and prints no matched bytes or credentials.
Both actual archives pass for UTF8/UTF16LE lab password values. Default Linux
audit behavior and its separate receipt remain intact. This is not unknown-
credential discovery, signature validation or licensing clearance.

Two pure cases cover exact file binding/grouping, version divergence, absent /
duplicate/foreign entries and malformed versions. Current Linux generation
again passes with 76 packages / 13 companions / 101 files / 206 relationships;
all eleven focused SPDX/model tests pass there. Logs: build/iteration-221-*.
Full pnpm check passes Windows bundled 567 / 48 platform skips and Linux
561 / 54 (615 cases each), zero failures. The concurrent Linux soak is still
running separately; no 30-minute acceptance is inferred here.
Manual Windows bundled CI now invokes generation after packaging; actual GitHub
execution remains unrun. Production/IPC/native code is unchanged by this block.
Windows Node/application distribution, MSI/EXE integration, clean machine and
remaining release/security/license/platform gates remain open.
