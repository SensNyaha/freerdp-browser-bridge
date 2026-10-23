# Iteration 272 — GCC 12 instrumented FreeRDP/WinPR consumer

2026-10-16. Extends Stage 0 linked sanitizer coverage after the bridge-only
profile in [iteration 269](ITERATION_269.md). No production code, dependency pin
or release artifact changes. GCC minimum remains 12.

## Exact inputs and profile

The clean pinned FreeRDP checkout at
`bf217a504e54cc719880c228e82353382cd7d4fa` is exported with git archive.
Tar SHA-256 is
`8200da0eb23dcd7b18c7a2e335437bde610a4a6d9d806020a1c0c17005084646`.
Bounded hash-checked transfer/extraction uses the existing restricted Ubuntu
fixture, without network or local lab data. The approved DSP build-copy recipe
is unchanged, canonical SHA-256
`6e0d1b10ae4e85effeaf4f2e91b15a140028d4bc7c6f46fb6f4ab5c6923847dd`.

The fixture lacked pkg-config. A separate public pkgconf/library tool tar
(`dab74bf226d2d7bb0580d59c0a81daa9d52f2469e21ce12de4d7e6ed996005ef`)
provides it under writable build tools; its child wrapper selects matching tool
libraries. The CLI's pkg-config input is restricted to the copied private
dependency prefix. Kerberos's private config tool and mandatory dependency
headers/libraries resolve inside that prefix. No system dependency substitution
or download is used.

The separate SDK uses GCC/G++ 12.4, Debug with `-Og -g1`, the pinned headless
client/channel profile and `WITH_SANITIZE_ADDRESS=ON`. C/C++ flags explicitly
include `-fsanitize=address,undefined -fno-omit-frame-pointer`, with sanitizer
link flags. All 390 compile_commands entries are checked for instrumentation;
399 build steps and install succeed. The reduced debug-info setting limits
fixture storage, not sanitizer coverage. Upstream deprecation warnings are
retained in the log; bridge-owned warnings remain errors.

The three private installed SDK libraries all have actual libasan/libubsan
NEEDED entries, not just configured flags. SHA-256 values:

- libfreerdp3.so.3: `2cb8c223ec5755e42928de9f58b62b6d44fe334625f7cc0b39a82f5aa72f6a8f`.
- libfreerdp-client3.so.3: `dc0c4658c9b8931c3641a0ae61dc857a33a46925b3535306c6afea932dac2661`.
- libwinpr3.so.3: `af809b078ef9bd1a430c95747a5076cef10cb6bfda77822af37923f357542289`.

## Consumer verification

The existing Ubuntu bridge sanitizer tree is explicitly retargeted to the new
SDK, after preceding runs finish. All three CMake SDK origins are checked, and
121 build steps succeed. Readelf confirms a standard PIE worker with ASan/UBSan
runtime dependencies; no non-PIE, ASLR/seccomp or sanitizer-options override is
used. Parent Node remains ordinary Node 24.21.0, without preload. Addon is OFF.

Verbose native CTest passes 31/31. The complete LastTest.log is also scanned for
ASan/LSan/UBSan diagnostic markers so recoverable UBSan output in a passing test
cannot be hidden by ordinary output-on-failure reporting. AUDIN passes 58 cases /
4,256 assertions, including the repeated public DSP reset ownership regression.
The independent runtime probe verifies FreeRDP 3.32.1, private module paths and
JPEG/OpenH264/FreeRDP AVC420/Opus/libudev-context roundtrips.

Full pnpm check also passes: 633 passed / 84 explicit profile/platform skips /
717 total, zero failures. Actual native lifecycle, 100 sequential workers,
parent-death cleanup and local strict-TLS fixtures run with this instrumented
SDK/worker. No sanitizer diagnostic markers appear in the captured run.
The worker SHA-256 is
`cb134e97800610715d47874e217b5e5aabdcb65e08138ab9bfe5b906e3168188`.
The fixture receipt is `/work/build/iteration-272-receipt.json`.

Execution retains UID1000, read-only root, no network, init, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB and bounded 3 GiB executable
build tmpfs; measured occupancy remains within the bound. Source is the prior
2885a57 export with the explicit iteration 269 overlays, not a new archive of
the latest bridge commit. Standalone codec/crypto/system private dependencies
remain uninstrumented Release inputs. The upstream test suite itself is not
enabled; this is the instrumented SDK exercised by bridge integration fixtures,
not full upstream test/fuzz or connected RDP/device acceptance.

Evidence: `build/iteration-272-upstream.log`,
`build/iteration-272-linked.log`, `build/iteration-272-worker-elf.log`.
Bounded local SDK runner `build/iteration-272-upstream.py` SHA-256:
`18b9432b95407e42715f65b2699a5e56f20fca099c9598e76543c4c96d964a90`.
Consumer runner `build/iteration-272-linked.py`:
`4f776b65cf336f67db047569e90992fa0875de138edf1dae979659e2beac1fca`.

Private dependency/addon instrumentation, full upstream tests/fuzz, additional
platform/distro/CI, connected RDP/device/audio and sustained resource acceptance
remain open. The separately accepted Release SDK/packages are unchanged.
