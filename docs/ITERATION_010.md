# Iteration 10: static Windows native toolchain initialization

Implementation commit: `d8b6d35`.

Requirement: preserve ADR-010's project-private pinned dependencies while building
from regular PowerShell without Visual Studio's dynamic vcpkg shell integration.

The reported endpoint-protection event names `iex (Get-Content vcpkg-init.cmd ...)`.
`vcvars64.bat` reaches that optional hook through `VsDevCmd` extension discovery.
The project helper now calls a static batch file: SDK/core initialization with
`-no_ext`, then only the C++ and CMake extensions. The C++ header paths are finalized
explicitly because core initialization has already run. Failures stop the command.
No antivirus configuration, exclusions, execution policy or installed VS files change.

Both target and host vcpkg overlay triplets use the prepared MSVC environment instead
of repeating full `vcvarsall` initialization. The build-tool environment allowlist
participates in package ABI hashes; compiler tracking remains enabled. This changed
the ABI cache and required rebuilding dependencies. Linux triplets are unchanged.

Verification on Windows x64 / MSVC 19.44, 2026-10-08:

- All 26 requested target/host packages installed successfully through the new helper.
- Pinned FreeRDP/WinPR 3.32.1 rebuilt and installed into the private prefix.
- Foundation CTest 2/2 and bundled CTest 4/4 passed through static initialization.
- Linked `pnpm check`: build/lint/format passed, 63/63 Node tests passed.
- New native toolchain integration fixture compiles, links and runs a program using
  Windows SDK and STL, and checks that initialization preserves a fixture vcpkg root.
- ZIP relocation without dependency PATH passed, including private DLL and codec probes.

This establishes a working build path without the reported dynamic shell hook.
It does not establish compatibility with every endpoint-protection policy or claim
inspection of Kaspersky's event history. Windows CI execution and Linux acceptance
remain pending. No RDP/device integration gate is claimed by these build tests.
