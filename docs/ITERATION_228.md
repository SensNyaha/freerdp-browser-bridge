# Iteration 228 — clipboard IPC framing and bounded output

2026-10-15. Implements the transport portion of SPECIFICATION §2.7 without
activating an RDP/browser clipboard path. [Contract](CLIPBOARD_IPC.md).
Prepared payload implementation: `0988fc4`.

RWI1 kinds 45/46/47 have fixed/variable class limits and exact zero/nonzero
correlation before allocation. Clipboard output owns one latest scalar state and
one nonreplaceable correlated result outside the 64-slot control FIFO. Tests
fill all 71 slots, including an independently valid full 16 MiB UTF-8 response,
and verify the exact 26,025,595 queued wire-byte maximum. Control still wins
queued priority; an in-flight write cannot be preempted. Envelope/codec failure
is not an authorization decision; producer ownership remains necessary.

RWS1 retains its 16,400-byte datagrams and now permits a 16,777,264-byte logical
clipboard record. First-header tests preserve smaller AVC/control class limits.
Both workers validate unselected commands and return unavailable without text;
request payloads are wiped on loop exit. Actual native process tests transmit
a complete maximum-size Unicode set over Windows/Linux framed pipes and Linux
Node-addon SOCK_SEQPACKET, then verify heartbeat, shutdown and removed private
runtime directory. No RDP target, credential, clipboard access or GUI is involved.

Windows foundation CTest passes 14/14, linked Windows 28/28 and Linux 29/29.
Local non-PIE ASan/UBSan passes 15/15. Full bundled Windows `pnpm check` passes
575 with 49 platform skips / 624 cases. Latest clipboard focus passes Windows
four with one Linux-only skip and Linux nine of nine. The SDK tests use their
normal private LD_LIBRARY_PATH. Independent installed relocation also passes
1/1 on each platform without dependency PATH, including the private ZLIB/FreeRDP
and matching addon/worker inventory.
The Linux fixture initially omitted the packet owner's mandatory write callback;
correcting that fixture restored HELLO without changing descriptor checks.

Seeded instrumented fuzz completes 1,450,834 IPC executions in 21 seconds
(coverage 1,793 / 3,269 features, peak RSS 313 MiB). An earlier invocation exited
139 before the first fuzzer diagnostic; that startup failure remains unresolved
and is not a passing run. The same binary/options pass on retry without disabling
checks. RWS1 fuzz completes 3,018,119 executions in 21 seconds (coverage 276 /
757 features, peak RSS 267 MiB). Standard PIE/CI/addon sanitizer acceptance
remains open. Evidence: `build/iteration-228-*`.

Clipboard HELLO/config selection, RDP-thread handoff, typed Node APIs, control /
media revocation, browser transport/gesture and actual remote acceptance remain
open. This block does not claim a total process memory bound or latency gate.
The existing default Node write budget and public WebSocket limits are unchanged.
