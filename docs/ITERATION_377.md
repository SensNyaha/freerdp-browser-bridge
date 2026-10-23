# Iteration 377 — prepared bounded Windows resource batch helper

2026-10-20. Continues TODO Stage 10 launch-volume work after
[376](ITERATION_376.md): per-invocation event-loop progress improves, but two
resource queries still exceed the unchanged three-second deadline under the
40-worker full run. This block prepares one helper process to query up to
sixteen PIDs. It does not yet change the Node watchdog/sampler or advertise
automatic batching. Current load, cancellation/admission integration, capability
adoption and sustained/connected resource acceptance remain open.

The new private command validates a bounded complete decimal PID list into
fixed storage before querying. The existing scalar PID grammar moves to a
portable allocation-free header and keeps its old accepted values. The shared
OS read retains limited query access, checked CPU conversion and RAII handle
retirement. Batch results retain positional order, including duplicates and
independent target failures. Every target close attempt precedes output; a
failed close remains an errored item and callers still join helper exit for
complete retirement. A zero resident result is refused for the batch. The new schema-1 record
and exit conventions are explicit in [the command contract](PROCESS_RESOURCE_BATCH.md).
Existing scalar command behavior and all Release/dependency inputs stay unchanged.

The prepared TypeScript codec bounds the complete input at 2048 UTF-8 bytes,
requires the expected 1..16 count and canonical keys/integer grammar, and returns
only validated numeric item scalars. It refuses malformed, duplicate/escaped /
foreign keys, excess/missing records, inexact/negative values and inconsistent
errors with a fixed content-free error. Four codec cases plus the existing
scalar receipt/reader controls pass 6/6. The first codec run has one fixture
failure: its helper defaulted an explicitly invalid `undefined` count to one.
The fixture now distinguishes omitted versus explicit count; parser bounds are
unchanged. Both initial and corrected logs are retained:
`build/iteration-377-codec.log` and `iteration-377-codec-repeat.log`.

Three portable native cases cover scalar compatibility, exact maximum PID /
175-unit sixteen-item admission, order/duplicates, count overflow, malformed
elements, embedded NUL and non-ASCII digits. The actual command tests use an
explicit prepared-helper flag so older native outputs remain separately scoped.
With that flag enabled against the preceding linked worker/helper, two new
valid-command cases fail with the expected unsupported-command exit 2, while
the refusal grammar case passes. This before-control is retained in
`build/iteration-377-native-before.log`; it is not an acceptance result for the
new component. No RDP connection, source launch or device access occurs.

A new source-only linked Debug consumer uses the unchanged bound Debug SDK
at `build/freerdp-source-clean-iVDioP/receipt.json`; the private SDK/dependency
inputs are reused, with no download or Release replacement. MSVC 19.44 /
CMake 3.31.6-msvc6 / Ninja builds and CTest 34/34 pass in 43.60 s, including
the new portable PID cases. The ordinary framed process/TLS/lifecycle set
passes 27 / one platform skip. Evidence is `build/iteration-377-native-build.log`.

`build/native-clean-hHO2vQ/receipt.json` binds 353 source files / 1,937,918 bytes
with SHA-256 `a51df2b7c0b411c89ff0318543eff31e639d0218bc55921938fb2e2bc71879b1`.
The new worker is
`cac75576a5c607c7b576275f16d411ff6725657584668f37e39a951bc2e75c51`,
and helper is
`e2acddb70eac8ee0e89ca235107b3c3443cb1373d91f8c662c54474536c04dba`.
The native-source/artifact audit matches all 353 inputs, both artifacts and
seven protected files (`build/iteration-377-audit.cjs`).

Against those exact new artifacts, the explicit batch-helper profile plus
existing scalar/directory and codec checks pass 14/14, zero skips. One child
returns sixteen valid owned-process samples; mixed healthy/refused/healthy
requests retain sibling values and order, and a sixteen-error batch remains
a well-formed per-item result. Complete invalid grammar/arity yields no
receipt. The test joins each helper's close before parsing. This proves the
prepared command path, not automatic cross-worker query coalescing or a
resource-capacity correction. Log: `build/iteration-377-native-after.log`.

Full Windows `pnpm check` on this source profile, with the explicit prepared
helper tests enabled, passes build/lint/format and 832 tests / 51 skips /
one failure / 884 total in 631.80 s. All new command/codec cases pass. The
unchanged scalar-watchdog capacity case again fails with two active
`WORKER_RESOURCE_UNAVAILABLE` events, active query maximum 3,103 ms,
retiring query maximum 3,405 ms, invocation 91 ms, admission 2,800 ms,
complete-task maximum 620 ms and event-loop maximum 376 ms. These are
independent maxima. Prepared batching is not used by that case; the existing
query-throughput/adoption requirement remains open. No timeout, policy,
assertion or legacy command is relaxed to obtain a pass. Full evidence:
`%TEMP%/freerdp-bridge-iteration377-debug-check.log`.

Post-run native/source/artifact and protected-file audit still passes; no
worker/query-helper process remains and the temporary build alias is absent.
Clang-format with warnings-as-errors, explicit Markdown formatting and
`git diff --check` pass. The original Release worker remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
No Release settings, pins, native capability advertisement or active sampler
route are changed. Further owner/adoption work must meet the documented shared
admission, per-member cancellation and joined-retirement requirements.
