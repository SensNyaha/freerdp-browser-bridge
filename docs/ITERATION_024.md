# Iteration 24 — observable RDPEI transport readiness and suspension

Date: 2026-10-09. Implements the next native transport part of SPECIFICATION §2.5,
ARCHITECTURE §7 and Stage 5 under accepted ADR-008 / ADR-009 / ADR-011.
The original scope, one-monitor decision and FreeRDP 3.32.1 pin are preserved.

## Delivered

- `bridge_rdpei` gains an isolated public-DVC endpoint/callback adapter. No private
  FreeRDP structures, source patches or dependency rebuild are required. This is
  not a plugin registration wrapper or worker channel activation.
- Readiness observes actual SC_READY/CS_READY framing and successful delegated
  receive/write completion. Channel open, GetVersion and contact API success
  remain insufficient. Negotiated version/count are distinct from permission
  to dispatch input or acknowledgement by a remote application.
- Server suspension closes the gate before delegation and discards upstream
  periodic TOUCH/PEN frames. Resume reopens transport without replaying stored
  packets; no queue or new timer exists. The global SuspendInput setting is not
  modified. The owner must separately resolve held contacts and current lease
  before advertising input readiness.
- Inbound reassembled PDU limits are 6..14 bytes; outbound framing is bounded at
  8,192 bytes before buffer inspection. Known versions, CS_READY fields and phase
  ordering are validated. TOUCH/PEN bodies are still the upstream encoder's
  responsibility; upstream DVC reassembly limits are separate retained work.
- Failures remove readiness; callback ownership has idempotent close and deferred
  destruction during active delegated methods. Binding requires synchronous
  dynamic channels with no asynchronous channel/update mode, and the adapter must
  outlive host callbacks and close before plugin termination on its RDP thread.

Contract and primary standards references: [DVC transport gate](INPUT.md#public-dvc-transport-gate).
ABI authority is the public `freerdp/dvc.h`, `freerdp/client/rdpei.h` and
`freerdp/channels/rdpei.h` at pinned commit
`bf217a504e54cc719880c228e82353382cd7d4fa`.

## Verification

- RDPEI suite: **23 cases / 9,789 assertions**. Four mock only the public touch
  call, ten load the actual linked RDPEI addin against a fake DVC endpoint, and
  nine use fake public DVC interfaces for failure/lifetime/parser tests.
- The five new actual-addin cases verify no readiness at channel open, negotiated
  v1.1/v2/v3/future-v4 exchange, suppression of two actual periodic contact frames,
  resume without stored-packet replay and explicit contact cancellation, failed
  CS_READY/early periodic writes, and malformed/out-of-phase server PDUs. Existing
  v1.0, contact allocation/exhaustion and encoded flag/coordinate tests still pass.
- Fake-interface cases cover missing/asynchronous interfaces, partial/rejected
  binding cleanup, successful write followed by receive failure, reply corruption,
  exceptions, reentrant close without destruction inside a delegated call, foreign
  thread rejection and rebind requiring a fresh handshake. Lengths 0..32 and all
  256 values of every six-byte header position are checked before delegation.
- A fixed 1,000-frame TOUCH/PEN loop checks suppression without packet retention.
  These fake frames inspect framing only; they are not encoded touch-body,
  bandwidth/FPS, real-session soak or physical pen evidence.
- Portable touch remains **10 cases / 13,114 assertions**. Windows bundled CTest
  **10/10** passes with `/W4 /WX` and `/analyze`; clang-format passes. Expected
  error-injection cases produce FreeRDP numeric diagnostics without session data.

- Bundled `pnpm check`: **124/124**, no skipped/cancelled cases, **121.77 s**.
  Typecheck, lint, formatting, native connection/lifecycle and sequential
  100-worker cleanup regression pass. The foundation CTest is **4/4**.
- Native package relocation is **1/1**: runtime/codec probes and worker lifecycle
  load local private libraries with dependency paths absent from PATH.

Logs are Git-ignored `build/iteration-024-*.log`.

## Retained integration and acceptance gaps

Stage 5 touch remains IN PROGRESS. A public plugin/listener registration owner and
Connection binding/cleanup are still required. The gate has no contact state or
control lease: suspension/resize/focus/detach must cancel/reset contacts and drain
upstream state before resume can be advertised as input-ready. Bounded/versioned
private IPC, Node/control ownership, browser contact IDs/capture/cancellation and
actual server/physical-device tests remain open. Pressure/orientation, hover and
optional pen are not newly supported. No capability bit or usable `rdp` status
changes; neither helper is linked into rdp-worker.

No new touch or other input is sent to the operational XRDP desktop in this block.
Actual video evidence remains iteration 22. Actual-addin tests here exercise native
channel integration with a fake transport, not remote RDP/device acceptance.
Linux, ASan/UBSan and libFuzzer gates remain open; deterministic mutations are not
claimed as a fuzzing campaign.
