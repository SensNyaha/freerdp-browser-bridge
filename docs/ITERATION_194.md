# Iteration 194 — actual Linux packet endpoint

2026-10-14. Implements Stage 1 / ARCHITECTURE section 2 actual AF_UNIX
SOCK_SEQPACKET read/write ownership beneath the RWS1 codec from `2c60d43`.
This component is tested against real kernel sockets, not fake callbacks.
Worker descriptor selection and Node supervisor activation remain next gates.

`LinuxSeqpacketEndpoint` duplicates a connected Unix packet descriptor with
CLOEXEC and verifies socket type and minimum send capacity. It leaves the
caller's descriptor flags unchanged, uses per-call nonblocking I/O, retains
one fixed 16,400-byte receive scratch and borrows output header/body through
sendmsg. No full encoded-record copy is added. Incoming scratch is explicitly
wiped before reuse/failure/destruction. Ancillary FD transfer is refused without
importing a descriptor; oversized/truncated datagrams are terminal errors.

Each instance is owned by one thread; separate read/write instances may share a
duplex socket. A whole send has one finite 20..5,000 ms deadline. An unfinished
receive keeps its original deadline across later read calls. Idle between records
is distinct from clean peer EOF, partial EOF, malformed framing or timeout.
Send cancellation is checked between chunks and at most every 20 ms while blocked;
it terminally invalidates the instance, without retrying uncertain partial output.
MSG_NOSIGNAL avoids process-wide signal-policy changes.

Verification: seven actual Unix socket cases cover maximum 8 MiB frame/513 chunks,
following record identity, idle/EOF/partial EOF/empty datagram, original partial
deadline, blocked write deadline and cancellation, oversized/truncated/malformed
records, SCM_RIGHTS refusal without descriptor leak, foreign owner refusal,
broken peer, invalid socket types, twenty lifetimes and insufficient send buffer.
Release and ASan/UBSan each pass **7 cases / 87 assertions**. Full linked Linux
CTest **23/23** and portable sanitizer CTest **11/11** pass. Full Linux Node
check is **453 passed / 75 skipped / zero failures**, 528 cases. The documented
local non-PIE sanitizer workaround remains; no standard-PIE or CI gate is claimed.

The first test compile missed an algorithm include and used the wrong existing
header helper signature; both test-only errors were corrected with warnings as
errors retained. Actual connected RDP/audio/release, inherited descriptor,
Node activation and platform/resource/soak acceptance are not established here.
Local logs: `build/iteration-194-*` and the same paths inside the isolated builder.
