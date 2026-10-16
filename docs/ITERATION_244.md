# Iteration 244 — isolated Windows/Linux native foundation builds

2026-10-16. Continues Stage 0 after `d352eb6`, extending the source-only native
helper to the Windows x64 foundation profile. No C++/protocol or RDP capability
changes are made.

`native-build.ps1 -Task clean-foundation` uses the existing temporary ASCII
workspace alias and MSVC x64 environment, then calls the common helper with the
already prepared foundation Catch2 source. No dependency download occurs; an
absent source gives an explicit prerequisite error. The alias stays alive until
CMake/CTest and all Node child tests finish. Existing native build tasks retain
their behavior. Direct Windows helper use requires the matching compiler/tool
environment; the wrapper provides it.

The common helper still copies only bounded source into a new empty output
tree. Platform-specific CTest inventory now requires Windows pipe/private-ACL
cases or Linux stream/seqpacket-worker cases, alongside shared clipboard and
IPC cases. Windows uses its actual `.exe`; both profiles must report absent
FreeRDP/RDP/connectCore and framed IPC. Receipts add the explicit platform.
No old object/cache/binary, SDK, Git, node_modules or lab file is copied. Node
lifecycle uses the original workspace's built JS against the newly compiled
worker and fake fixtures.

Both fresh project-native foundation builds pass on the first platform run:

| Profile | Compiler / CTest | Node clipboard/worker lifecycle | Fixture |
| --- | --- | --- | --- |
| Windows x64 | MSVC / 14 passed | 15 passed / one absent-primary skip | `build/native-clean-SVB6FO` |
| Linux amd64 | GCC / 15 passed | 15 passed / one absent-primary skip | `build/native-clean-sWghck` |

Each compiles Catch2 into its own new output tree from existing 3.8.1 source.
Each includes full 16 MiB framed clipboard delivery, 100 sequential workers,
heartbeat, HELLO/CLI agreement, parent death, bounded flood/output failure and
joined runtime cleanup. These are native lifecycle/parser fixtures, not RDP
desktop/device or multi-user/abnormal simultaneous-hard-kill acceptance.

Both receipts independently bind exactly the same 328 source files / 1,851,578
bytes / SHA-256
`b1bb08d242a533d21c8a0b29aae62c4cd3110254e68429c911864f998e446e9f`,
with prebuiltOutput=false, sourceUnchanged=true and freerdpRebuilt=false. Logs:
`build/iteration-244-{windows,linux}-clean-native.log`. The generated source,
object/output trees and receipt files remain under ignored build for inspection.
Full Linux bundled Node check passes 651 with 57 platform skips / 708 cases and
zero failures. Full Windows bundled Node check passes 656 with 49 skips / 705
cases and zero failures. Logs are
`build/iteration-244-{linux,windows}-bundled-check.log`. Existing source-only logs
retain separate platform scope from bundled runtime checks.

This completes the named local Windows/Linux project-native foundation source
slice. Fresh upstream dependency/FreeRDP builds, linked clean project build,
distro/clean-machine matrix, actual CI and standard PIE sanitizer acceptance
remain open. Stage 0 is still IN PROGRESS.
