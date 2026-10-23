# Iteration 225 — bounded CLIPRDR receive path

2026-10-15. Implements the ingress portion of SPECIFICATION §2.7 with header
admission before body allocation and a public FreeRDP receive adapter.
[Contract](CLIPBOARD_INGRESS.md). Unicode codec commit: `850e757`.

Five portable cases / 4,310 assertions cover controls, exact/header length,
capability/name/format budgets, every split position, no-allocation header refusal,
deadline/backward clock/framing/fragment limits, consumer faults, reentry and
retirement during borrowed data. Four actual pinned CLIPRDR/fake-SVC cases /
190 assertions cover capabilities/monitor, long and short lists, reply writes,
Unicode requests/responses, pre-parser refusal and close/identity behavior.
This is linked channel integration, not an actual remote clipboard test.

Windows foundation CTest passes 13/13; linked Windows 26/26 and Linux 27/27.
The existing local non-PIE ASan/UBSan profile passes 14/14; standard PIE/CI and
Node addon sanitizer acceptance remain open. Full bundled Windows `pnpm check`
passes 567 cases with 48 platform skips and zero failures / 615 total.
The initial linked fixture incorrectly selected only SynchronousStaticChannels;
callbacks ran on the SDK's internal thread. The corrected fixture explicitly
disables that thread with the public ThreadingFlags setting. The GCC 12 Release
test helper now sizes its complete vector before copying, retaining warnings as
errors. These corrections do not change the pinned dependency.

Clang ASan/UBSan seeded fuzz completes 1,589,547 runs in 21 seconds, coverage 785,
1,318 features, peak RSS 276 MiB, exit zero. The 16 KiB fuzz maximum is separate
from production item limits. GitHub workflow is prepared, not counted as run.
Evidence: `build/iteration-225-*`.

Worker/provider selection, direction/request/attachment ownership, IPC/browser
transport and actual remote acceptance remain open. Core decompression/total
memory and broad format/platform compatibility are not claimed by these tests.
