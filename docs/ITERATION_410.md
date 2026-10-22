# Iteration 410 — GCC 8.3 linked Astra container and Windows control

Date: 2026-10-22. Branch `feature/astra17-gcc83`, implementation checkpoint
`8e6263d`. Requirement: the user's GCC 8.3.0/Astra Linux 1.7.5 port and mandatory
RED OS 7.3/GCC 11 support, with **0.2.0** as the next verified release target.
The user's latest preference is container-based compiler/runtime testing without
deploying a full VM. The earlier ISO-kernel foundation result remains historical
evidence; this block starts no VM and installs no OS or software on an external host.

## Separate Astra linked runtime

The compiler fixture retains the exact pinned GCC 8.3.0 image and source-built
dependency/SDK/consumer receipts from [409](ITERATION_409.md). A separate image
starts from `scratch`, using the checked Astra ISO runtime packages, official
Node 24.21.0, prepared CMake and the exact linked GCC 8.3 binaries. It contains
the bridge's declared private DSOs, public JS test inputs and Linux Node modules.
No compiler-host glibc/libstdc++ is substituted for the ISO runtime; no host mounts,
session credentials or private lab configuration are copied.

The actual runtime identifies Astra **1.7.5**, glibc
`2.28-10+deb10u2+ci202309131632+astra7`, compiled with GCC 8.3.0. The loader selects
the ISO's libc/libstdc++/libgcc and the private FreeRDP/codec/Kerberos/ICU DSOs.
The IPC addon loads only its system runtime dependencies, without FreeRDP/WinPR.

The runtime/codecs probe passes Zlib, JPEG, OpenH264, FreeRDP AVC420 and Opus
roundtrips, creates a private eudev context and lists all 22 expected channels.
Native CTest passes **37/37**, zero failures, **15.43 s**. The final Node
packet-addon/lifecycle/clipboard/process/TLS fixture suite passes **54/54**,
zero skips/failures, **24.70 s**, followed by `ASTRA_LINKED_RUNTIME_ACCEPTED`
and container exit 0. Test deadlines and bridge assertions remain unchanged.

The first minimal runtime also passes CTest 37/37 and 41 Node checks; 13 TLS
checks fail during fixture certificate creation because the image lacks the
system `openssl` CLI. The failed log is retained. Two additional packages from
the **same checked ISO index**, unpacked without installation scripts, supply
the matching system CLI for dummy loopback certificates:

| ISO package | Version | Bytes | SHA-256 |
| --- | --- | --- | --- |
| libssl1.1 | 1.1.1n-0+deb11u4-deb11u5-astra3 | 1,553,760 | `ac81cff02f8dbf4df3851e2c4afd446bd1e7c456c95092a8d1b83cb659e488d3` |
| openssl | 1.1.1n-0+deb11u4-deb11u5-astra3 | 841,952 | `ef9aecf8e70d93aa66ea256dac6eef1fe7b443eb157f13043970a2ee024fb96c` |

The system CLI reports OpenSSL 1.1.1n under an empty environment; the worker
continues using its source-built private OpenSSL 3.6.5. No certificate trust
or TLS test is weakened. The final container has network `none`, 2 CPUs,
2 GiB, 256 PIDs, all capabilities dropped and no-new-privileges.

| Bound input/output | SHA-256 |
| --- | --- |
| Original Astra ISO | `91236b4f3373773681da7d89982053ee76bcaba41467178f26a7678c0abaf7ed` |
| ISO package index | `ee767eb5f99664a2cb40c92ec17ea6d9be13dd1326164c0f3170ae7cfac5ec71` |
| Initial runtime tar, 21,334 entries / 834,500,708 data bytes | `5a94c0ee70b33e5d69e10496fb3116fdf5cce695c8022b9f524af1fcd2acb199` |
| Matching CLI package runtime layer | `6e2398c6bc85fb520803db6b14e192d59e15050249a7dc81d455392489edf1bf` |
| Final local image ID | `5e509143081a7ce51ea576fe836a10cb40d427100013394f00a68643d223e639` |
| Worker | `9ecbad8f155f72a4539c9ea0a8f503a0e06b8c2ed2ac910de6cd66d41385f64f` |
| IPC addon | `6fedaf4e3af30ae9b5580b7aec7fb7fbb86bbeb8071568ed69ca49b0583290d1` |

Assembly limits are 128 MiB per regular file, 1 GiB total data and 60,000
entries. The first preparation failure uses an unavailable Python 3.7 Path API;
a new owned assembly directory uses compatible APIs. This is fixture tooling,
separate from bridge source changes. The final native bytes match iteration 409.

## Windows linked source control

An initial consumer correctly refuses the old prepared SDK's absent DSP
ownership override metadata before compiling the worker. A separate clean
Release SDK rebuild uses the pinned FreeRDP source and the existing checked DSP
correction, reusing prepared Windows private dependencies. The source SDK
probe passes **1/1**, verifies three private module origins and refuses a foreign
prefix. Existing MVP SDK/build outputs remain unchanged.

A fresh Windows Release consumer builds with MSVC **19.44.35228.0**,
CMake **3.31.6-msvc6**, Ninja and Catch2 3.8.1. Native CTest passes **36/36**, 18.29 s;
focused real-worker Node process/protocol checks pass **27 / 1 platform skip /
28 total**, zero failures. The clean receipt records unchanged source,
no prebuilt consumer output and the exact same 363 native files / 2,021,386
bytes / source hash as the GCC 8.3 linked receipt.

| Windows bound input/output | SHA-256 |
| --- | --- |
| Native source | `29297ea4fb985ba18e59ad553c91c13b3c012f47bda1776978a1941dd9aba138` |
| New SDK receipt | `d6babaca7fa51c0456ba0a996515429e779d98bfb538da92068976c3a4439096` |
| New consumer receipt | `a4a75e6c9f9bdfd831b845302425406aa22f3431786ad895fbeee940f764ce55` |
| Worker | `1409283dc4144ec8c726f52ff580b7e346b13fa92c5222e6a1162c69dbc40576` |
| Runtime-directory helper | `1d6ce47f41ae64d7daa9e8df26cf1836d20f6e44c7cf4e6c9bba76e47fa23f0e` |

The first full Node invocation incorrectly uses a `subst` working directory,
mixing logical ESM paths with pnpm's physical junction targets. It finishes
**885 passed / 15 failed / 61 skips / 961 total**; Unicode refusals and
typed-error assertions fail. A direct diagnostic verifies that logical/physical imports
have different `SessionError` constructors. Both affected tests pass **2/2**
from the physical project path, without changing product code or assertions.
The existing `nodeTestDirectories` helper already documents this Windows
constraint. Full regression must also use the physical project/binary paths.
The complete physical-path repeat passes **900 / 61 skips / 961 total**,
zero failures, **381.66 s** for the test suite. Version consistency,
TypeScript build, lint and formatting also pass, including the original
Unicode/typed-error assertions and isolated headless Edge fixtures.
No product or test assertion changes are needed.

## RED OS linked consumer and loader gap

The authorized actual RED OS 7.3 host compiles the committed `8e6263d` source
with stock GCC **11.4.1**, CMake 3.25.1 and its existing private Node 24 tools.
All **415** build steps complete, including the IPC addon. It reuses the public
GCC 8.3-built private SDK/dependency inputs in a new user-owned test directory;
no system package or host service is installed or changed.

Source archive SHA-256 is
`1e9d37cf32b2b13efbbab08e88fe372a61d6d8205f3607a2e9b0ac9fc4a1cc85`,
SDK input archive SHA-256 is
`33a887b000233eea3c51ac4206454435df7a7a83f67e549d37b1179754ea7b4c`.
The archive contains 1,050 entries / 79,187,970 declared data bytes, with
checked extraction paths, relative symlinks and bounds. Existing verified
Catch2 3.8.1 source is reused.

CTest passes **25/37** and fails **12/37**, 6.88 s: the Debian-built private
`libcups.so.2` imports `libcrypt.so.1`, absent on this RED OS host. Linked test
executables fail at loading; the packet-worker test also observes worker
exit 127. ELF metadata identifies the CUPS client DSO as the direct importer.
This is a retained portability failure, not accepted RED OS product behavior.
The source compiler result does not close its runtime gate. No incompatible
SONAME symlink, foreign system-libc substitution, disabled CUPS capability or
weakened loader/test check is applied.

The exact pinned CUPS source adds `-lcrypt` through global
`AC_SEARCH_LIBS([crypt], [crypt])`; the shared client links the resulting `LIBS`.
The built client DSO has no undefined crypt symbols. A client-only as-needed
link is the next source-level correction to verify, retaining public APIs and
printing support. No corrected CUPS/RED OS runtime result is claimed yet.

## Evidence and remaining gates

Ignored local evidence includes `build/iteration-410-astra-linked-prepare2.log`,
`iteration-410-astra-linked-image2.log`, `iteration-410-astra-linked-check.log`
and `iteration-410-astra-linked-check2.log`, the ISO CLI package receipt,
`iteration-410-windows-sdk.log`, `iteration-410-windows-linked.log`,
`iteration-410-windows-linked2.log`, `iteration-410-windows-node.log`,
`iteration-410-windows-node2.log`, `iteration-410-windows-unicode-physical.log`
and `iteration-410-redos73-linked.log`. The tracked implementation remains
in the compiler feature branch; the local fixture outputs are not release inputs.

The Astra result proves the linked library/runtime profile on the Docker host
kernel. Installed-OS/security profiles and actual Astra-kernel linked execution
are separate. Mandatory RED OS linked runtime and real RDP desktop checks
remain open. No Stage 0/platform checkbox,
shared merge or 0.2.0 release is accepted by these container results alone.
