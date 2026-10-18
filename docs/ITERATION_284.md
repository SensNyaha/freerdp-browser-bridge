# Iteration 284 — experimental shared OpenSSL sanitizer runtime

2026-10-18. Continues Stage 0 / SPECIFICATION §2.2 and §3 after the separately
verified [static baseline](ITERATION_281.md), [X.509](ITERATION_282.md) and
[memory BIO](ITERATION_283.md) blocks. Uses the same exact pinned OpenSSL 3.6.5
source and existing port patches. No Release recipe/artifact, dependency pin or
production source change. No RDP, external service, device or lab credential
is used.

## Experimental profile and source ownership

Pinned `INSTALL.md` recommends `no-shared` for ASan. Iterations 281–283 retain
that recommended baseline. This additional shared Debug build is explicitly a
local experiment, not a replacement Release profile or general upstream shared
sanitizer acceptance. Pinned `Configure` permits shared ASan/UBSan without user
RPATH, and explicitly rejects the shared/sanitizer/RPATH combination. No RPATH
option, configure workaround, sanitizer suppression/preload/runtime override or
source correction is introduced.

Separate `openssl-shared-sanitizers-284` output uses GCC 12.4, Debug `-Og -g1`,
`shared no-module no-asm enable-tests enable-asan enable-ubsan -DPEDANTIC`,
existing static-engine/capieng/ec_nistp settings and nonrecovering UB checks.
All **2,092 planned library C commands**, including the build's shared/static
outputs, have both sanitizers. Module/assembly profiles remain untested here.
The actual shared ELFs have ASan/UBSan NEEDED entries and no RPATH/RUNPATH:

| Module | SHA-256 |
| --- | --- |
| libssl.so.3 | `d0f4d10422e4404f342df224f4fc6b3e06c063e1c488ebac669dd61659feeaa8` |
| libcrypto.so.3 | `d359da78c5e457d5994872f617b63ae9aa058f87a6bd1f7b4c92a1e385827cf9` |

Active sources still equal the independent exact patched reference from 281;
the prior static archive hashes remain unchanged. `apps/openssl`,
`ssl_ctx_test` and `sslbuffertest` actually link the new shared SSL/crypto;
`asn1_decode_test` links new shared crypto. Each has its own ASan/UBSan runtime.

## Upstream and runtime checks

- Focused SSL context: **1 recipe / 1 top-level test**, pass.
- Selected SSL context, memory-BIO buffers, ASN.1 decode and certificate verify:
  **4 recipes / 211 top-level tests**, pass in 24 seconds. Native nested TAP
  checks run too. No ASan/LSan/UBSan diagnostic is observed. The FIPS preparation
  remains an explicit non-FIPS skip.
- **Seven retained result files** are additionally scanned within finite file/
  count/aggregate limits, with no sanitizer diagnostic. Source/static/shared
  hash audit passes.
- A separate five-entry runtime slice contains only both `.so.3` files, their
  `.so` aliases and the license. Transfer SHA-256 is
  `6f1bf5f32712138cb68e71645df98f583a286afe85c65fe1bfad2eb7f5ccdd0d`.
  Entry set/size/path checks, safe extraction and module hash checks precede
  admission into new `openssl-shared-sdk-284` in the existing bridge fixture.
  Earlier SDKs are preserved. This is not a new Release package/portability gate.

The bridge driver projects the existing exact 31 CTest commands into a separate
loader profile. Native ELF children receive the new OpenSSL before the existing
instrumented JPEG/SPNG/ZLIB/OpenH264/Opus/FreeRDP/WinPR stack. Ordinary CTest,
compiler-policy CMake and the OpenSSL certificate-generation tool retain their
separate ordinary tool loader. Parent Node has no preload; addon stays OFF.
Focused clipboard-worker/RDPSND/AUDIN CTest passes **3/3** in 4.55 seconds.
Full native CTest passes **31/31** in 91.10 seconds. Runtime codec probes pass;
the resolved module list confirms both OpenSSL modules from the new prefix and
the existing instrumented codec origins. Full `pnpm check` passes build/lint/
format and **633 passed / 84 profile/platform skips / 717 total / zero failures**,
239.28 seconds for Node tests. Full output has no ASan/LSan/UBSan diagnostic.
The worker hash remains
`cb134e97800610715d47874e217b5e5aabdcb65e08138ab9bfe5b906e3168188`.
This reuses the existing exported bridge workspace/binaries, not a fresh bridge
source export or new Release build.

## Evidence and limits

Both fixtures retain UID1000/read-only/no-network/init/cap-drop/
no-new-privileges and finite CPU/memory/tmpfs bounds. Host `build/` retains
`iteration-284-shared.log`, `iteration-284-audit.log`,
`iteration-284-linked.log`, runtime slice and exported receipts/results.
Build runner SHA-256:
`d28ff0ce7797628db29c16dfcb23b19d3d7d33f23dd11cb0bb1e0a883930c82c`.
Linked runner SHA-256:
`416d5549a091679564c2f5464f452681206e2ce4a6430477c9df6ea109c19a03`.
Source/module/result audit runner SHA-256:
`08e2eee094eef65270d9236de9bb1c511f9f5a3b7884b85c472ff90b960222b5`.
Build, audit and linked JSON receipts and focused/selected upstream results are
exported to host `build/`. The original iteration 275 UB report retains its
recorded SHA-256.

This is a named experimental C-only/no-module local runtime slice. Full
production OpenSSL features, assembly/modules, all upstream algorithms/tests,
other dependencies/addon, platform/CI, actual RDP and sustained resource gates
remain open. Stage 0 remains IN PROGRESS and prior diagnostics are preserved.
