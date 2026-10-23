# Iteration 26 — terminal contact ownership through suspend/reset/resume

Date: 2026-10-09. Implements the isolated native contact/drain part of SPECIFICATION
§2.5, ARCHITECTURE §7 and Stage 5 under ADR-008 / ADR-009 / ADR-011. FreeRDP 3.32.1
and its pinned source commit are unchanged.
Implementation commit: `d38afe1`.

## Delivered

- Contacts retains ten external/native ID pairs through actual terminal transport
  writing. End/cancel API acceptance cannot prematurely reuse an ID.
- Gate phase observers request reset/hold on suspension. Encoded gesture frames
  are discarded; up to ten native terminal records of at most 31 bytes are retained
  in fixed storage, even after upstream consumes its periodic UP state.
- A fresh at-most-320-byte cleanup envelope copies only validated native UP records.
  Successful writing releases ownership and input readiness; there is no gesture
  queue/replay or newly scheduled timer. Whole-frame checks precede state mutation.
- Native status/ID submission is explicit and exception-safe. Untracked contacts
  fail before writing. A running drain has a two-second deadline; server suspension
  may last longer. Failed drain requires Connection teardown, never gesture retry.
- The owner requires actual DISABLE_TIMESTAMP_INJECTION in negotiated RDPEI 1.0.1+
  before enabling its profile. v1.0 transport still works, while timestamp-remoting
  contact cleanup remains required compatibility work. No new worker activation,
  capabilities or IPC/browser contract changes in this isolated block.

Contract and primary standard references:
[terminal ownership/drain](INPUT.md#terminal-contact-ownership-and-drain).

## Verification

- RDPEI suite: **51 cases / 12,314 assertions**. Twenty-three load the actual pinned
  addin against a fake DVC endpoint, seven test the bounded body parser/terminal
  envelope directly, and twenty-one use public-call/gate/registration fake fixtures.
  Public API exception and invalid/uncertain native IDs are explicitly tested.
- Nine new actual-addin cases cover pending-end ID ownership/reuse, local reset,
  suspended UP consumption followed by cleanup, resume before service/pump,
  ten-contact overflow/reset, end accepted before suspend, failed cleanup write,
  deadline failure, channel-loss abandonment, v1.0 unavailability, untracked native
  IDs, foreign thread rejection and long server suspension. Re-enveloped records
  decode to only the expected native UP flags/coordinates; no later periodic active
  frame remains after cleanup in these fixtures.
- Parser cases cover signed integers/rectangles, optional orientation/pressure,
  full signed widths, truncation, 64-contact limits, duplicate IDs, unknown fields,
  1,536 header mutations, variable-integer prefixes and forbidden active/oversized
  cleanup records. These deterministic checks are not a libFuzzer/ASan campaign.
- The actual-addin fixture now waits 40 ms per pump: Windows GetTickCount64 can
  quantize at about 16 ms, so its old 25-ms wait occasionally missed a 20-ms poll.
  This changes test scheduling only, not the product timer or measured performance.
- Bundled native CTest **10/10**, `/W4 /WX`, `/analyze` and clang-format pass.
  Portable touch is unchanged at **10 cases / 13,114 assertions**.

- Bundled `pnpm check`: **124/124**, no skipped/cancelled cases, **111.24 s**.
  Typecheck, lint, formatting, connection/lifecycle and sequential 100-worker
  cleanup regression pass. Foundation CTest is **4/4**; package relocation **1/1**.

Logs are Git-ignored `build/iteration-026-*.log`.

## Retained acceptance

No actual remote/device touch is claimed. Timestamp-remoting/v1.0 cleanup,
Connection/provider/thread/resource ownership, control leases, resize/focus/detach
reset wiring, bounded private IPC/Node/browser and real server/physical touch are
open. Pressure/orientation and optional pen are not newly exposed. Actual drdynvc
reassembly, host failure audit, Linux, ASan/UBSan/libFuzzer and soak remain open.
No new input reaches the operational XRDP desktop in this native fixture block.
Original requirements and the one-monitor/100% decision remain preserved.
