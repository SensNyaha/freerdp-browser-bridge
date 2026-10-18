# Iteration 281 — local OpenSSL static sanitizer cases

2026-10-18. Continues Stage 0 / SPECIFICATION §2.2 and §3 after iteration 280.
The initial tracked tree was clean. This is an independent pinned OpenSSL 3.6.5
Debug C-only static build and selected upstream ASN.1/X.509/BIO/buffer tests.
No production code, dependency pin, Release artifact or bridge runtime changes.
No RDP, external service, physical device or lab credential is used.

## Source and build

Cached `openssl-openssl-openssl-3.6.5.tar.gz` matches the existing port SHA-512:

```text
40f0b346a9a5cf4cb37f1ecebdc74750c39a95783710061bfac58964883b0831543ecee0aee9f747ea093781b13c58a543b0b935d222519e3cb19648d77a0276
```

All ten existing vcpkg patches are applied to a separate extracted copy with
zero fuzz; recorded line offsets are retained. A second independent extraction
and replay proves the complete patched file contents. Only five port files
differ from the archive: `Configurations/15-android.conf`, the Unix/Windows
Makefile templates, `exporters/cmake/OpenSSLConfig.cmake.in` and
`tools/c_rehash.in`. No C/header/test recipe source changes.

The existing container had little free tmpfs space, so a second container uses
the same prepared Ubuntu/GCC12 image without modifying prior outputs. It keeps
UID1000, read-only root, no network, init, dropped capabilities,
no-new-privileges, two CPUs / 4 GiB, a 2 GiB executable build tmpfs and 128 MiB
noexec temporary space. No host device or credential mount is added.

Pinned `INSTALL.md` recommends `no-shared` with `enable-asan`, and PEDANTIC with
`enable-ubsan`. This separate profile follows those recommendations:
`linux-x86_64 --debug no-shared no-module no-asm enable-tests enable-asan
enable-ubsan -DPEDANTIC`, plus existing static-engine/capieng/ec_nistp options,
`no-docs`, frame pointers and `-Og -g1`. All **1,163 library C commands** in the
generated dry build are checked for both sanitizer flags, PEDANTIC and
nonrecovering UB checks. The selected test ELF is standard PIE with actual
libasan/libubsan NEEDED entries and no shared libcrypto/libssl dependency.
No sanitizer preload, suppression or runtime option override is used.

| Static archive | SHA-256 |
| --- | --- |
| libcrypto.a | `5fb5673211a4736c2878e1b9b638b369793338ff860d9b78d3a381e247f79e3c` |
| libssl.a | `70f19ca5cc51cf2a9f984f02fbb9577620ad5e0d643fc3ee2bde8a108c96179b` |

## Results and retained failures

The selected targets build the native tests and local `apps/openssl`, rather
than all upstream programs. The upstream harness selects source-owned test
configuration, providers/engines and fixtures; it also retains its ordinary
`MALLOC_PERTURB_=128` default. Synthetic fixture keys/certificates are public
upstream test data, separate from any session credentials.

- First focused run executes zero native tests: generated `util/wrap.pl` is
  absent. `link-utils` alone is insufficient and its failed repeat is retained.
- Makefile inspection identifies the exact prerequisites. Building
  `link-utils util/wrap.pl util/shlib_wrap.sh` fixes harness startup without
  changing binaries, parser code or tests. Focused ASN.1 encode/decode then
  passes **2 recipes / 2 top-level recipe tests**.
- The complete selected group passes **10 recipes / 15 top-level recipe tests**:
  internal ASN.1, ASN.1 encode/decode/parse/string table, X.509 time/store,
  packet/wpacket and BIO memory ownership. Native nested TAP checks also run;
  the count of 15 is the harness-level count. No ASan/LSan/UBSan diagnostic is
  observed in these successful runs. The FIPS-only preparation recipe is
  skipped because this is not a FIPS profile.
- Initial post-test audit refuses three unlisted `.orig` backups produced by
  patch offsets. Independent exact patch replay proves each backup matches an
  original or intermediate port-patch state; all are preserved. Every active
  source file equals the independent patched reference. Both archive hashes
  remain unchanged after testing. Final source/result audit passes.

This accepts only the named local static cases. It does not establish shared
OpenSSL selection in the bridge, all algorithms/TLS, the full upstream suite,
assembly, long fuzzing, platform/CI or connected RDP acceptance. No bridge code
or loader changes, so the native 31/31 and Node 633 / 84 skips from iteration
280 remain separate evidence; they are not rerun or claimed as a new profile.

## Evidence

Host `build/` retains `iteration-281-configure.log`, `iteration-281-tests.log`,
`iteration-281-tests-repeat.log`, `iteration-281-tests-final.log` and
`iteration-281-audit.log`, plus exported build/test JSON receipts and all four
focused/selected `.txt` results. The original iteration 275 diagnostic remains
untouched. Local runner SHA-256 values:

- Configure: `240d2e2e63c81fd1fe90a228daf5ec6c1e7fb39d81bbcbfcc036f9046a12f759`.
- Final tests: `5a3557049784f90c33d045efe238ae16ea2db5f5dd9c4134a04e0816c9b7e874`.
- Final audit: `a1a1d6adfdfed7ba2d3452f82bc210da8f0a3e31404ee210c4e2e09e4ec1adda`.

Stage 0 remains IN PROGRESS, including the retained OpenH264 API timeout and
remaining dependency/addon/build/platform acceptance.
