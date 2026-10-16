# Iteration 258 — source-only native install inputs and restricted archive runtime

2026-10-16. Implements BUILD_AND_DEPLOY §2 licensing/feature packaging for the
new Stage 0 source-only consumers. A failing-before install of iteration 254's
`build/native-clean-QLgO56` reproduced a lookup of the absent copied-source
`.deps/FreeRDP/LICENSE`. Record: `build/iteration-258-install-repro.json` in
the Linux SDK fixture, and host log `build/iteration-258-install-repro-elf.log`.
The installed executable's origin-relative RPATH was already correct.

CMake now takes an explicit `BRIDGE_FREERDP_LICENSE_FILE`, retaining the normal
checkout default. The source-only helper supplies `LICENSE` from its verified
pinned SDK source. Missing license input fails configure. Packaging also
requires and installs the generated native feature JSON directly, without
depending on an unrelated copied SDK CMake cache. No runtime/wire/parser or
RPATH behavior changes.

New Linux consumer `build/native-clean-TFIAmR` passes CTest 30/30, process/TLS
40/40 and full pnpm check 656 passed / 58 platform skips / 714, zero failures.
It binds the same source-built dependency/SDK receipts as iteration 254. New
native source-input hash is
`b9faf3f3c3123dc0c89eff7bbedc3462a402b342dae0a41ff67842834f6c0c8b`.
Worker/addon/pairing hashes remain the exact values in iteration 254.

Actual install and CPack TGZ now pass under
`build/native-source-package-2T8ge5`. Installed FreeRDP license and feature JSON
match their declared inputs byte for byte. Canonical ELF closure passes 34 files
/ 274 dependency edges. The archive SHA-256 is
`f550c9790f6c313ff6449d5921ebc9ac8cccaf53692615890636046808bb86f5`.
Logs: `build/iteration-258-linux-package-consumer.log`,
`build/iteration-258-linux-package.log`, `build/iteration-258-linux-full-check.log`.

Only this TGZ and the independent probe were copied into a new pinned Node
24.21.0 Bookworm verifier, `freerdp-bridge-native-check:258`. It has no workspace,
SDK, system FreeRDP or fallback libudev. Actual execution under UID 1000,
read-only root, no network, init, dropped capabilities, no-new-privileges and
bounded private tmpfs passes: FreeRDP 3.32.1, six canonical private modules,
codec/libudev-context roundtrips, IPC pairing hashes/record, HELLO/heartbeat/
shutdown and empty owned runtime. Log:
`build/iteration-258-independent-runtime.log`.

The Windows source-built-chain consumer from iteration 257 also installs and
produces a ZIP in its own new `build/native-source-package-*` directory.
Its installed license and feature report match the new SDK/source inputs byte
for byte; `build/iteration-258-windows-package.json` identifies the outputs and
`build/iteration-258-windows-package.log` records the actual commands.
Actual Windows relocation passes 1/1 with a minimal system PATH: directory ACL
helper, module origins, codecs, static inventory, worker lifecycle and cleanup.
Log: `build/iteration-258-windows-relocation-repeat.log`. The first invocation
stopped before native launch because PowerShell decoded the UTF-8 JSON path
without an explicit encoding; selecting UTF-8 corrected the invocation.
This is packaging/relocation evidence, not a clean-machine installer acceptance.

The native archive smoke is separate from the full Node API/service image,
new-distro source compilation, CI, licensing/vulnerability review, installers,
actual RDP/devices and sustained resources. Stage 0 remains IN PROGRESS. The
historical iteration 223 release cohort remains unchanged.
