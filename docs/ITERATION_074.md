# Iteration 74 — stable Windows native build PATH

Date: 2026-10-10. Implements Stage 0 reproducible-build discipline following
the private Opus provider `6cc179b`.

Two separate caller processes exposed different inherited PATH hashes, and
vcpkg's tracked environment caused full dependency rebuilds even when source,
compiler and SDK were unchanged. `native-build.ps1` now discovers Git and passes
its directory to the static `msvc-env.cmd` setup. That disposable cmd shell starts
from Git plus standard Windows executable directories, then initializes SDK,
C++ and CMake through the existing explicit batch extensions. Node remains an
explicit local executable invocation. Standalone setup without the optional
second argument preserves its prior behavior.

PATH still participates in vcpkg ABI keys. Compiler tracking, INCLUDE/LIB/SDK
tracking, pin verification, antivirus policy and the no-IEX setup are unchanged.
No machine/user PATH is persisted. This also selects the installed Visual Studio
CMake through its extension instead of an arbitrary earlier caller PATH entry;
the existing native build caches reconfigured and rebuilt successfully.

The real Windows toolchain fixture now performs two SDK/STL compilations with
different transient caller directories, runs both binaries and Git/CMake, and
checks equal initialized PATH hashes plus preserved VCPKG_ROOT. It passes **1/1**.
Full `pnpm check` passes **213/213** for this block. A first dependency build under
the new environment completes in about **11 minutes**; the immediate repeated
helper and another separate tool invocation both report all packages already
installed, with no package rebuild. Their reported vcpkg installation-operation
times are 666 µs / 1.15 ms; these exclude helper/compiler-detection startup.
The installed Opus ABI record now matches the current version-patch hash.

Bundled CTest passes **15/15**, foundation **6/6**, private bundle relocation
**1/1**, and CLI/HELLO/build REST comparison **1/1** for each binary directory.
Helpers return **0** through explicit exit-code propagation. MSVC warnings-as-errors
and static analysis, format/lint and `git diff --check` pass. New preparatory Opus
payload files are separate next-block work and are not part of this commit or
these native suites.

This verifies repeat builds on the current Windows machine, not fresh-checkout,
Linux, sanitizer or installer acceptance. [Build helper contract](DEVELOPMENT.md).
