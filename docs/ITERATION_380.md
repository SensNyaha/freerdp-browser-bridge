# Iteration 380 — Windows foundation host-batch profile

2026-10-21. Verifies the non-FreeRDP branch of the host-resource capability
introduced in [378](ITERATION_378.md), continuing TODO Stage 0 compiler/profile
and Stage 10 sampled-resource acceptance. Production/native sources, Release
outputs, dependency pins and deadlines are unchanged. No RDP connection,
device/source access, external system or new security investigation is used.

The existing offline source-only foundation driver builds a new MSVC 19.44 /
CMake 3.31.6-msvc6 / Ninja Debug output without a FreeRDP SDK. Prepared compiler,
Catch2 and public tools are reused; no previous project binary/object is copied.
Native CTest passes 17/17 in 7.55 s, and framed process/lifecycle checks pass
16 / one platform skip in 30.33 s. Evidence:
`build/iteration-380-foundation-build.log`,
`build/native-clean-qRtFwb/receipt.json`.

All 353 exported native files / 1,938,082 bytes match the current source and
linked output's exact source SHA-256
`767b9ddd7bd3089e3c6ec04543267b6210077e4b29f90feef8ea829a16cf0897`.
The foundation worker SHA-256 is
`3df1cd515deb81fe8805ef7409c7d1ed69d75c33149eaca694f58aabb55abd76`;
helper is `81309bd0845a58b764299a4abdb581f7af9a39ac588fa5bfbfe5413804008b09`.
The separate artifact/source audit verifies these recorded hashes, all native
source bytes and seven protected inputs (`build/iteration-380-audit.cjs`).
These artifact hashes supplement the foundation receipt's source binding;
the receipt itself does not contain an artifact-hash map.

One new explicit-profile native capability test verifies CLI and decoded HELLO
both report `processResourceBatch: true`, while this actual foundation worker
has null FreeRDP and `connectCore=false`. Probing/closing with default policy
options issues zero resource queries and removes its runtime directory. The
test can also run against newly supported linked outputs; old/native profiles
still skip unless explicitly selected for current batch support.

Two synthetic lifetime cases additionally cover the interval after the five-ms
collection timer has fired but before the physical invocation's immediate turn.
Expired staged members query no PID and release both permits; cancellation of
one staged member excludes only that PID while the healthy sibling succeeds.
This is distinct from expiry/cancellation during collection and from already
running-child cancellation. The gate/permit/batch/capability unit focus passes
38/38 in 1.77 s. The initial ignored staging prototype passes 2/2 separately;
the tracked tests reuse the existing fixtures. Logs:
`build/iteration-380-staging.log`, `iteration-380-focus.log`.

The foundation capability/helper/owner/fault/capacity integration set passes
12/12 in 24.71 s. Fixed forty-call scalar control completes all forty in
2,098 ms; batching completes forty in 328 ms through three launches. The
forty-worker/five-replacement fixture gathers 353 paired logical samples and
354 dispatched items through 100 launches, maximum batch thirteen. It reports
zero startup/active/retiring worker failures and zero admission expiries. Maximum
active query is 670 ms against the unchanged 3,000 ms bound; final query/batch
owners, PIDs and runtime are empty. These are bounded local controls, not a
statistical latency or connected performance claim. Evidence:
`build/iteration-380-foundation-focus.log`.

The initial foundation full run exposes three incorrect codec-fixture
prerequisites: browser/native microphone Opus, browser Opus decode and the
Opus viewer infer foundation from the directory name. The isolated output
has no `foundation` substring, so they attempt absent SDK-only executables
and fail `ENOENT`. The same failure reproduces in focused controls retained
in `build/iteration-380-codec-before.log` and `iteration-380-viewer-before.log`.
That first full run completes with 809 passed / 99 skips / three failures /
911 total in 516.11 s (`build/iteration-380-foundation-check.log`). Its affected
cases execute before the correction; their original diagnostics are preserved.

Those tests now query the actual bounded native CLI report for FreeRDP linkage,
matching CMake's SDK-fixture condition. Missing/malformed native reports remain
errors; a linked build's missing codec fixture still fails rather than being
silently skipped. Codec assertions are unchanged. On the actual foundation
output the corrected set passes its PCM case and explicitly skips three
SDK-dependent cases; the same four cases all pass on the current linked Debug
output. Logs: `build/iteration-380-codec-foundation-repeat.log`,
`iteration-380-codec-linked.log` (4/4, 15.00 s). This is a test-profile correction,
not native codec or audio acceptance on foundation.

Corrected full Windows foundation `pnpm check` passes build/lint/format and
809 tests / 102 profile/platform skips / 911 total, zero failures, in 561.39 s.
The three SDK-dependent cases explicitly skip and the PCM viewer still passes.
Host resource capability, native helper/fault controls and original forty-worker
capacity pass: no worker failures or admission expiries, 381 dispatched items
through 101 launches and maximum active query 714 ms. Final query/batch owners
are empty. Log: `build/iteration-380-foundation-check-repeat.log`.
Post-run source/artifact/protected-input audit, local documentation links,
explicit report formatting and `git diff --check` pass before commit.

Wider platform/CI, fresh OS/tools,
linked/connected resource, real Windows query failure, prolonged load, Release
adoption and complete stage gates remain open.
