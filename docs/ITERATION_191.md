# Iteration 191 — bounded Linux stream writer foundation

2026-10-14. Implements Stage 1 and ARCHITECTURE's fixed priority output on the
existing inherited stream fallback, following native clean-runtime `282b4ce`.
The primary SOCK_SEQPACKET transport remains open. Worker selection and Linux
audio capabilities do not change in this block.

The isolated owner uses the existing OutputDispatcher, a duplicated writable
FIFO/AF_UNIX stream descriptor, private eventfd and one writer thread. Nonblocking
partial writes/polling share one whole-record deadline. Finite owner drain and
cancellation preserve borrowed header/body storage; flags are restored only
after join. Broken pipes do not change caller/global SIGPIPE policy.
[Ownership and deadlines](LINUX_STREAM_OUTPUT.md).

Six actual Linux descriptor cases pass **174 assertions**. They cover Node-style
socketpairs as well as FIFOs, exact records and partial reads, stalled-reader
producer credit, write/drain timeout, broken reader, invalid descriptors/types /
timeouts, foreign finish, repeated close, Opus queue selection and twenty joined
lifetimes with unchanged FD count. Synthetic packet/Opus data is used; there is
no RDP/device acceptance in these tests.

GCC Release warnings-as-errors build and full linked CTest pass **21/21**. The
same six cases / 174 assertions pass ASan/UBSan with zero findings in the local
non-PIE placement workaround documented in iteration 184. Production/CI compiler
flags remain unchanged; this does not establish standard PIE sanitizer or actual
GitHub CI acceptance. The first test compile missed explicit POSIX signal headers;
that retained compile failure is corrected, not suppressed.

Linux complete `pnpm check`: **452 passed / 76 skipped / zero failures**, 528
cases, still against the previous worker output. Windows foundation CTest and
linked CTest remain **10/10** and **22/22**. Windows full `pnpm check` passes
**528/528**. No output wire format or public protocol changes.

Local evidence: `build/iteration-191-*`. The next block selects the tested driver
in Linux workers, then verifies native/fake-parent backpressure, lifecycle and
private-library relocation again. Connected RDP release/fault/resource/soak and
primary seqpacket acceptance remain separate requirements.
