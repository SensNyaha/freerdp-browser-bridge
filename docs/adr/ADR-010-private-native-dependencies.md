# ADR-010: Private native dependency prefix and bundled runtime

Status: Accepted (explicit user instruction, 2026-10-08)

Build ZLIB and other native dependencies from a pinned vcpkg registry into the project's
ignored .deps/installed/<triplet> prefix. Do not perform vcpkg global integration or install
libraries into system directories. Keep downloads, binary cache and build trees project-local.

The runtime distribution must carry its own ZLIB/OpenSSL/FreeRDP/WinPR and any enabled channel
dependencies. Windows DLLs live beside the worker. Linux shared objects live in a private lib
directory with relative loader paths. OS CRT/kernel libraries remain platform prerequisites.

Packaging uses a common native staging layout for CPack ZIP/TGZ, WiX MSI, NSIS EXE, DEB and RPM
generators. A configured generator is not evidence that an installer was built or tested.
Dependency licenses, pinned registry metadata and actual feature inventory ship with the bundle.
MSI/EXE/DEB/RPM integration and clean-machine tests remain explicit acceptance tasks.
