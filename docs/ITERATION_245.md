# Iteration 245 — isolated Linux linked project-native build

2026-10-16. Continues Stage 0 after `46e680e`. The new `linked` mode of
`test-native-clean-build.mjs` compiles all project-native Release sources into
a new empty build tree against the existing prepared pinned Linux SDK. It does
not rebuild upstream FreeRDP/dependencies, package/install artifacts or establish
new actual RDP/device acceptance.

The core source copy/hash remains identical to Iterations 243–244: 328 files /
1,851,578 bytes / SHA-256
`b1bb08d242a533d21c8a0b29aae62c4cd3110254e68429c911864f998e446e9f`.
No existing project cache/object/binary/addon is copied. Linked mode requires the
prepared FreeRDP source checkout to match `native/dependencies.json` at
`bf217a504e54cc719880c228e82353382cd7d4fa` with no status changes before and after
the run. It regenerates the filtered actual SDK feature report with the existing
inspector, bounds it, and declares that metadata as an additional input. The SDK,
vcpkg toolchain and Catch2 3.8.1 source stay external/reused; dependency install
is disabled and FetchContent is disconnected. Existing foundation defaults and
the Windows clean-foundation task remain available. Linked mode is Linux-only.

CMake requires exact FreeRDP/WinPR 3.32.1 and selects the private SDK/dependency
prefixes. A new worker, IPC-only Node addon/manifest and all native fixtures are
built with warnings-as-errors. The CTest inventory must include at least 30
cases, including clipboard receive/session/worker, GDI, RDPEI, RDPSND, AUDIN,
Opus and H.264. CLI checks actual FreeRDP 3.32.1, connectCore and text/revoke
capabilities, preserving overall rdp=false. Private library paths are scoped to
native/Node test processes. The addon's dynamic `NEEDED` imports are checked for
absence of FreeRDP/WinPR; this is the direct import boundary, not an addon
sanitizer or whole-process resource claim.

An initial independently configured scratch source copy passes compilation,
CTest 30/30 and focused Node 40/40. The final common helper repeats from another
empty source/build tree and passes CTest 30/30 and Node 40/40 without skips.
Node checks cover full 16 MiB clipboard over both carriers, clipboard selection
against a synthetic strict-TLS endpoint, exact certificate refusal, no TLS
application bytes, automatic primary IPC, 100-worker lifecycle, parent death,
pairing/deadlines and joined cleanup. SDK channel/codec cases use their scoped
native/fake-channel fixtures; they are not remote desktop/device acceptance.

Final fixture: `build/native-clean-13q3HO`. Filtered feature input SHA-256:
`bb6dd3290963488d7ae3baa4cc54d0066dd4290611b250515aceb9d13be5d76e`.
Artifact receipt (streamed with finite size bounds):

| Artifact | SHA-256 |
| --- | --- |
| worker | `2246cb7c24a714dffb296b1cba82e4f74a26aca75abd7cb7d2ba4b4c277fbaac` |
| IPC addon | `3175499f4d4289d95245d4f8a999863fb02694061d37f8cae9c3605037146bb1` |
| pairing manifest | `f047221c56031132cd1dd15cf721c3d311f1efedeef56d8fca67b9ed3a1f04b8` |

The receipt also records sourceUnchanged=true, linked=true, foundation=false,
freerdpRebuilt=false, nativeTests=30 and nodeAddonFreerdpNeeded=false. Final log:
`build/iteration-245-linux-clean-linked-final.log`; scratch configure/build/CTest
and Node logs remain separately in `build/iteration-245-linked-*`.
Full Linux `pnpm check` against this exact new worker/addon passes 651 with
57 platform skips / 708 cases and zero failures in
`build/iteration-245-linux-clean-linked-check.log`. Windows helper lint/format
passes; Windows source-only foundation and existing bundled runtime retain
Iteration 244's separate scopes. No new Windows native execution is claimed here.

This completes the named local Linux linked project-native source build slice.
Fresh upstream dependency/FreeRDP builds, Windows linked source build, other
distros/clean machines, actual GitHub CI, standard PIE sanitizer, deployment and
remaining RDP/device/resource gates stay open. Stage 0 remains IN PROGRESS.
