# Iteration 256 — Windows SDK consumes the new source dependency receipt

2026-10-16. Continues Stage 0 after iteration 255. The MSVC wrapper accepts
`-DependencyReceipt` only for `clean-freerdp`, in the fixed relative
`build/dependencies-source-clean-*/installed/bridge-dependency-build.json`
namespace. Wrong tasks, traversal and absolute paths fail before toolchain or
alias setup. The existing shared SDK helper validates the receipt, recipes,
installed status and exact dependency prefix; its output binds the unchanged
dependency receipt hash.

New fixture `build/freerdp-source-clean-MpfPs4` clones the clean pinned FreeRDP
commit `bf217a504e54cc719880c228e82353382cd7d4fa`, compiles and installs against
`build/dependencies-source-clean-MypULr/installed/x64-windows-bundled`.
The independent public-header probe verifies FreeRDP and WinPR 3.32.1, three
canonical DLL origins and 20 static client channels. Consumer CTest 1/1 and
the exact foreign-prefix refusal pass. Serial/parallel remain compiled OFF on
Windows under the pinned upstream profile; this inventory does not advertise
device runtime support.

| SDK artifact | SHA-256 |
| --- | --- |
| FreeRDP DLL | `33934dfef986a0035421d90002287d4d1f091b4082de4a7eb9bf3c241832df72` |
| client DLL | `1cb4753fd7ea650a511a5d2e6f93c9134a3a531fc49ddf003deb89830f90c333` |
| WinPR DLL | `1d8097df47f00dc69d6dc233c7f92dd99b5c550f2e6f2bec369cc0536dd449cd` |
| filtered feature report | `ecf9385a912fa5422c865ba57c5826b7df6d1389fb201c8b074c7838ff0a3311` |
| SDK receipt | `835eef48d535ee32243cfaa34fb4047c5fe5f8b6ee47bc7fd1668a87d13890df` |

The SDK receipt binds dependency receipt
`0d47332311bd1050e66d3f72a7d508143b6cf0c50f53af46893ed282eb132d83`.
Log: `build/iteration-256-windows-fresh-dependency-sdk.log`.
Focused wrapper/provenance/frontdoor tests pass 3/3 on Windows, including six
wrapper refusal cases. A new worker consumer follows separately. This is local
source-chain evidence with prepared tools/cached source, not complete fresh
checkout/clean-machine/CI, sanitizer, release or RDP/device acceptance.
