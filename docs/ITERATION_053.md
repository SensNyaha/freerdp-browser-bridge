# Iteration 53 — native PCM publisher and source-reset ownership

Date: 2026-10-10. Implements SPECIFICATION §2.6, MEDIA_PIPELINE §6/8 and
ARCHITECTURE §5/11 native audio producer ownership. Continues browser port ownership
`7f44b97` (iteration 52); this block does not activate worker audio.

The publisher keeps one fixed latest PCM IPC record/config and offers borrowed
bytes to a nonblocking bounded consumer. Capture precedes retry; replacements
force discontinuity. Epoch/config ordering, accepted-config preservation and
single-pump bounds are explicit. Source revision changes discard pending data
before any send, including the pinned Close behavior that leaves the device Open.

Five native owner/credit/clock/reset/fault cases and an actual linked RDPSND /
simulated-SVC Close/restart case cover exact PCM, pending-data disposal before
fresh samples, new epoch, reentry/foreign ownership, callback failure and identifier
exhaustion. Native RDPSND now **48 cases / 8,369 assertions**. Bundled CTest **13/13**,
/W4 /WX /analyze. Foundation CTest **5/5** and bundled `pnpm check`
**159/159** (zero skips, 105.17 s) pass. clang-format and `git diff --check` pass.
Logs: ignored `build/iteration-053-*.log`.

The consumer callback contract cannot turn the existing blocking stdout mutex into
a nonblocking priority lane. Bounded native writer/scheduling/shutdown and worker/
Node activation remain necessary before selection. Browser/actual audible RDP,
microphone, larger bursts, upstream limits and LAN latency gates remain open.
