# Iteration 386 — bounded three-minute audio source scenario

2026-10-21. Prepares the user's P0 MVP several-minute audible-output criterion
using the existing fixed Windows lab source and viewer counters. No native or
production behavior, Release profile, pinned dependency, audio format/buffer
contract or diagnostic subsystem changes.

The explicit `--audio-opus-compat-tone-soak` viewer mode selects the existing
Opus/200 ms headed preview with microphone off. Its fixed in-memory quiet tone
runs 180 seconds and the viewer waits at most 195 seconds after command dispatch
or until its window closes. Existing 45-second source / 60-second observation
defaults remain unchanged. This extends observation to the requested actual
criterion; it does not relax a protocol, operation or failure deadline.

Only source durations 45 and 180 are admitted before any remote input. The
same fixed command still owns Stop/Dispose/exit, accepts no arbitrary command
or file, and reports dispatch separately from execution. The existing target,
certificate, private credentials, input reset, stats queries and joined cleanup
remain. Actual use requires a separately authorized connection and source action.

Focused options/source tests pass 9/9 in 1.12 s, including duration refusal before
input, exact command/chunk equivalence, preserved defaults and PowerShell parser
acceptance of both fixed commands without executing them. Evidence:
`build/iteration-386-focus.log`. Focused ESLint/Prettier and diff checks pass.
Current complete Windows foundation regression remains [385](ITERATION_385.md),
835 passed / 102 profile/platform skips; native CTest remains 17/17. No actual
RDP/audio run is claimed by this preparation. Stable audio remains unaccepted
in [MVP acceptance](MVP_ACCEPTANCE.md).
