# Iteration 22 — bounded fractional wheel input

Date: 2026-10-09. Implements the Stage 5 mouse/wheel slice of SPECIFICATION §2.5,
ARCHITECTURE §7 and accepted ADR-008 / ADR-009 under ADR-011 display scope.
No public WS/native IPC input type, parser limit or capability bit changes.
Global usable `rdp` remains false.
Implementation commit: `c5d9ec3`.

## Delivered

- Replace a complete 120-unit notch for every nonzero browser wheel delta with
  independent fractional accumulation. The declared harness policy is 100 CSS
  pixels or three DOM lines per notch; page mode uses the canvas CSS dimension
  for the corresponding axis. Complete steps retain vertical inversion and
  horizontal direction, with one existing wheel record per signed 120-unit notch.
- Each DOM event emits at most two notches per axis/four records total. Spikes are
  saturated and excess is discarded without pending work. State is bounded at
  two fractions, a nine-value context and one monotonic timestamp; there is no
  timer or new queue. Floating-point threshold tolerance is 1e-9 notch.
- Context includes DOM mode, canvas CSS size, normalized remote target and modifier
  snapshot. Changes discard old partial gestures. Keyboard/button events, focus
  loss, blocked wheel input, reset/resize, pointer cancellation and disposal clear
  accumulated fractions. Over 500 ms idle or a backward clock resets before the
  next event; zero-delta events do not extend the gesture. Invalid/nonfinite input
  clears state and produces no record.
- Existing order is retained: preceding coalesced motion is flushed before a wheel
  event, with vertical before horizontal for completed steps. Physical transitions
  do not inherit older fractions. The actual lab helper serves the new module but
  its automation still permits only movement/reset to the operational desktop.

Contract and source rationale: [input](INPUT.md#fractional-wheel-and-trackpad-accumulation).
DOM unit conversion is explicitly client policy, with real-device sensitivity
remaining open. Browser/fake/native fixtures do not establish remote scroll distance.

## Verification

- Pure wheel suite: **8/8**. The input/Edge plus pure narrow run passes **15/15**;
  its additional zero-event idle assertion separately passes the 8-case suite.
- Bundled `pnpm check`: **124/124**, no skips/cancellations, **104.45 s**.
  Typecheck, lint, formatting, native lifecycle and the sequential 100-worker
  process/runtime-directory cleanup gate pass. Native implementation and wire
  are unchanged in this block.
- Cases cover signed independent axes and reversal, fractional convergence,
  pixel/line/page modes and CSS geometry, context/modifier/target changes, reset,
  spike saturation, invalid deltas/modes/times/geometry and 500 ms clock bounds.
  Repeated 2,403 bounded input combinations retain four-or-fewer records, each
  exactly ±120 and native-schema-safe, without zero-event replay.
- A deterministic 1,000-event stream of deltaY=0.1 produces **one** -120 record
  after 100 pixels; the old per-event sign rule would produce **1,000** -120
  records. A further 99.9 + 0.1 pixels produces exactly one next step. This is
  functional event-count evidence, not an end-to-end latency or physical-device
  benchmark.
- Actual Edge DOM with a fake control backend verifies scaled pointer movement
  before completed vertical/horizontal steps, fractional line events, capped page
  spikes, no backlog, blur/refocus and key-transition isolation, blocked/resumed
  input, reset while paused, target changes, disposal and a healthy WS attachment.
  The existing Edge pointer/drag/wheel fixture now uses a full 100-pixel gesture;
  physical scancode, text/composition and control schema regressions pass.

## Separate actual XRDP / Edge regression

The authorized 192.168.21.149:3389 lab used its previously approved exact
session-only certificate fingerprint. The updated module chain loaded and the
H.264 viewer recovered once from deliberately injected initial decode failure.
Before resize it rendered 48 frames, decode mean 1.96 ms / p95 2.20 ms.

The viewer rendered nonuniform pixels at 1280×720 generation 3 and restored
1920×1080 generation 4, with configuration counts 3 then 4 and keyframes 13 then
15. Exact no-op/invalid odd-width requests and fresh-token reattachment passed;
actual/rendered display and cursor shape replay agreed. The run sent one motion
and four resets, with empty runtime directories after shutdown.

No wheel, text, physical key or button input reached the operational desktop.
This is a viewing/reset/resize regression with the new input module, while actual
remote wheel/trackpad acceptance remains open. Measurements describe this local
run and are not FPS/latency guarantees.

Ignored logs: `build/iteration-022-*.log`.

## Retained acceptance

Real remote wheel/buttons and mouse/trackpad sensitivity, Windows-server and other
browser/platform coverage, measured input latency, no-stuck-key disconnect checks,
keyboard layouts, Unicode/OS IME and touch/pen remain open. This browser fix does
not complete Stage 5 or change any requirement outside accepted ADR-011 scope.
