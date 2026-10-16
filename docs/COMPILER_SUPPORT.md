# Native compiler support

User decision, 2026-10-16: prefer GCC 8 if feasible, otherwise GCC 12. The bridge
retains its required C++20 implementation and sets **GCC 12 as the GNU minimum**.
The complete private dependency → FreeRDP 3.32.1 → worker/addon chain already
builds and passes linked CTest/full Node checks with GCC 12.2 on local Linux.
[Source-chain evidence](ITERATION_254.md), [clean source export](ITERATION_260.md).

GCC 8 with its stock libstdc++ cannot compile the current source: production
IPC/parser APIs use `std::span`, connection supervision uses `std::jthread` /
`std::stop_token`, and public addin adaptation uses `std::bit_cast`. These are
implemented after GCC 8 in the [official libstdc++ C++20 implementation table](https://gcc.gnu.org/onlinedocs/libstdc++/manual/status.html#status.iso.2020).
This is an incompatibility assessment from actual source requirements and the
upstream library table, not a claimed execution of a GCC 8 build. A separate
backport/replacement-library effort would require new lifetime/bounds/ABI and
platform validation; it is not part of the selected GCC 12 fallback.

CMake checks the GNU version before dependency/test setup and compiles a probe
for the required C++20 library facilities. This also detects an incompatible
compiler/standard-library combination. MSVC and Clang remain supported within
their independently tested scopes. The compiler-policy CTest tests the version
boundary as policy; it does not substitute for an actual compiler build.

With this policy enabled, a new source-only GNU 12.2 linked consumer passes
CTest 31/31, process/TLS 40/40 and full Node 657 passed / 58 platform skips / 715.
MSVC passes the actual library probe and foundation CTest 15/15. CI now includes
an explicit GCC 12 foundation entry, prepared but not run.
[Current policy/build evidence](ITERATION_263.md).

Ubuntu GCC 12.4 also passes the standard PIE ASan/UBSan foundation: actual
library probe, native CTest 16/16 and 100 default-option empty-program launches.
Its distribution sanitizer runtimes are 14.2; the historical Bookworm/GCC 12.2
PIE startup failures remain retained as a separate environment result. Eleven
Clang 18 PIE sanitizer fuzz smokes pass in the same restricted Ubuntu fixture.
[Sanitizer/toolchain evidence](ITERATION_264.md).

GCC 12 is a build-toolchain baseline. It is separate from the minimum glibc,
libstdc++ symbol versions and distribution runtime closure of a particular
binary archive. Installing a prebuilt npm/native artifact does not by itself
require a compiler; development builds and future local addon builds do.
