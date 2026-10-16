# Iteration 243 — isolated Linux native foundation source build

2026-10-16. Continues Stage 0's clean native build requirement after `00a24ff`.
This accepts the project-native foundation slice on the current local Linux
environment; it does not rebuild FreeRDP/dependencies or complete the distro/CI
matrix.

`test-native-clean-build.mjs` creates a unique ignored fixture containing only
the root CMake definition, native source tree and C++ test fixtures. It refuses
source links/special files, excessive tree depth/count and excessive file/total
size. No existing CMake cache, object, binary, SDK, node_modules, Git directory
or lab input is copied. Before configuration the fixture has only its source
directory. Copied file paths/lengths/bytes feed a SHA-256 receipt; source and
fixture bytes are rechecked after all commands.

The helper requires Linux/Node 24 and explicit already prepared Catch2 3.8.1
source. CMake uses a new Ninja/Debug output tree, FreeRDP and Node addon OFF,
testing ON and disconnected FetchContent. Catch2 compiles into the new output;
its source is reused, not downloaded or independently revalidated here. Ordinary
GCC warnings-as-errors remain enabled; no sanitizer/PIE workaround is introduced.
CTest inventory must contain at least 15 cases, including clipboard boundaries,
IPC, Linux stream and seqpacket worker ownership. CTest refuses an empty test
set. CLI must report lifecycle=true, RDP/connectCore=false, FreeRDP=null,
target FreeRDP 3.32.1 and framed-pipes.

Existing Node clipboard-envelope and worker lifecycle tests then target this new
executable and compiled fake fixtures. They use the repository's existing built
JS; no clean Node build is claimed by this helper. That separate slice retains
Iteration 213's scope. The fresh native path passes full 16 MiB framed command
delivery, heartbeat, CLI/HELLO agreement, 100 sequential workers, parent death,
malformed input, finite output/flood cleanup and private-directory retirement.

An initial scratch helper compiled and passed CTest 15/15, then used its fixture
directory as Node's cwd. The parent-death JS fixture could not be resolved and
timed out: 14 passed, one cancelled and one absent-primary skip. This was a
helper working-directory error, not a native acceptance pass. The corrected
scratch repeat and final checked-in helper each create another empty build tree
and pass CTest 15/15 plus Node 15 passed / one absent-primary skip / 16 cases.
The failed and repeated logs remain in `build/iteration-243-linux-clean-native*`.

Final receipt: 328 files / 1,851,578 bytes, source SHA-256
`b1bb08d242a533d21c8a0b29aae62c4cd3110254e68429c911864f998e446e9f`,
fixture `build/native-clean-bnEBlJ`, nativeTests=15, sourceUnchanged=true,
prebuiltOutput=false, foundation=true and freerdpRebuilt=false. The receipt is
also retained in the fixture. No RDP connection/device or OS clipboard access
occurs. The network-none SDK container remains unchanged outside its new ignored
fixture/helper. An independent read-only hash over the same Windows workspace
source paths agrees byte-for-byte (328 files / 1,851,578 bytes / same SHA-256),
so the Linux source snapshot is current rather than an older container copy.
Full Linux bundled `pnpm check` passes 651 with 57 skips / 708 cases and zero
failures in `build/iteration-243-linux-bundled-check.log`. Windows helper
lint/format checks pass; unchanged Windows bundled runtime baseline remains
Iteration 242 (656 passed / 49 skips), not a new Windows source-build claim.

Fresh upstream dependency/FreeRDP builds, linked project-native source build,
other distros, Windows source-copy build, actual GitHub CI and standard PIE
sanitizer acceptance remain open. Stage 0 stays IN PROGRESS.
