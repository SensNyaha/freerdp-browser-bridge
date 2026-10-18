# Iteration 277 — pinned ZLIB sanitizer runtime profile

2026-10-18. Continues Stage 0 / SPECIFICATION §3 dependency and runtime
verification. Existing Release recipes, SDKs, worker binaries and artifacts
remain unchanged. No RDP node, credential or physical device is used.

## Source and upstream verification

The cached madler/zlib v1.3.2 archive matches the exact pinned vcpkg port SHA-512:
`16fea4df307a68cf0035858abe2fd550250618a97590e202037acd18a666f57afc10f8836cbbd472d54a0e76539d0e558cb26f059d53de52ff90634bbf4f47d4`.
Archive admission is bounded to 8 MiB, 3,000 members and 32 MiB expanded.
The separate source copy applies the same existing
`0001-no-version-script-on-ohos.patch`: two OHOS exclusions in CMake, without
changing the Linux codec implementation. Patched CMake SHA-256:
`b8744cdeb5b64675f7766f6231853a7f8a22b118383c0c8ee2439c785ffe683b`.

GCC 12.4 Debug `-Og -g1`, ASan/UBSan, frame pointers and
`-fno-sanitize-recover=undefined` instrument all 18 configured compile commands.
The shared profile matches the existing port's shared/static choice and enables
the upstream tests. Static-only coverage tests are not part of this profile.
Upstream CTest passes **14/14** in 2.08 seconds, including shared examples,
install and nested CMake consumer tests. Complete output is scanned for
ASan/LSan/UBSan diagnostics. No diagnostic marker is present.

The separate installed `libz.so.1` has actual libasan/libubsan NEEDED entries.
Its SHA-256 is
`1633486c335ac8c707ef7ddc64aea7b2ebbcae02cbe9e82e6f82c050529b9ead`.
Evidence: `build/iteration-277-zlib.log`; receipt:
`/work/build/iteration-277-zlib-receipt.json`.

## Instrumented native processes and ordinary test tools

The first integration attempt fails before native execution: ordinary CTest
itself dynamically links ZLIB. A global loader path selects instrumented ZLIB
inside this uninstrumented tool, causing the ASan runtime-order refusal. This
failure is retained in `build/iteration-277-linked.log`.

The corrected test profile separates loader ownership:

- CTest and the compiler-policy CMake process use their ordinary ZLIB profile.
- Thirty actual native CTest executables use the new ZLIB prefix first,
  followed by the instrumented OpenH264, Opus and FreeRDP/WinPR SDK prefixes.
- Parent Node is an ordinary Node 24 binary with no preload; its verified ELF
  dependency list does not dynamically require ZLIB. Native children inherit
  the instrumented loader profile.
- A private test-tools CMake launcher selects the ordinary tool loader before
  executing `/usr/bin/cmake`, including the Node configuration-policy fixtures.

The generated CTest descriptor preserves all 31 original commands and the
original working directory. JSON inventory verifies the single expected loader
declaration for each test, with exactly one ordinary compiler-policy case.
An intermediate projection guard catches the generated bracket-quoted test
name before any test; that setup failure remains in
`build/iteration-277-linked-repeat.log`. The original descriptor is unchanged.
No ASan suppression, preload or disabled runtime-order check is introduced.

Three focused H.264/GDI/GFX sets pass in 18.80 seconds. Full linked CTest passes
**31/31** in 56.12 seconds, including the ordinary compiler-policy CMake case
and thirty instrumented native executables. The complete native output has no
ASan/LSan/UBSan diagnostic markers. The runtime probe reports
`runtime=/work/build/zlib-sanitizers-sdk-277/lib/libz.so.1`, the instrumented
Opus/OpenH264/FreeRDP origins and successful codec roundtrips. Full `pnpm check`
passes **633 / 84 explicit profile/platform skips / 717**, zero failures, in
156.84 seconds. Native lifecycle, 100 sequential workers, parent-death cleanup
and local strict-TLS fixtures execute with this profile. The captured final
native/Node run has no ASan/LSan/UBSan diagnostic markers.
Evidence: `build/iteration-277-linked-final.log`.

The fixture retains UID1000, read-only root, no network, init, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB and bounded build tmpfs. Bridge
source is the same prior `2885a57` export plus iteration 269 overlays used by
iterations 272/274/275. The addon is OFF.

Final receipt: `/work/build/iteration-277-linked-receipt.json`, also exported
to `build/iteration-277-linked-receipt.json` on the host. Worker SHA-256 remains
`cb134e97800610715d47874e217b5e5aabdcb65e08138ab9bfe5b906e3168188`;
OpenH264 and Opus hashes remain those recorded in iteration 275. No worker
rebuild, application/configuration change or Release promotion is required
for this separate local runtime observation.

Local runners and SHA-256:

- `iteration-277-zlib.py`: `52cf459f1c140ec392ceb111d15b00ba17d5010822299533085d9d0b0d695680`.
- `iteration-277-linked.py`: `334fda42e029cd786b30bca63cbd0a35fa0afcb25af6a1c7fcde617f421db10f`.

Other private dependencies/addon, complete upstream/static/fuzz/platform/CI,
actual RDP/device and sustained resource acceptance remain open. This work does
not resolve the separate OpenH264 upstream API timeout in iteration 276.
