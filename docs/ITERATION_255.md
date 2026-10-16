# Iteration 255 — Windows private dependencies rebuilt from cached source

2026-10-16. Implements the local Windows part of Stage 0 / BUILD_AND_DEPLOY §2
after the Linux source rebuild in iteration 252. The existing MSVC/ASCII alias
wrapper now exposes `clean-dependencies`; the alias stays alive through the
entire source build. Each invocation uses new installed/work/package trees,
disabled binary caches, `--no-downloads`, concurrency two and a finite one-hour
command budget. Compiler, vcpkg tools and cached source archives remain inputs.
The Windows host network is not globally isolated.

The first fixture, `build/dependencies-source-clean-NyNgxb`, failed while
building libusb (11/14). MSBuild FileTracker initialization reported
`UnauthorizedAccessException`, `E_ACCESSDENIED` / `0x80070005`, in
`NativeMethods.GetLongFilePath`. This is retained in
`build/iteration-255-windows-source-dependencies.log` and the fixture's
`work/buildtrees/libusb/build-x64-windows-bundled-rel-out.log`. Its exact denied
system path was not established. No port patch, FileTracker disabling or
security setting change was used.

A separately authorized run with system access created
`build/dependencies-source-clean-MypULr` and completed all 14 requested packages
in 15 minutes. The six runtime roots are ZLIB 1.3.2, OpenSSL 3.6.5, libusb
1.0.30, libjpeg-turbo 3.2.0, OpenH264 2.6.0 and Opus 1.6.1. The clean vcpkg pin
`2750401336fb7c95f6619657a46a7e798661341c` is verified before and after.
The final receipt has 14 installed status records and binds:

| Input/receipt | SHA-256 |
| --- | --- |
| recipes | `254706cc81dcf4c9a9df488fe6a50c4731c0b8684324a5d456d3d11fc5904791` |
| installed status | `8e561aded165647e7932d7a4a365bbab4856c8e3c002c35cb376eb73e87632f5` |
| dependency receipt | `0d47332311bd1050e66d3f72a7d508143b6cf0c50f53af46893ed282eb132d83` |

Repeat log: `build/iteration-255-windows-source-dependencies-repeat.log`.
This accepts this local cached-source dependency rebuild. It does not establish
a clean Windows machine, distro/CI execution, final deployment or RDP/device
acceptance. The ordinary installed dependency prefix remains separate.
