# Iteration 371 — anchor native audio waits to packet deadlines

2026-10-20. The actual repeat in [370](ITERATION_370.md) observes zero Node
consumer reset requests but 581 skipped native publication intervals. Review
finds a relative 20 ms event wait even after an audio packet's next deadline
has been established. Owner work and wait overshoot can cumulatively outrun
the 20 ms packet timeline. This is one reproducible scheduling defect, not a
claim that every observed RDP stall has the same cause.

The packetizer now exposes its next deadline without advancing the clock or
consuming samples. The serialized sink/session expose it only for an active
owner; initial/no-data, reset, Close, retired, foreign/reentrant, failed and
blocked publication expose no deadline. The RDP event wait is bounded by that
deadline for both PCM and Opus, with overflow-safe upward millisecond rounding
and a 1 ms lower bound for overdue audio. Other owners' shorter waits are
preserved. Blocked output retains the existing ordinary poll, preventing a
new busy retry path. Late-discard/reset rules, packet bytes/timestamps, queue
capacities, buffer profiles, threads and public protocols are unchanged.

A controlled native virtual-minute replay gives each owner turn 3 ms of work
and rounds waits to an explicitly modeled 15.625 ms quantum. The former
relative-wait control skips 1,248 intervals and fails the zero-skip assertion;
deadline scheduling skips zero and emits at least 3,000 packets. This does
not measure the current Windows timer or establish audible/CPU/LAN acceptance.
Deadline lifecycle, early/invalid clock stability, rounding/cap/overflow and
existing late-stall/PCM queue controls also pass in Debug foundation CTest
16/16. The failing-before log preserves the two expected regression failures.

The first linked Debug preparation is refused by Git's owner check when a
process under the host account inspects a checkout owned by the sandbox
account. The same ordinary build in the checkout owner's sandbox context
passes that guard; Git trust settings and ACLs are unchanged. The first linked
compile then catches an ambiguous `audio` namespace imported by the existing
IPC using-directive; the call is corrected to `bridge::audio` before a fresh
source export. Both failed runs remain retained. A new isolated Debug consumer
uses the existing bound pinned Debug SDK; ordinary Release outputs are retained.

The fresh `build/native-clean-PUICs8/receipt.json` binds 351 native source files /
1,932,989 bytes with SHA-256
`8acce7392ae76097c973729c5301d79220b0e85026c123b61de28bf2ccae9fe8`.
MSVC 19.44 / CMake 3.31.6-msvc6 / Ninja Debug compilation and linked CTest
33/33 pass, including actual pinned RDPSND with simulated SVC transport for
both codecs. The deadline tests cover blocked output recovery, reset/new data,
foreign/reentrant ownership and retirement; they do not use actual RDP.
The new worker SHA-256 is
`6613765109eedc498178827d764cd0c925456d8c9159daa4857def5e36b27ac6`.
Native process/TLS/lifecycle checks pass 27 / one platform skip, including 100
sequential workers and joined runtime cleanup. Seven protected inputs match
their pre-build hashes, and the temporary native workspace alias is removed.

Full Windows `pnpm check` with the new linked Debug worker passes build, ESLint,
format and Node 812 passed / 51 platform/profile skips / 863 total, zero
failures. The log is `%TEMP%/freerdp-bridge-iteration371-debug-check.log`.
The existing Release worker remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.

The same native source snapshot additionally compiles with GCC 12.4 / C++20
in the already local Ubuntu image
`sha256:e7890149c961c812ab83ecad5dd81ab7bb9281c94ceec00952a87fc7681bf89d`.
Ordinary Debug foundation CTest passes 17/17 in 7.44 s, including the virtual
deadline model. Source/Catch2 mounts are read-only; UID1000, network none,
read-only root, init, dropped capabilities, no-new-privileges and bounded
tmpfs/CPU/memory remain. No SDK, Node dependencies or lab files are mounted.
This is portable foundation coverage, not Linux linked/audio acceptance.
The retained log contains the complete CTest result. After completion the tool
handle is absent and the Docker API is unavailable for a post-run inventory;
no additional container cleanup observation is claimed.

Ignored logs: `build/iteration-371-native-before.log`,
`iteration-371-native-after.log`, `iteration-371-linked-debug.log`,
`iteration-371-linked-debug-sandbox.log`, `iteration-371-linked-debug-repeat.log`,
`iteration-371-linux-native.log`.
The protected input snapshot is `build/iteration-371-protected.json`.
Actual new-worker audio, remaining scheduling stalls, resource/CPU, recovery,
microphone, platform and soak acceptance remain open.
