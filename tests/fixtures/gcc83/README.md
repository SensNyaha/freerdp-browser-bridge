# Exact GCC 8.3 foundation container

The dedicated [workflow](../../../.github/workflows/gcc83.yml) uses the same
official GCC image digest as the compiler-port acceptance. It asserts the
actual compiler version is 8.3.0, then configures the unchanged C++20 foundation
in Release mode with warnings as errors. It does not use the host compiler,
SDK, FreeRDP libraries, Node installation or workspace dependencies.

The preparation step exports only tracked `CMakeLists.txt`, `CMakePresets.json`,
`native` and `tests` with `git archive`. Catch2 3.8.1 is checked out at commit
`2b60af89e23d28eefc081bc930831ee9d45ea58b`. CMake 3.31.6 and Ninja 1.11.1.4
Linux wheels have fixed download URLs and SHA-256 checks before extraction.
The Docker context excludes wheel archives and the Catch2 Git directory;
no ignored local credentials or SDK/cache directories are copied.

After these public inputs and the pinned compiler image are fetched, Docker
build and CTest run with networking disabled. The test container has explicit
CPU, memory and PID limits, no capabilities, no-new-privileges and no host
mounts. CTest fails if there are no tests and bounds each test to 60 seconds.
The normal modern compiler/Windows and sanitizer jobs remain separate.

To repeat locally, prepare `build/gcc83-context` with the workflow's public-input
steps, then run from the project root:

```sh
docker build --platform linux/amd64 --network none -t bridge-gcc83-foundation:local build/gcc83-context
docker run --rm --init --platform linux/amd64 --network none --cpus 2 --memory 4g --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges bridge-gcc83-foundation:local
```

This is a foundation compiler regression, not linked FreeRDP, real RDP,
installed Astra/RED OS or audible-output acceptance. Those named checks retain
their separate [source-chain](../../../docs/history/iterations/401-450.md#iteration-411) and
[actual Linux RDP](../../../docs/history/iterations/401-450.md#iteration-412) evidence.
