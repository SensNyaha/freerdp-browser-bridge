# Iteration 432 — node:http 0.2.3 release preparation

2026-10-23, separate `release/0.2.3`, following accepted implementation
`6a5c432` and [its full feature checks](ITERATION_431.md).

Eight root/workspace manifests and CMake are aligned to **0.2.3**. Package
README installation examples use the matching release/runtime versions. The
explicit version and source README guards are required before the alignment
commit. FreeRDP 3.32.1 and pinned commit, dependency recipes, C++20, compiler
support, native wire/ABI contracts and Release flags are unchanged. Previous
accepted tags and artifacts remain immutable.

This is release preparation, not acceptance or publication. Fresh version-
stamped linked MSVC/GCC 8.3 native builds/CTest/lifecycle, full Node checks,
nine root-README-complete npm archives with exact integrity/source/notices,
external consumer/reinstall and actual installed-package RDP profiles remain
required before merge/tag. Registry writes and fresh registry-only consumers
remain separate, including the still-pending npm owner confirmation for 0.2.2.
