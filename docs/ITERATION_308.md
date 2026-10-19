# Iteration 308 — bounded Linux CPU helper and policy lifecycle

2026-10-19. Extends SPECIFICATION §2.12 / TODO Stage 10 CPU queries and the
optional sampled policy to local Linux native workers. Source CMake adds and
installs one project helper, `rdp-process-query`, on Linux;
Release build-type/options, dependency pins and existing Release artifacts are
unchanged. No RDP host, network service, physical device or security mechanism
is accessed or reconfigured by this block.

The helper accepts only the nonsecret CPU-command/PID pair, reads a bounded
kernel stat record and obtains the clock frequency from `_SC_CLK_TCK`.
Its stack buffer, read attempts and parser are bounded; descriptor retirement
precedes the scalar receipt. Parenthesized names cannot shift required CPU
fields. Checked tick conversion preserves carry without assuming 100 Hz or
overflowing integer multiplication. [Command/reader contract](PROCESS_CPU.md).

`linuxWorkerCpuMicros` and the platform dispatcher reuse the existing joined,
cancellable, two-second / 128-byte query owner. The Windows command/environment
remain unchanged. Existing CPU policy/window/failure semantics now select the
proper helper on Windows/Linux; other platforms still refuse. Missing or old
Release helpers fail as unavailable rather than silently dropping an enabled
policy. No public create field or wire layout changes.
[Policy and retained limits](WORKER_CPU_POLICY.md).

## Native and focused verification

MSVC Debug compiles with the ordinary warnings-as-errors/static-analysis setup.
Portable CPU checks pass **6 cases / 62 assertions**: previous Windows units,
non-100-Hz conversion/carry/ceilings and bounded stat name/token/PID cases.
CTest passes **16/16** in 5.81 seconds. The first run retained in
`build/iteration-308-windows-native.log` fails one test-only expectation: replacing
a numeric token by empty whitespace while keeping later numbers shifts their
positions, rather than producing a recognizable empty field. That vector is
corrected; required-token truncation and invalid number tests remain. The
parser is not claimed to validate every field of an arbitrary stat document.
The passing repeat is `iteration-308-windows-native-repeat.log`.

The existing Ubuntu GCC 13 Debug native source copy is explicitly updated at
its actual CMake source path and incrementally rebuilt. It compiles the new
helper, passes the same **6 / 62** portable checks and CTest **17/17** in
6.75 seconds. No prepared binary is represented as a fresh source build.
Linux CPU-focused checks pass **24/24** in 9.38 seconds; Windows focus passes
**22 / 2 Linux-only skips** in 12.33 seconds.

Actual unconnected C++ workers verify cumulative queries, eight query
cancellations, healthy combined CPU/RSS polling, heartbeat and joined cleanup.
The owned Node test process separately exercises counter growth across 200 ms
of local work; no FreeRDP runs inside Node. Actual CLI grammar controls emit
no receipt for invalid commands/PIDs. Synthetic counters separately exercise
limit/sibling isolation, regression, invalid/unavailable results, deadline and
late/uncertain retirement on both platforms. Actual native overload acceptance
is not inferred from these synthetic breaches.

## Install and compiler baseline

A new Debug install prefix contains byte-identical worker/query executables.
Four actual installed-query/grammar/growth/cancellation checks pass with only
the installed binary directory supplied to the reader. Installed SHA-256:

- worker: `36422fd4ca31d90b19c9d6c44720600daad8d70429308cc445afae0f8f584bdb`;
- helper: `67f5970a66af5eb8ad9c3081e18b32123691803127c85a2e75dc11dcdd5274b2`.

Prepared GCC 12.4 independently compiles the actual helper with C++20,
`-Wall -Wextra -Wpedantic -Werror`, stack protector and Debug output. Its query
of the owned runner process returns schema 1, error 0 and 80,000 cumulative
microseconds. This focused GCC 12 control is separate from the GCC 13 full
consumer, fresh distro builds and sanitizer acceptance. The first install
runner invocation fails on host inline-JavaScript quoting before Docker is
accessed; the correction uses a script file and normal approval, without
changing security settings. Successful evidence is `iteration-308-linux-install.log`.

Full Linux `pnpm check` passes build/lint/format and **626 passed / 148
platform/profile skips / 774 total / zero failures**, Node duration 120.23
seconds. Full Windows `pnpm check` also passes build/lint/format and **679
passed / 92 platform/profile skips / 771 total / zero failures**, Node duration
405.88 seconds. C++ clang-format, `git diff --check` and 39 local contract/report
links pass. The unchanged Windows Release worker retains SHA-256
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.

Evidence also includes ignored `build/iteration-308-{linux,windows,windows-focused,node-build}.log`,
`iteration-308-transfer.cjs`, `iteration-308-run.py`,
`iteration-308-install-transfer.cjs` and `iteration-308-install.py`.
No production package/Release helper adoption, actual CPU overload, connected
CPU, startup/Node/total-session budgets, hard OS-failure retirement, sanitizer,
broader platform/CI or sustained/soak acceptance is claimed.
