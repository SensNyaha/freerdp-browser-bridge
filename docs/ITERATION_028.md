# Iteration 28 — bounded touch IPC codec foundation

Date: 2026-10-09. Implements the isolated touch-record validation part of
SPECIFICATION §2.5, ARCHITECTURE §7 and PROTOCOL §6 / Stage 5 under
ADR-008 / ADR-009 / ADR-011. No FreeRDP pin or original scope changes.
Implementation commit: `156b5d4`.

## Delivered

- INPUT_TOUCH kind 31 has a fixed 16-byte payload and schema version 1. Native and
  TypeScript framing reject any other length before body allocation. Unknown
  actions, reserved bytes, signed IDs, fractional/out-of-range values and malformed
  versions are rejected. Coordinates are absolute; the external ID is 31-bit.
- Native stateless decoding returns a fixed event without heap allocation.
  TypeScript codecs check the exact four-field shape before allocating a record.
  Existing physical input and UTF-16 text contracts remain unchanged.
- The IPC fuzzer harness has a touch decoder route. This Windows run does not
  compile/run libFuzzer or sanitizers, and makes no fuzz-campaign claim.
- No Node worker/public browser touch dispatcher or capability is added. Current
  native workers explicitly refuse this otherwise well-framed unsupported request.
  Contact transitions, negotiated readiness and control/display ownership remain
  separate dispatch checks, not properties of a successful stateless decode.

Contract: [touch IPC layout](IPC_FOUNDATION.md#touch-input-codec-foundation),
[input scope](INPUT.md#touch-ipc-codec-foundation).

## Verification

- Portable touch suite: **14 cases / 14,182 assertions**, including the unchanged
  state machine's 10 cases / 13,114 assertions and four new codec/framing cases.
  Independent big-endian vectors, all four actions, min/max IDs/coordinates,
  all 1,024 prefix-byte variants, truncated/overlong records, overflow values and
  header-only large-length rejection pass.
- TypeScript narrow protocol tests: **13/13**, including four new touch cases.
  Literal vectors agree with native expectations, shape/prototype/invalid type
  rejection and byte-at-a-time framing pass. Large declared lengths fail with
  only a header present, before a body can be supplied/allocated.
- Native lifecycle refusal: **1/1** on foundation and in the bundled full suite. The actual worker accepts HELLO,
  emits no touch capability, rejects INPUT_TOUCH with correlated ERROR 3 and exits
  normally with code 2. It does not connect to RDP or send device input.

- Bundled `pnpm check`: **129/129**, no skipped/cancelled cases, **113.78 s**.
  Strict TypeScript build, lint, formatting, native/fake integration and sequential
  100-worker cleanup pass. The five new Node cases are four codec cases and the
  separate actual-worker lifecycle refusal case.
- Bundled native CTest **10/10**, foundation CTest **4/4**, MSVC `/W4 /WX`,
  `/analyze` and clang-format pass. RDPEI remains **62 cases / 12,612 assertions**.
- Private package relocation **1/1**: local DLLs and native runtime probes work
  without dependency PATH. No actual RDP/device integration is added by this codec
  block; the preceding worker-provider block's XRDP regression is documented
  separately in [Iteration 27](ITERATION_027.md).

Logs are Git-ignored `build/iteration-028-*.log`.

## Retained acceptance

Worker contact dispatch/reset/drain/resize wiring, session opt-in, readiness status,
control leases, bounded queue scheduling, browser capture and real server/physical
touch remain open. Timestamp-remoting/v1.0 cleanup, same-plugin reopening, actual
drdynvc failure/reassembly/resource audit, Linux, ASan/UBSan/libFuzzer and soak are
retained requirements. Stage 5 remains in progress. No remote input is sent by
these codec tests; the existing single-monitor/100% decision is preserved.
