# Iteration 217 — known-password artifact gate and corrected runtime refresh

2026-10-15. Implements the current Stage 10 secret-scanning regression slice and
repackages the logger correction from c1cc41a. The local audit reads only the
authorized Git-ignored lab password file, with an 8 KiB bound and exact canonical
path check. It compares UTF8/UTF16LE bytes against streamed decompressed native,
production Node and application-SBOM archives plus the final image SPDX. It
does not extract any archive to the filesystem. Credentials never enter argv,
environment or the resulting receipt; only paths/hashes/byte counts are emitted.
Mutable owned password/scratch buffers are wiped. Immutable parsed JavaScript
strings and stream-internal copies do not have a guaranteed overwrite.

The stream matcher owns at most 16 patterns of 4..8,192 bytes, one 64 KiB input
chunk and overlap shorter than the longest pattern. Default read budget is
512 MiB. Archive subprocesses have a 120-second deadline and a 16 KiB discarded
stderr budget. Refusal/match errors contain no data. Source iteration and the
tar child are joined on failure; compressed file hashes are checked before and
after processing. Fixed artifact paths must resolve inside build. The success
receipt is removed before starting a new audit.

Four pure tests verify all split positions for UTF8/UTF16LE, nonmatching binary
accounting, chunk/pattern/total bounds and generator retirement on a match.
The complete unit suite passes Windows 351 / two platform skips and Linux
353 / zero skips (353 cases each). Whole-repository ESLint and format checks
pass. Current API full-check evidence remains Iteration 216; no native code
has changed since its recorded linked CTest baseline.
The first actual local run was denied file access by the workspace sandbox;
the explicitly authorized read succeeds after normal escalation review. The
same security checks remain in place. No bypass or extra credential copy is
introduced. Actual final receipt passes on these exact inputs:

- native archive ffeb66a24b4c08221dc776d13cc30e9c54e558bd06188fce4a50ac58fb760c15,
  66,761,541 decompressed bytes;
- updated Node archive 3f7f3d9ca4751b86ace4795b9d4fe62830a1ad4b8a8389bb62ecc557733a5288,
  3,369,644 compressed / 13,694,168 decompressed bytes;
- application/native SBOM collection
  46a72bbbfc79e0fa9799408d089f8e882f51509e351156ff5622b9ca3eebb43d,
  554,736 decompressed bytes;
- image SPDX 185e127cc8a0af5ea03a8fddf1f4e0d864965efbdf0953aff7545841708e6056,
  1,294,712 bytes, 303 packages / 1,274 files / 1,152 relationships.

Updated runtime freerdp-bridge-service:217 has ID
sha256:1683e50e23570f60d965e3fee1989cc5911cc3afc6059c83e7940cd4fa43c6c0,
109,877,152 Docker-reported bytes. Digest-bound Syft verification passes with
unchanged saved-archive SHA-256 before/after scanning. The separate verification
target runs read-only/non-root UID 1000/no network/no extra capabilities and
passes API/default-auth denial, actual private primary-IPC worker lifecycle and
cleanup. Production runtime does not contain the verification identity fixture.
No remote RDP/device or installer/fresh native build acceptance is added.

Logs and scalar receipts are under build/iteration-217-* and build/packages.
This gate checks known local password values and the listed Linux artifacts,
not arbitrary unknown credentials, encoded/encrypted variants, every historical
artifact or a Windows-native archive. Existing random canary API/error/metrics
snapshots cover the current password/gateway/token diagnostics independently.
Broader release and runtime resource/platform/device gates remain open.
