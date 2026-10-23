# Iteration 273 — bundled workflow selects the GCC 12 baseline

2026-10-16. Implements the user's GCC 12 fallback and BUILD_AND_DEPLOY §1 /
Stage 0 reproducible toolchain selection. Production/native code is unchanged.

The manual bundled workflow previously installed build-essential and used the
runner's default compiler. It now installs g++-12 and writes `CC=gcc-12` /
`CXX=g++-12` to the GitHub environment before all dependency/SDK/worker builds.
The selected compiler versions are printed. Binary-cache keys distinguish the
Linux GCC 12 and Windows MSVC profiles in addition to OS and recipe identity.
Windows still uses its selected MSVC developer environment. vcpkg's own ABI
tracking remains in effect; no source/version or runtime policy changes.

A fresh local CMake project in the restricted Ubuntu verifier uses only those
CC/CXX environment selections, enables C and C++, asserts actual versions are
12.x and invokes the repository's C++20 library probe. It passes with GCC/G++
12.4 and required span/bit_cast/jthread support. This verifies CMake environment
selection; it does not simulate GitHub environment-file processing or execute
the whole workflow. Actual GCC 12 dependency/SDK/consumer builds are separately
recorded in iterations 254, 263 and 272.

Prettier for the changed YAML and git whitespace checks pass. No new test
mirroring the static workflow is added. Native/Node implementation and inputs
are unchanged from the accepted suites in iterations 270 and 272.

Evidence: `build/iteration-273-compiler-env.log` and bounded local probe
`build/iteration-273-compiler-env.py`. Actual GitHub Actions execution remains
open; this prepared recipe is not a CI pass and does not close Stage 0.
