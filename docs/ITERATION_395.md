# Iteration 395 — current Linux linked build and baseline regression

2026-10-21. Addresses the remaining current Linux build/regression MVP gate,
without another dependency rebuild or sanitizer/security campaign. The fixture
uses a complete tracked-source archive of
`4fa2101fd0413439a250f26eede102585931e807`, hash
`c1c9b05d7b3d44a61d0e9534a2c82c9f5f37b81c7206fe675e07d122e5ca3439`.
It contains no prior build/dist/node_modules/.deps/.local-tests/.git. Node 24.21.0,
pnpm 10.11.0 and prepared public cache use frozen offline installation.

Inputs are explicit reused artifacts, not a newly source-rebuilt SDK chain:

- corrected pinned FreeRDP/WinPR 3.32.1 SDK from the existing
  `iteration-269-fixed-sdk.tar`, SHA-256
  `1b658a3c584fed37d1c0d2eea0e6c5db2e15dae89ce5ad4286cbb5e546539d23`;
- only `/work/.deps/installed/x64-linux-bundled` exported from local image
  `sha256:1ba7437530254e6953051eef7fc43f60ca433adc49be2f7eabefe4ff964c8627`.
  Its versions match the current pins; no old container is restarted or whole
  workspace copied. The dependency tar is 73,175,040 bytes, SHA-256
  `4f14fca110c75cb1eb9c7386d751b6257c11ca01f03eca787fbb9a5e9c6ee74a`.
  No independent source-rebuild receipt is invented for this export;
- the prepared public Node archive retains [389](ITERATION_389.md)'s hash;
- the compiler/Catch2 image is
  `sha256:e7890149c961c812ab83ecad5dd81ab7bb9281c94ceec00952a87fc7681bf89d`.

The actual fixture uses UID1000, init, read-only root, network none, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB / 256 PIDs and bounded build/tmp
tmpfs, with no host mounts or lab credentials. GCC 12.4 / CMake 3.28.3 / Ninja
compile a fresh Release linked worker and IPC-only Node addon. Original Release
configuration, artifacts and dependency versions are unchanged. CMake's existing
DSP metadata guard passes; all three FreeRDP/WinPR package paths must resolve
inside the selected SDK. The archive's exact feature report is preserved.

The first native CTest passes 35/35 in 19.05 s. Actual runtime codec/libudev
roundtrips and private module origins pass; the addon has no FreeRDP/WinPR
NEEDED edge. Full Node first reports 793 passed / 70 failed / 81 skips / 944:
the 70 failures report local TLS fixture initialization. A direct inventory
confirms that the minimal compiler image has no ordinary `openssl` CLI. That is
a fixture prerequisite failure, not strict-certificate or actual RDP acceptance.
The first full log is retained as `build/iteration-395-linux.log`; the failed
container is removed, with no security configuration change.

The repeat adds the already cached `iteration-269-tls-tool.tar`, hash
`28fe84209015b28d2618189502f8e4a3f70274b94f63023b3b701f2ba62c4e57`.
Its CLI wrapper uses its own matching public libraries and empty config only
for the test's explicitly specified localhost subject/SAN dummy certificate,
as previously verified in [275](ITERATION_275.md). It does not alter the native
worker loader, trust policy or verification. The test suite remains unchanged.
The repeat passes native CTest 35/35 in 20.25 s, focused actual-process /
synthetic-TLS clipboard checks 7/7 in 1.98 s and full Node **863 / 81 skips /
944 total**, zero failures, in 227.42 s. Prepared IPC addon readiness/capacity,
32 actual native workers, 100 sequential workers and private codec/module
origins run; these do not connect to an actual desktop.

All 1,327 archived source files and 1,018 reused native-input files remain
byte-identical. No worker PID remains in the owned container namespace.
The final receipt is exported successfully through the existing bounded
`docker exec ... cat` path, and the container is removed. Worker SHA-256 is
`e312579efea60513407f67d9d5cf2ab4d8099bf2ff51061a288460f02b790f26`;
IPC-only addon SHA-256 is
`3a496c809c876400b8bdc1ae250a3e1cf02ff85e585ca5879c1850bfb9658188`.
This closes the named current Linux linked build/baseline slice, not actual
current XRDP/browser/device, fresh dependency/SDK, distro/CI or full v1 gates.
The later Windows-only pointer preparation is outside this source snapshot;
it does not change native/production code.

Runners and retained evidence are
`build/iteration-395-host.cjs`, `iteration-395-run.py`,
`iteration-395-linux-repeat.log`, `iteration-395-receipt.json`; initial runner
copies remain separately. No production source/test is changed to hide the
first environment failure.
