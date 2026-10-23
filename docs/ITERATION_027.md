# Iteration 27 — scoped RDPEI provider and worker lifetime

Date: 2026-10-09. Implements the provider/thread-lifetime part of SPECIFICATION
§2.5, ARCHITECTURE §7 and Stage 5 under ADR-001 / ADR-008 / ADR-009 / ADR-011.
Pinned FreeRDP 3.32.1 and source commit are unchanged.
Implementation commit: `1072e58`.

## Delivered

- Public addin-provider scope intercepts only the exact RDPEI DVC entry ABI;
  other channel classes retain the previous provider's behavior. Context identity,
  synchronous settings, overlapping scope, selector, foreign-thread and reentry
  checks precede plugin registration. Refusal entries prevent intercepted dynamic
  fallback. Previous/null provider restoration and foreign-replacement detection
  are explicit. No private host storage or arbitrary argv is used.
- Registration releases stack-borrowed host entry points after entry returns.
  Explicit retirement completes delegated cleanup on the RDP thread, publishes
  the retained result and lets later host Terminated return it without revisiting
  any delegated resources. Errors/partial cleanup remain visible.
- Connection binds after context creation/configuration and closes after
  disconnect, before the RDP thread exits. The wrapper outlives context destruction.
  Compile-time channel guards remain. Touch loading stays explicitly disabled
  until IPC/control/browser dispatch exists; no capability is newly advertised.

Contract: [provider and worker lifetime](INPUT.md#scoped-addin-provider-and-worker-lifetime).

## Verification

- RDPEI: **62 cases / 12,612 assertions**. Twenty-four use the actual pinned addin
  with fake DVC transport. Eight new public-provider cases include actual entry
  resolution/registration, context/thread/selector/scope/refusal checks, previous
  provider forwarding, lookup reentry/exception handling, foreign replacement,
  null restoration and RAII retirement. Six of these provider cases load the actual
  addin against fake host entry points; they are not actual drdynvc/server tests.
- Registration cases verify that premature foreign-thread retirement is refused,
  completed/error retirement is a cross-thread no-op, and stack-borrowed entry
  callbacks cannot register/look up resources after entry returns. A dedicated
  actual-addin case creates/frees context on the owner thread, installs/retires on
  the RDP thread and invokes later host termination after joining that thread.
- Bundled CTest **10/10**, foundation CTest **4/4**, MSVC `/W4 /WX`, `/analyze`
  and clang-format pass. Portable touch remains **10 cases / 13,114 assertions**.
- Bundled `pnpm check`: **124/124**, no skipped/cancelled cases, **130.89 s**.
  Typecheck, lint, formatting, connection/native lifecycle/fake input and sequential
  100-worker cleanup regression pass. Later native-only lifetime test additions
  were rebuilt and passed in the native suites.
- Actual XRDP/Edge H.264 reset/resize/reattach regression passes using the approved
  exact session-only fingerprint. It renders 40 frames before resize, recovers once
  from injected decode failure, displays nonuniform 1280×720 generation 3, then
  restores 1920×1080 generation 4. Display/cursor replay and cleanup pass. Decode
  mean **2.98 ms**, p95 **3.00 ms** describe this run, not a performance guarantee.
  Only one motion and four resets reached the operational desktop; no remote touch,
  wheel, text, key or button input was sent.

Logs: Git-ignored `build/iteration-027-*.log`.
Private native bundle relocation: **1/1**, using local DLLs without dependency PATH.

## Retained acceptance

No actual remote/device touch is claimed. Contact dispatch/reset/resize/control
wiring, bounded private IPC/Node/browser and real server/physical touch remain open.
RDPEI v1.0/timestamp-remoting cleanup and same-plugin DVC reopening are retained
compatibility work. Actual RDPEI host failure/reassembly/resource audit, Linux,
ASan/UBSan/libFuzzer and soak remain open. One primary monitor, 100% desktop/device
scale and orientation 0 are unchanged; other original requirements remain.
