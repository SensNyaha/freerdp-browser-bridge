# Iteration 263 — explicit GCC 12 baseline and C++20 library admission

2026-10-16. Implements the user's compiler requirement: GCC 8 if feasible,
otherwise at least GCC 12. The current C++20 source requires facilities absent
from stock GCC 8/libstdc++; [the compatibility assessment](COMPILER_SUPPORT.md)
records source examples and the authoritative upstream library table. No GCC 8
execution or compatibility port is claimed. The selected fallback is GCC 12.

CMake refuses GNU versions below 12 before dependency/test setup and compiles
a probe for the actual span/bit_cast/jthread library facilities. A separate
compiler-policy CTest covers rejected GNU 8.5/11.5, the accepted GNU 12 boundary,
12.2/13.3 and other compiler families. These are policy fixtures, not simulated
compiler-build acceptance. The required standard remains C++20.

The foundation CI matrix now has a separate Ubuntu GCC 12 entry alongside the
distribution default and Windows MSVC. It installs/selects g++-12 explicitly.
Formatting passes locally; the workflow is prepared, **not executed CI evidence**.
GCC 13/Clang 18 validation profiles do not increase the GNU minimum.

Actual Windows MSVC configuration passes the new C++20 library probe and
foundation CTest **15/15**, including compiler-policy tests. Log:
`build/iteration-263-windows-foundation.log`.

New Linux source-only linked consumer `build/native-clean-pX9Xo8` identifies
**GNU 12.2.0**, passes the actual C++20 library probe, compiles and passes linked
CTest **31/31**, process/TLS Node **40/40** and full pnpm check **657 passed /
58 platform skips / 715**, zero failures. Logs:
`build/iteration-263-gcc12-source-consumer.log`,
`build/iteration-263-gcc12-full-check.log`. It consumes the same checked
source-rebuilt private dependencies/SDK as iteration 254. Input source hash is
`6006c5a835210a2e9e8e977e8663be67d430094c83dd201c8e14b9aa82eeb83d`.
The worker/addon/pairing bytes remain exactly those in iteration 258.

One earlier Docker launch was not executed because the approval-review service
hit its usage window. After its stated reset time, the normal approval path
accepted the command and the actual build/checks above completed. No access
check or compiler/sanitizer requirement was bypassed.

This accepts the named local GNU 12 build baseline and explicit configuration
policy. Runtime glibc/libstdc++ distribution closure, sanitizer environment,
other compiler/toolchain profiles, complete CI and RDP/device acceptance remain
separate. Stage 0 stays IN PROGRESS.
