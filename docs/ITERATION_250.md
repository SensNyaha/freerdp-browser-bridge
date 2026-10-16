# Iteration 250 — fresh Windows bridge consumer of the rebuilt SDK

2026-10-16. Continues Stage 0 after `512a352`. The MSVC wrapper accepts a
RebuiltSdkReceipt only with clean-bundled and only as a relative
`build/freerdp-source-clean-*/receipt.json` path. Wrong task, traversal and
absolute paths refuse before alias/toolchain setup. The accepted path is passed
under the wrapper's ASCII alias; the existing shared consumer guard requires
the completed pinned SDK receipt, unchanged bytes, expected prefix relationship
and exact three CMake package origins. No arbitrary FreeRDP argv is exposed.

The first consumer `build/native-clean-6Qxo8l` ends with the helper's former
generic error during compilation, after 288/401 steps, with its 180-second
command budget active and no compiler diagnostic. The exact spawn failure
reason was not captured, so timeout is not asserted as a proven cause. A
filtered process query afterward finds no compiler/CMake/Ninja command naming
that fixture. The failed output/log remains.

Compilation now has its own finite 600,000 ms budget and explicit ETIMEDOUT
diagnostic. CTest and Node process/IPC command budgets remain 180,000 ms; no
protocol, assertion, watchdog or browser deadline is extended. The new receipt
records buildDeadlineMs. The final new-tree repeat `build/native-clean-M3p9M3`
passes compilation, linked CTest 29/29 and focused Node 26 passed / one
absent-primary skip / 27. It includes 16 MiB framed clipboard delivery, selected
typed/raw clipboard strict TLS refusal/cancellation, heartbeat, 100 sequential
workers, parent death, paused-output and joined cleanup. No real RDP/device is
accessed.

The copied source input remains 328 files / 1,851,578 bytes, unchanged SHA-256
`b1bb08d242a533d21c8a0b29aae62c4cd3110254e68429c911864f998e446e9f`.
The Windows SDK receipt hash is
`ac24543c9ea8a4753292a283b79514129e0b3210a89fe709a40268929bcb02a3`;
feature hash is
`ecf9385a912fa5422c865ba57c5826b7df6d1389fb201c8b074c7838ff0a3311`.

| New project artifact | SHA-256 |
| --- | --- |
| worker | `5793f40657c0aa35b36bd02eaee52770156930d99a7a75ec0a9d97045e1b1912` |
| private-directory helper | `f59b2a65c56f247b8e1bf52cb4a6a2b1df6bb39e5f1c1e6feb0cb6376c2a0448` |

Logs: `build/iteration-250-windows-rebuilt-sdk-consumer.log` and the separate
consumer-repeat log. The wrapper refusal fixture passes on Windows. Full
Windows check then targets this exact new worker by its canonical path after
alias removal. It passes 660 with 49 skips / 709 and zero failures in
`build/iteration-250-windows-rebuilt-sdk-check.log`.

The final common helper/wrapper fixture Linux regression retains Iteration
248's rebuilt-SDK consumer and passes 654 with 58 skips / 712 and zero failures.
The earlier correctly selected Windows linked repeat on Iteration 246's worker
passes 659 with 49 skips / 708 and zero failures. Its first two PCM page-load
timeouts and unchanged focused 3/3 repeat remain in Iteration 247; the full
repeat does not prove their intermittent cause is fixed.

This accepts the named local Windows/Linux project-native consumer of a newly
source-built pinned FreeRDP SDK. Other private dependencies, Catch2 and toolchain
remain prepared inputs. Complete fresh dependency/distro/CI, standard PIE
sanitizer, clean-machine packaging/installers and actual RDP/device/resource
gates stay open. Stage 0 remains IN PROGRESS.
