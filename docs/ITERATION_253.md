# Iteration 253 — FreeRDP consumes the source-rebuilt dependency prefix

2026-10-16. Continues Stage 0 after `18c4831`. The isolated FreeRDP build accepts
an optional completed dependency receipt after --clean-local. The shared bounded
reader requires the pinned source-only profile, current unchanged recipes,
correct installed-status hash and isolated prefix. Out-of-scope paths refuse
before checkout/configure. The SDK build uses this exact root for vcpkg installed
state, CMake prefix/mandatory dependency path checks, private Kerberos tool,
probe link/runtime paths and feature-status inspection. No original installed
dependency/SDK root is substituted.

The SDK receipt binds the dependency receipt path/hash and records
dependencyBuildSourceRebuilt=true. dependenciesRebuilt=false still means that
this SDK invocation consumes previously built dependencies; the preceding
source rebuild is proved by the separate completed receipt. Before publishing
its result the SDK build revalidates the unchanged dependency receipt/status /
recipes, as well as original/new FreeRDP source pins.

Actual new SDK `build/freerdp-source-clean-HC5AcL` clones exact clean FreeRDP
`bf217a504e54cc719880c228e82353382cd7d4fa`, compiles and installs against
`build/dependencies-source-clean-w2PFkb/installed/x64-linux-bundled`. All 15
mandatory include/library cache fields resolve under that dependency prefix.
The public runtime probe verifies three private canonical SDK module origins,
FreeRDP/WinPR 3.32.1 and all 22 client channels. Exact foreign-prefix refusal 2
and CTest 1/1 pass. The new report reads the new dependency status database.

| New SDK artifact / input | SHA-256 |
| --- | --- |
| libfreerdp3.so.3.32.1 | `ba3177fc21c35c88843fb8b015e338f46afb3ca18fcfd4bac2ff188f1862559b` |
| libfreerdp-client3.so.3.32.1 | `3bd1fdc36df4e47dc1da89cdea69a9b7a389474539226ed0129b728d6e48fe29` |
| libwinpr3.so.3.32.1 | `dbdc5597a99c612bf8ba8a405f5015b31742842d8291e443b34f19dc3871c0ef` |
| completed SDK receipt | `7e864b343083e7f94ef9e651bc6b6405c56a6473d0404567bff017f683b52455` |
| bound dependency receipt | `20783b8d6cc5daf079e2f4ff9bd9a190be69814cb1088eb7afb4fe4ca3c0a32c` |

Log: `build/iteration-253-linux-fresh-dependency-sdk.log`. The filtered feature
report retains hash `bb6dd3290963488d7ae3baa4cc54d0066dd4290611b250515aceb9d13be5d76e`.
Explicit legacy-root inspection also produces byte-identical existing Windows /
Linux inventories (ecf9385a… and bb6dd329… respectively). Portable provenance
and out-of-scope frontend refusal focus passes on both platforms. Full Windows
regression on the known rebuilt-SDK consumer passes 662 / 49 skips / 711; the
new Linux project consumer's full check passes 656 / 58 / 714 in Iteration 254.

This verifies the named local Linux SDK/dependency handoff. Compiler/toolchain
and cached source inputs are reused. New project consumer acceptance is recorded
separately; Windows cold chain, complete fresh checkout/distro/CI, standard PIE
sanitizer, final packaging/installers and actual RDP/device/resource gates remain
open. No public/session wire contract changes.
