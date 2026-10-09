# Iteration 25 — public RDPEI plugin and listener ownership

Date: 2026-10-09. Implements the isolated native plugin/listener lifecycle part of
SPECIFICATION §2.5, ARCHITECTURE §7 and Stage 5 under ADR-008 / ADR-009 / ADR-011.
FreeRDP 3.32.1 stays pinned to `bf217a504e54cc719880c228e82353382cd7d4fa`.

## Delivered

- PluginRegistration composes the actual linked RDPEI addin with DvcGate through
  public plugin, entry-points, manager and listener interfaces. Public context
  identity, optional notifications and host lookup methods are preserved.
- One registration/channel attempt per owner prevents stale callbacks from
  targeting a replacement generation. Failed Initialize cannot activate even a
  partial listener. Same-plugin DVC reopening remains retained work.
- Disconnect/Terminate close the gate before upstream callbacks. Active gate
  delegation, reentrant lifecycle and foreign-thread termination are rejected.
  The owner must outlive host Terminated; destruction is not unregistration.
- Failed host registration cleans a successfully created addin once. A local
  fallback protects pinned generic Initialize's unconditional listener dereference
  after creation failure. Partial listeners are cleaned at termination; cleanup
  errors ignored by upstream are surfaced without unsafe retries.
- Bundled-only component, isolated from rdp-worker. No input API, private IPC/WS
  contract, global addin-provider change, capability or session setting changes.

Contract and primary references:
[public registration owner](INPUT.md#public-rdpei-registration-owner).

## Verification

- RDPEI: **34 cases / 10,127 assertions**. Four public touch-call mocks, nine fake
  DVC gate cases, seven fake registration cases and fourteen actual linked-addin
  cases with a fake DVC endpoint. These are not remote RDP/device acceptance.
- Four new actual-addin cases cover wrapped context identity, real handshake and
  encoded DOWN/cancel, optional notifications, duplicate/replacement rejection,
  disconnect before host OnClose, failed/partial/missing listener outputs and
  rejection of termination inside CS_READY write. The real pump runs after
  termination without its freed RDPEI addin.
- Fake registration cases cover policy/host validation before entry allocation,
  existing plugin, failed/throwing registration, entry failure/missing plugin/wrong
  name, lifecycle forwarding, repeat initialization/termination, partial listener
  errors, callback exceptions and foreign-thread rejection. Cleanup happens at
  most once in these fixtures.
- Portable touch stays **10 cases / 13,114 assertions**. Windows bundled CTest
  **10/10**, MSVC `/W4 /WX`, `/analyze` and clang-format pass. Injected failures
  produce numeric FreeRDP diagnostics without session data.

- Bundled `pnpm check`: **124/124**, no skipped/cancelled cases, **102.64 s**.
  Typecheck, lint, formatting, native connection/lifecycle and sequential
  100-worker cleanup regression pass. Foundation CTest is **4/4**.
- Private native package relocation: **1/1**, runtime/codec probes and worker
  lifecycle pass without dependency paths in PATH.

Logs are Git-ignored `build/iteration-025-*.log`.

## Retained gates and findings

This block does not implement contact/lease ownership or enable touch. Pinned
TouchRawEvent/Cancel queues dirty local state; success is not proof of a written
terminal-contact frame. Cancel/reset/drain before resume input-readiness remains
required, including pending terminal contacts. Connection lifetime, host provider
dispatch, actual drdynvc threading/reassembly resource audit, bounded IPC, Node
control ownership and browser capture remain open. Actual server/physical touch,
pressure/orientation, hover/pen, Windows-server, Linux, ASan/UBSan and libFuzzer
acceptance are not claimed.

Source inspection identifies a host plugin-name append preceding plugin pointer
append; failure can leave mismatched bookkeeping. The wrapper accesses no private
arrays and does not repair that upstream allocation-failure path. Actual host
lifecycle/resource acceptance remains required.

No new input reaches the operational XRDP desktop. Prior actual viewing evidence
remains iteration 22. Stage 5 touch stays IN PROGRESS; original requirements and
the user's one-monitor/100% scope remain preserved.
