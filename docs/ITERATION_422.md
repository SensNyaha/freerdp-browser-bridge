# Iteration 422 — 0.2.1 release preparation

2026-10-22, `release/0.2.1`. The accepted Fastify implementation merges into
shared master at `bd9f6d3`, after `03aefc6`, `12cb6f0` and `b836b36`.
[Implementation checks](ITERATION_420.md), [installed-package actual RDP](ITERATION_421.md).

All six product package manifests and CMake now declare 0.2.1. The explicit
version guard passes with six manifests. FreeRDP 3.32.1 and its pinned commit,
dependency versions, native language mode and Release settings are unchanged.
Existing 0.2.0/0.1.0 tags and artifact bytes remain immutable.

This is preparation, not an accepted tag or npm publication. Fresh clean linked
MSVC/GCC 8.3 native consumers, corresponding native npm artifacts, external
consumer/runtime/RDP checks and final full regressions are required before
release merge/tag. Evidence is appended only after those checks finish.

The supported install path includes the platform native npm package explicitly
alongside Fastify. No compiler or network install script is required at the
consumer. Automatic optional package installation remains a future convenience.
Version-stamped artifacts must match the JS product version exactly; development
0.2.0 tarballs are not relabeled as 0.2.1.
