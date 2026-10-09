# Iteration 23 — bounded native RDPEI touch foundation

Date: 2026-10-09. Implements the native contact-state part of SPECIFICATION §2.5,
ARCHITECTURE §7 and Stage 5 under accepted ADR-008 / ADR-009 / ADR-011.
The original requirements and pinned FreeRDP commit are preserved.

## Delivered

- Portable `bridge_touch` keeps at most ten independent contacts in fixed storage,
  validates transitions/IDs/dimensions before dispatch and clamps coordinates to
  the observed desktop. Duplicate begins and unknown updates/ends/cancels are
  rejected; an eleventh begin leaves the active contacts unchanged.
- End at changed coordinates emits UPDATE followed by UP at the same point, as
  required by MS-RDPEI. Cancel uses the last attempted coordinates. Failed/uncertain
  dispatch, including begin or a sink exception, retains cleanup ownership and
  gates new input. Release attempts every contact and retries only failed cancels;
  channel-loss abandonment is explicitly local and asserts no remote delivery.
- Bundled-only `bridge_rdpei` projects through public TouchRawEvent with valid flags
  and checks both status and contact ID. OK with a negative ID is not acceptance.
  It does not use private FreeRDP structures or unchecked AddContact slot indices.
- Public DVC fixture loads the actual linked static RDPEI addin and runs its
  synchronous registered channel pump. Only the DVC transport endpoint is fake;
  encoded handshake/touch PDU, actual contact allocation and write failure are
  exercised. Fixture packet capture is bounded at eight 1024-byte records.
- Foundation/bundled CTest register portable state and bundled RDPEI tests.
  The helpers are not linked into rdp-worker or connected to WS/private IPC yet.
  There is no new input command, capability bit, production channel enablement,
  event queue, timer or dependency/version change; global usable `rdp` stays false.

Contract and standards: [native touch foundation](INPUT.md#native-touch-foundation).
The caller still must establish negotiated readiness, thread/lifetime ownership,
suspension and current lease before any real dispatch.

## Verification

- Portable touch: **10 cases / 13,114 assertions**. Validation before dispatch,
  desktop clipping, transition ordering, ten-contact overflow, independent slot
  reuse, cancellation coordinates, failed begin/final update/up, cleanup retry,
  sink exception and channel-loss abandonment pass. 1,000 ten-contact cycles
  execute 20,000 dispatches and return to empty state each time; this is functional
  bounded-state evidence, not a remote desktop soak test.
- RDPEI: **9 cases / 370 assertions**. Four replace the public call only to verify
  flag projection, signed API bounds, missing APIs, negative contact ID/API errors
  and ordered state/cleanup. Five use the actual pinned addin with a test DVC
  endpoint, covering pre-ready behavior, real SC_READY/CS_READY, DOWN/UPDATE/UP
  pixels/flags, cancellation with no remaining periodic active contact, actual
  64-slot upstream exhaustion and transport write failure/cleanup ownership.
- Bundled `pnpm check`: **124/124**, no skipped/cancelled cases, **109.63 s**.
  Typecheck, lint, formatting, native connection/lifecycle and the sequential
  100-worker cleanup regression pass. A separate foundation-worker run passes
  117 cases with seven explicit FreeRDP-only skips; those seven run in the bundled check.
- Windows MSVC /W4 /WX, /analyze and clang-format pass. The foundation CTest is
  **4/4** and bundled CTest **10/10**; original input/media/display regressions pass.
  Logs are Git-ignored `build/iteration-023-*.log`.

## Identified integration gaps

The actual addin fixture reproduces GetVersion=v3 and successful contact API return
before any SC_READY. Source/public-header inspection confirms ChannelConnected
does not establish readiness either, and no public completion callback currently
exists. A touch implementation must observe the readiness exchange and handle
server suspend/resume together with upstream periodic frames before advertisement.
That is retained work, not replaced by a guessed capability check.

Bounded/versioned private IPC, Node/control-lease ownership, browser contact IDs /
capture/cancellation, resize/focus/detach reset integration, pressure/orientation,
hover/pen and real server/physical touch remain open. No touch or other new input
is sent to the operational XRDP desktop in this block. Existing actual XRDP video
evidence is from iteration 22; this iteration's addin fixtures are native channel
integration with a fake transport, not actual RDP/device acceptance.
