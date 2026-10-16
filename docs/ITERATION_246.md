# Iteration 246 — isolated Windows linked project-native source build

2026-10-16. Continues Stage 0 after `57e396c`. Extends the existing source-copy
linked helper to Windows x64, preserving the Linux linked/default foundation
profiles. No C++/protocol change, dependency rebuild or new actual RDP/device
claim is introduced.

`native-build.ps1 -Task clean-bundled` selects the existing bundled Catch2 source,
holds the temporary ASCII workspace alias through MSVC/CMake/CTest/Node checks,
and calls the common helper's linked mode. The source copy, finite limits/hash,
empty output tree, exact clean FreeRDP source pin and declared filtered feature
input checks are unchanged. Windows uses its actual private dependency triplet
and compiled `.exe` targets. Existing CMake runtime rules copy the prepared SDK
DLLs into the new output tree; no old project worker/object/cache is copied.
Installed SDK/toolchain/Catch2 remain external inputs, and dependency installation
and FetchContent network operations are disabled.

Windows requires at least 29 CTest cases with the shared clipboard/IPC/media /
channel inventory and Windows pipe/private-directory cases. Node addon selection
stays OFF on Windows; its primary seqpacket/ELF checks and artifact hashes remain
Linux-only. Windows hashes the newly compiled worker and private-directory
helper instead. Overall rdp=false remains unchanged; linked CLI must show
FreeRDP 3.32.1, connectCore and text/revoke capabilities.

The first Windows linked run passes compilation, CTest 29/29 and Node 26 passed /
one absent-primary skip / 27 cases. Focused checks include full 16 MiB framed
clipboard delivery, typed/raw clipboard selection against a synthetic strict-TLS
endpoint, exact certificate refusal with zero TLS application bytes, heartbeat,
100 sequential workers, parent death, bounded flood and joined cleanup. No real
clipboard/desktop/device is used. The lifecycle tests run while the alias exists;
a full Node regression then targets this exact new worker via its canonical
workspace path after alias removal.

Receipt fixture `build/native-clean-QUFLm4`: same 328 files / 1,851,578 bytes /
source SHA-256
`b1bb08d242a533d21c8a0b29aae62c4cd3110254e68429c911864f998e446e9f`
as the independent Windows/Linux foundation and Linux linked builds. SDK source
commit is `bf217a504e54cc719880c228e82353382cd7d4fa`, clean before/after the run.
Windows filtered feature SHA-256:
`ecf9385a912fa5422c865ba57c5826b7df6d1389fb201c8b074c7838ff0a3311`.

| New project artifact | SHA-256 |
| --- | --- |
| worker | `5f1ea7d32e72a9b9aff6bfe64769e85a468acfeffa1bd398f257de3f55b4cdbd` |
| private-directory helper | `3221c95aedbe621d60d236704e9b258b707f0596c4e333ab7b94ccd790ca2a7d` |

The receipt records sourceUnchanged=true, prebuiltOutput=false, linked=true,
foundation=false, nativeTests=29 and freerdpRebuilt=false. Log:
`build/iteration-246-windows-clean-linked.log`. Linux source/native evidence
retains Iteration 245's scope; its current full regression uses that same
validated clean linked worker.

The first canonical-path Windows full check has 654 passes, 49 skips and two
failures / 705 cases. Both fixture errors are retained in
`build/iteration-246-windows-clean-linked-check.log`:

- The native Opus browser fixture uses port 0 and receives port 5060; Edge refuses
  navigation with `ERR_UNSAFE_PORT` before codec assertions. Its unchanged
  individual repeat passes, which does not substitute for full regression.
  All eleven remaining direct Chromium/HTTP port-0 fixtures now use the existing
  bounded high-range helper. No browser port policy override is used.
- The Ninja fixture resolves a configured SDK prefix relative to the original
  project cwd, assuming CMake's source root is the repository root. For the new
  source/output tree it incorrectly reaches `Desktop/.deps` and gets `ENOENT`.
  It now rebases from cached binary directory to actual binary directory. Two
  portable path cases cover ordinary and isolated output plus an external SDK
  drive. Header-dependency and private-DLL hash assertions remain unchanged.

The corrected browser/Ninja/helper focus passes 20/20 on the exact new Windows
worker. First Linux full regression passes 651 with 57 skips / 708 cases; its
updated repeat passes 653 with 57 skips / 710 cases and zero failures. Full
Windows repeat including the two new path cases passes 658 with 49 skips / 707
cases and zero failures in
`build/iteration-246-windows-clean-linked-check-repeat.log`.
These fixture corrections change no production protocol/device behavior.

This accepts the named local Windows/Linux project-native foundation and linked
source builds with reused SDK inputs. Fresh upstream dependency/FreeRDP builds,
clean-machine/distro matrix, actual CI, standard PIE sanitizer, packaging /
installers and remaining RDP/device/resource gates stay open. Stage 0 remains
IN PROGRESS.
