# Iteration 327 — actual localhost dual-family selection/fallback

Requirement: TODO Stage 9 retained dual-stack preference/fallback verification
for [IP settings](IP_SETTINGS.md). This adds local transport evidence without
changing production code, SDK/dependencies, native binaries or Release settings.

The existing synthetic TLS fixture accepts an optional validated port while
retaining its strict loopback host allowlist and zero-port default. Invalid
ports refuse before filesystem/certificate/listener acquisition. Only a fixed
port-busy tag permits up to three owned setup attempts; unrelated failures are
not retried. Partial setup and all listeners retire before completion.

The actual native worker targets only localhost after an OS lookup confirms
that every candidate is ::1 or 127.0.0.1 and both families are present. Two
independent IPv4 and IPv6-only TLS listeners share one port. A fresh owned worker
exercises each case with a 4-second connection deadline and bounded observation:

| Selection and listener state | Observed endpoint |
| --- | --- |
| preferIPv6 true; both available | IPv6 |
| preferIPv6 false; both available | OS first family, IPv6 in this run |
| preferIPv6 true / force 4; both available | IPv4 |
| force 6; only owned IPv6 listener closed | Refused, zero IPv4 accepts |
| preferIPv6 true; IPv6 unavailable | IPv4 fallback |

Allowed cases reach the real FreeRDP certificate callback and explicitly reject
the dummy certificate. The failed case reports RDP_CONNECT_FAILED without a
certificate prompt. Exact per-endpoint counter deltas rule out an unintended
second-family connection. All TLS application-byte counters remain zero;
heartbeat, native close, empty runtime and absent PID pass for all five workers.
Both TLS listeners/temporary dummy certificates join cleanup. IPv6 absence may
produce a named skip; unrelated errors fail. No external resolver/target, actual
RDP desktop, remote application/input, lab credentials or OS/network setting
change is used.

## Current evidence

Windows focused IP suites pass **9/9** against the unchanged iteration-325
worker. The new case reports OS first family 6, preferred 6, forced 4, no forced
fallback and fallback 4, five workers, zero application bytes and joined cleanup.
Log: `build/iteration-327-ip-focus.log`. This observes current OS ordering; because
IPv6 was already first, it does not claim an ordering reversal relative to false.

Linux focused checks pass **2 / 7 absent-FreeRDP skips / 9 total**. Full Linux
`pnpm check` passes build/lint/format and Node **676 passed / 163 skips / 839
total / zero failures** (141.99 s), with unchanged foundation binaries. It does
not claim linked Linux dual-family selection.

The first full Windows `pnpm check` passes build/lint/format but ends with
**784 passed / 51 skips / 1 failure / 836 total** (588.00 s). The unchanged
40-worker resource-policy capacity case fails after replacement while waiting
for resource samples. Diagnostics record 19 WORKER_RESOURCE_UNAVAILABLE and one
IPC_TIMEOUT, query duration up to 5,629 ms, six admission expiries and 15 task
failures. The IP/dual-family cases pass. Original failure is retained in
`build/iteration-327-windows-full.log`; no timeout or policy is relaxed. An
unchanged focused capacity control then passes **1/1**, with 45 workers, 845
paired queries, no worker failures, maximum query 2,520 ms and empty admission/
runtime after joined close (50.67 s). Its task-failure counter includes ordinary
cancellation during retirement; no admission expiry occurs. Control evidence:
`build/iteration-327-capacity-control.log`. Original deadlines and polling
intervals are unchanged.

The full Windows repeat passes build/lint/format and **785 passed / 51 skips /
836 total / zero test failures** (606.74 s). Its capacity assertions also pass
with 45 workers, 858 paired samples, joined cleanup and no admission expiries;
diagnostics still record **five IPC_TIMEOUT** events, maximum query 3,046 ms
and maximum task 2,279 ms. The current diagnostic does not establish whether
these events occurred during active sampling or retirement. Evidence:
`build/iteration-327-windows-full-repeat.log`. No production correction or root
cause is claimed. The original resource-unavailable spike and the repeat's
unclassified timeout events remain an open resource/load/retirement limitation,
separate from the accepted localhost IP outcomes. The next diagnostic step must
classify failure phase while preserving the same thresholds and polling.

Post-run protected/native artifact audits, local documentation links and
`git diff --check` pass. No native binaries, SDK/dependency inputs or Release
configuration are changed.

The preceding native CTest 33/33 Windows and 17/17 Linux remain
baseline, not new runs. Linked Linux, broader DNS/server profiles, actual IPv6
RDP desktops and resource/soak/platform gates remain open.
