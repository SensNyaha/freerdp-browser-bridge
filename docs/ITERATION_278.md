# Iteration 278 — ZLIB static sanitizer and infcover verification

2026-10-18. Continues Stage 0 / SPECIFICATION §3 after the separate shared
[ZLIB runtime profile](ITERATION_277.md). No production code, dependency pin,
Release recipe, worker binary or shared SDK is changed. No RDP/device access
is used.

## Instrumented static build

The same exact ZLIB 1.3.2 source and existing OHOS port correction from iteration
277 are reused without mutation. Patched CMake SHA-256 stays
`b8744cdeb5b64675f7766f6231853a7f8a22b118383c0c8ee2439c785ffe683b`
before and after the independent configure/build/test run.

A new GCC 12.4 Debug output sets shared OFF, static ON and upstream testing ON.
The original coverage recipe temporarily clears `CMAKE_C_FLAGS` when declaring
`infcover`; the explicit Debug flags also contain ASan/UBSan,
`-fno-sanitize-recover=undefined` and frame pointers. Actual compile-command
inspection verifies these flags in **all 19 commands**, including `infcover.c`,
which additionally retains the upstream `-coverage` option. Its ELF has actual
libasan/libubsan NEEDED entries. Matching `gcov-12` is selected explicitly.
No sanitizer suppression or runtime option override is used.

The original `infcover.c` memory-owner fixtures track allocations/frees, enforce
allocation limits and exercise induced allocation failure and inflate recovery.
Their assertions and test data are unchanged. The gcov summary applies to
`test/infcover.c`; no whole-library branch-coverage percentage is claimed.

## Results and scope

- Focused `zlib_static_example`, `zlib_static_example64`, `zlib_coverage` and
  `zlib_coverage-summary`: **4/4 pass**.
- Complete upstream static-profile CTest, including install and nested CMake
  consumer cases: **16/16 pass** in 2.13 seconds.
- Complete output contains no ASan/LSan/UBSan diagnostic markers.
- Source CMake hash remains unchanged. Install fixtures write only below the
  new test output; the prior SDK/runtime profile is preserved.

The fixture retains UID1000, read-only root, no network, init, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB and bounded executable build
tmpfs. This is an independent static codec/test profile; actual shared-library
selection, bridge CTest 31/31 and full Node 633 / 84 skips remain the separately
verified iteration 277 scope. No new worker/application build is introduced.

Evidence: `build/iteration-278-static.log`; receipt
`/work/build/iteration-278-receipt.json`, exported to
`build/iteration-278-receipt.json` on the host. Local runner
`build/iteration-278-static.py` SHA-256:
`56f6804c438c863cc52094b08070e7b991391d78f974c8ea6069a63d8cc8afa3`.

This accepts the named local static ZLIB cases. Other private dependencies/addon,
longer fuzzing, complete upstream/platform/CI and actual RDP/device/resource
acceptance remain open, including the retained OpenH264 API timeout.
