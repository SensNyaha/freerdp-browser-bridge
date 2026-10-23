# Iteration 247 — isolated Linux FreeRDP source rebuild and runtime identity

2026-10-16. Continues Stage 0 after `582c982`, implementing the pinned shared
library build requirement in BUILD_AND_DEPLOY §2. The ordinary build remains
available. `node scripts/build-freerdp.mjs --clean-local` verifies the existing
clean pinned Git checkout, clones it locally with no hardlinks, checks out exact
commit `bf217a504e54cc719880c228e82353382cd7d4fa`, then configures, builds and
installs into a new ignored source/output/prefix tree. No project worker or
existing SDK output is copied into this tree. No network is required.

The existing profile, private dependency path checks, Kerberos tool check,
OpenH264 selection and disabled dynamic decoder loading remain required. All
15 Linux include/library cache fields stay under the prepared private dependency
prefix. The feature inspector accepts an explicit cache/install/report triple,
so the new report reads the new SDK instead of the original installed headers.
Its default paths remain unchanged. Dependencies, compiler, CMake and vcpkg
toolchain are reused; `dependenciesRebuilt=false` is recorded explicitly.

A separate C++20 consumer compiles against the new installed public headers and
libraries with warnings as errors. It checks canonical loaded-module origins
for FreeRDP, client and WinPR, requires version 3.32.1 for both version APIs and
compares the bounded public static client-channel enumeration with the filtered
cache inventory. The positive CTest passes 1/1; a second invocation with the
dependency prefix as the expected SDK location must return exact origin-refusal
code 2. This does not create an RDP connection or enumerate/access devices.

Final fixture: `/work/build/freerdp-source-clean-vGWbFA` in the existing local
network-disabled Linux verification container. The source checkout and original
cached checkout are clean and pinned before/after. Runtime inventory has 22
channels and three private module origins. Receipt and logs remain in the
ignored build tree. `build/iteration-247-linux-clean-sdk-repeat.log` records the
complete successful clone/build/install/probe/CTest path.

| New artifact | SHA-256 |
| --- | --- |
| libfreerdp3.so.3.32.1 | `8223c14b2153850e4766ff9473348b12a88051c8e9e551b83ed2ecbf917b2813` |
| libfreerdp-client3.so.3.32.1 | `8c876790faa0a9865195b2592683ca5d0b48392aaa2fe105d5c9baeab60087da` |
| libwinpr3.so.3.32.1 | `2443cfe5341c4d32b102449b5c87d9c6dea2afdd3f0de9cd5ca51ba154b78dae` |
| filtered feature report | `bb6dd3290963488d7ae3baa4cc54d0066dd4290611b250515aceb9d13be5d76e` |

Retained failures: the first complete helper run built and installed its SDK
but failed linking the independent probe because the linker could not resolve
transitive private libraries. An explicit Linux `rpath-link` to the existing
private dependency lib directory fixes this without substituting system
libraries. The original log and failed fixture `6XIFzG` remain. A preceding
exploratory checkout/build/install `wzRraT` also remains separate.

Regression invocation errors are retained separately: the first pair used
`BRIDGE_WORKER_PATH`, which the tests do not consume, selecting the default
foundation output. Linux reports 561 passed / 145 skipped / four failures / 710.
Windows reports 617 passed / 90 skipped / 707 with zero failures; this is a
foundation regression and does not substitute for the linked profile.
The next Linux command selected the correct linked binary directory but omitted
its required private runtime library path, producing loader failures before
native handshake (472 passed / 57 skipped / 99 failures / two cancelled / 630).
These are not accepted linked regression results. With
`BRIDGE_TEST_BINARY_DIR=/work/build/native-clean-13q3HO/out` and
`LD_LIBRARY_PATH=/work/.deps/freerdp-install/lib:/work/.deps/installed/x64-linux-bundled/lib`,
full Linux check passes 653 with 57 skips / 710 and zero failures. This regression
uses Iteration 245's known project worker/SDK, separately from the new SDK probe.
The first correctly selected Windows linked run reports 656 passed / 49 skipped /
two failures / 707. Both failures are Edge PCM `page.goto` 3000 ms local-page
load timeouts before playback assertions. Their unchanged focused repeat passes
3/3; the cause remains unverified. These are retained in
`build/iteration-247-windows-linked-check.log` and
`build/iteration-247-pcm-port-focused-repeat.log`. The full linked repeat is
tracked with subsequent Windows acceptance, not asserted as a pass here.
Linux final shared probe rebuild/CTest 1/1 and exact foreign-prefix exit 2 also
pass after the Windows-only WINPR_DLL declaration and diagnostic additions.

This accepts the named local Linux FreeRDP source rebuild and installed SDK
identity smoke. Windows execution of this new mode, rebuilding all private
dependencies, a new bridge consumer against this SDK, fresh complete checkout /
distro matrix, CI, standard PIE sanitizer, packaging/installers and actual
RDP/device/resource gates remain open. Stage 0 remains IN PROGRESS.
