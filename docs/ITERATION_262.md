# Iteration 262 — Ubuntu standard PIE ASan/UBSan foundation

2026-10-16. Stage 0 sanitizer environment verification following the retained
Bookworm failures/non-PIE workaround in iteration 184. A new pinned Ubuntu 24.04
builder installs official distribution GCC/Clang/CMake/Ninja packages, then
extracts only the iteration 260 tracked-source archive (`5f584b4`, SHA-256
`94d3d8c584fb6563a516049d7076353d1ddbbdfc8453272f91a7b55109c361b4`)
and prepared public Catch2 3.8.1 source. No native SDK, FreeRDP, Node packages,
laboratory files or device is selected. Tool packages were downloaded normally;
compilation/tests use network-disabled containers.

| Tool/runtime | Actual version |
| --- | --- |
| GCC / g++ | 13.3.0-6ubuntu2~24.04.1 |
| libasan8 / libubsan1 | 14.2.0-4ubuntu2~24.04.1 |
| Clang / compiler-rt | 18.1.3-1ubuntu1 |
| CMake / Ninja | 3.28.3-1build7 / 1.11.1-2 |
| kernel | 6.6.87.2-microsoft-standard-WSL2 |

Empty `int main() { return 0; }` programs compile with default PIE and
`-fsanitize=address,undefined -fno-omit-frame-pointer`. Both GCC and Clang
successfully execute **100/100** times with default sanitizer options. Readelf
confirms ET_DYN. This contrasts with the historical failed environment but does
not prove which toolchain/runtime/environment difference caused that failure.

The unchanged standard `sanitizers` preset then configures with only offline
Catch2 source overrides, compiles under GCC 13 and passes native CTest **15/15**
with a 30-second per-test deadline. `ipc-tests` and `rdp-worker` are actual PIE
ELF executables; ldd shows both ASan and UBSan runtimes. Worker `--version` runs
and reports the honest foundation/FreeRDP-absent capability state. No `-fno-pie`,
`-no-pie`, ASAN_OPTIONS override, ASLR/sysctl change or seccomp relaxation is used.

Tests run as UID/GID 1000 with init, read-only root, network none, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB, a bounded executable build
tmpfs and separate noexec /tmp. Initial diagnostic setup attempts stopped before
sanitizer execution: Docker cp refused the read-only root, an optional sysctl
read was denied to UID 1000, and Docker's default tmpfs noexec refused the probe
binary. The final fixture explicitly enables exec only on the owned build tmpfs
and sends the diagnostic through stdin. /tmp remains noexec and other restrictions
remain in place. Build-time root read recorded mmap_rnd_bits 32; the non-root
runtime cannot read that sysctl. These setup errors are not sanitizer failures.

Builder `freerdp-bridge-ubuntu-native-check:262` has config/image identity
`34659420ab176a92780a5c4ceb7efd6fb6fac96639c3292f9a03d44b7718b4c8`.
Logs: `build/iteration-262-ubuntu-builder.log`,
`build/iteration-262-asan-layout-exec.log`,
`build/iteration-262-ubuntu-standard-pie.log`; earlier setup logs remain.
`docker/native-ubuntu-build-check.Dockerfile` retains the verified build recipe.
For execution use an executable `/work/build` tmpfs; keep the root read-only and
`/tmp` noexec. Configure with
`cmake --preset sanitizers -DFETCHCONTENT_FULLY_DISCONNECTED=ON
-DFETCHCONTENT_SOURCE_DIR_CATCH2=/catch2-src`, build with parallel two, and run
`ctest --preset sanitizers --timeout 30`.

This accepts the named local Ubuntu standard PIE native foundation component.
It is separate from Node integration in this Ubuntu image, the IPC addon,
instrumented FreeRDP/codec providers, fuzz execution and actual CI. Historical
Bookworm PIE failures remain retained. GCC 13 is this validation toolchain,
**not the project's minimum compiler**; the user-selected GNU baseline is GCC 12.
Stage 0 and broader platform/resource gates remain IN PROGRESS.
