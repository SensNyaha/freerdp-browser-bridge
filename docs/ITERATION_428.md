# Iteration 428 — NestJS 0.2.2 release preparation

2026-10-22, separate `release/0.2.2`, following accepted implementation
`a8afefb` and [its feature checks](ITERATION_427.md).

Seven root/workspace manifests and CMake are aligned to **0.2.2**. The explicit
version guard passes for all seven manifests. Package README installation
examples are updated for the candidate release. FreeRDP 3.32.1 at pinned
`bf217a504e54cc719880c228e82353382cd7d4fa`, dependency pins, C++20, compiler
support, wire contracts and Release flags remain unchanged. Prior tags and
published archives remain immutable.

This is preparation, not acceptance or publication. Fresh version-stamped
linked MSVC/GCC 8.3 builds, CTest/lifecycle, full checks, all eight npm archives
with root README and native source/notices, exact external consumer/RDP gates
and integrity audits remain required. Only after those checks pass may this
branch merge and an immutable v0.2.2 tag be created. npm write acceptance and
public registry/consumer verification are separate subsequent steps.
