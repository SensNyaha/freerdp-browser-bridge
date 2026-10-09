# Iteration 21 — bounded committed Unicode text and IME fallback

Date: 2026-10-09. Implements SPECIFICATION §2.5, PROTOCOL §3/6,
MEDIA_PIPELINE §10 and accepted ADR-008 / ADR-009. ADR-011's one-primary-monitor,
100% scale scope remains. This is an experimental Stage 5 slice; global `rdp`
remains false and actual remote Unicode/OS IME acceptance is open.

## Delivered

- Strict `input.text` with one well-formed 1..256 UTF-16-unit string and no extra
  properties. NUL/C0/C1 controls are rejected except tab/LF/CR. Physical canvas
  input remains unchanged for shortcuts; text does not use a US layout mapping or
  Unicode normalization. A batch counts towards the existing total message limit
  and the shared 32 text/non-input command budget.
- Additive RWI1 kind 30 INPUT_TEXT: even 2..512-byte UTF-16BE body, validated at
  header boundaries before allocation and for surrogate pairing before enqueue.
  HELLO bit 10 `unicodeInput` requires connection-core/basic-input bits. Older
  workers decode false and cannot receive kind 30; unknown-bit readers require a
  coordinated upgrade. The foundation worker advertises false.
- One owned fixed-size batch occupies one of the existing 64 native/Node input
  slots. Control lease/state/resize rules apply to text, including stale queued
  command cancellation. The RDP thread releases tracked physical input, sends
  every unit down/up through the pinned public FreeRDP Unicode API and checks each
  result. A failed down stops immediately; a failed up retains one accepted unit
  for release retry. Already-dispatched or partial text cannot be undone.
- The worker checks the server-negotiated `FreeRDP_UnicodeInput` setting. ERROR 9
  maps to nonfatal INPUT_NOT_IMPLEMENTED; unsupported text does not poison the
  session input tail. Existing INPUT_ACK confirms the complete batch's API sends.
  Native read and Node encode/write IPC buffers are cleared. Queue/state,
  immutable JS and upstream copies are not claimed to be securely erased.
- Public correlated `input.text.result` exposes only request sequence and
  sent/unavailable/paused/failed, without echoing characters. No positive result
  is produced for a queued text command discarded after disconnection. Resize
  pause and absent Unicode support preserve the control attachment; actual send
  failure may terminate it. Sent is API success, not remote consumption.
- The harness provides an explicit local Unicode/IME textarea. Preedit stays
  local; a completed draft is submitted only by the user. One pending submission
  disables the field/button. Sent clears the draft; unavailable/paused retains it.
  Reset cancels not-yet-dispatched work and clears text; disposal removes listeners.
  The viewer resets physical input before text, correlates results and detaches
  after a seven-second deadline without retrying uncertain text. No text is stored
  in files, logs, metrics or error messages. Direct canvas IME/preedit mirroring is
  not implemented or claimed.

Contracts: [input](INPUT.md#committed-unicode-text),
[public protocol](../PROTOCOL.md#experimental-committed-unicode-text-v1-additive-extension),
[private IPC](IPC_FOUNDATION.md), [manual use](DEVELOPMENT.md#manual-windowsxrdp-viewer).

## Verification

- Narrow protocol/input/Edge/fake-IPC suite: **29/29**. A separate new 32-command
  text-budget test also passes. These are not real RDP text integration tests.
- Final bundled `pnpm check`: **115/115**, no skips/cancellations, **108.85 s**.
  Typecheck, lint, formatting, native lifecycle and the sequential 100-worker
  process/private-directory cleanup gate pass. The earlier 114-case run also
  passed before the final explicit text-rate boundary test was added.
- Pure browser/Node validators agree for every 65,536 individual BMP unit, plus
  supplementary pairs and size boundaries. Independent UTF-16BE/golden header
  vectors cover Cyrillic, CJK and emoji; combining marks and exact line endings
  are retained. Lone/reversed/truncated surrogates, forbidden controls, empty,
  oversized and odd records are rejected with fixed diagnostics.
- Fake native IPC validates the exact independent text vector, checks old-peer
  refusal before send, ERROR 9 without worker failure and ERROR 8 during resize.
  Heartbeat and physical input continue after unavailable Unicode.
- Fake control WS checks correlated sent/unavailable replies, a healthy subsequent
  command and malformed input rejection without echo. A burst of 33 text batches
  closes the attachment at the shared command-rate limit.
- Actual Edge DOM with a fake backend verifies no preedit forwarding, explicit
  composition commit once even under duplicate submit, one pending field, draft
  retention on unavailable/paused, oversized draft rejection, ready-state pause,
  reset-before-dispatch cancellation and disposal clearing. Composition events
  in this fixture are synthetic; no actual OS IME or RDP text is exercised.
- Foundation CTest **3/3**, bundled CTest **8/8**. IPC/input/state now has
  **24 cases / 473 assertions**, including three new Unicode cases. They check
  UTF-16/network boundaries, reset before ordered per-unit down/up, supplementary
  units, stop after send failure, release retry and no repeated accepted-down send.
  The new parser is included in the fuzz dispatcher; no new fuzz campaign is claimed.

## Separate actual XRDP / Edge viewing regression

The authorized 192.168.21.149:3389 lab used the previously approved exact
session-only fingerprint. The updated harness loaded with the new text module,
but automated native input stayed motion/reset only:

- H.264 recovered once after deliberately injected initial decode failure. Before
  resize it rendered 53 frames, decode mean 1.97 ms / p95 2.30 ms. It rendered
  nonuniform pixels at 1280×720 generation 3 and restored 1920×1080 generation 4,
  with configuration counts 3 then 4 and IDR/keyframe counts 13 then 15.
- JPEG independently rendered nonuniform pixels at those changed/restored sizes
  and generations, configurations 2 then 3. Before resize it rendered 51 frames,
  decode mean 18.28 ms / p95 28.50 ms.
- Both runs passed exact no-op/invalid odd-width requests, fresh-token reattachment,
  actual/rendered display replay and cursor shape replay. Each sent one motion and
  four resets, with empty runtime directories after shutdown. No text, physical
  keys, buttons or wheel reached the operational desktop.

These local measurements are not FPS/latency guarantees or remote Unicode/IME
acceptance. Native/fake input fixtures are intentionally distinct from RDP viewing.

Ignored logs: `build/iteration-021-*.log`.

## Retained acceptance

Actual remote application rendering, server Unicode rejection, real OS IME,
supplementary and line-ending behavior, keyboard layouts and disconnect no-stuck
tests remain open. Direct canvas IME/preedit, touch/pen and measured input latency
are not accepted by these fixtures. Stage 5 remains IN PROGRESS; no original
requirement is silently removed. Automated operational XRDP input remains restricted
to movement/reset, so browser viewing regression cannot accept remote text entry.
