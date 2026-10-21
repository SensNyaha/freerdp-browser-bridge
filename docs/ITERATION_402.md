# Iteration 402 — Linux regression and the remaining joint Windows gate

2026-10-21. Practical MVP regression after the input correction `1ffbfeb` and
CLIPRDR compatibility `d34cb74`. No dependency pins or Release settings change.

## Linked Linux regression

The tracked-source archive binds commit
`d34cb74c4ca91c2acff8f10faf40facdabc34081`, SHA-256
`b94e7aad552e2907bb917ccf3289c4265d63d5a82596edb78963f967f9dacd6c`.
The GCC 12 Release worker and IPC-only Node addon reuse the exact bound native
input archives from [395](ITERATION_395.md); SDK/dependencies are not rebuilt.
The container runs as uid 1000, network none, read-only root, bounded tmpfs,
2 CPUs / 4 GiB / 256 PIDs, no host mounts and no added capabilities.

- Native CTest: **35/35**, 21.08 s.
- Focused process/synthetic-TLS cases: **7/7**, 2.19 s.
- Full `pnpm check`: **870 passed / 82 skipped / 952 total**, zero failures or
  cancellations, Node test duration 224.98 s.
- All 1,348 tracked files and 1,018 native input files retain their hashes;
  real private module origins and the addon's lack of FreeRDP linkage pass.
- Checked runner receipt records zero remaining workers; the host wrapper
  emits `containerRemoved: true` after its removal check.

Evidence: `build/iteration-401-linux-repeat.log`,
`build/iteration-401-linux-receipt.json`. Worker SHA-256:
`82eecc38df04b31d8957705d0e279b291528354d8645c34356bfb37371102156`;
addon: `3a496c809c876400b8bdc1ae250a3e1cf02ff85e585ca5879c1850bfb9658188`.
The outer tool handle reports exit 1 despite the completed checked runner,
validated receipt and removal marker, with no wrapper failure marker in the
log. That discrepancy is retained: this is acceptance of the named checks,
not a claim that the outer invocation returned zero. A further independent
Docker inventory initially could not execute because automatic approval review
was unavailable due to a usage limit. After the user reported restored access,
the exact container-name inventory returns empty, exit 0. The earlier compilation-only attempt was
intentionally stopped when Windows access returned; its log is retained.

This verifies committed production code. The uncommitted joint Windows helper
is outside this Linux archive. Actual device/platform matrices remain open.

## Joint Windows observation remains unaccepted

The prepared Notepad/tone scenario uses the combined Release worker from
[401](ITERATION_401.md), H.264 1080p, Opus/200 ms and bidirectional text. In
`build/iteration-401-windows-combined-repeat5.log`, actual headed Edge Clipboard
API and CLIPRDR exchange both small Unicode documents with Notepad; exact
readback and one physical-key exercise pass while audio is decoding/playing.
One soak observation completes, then the observer encounters an enabled
source waiting for a new epoch/config and exits. This is **not** a completed
joint soak, permission/revoke/replay acceptance or a new audible-quality pass.

The last fixed-scalar audio observation records epoch 14, 13 configurations,
2,342,848 played frames, 448 underflow frames / five underflows and 12,480
overflow-skipped frames (also present before soak measurement), with zero
invalid Worklet calls. It does not establish whether that waiting state would
recover promptly. Native remains connected; worker retirement and empty
runtime pass. The helper reports that its own disposable document may remain.

Earlier attempts exposed helper ordering/counter mistakes: audio activation
must precede certificate activation, and local paste must preserve the write
count that already includes an optional user-sent tone command. These failures
are retained; they do not establish product Clipboard API failure.

The pending helper now observes existing epoch recovery for a finite 3 s
before failing, retaining the entire interval in elapsed/sample-loss totals.
It cannot accept persistent loss, a disabled source or an overdue ready reply.
It retains the existing queue limits and reports underflow/overflow/config
deltas. This is an observer correction requiring a real repeat; it does not
fix or accept production audio. The remote tone has a finite 33-minute owner
for the 30-minute gate; application preparation remains a user action.

Current helper validation: full Windows Node 24 `pnpm check` passes, **891
passed / 61 skipped / 952 total**, zero failures/cancellations, 351.48 s for
Node tests, using the hash-verified combined Release worker in its `out`
directory. TypeScript build, ESLint and full format check pass. The first full
invocation incorrectly selects the parent fixture directory and is stopped
after missing-executable failures; that log is retained. No test is disabled.
The initial format check flags only a local line-ending
change in `test-xrdp-viewer.mjs`; normalization leaves no tracked diff there,
and the repeat passes. Twelve focused observer/tone/soak tests pass, including
actual PowerShell parsing without tone execution. The actual combined repeat
remains outstanding; regression does not substitute for connected acceptance.
Logs: `build/iteration-402-local-build.log`, `iteration-402-local-lint.log`,
`iteration-402-local-format.log`, `iteration-402-local-format-repeat.log`,
`iteration-402-windows-check.log`, `iteration-402-windows-check-repeat.log`.

Next experiment: repeat this exact prepared Windows scenario, observe whether
the epoch transition recovers within the finite bound, then require the full
30-minute result, resize/replay/cleanup and human listening assessment. Do not
change production audio or broaden the scenario without evidence of the cause.

The first post-regression repeat (`build/iteration-402-windows-joint.log`)
stops before the certificate prompt; a separate 5-second TCP probe cannot reach
the approved Windows endpoint. There are zero remote key/clipboard operations,
and PID retirement / empty runtime pass. The user subsequently reports restored
access; this connection failure is retained separately from audio acceptance.
