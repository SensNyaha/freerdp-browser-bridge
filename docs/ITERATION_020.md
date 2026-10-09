# Iteration 20 — browser modifier and focus synchronization

Date: 2026-10-09. Implements a Stage 5 slice of SPECIFICATION §2.5,
MEDIA_PIPELINE §10 and accepted ADR-008 / ADR-009. Accepted ADR-011 separately
fixes current required display scope at one primary monitor, orientation 0 and
100% desktop/device scale; its scope commit is `adcc9de`.
Global usable `rdp` remains false. No WS/IPC type or capability bit is added.
Implementation commit: `236f1a1`.

## Delivered

- A pure bounded browser state machine reconciles Shift/Control/Alt/Meta before
  focused input. It tracks at most eight remote and eight observed physical sides.
  Document capture observes only modifier codes and stores no character data;
  events outside canvas focus are not forwarded. Missing keyup is repaired from
  subsequent aggregate flags. Explicit physical edges replace inferred sides,
  retain both known sides and preserve repeat events.
- Canvas focus changes and resize reset remote state while retaining locally
  observed sides. Window blur/page hiding clears observations. When a modifier
  was already held outside the browser and its side is unknown, the documented
  fallback is left; AltGraph uses right Alt without inventing Control. Actual
  browser Ctrl+Alt snapshots are honored. These rules do not translate characters
  or establish portability of remote keyboard layouts.
- Keyboard snapshots synchronize Caps/Num/Scroll Lock using the existing native
  toggle mask. Initial all-off snapshots synchronize too. Physical lock edges
  precede forced synchronization so the new state is not applied before the key
  toggles it. Pointer events do not overwrite lock state. Modifier edges remain
  active during composition; composing character events remain suppressed.
- Reconciliation flushes preceding coalesced motion. The input disposer now exposes
  reset and an optional reset-readiness predicate independent of ordinary input.
  The viewer resets before allocating its resize request sequence and when a
  pending/new display epoch arrives. Reset remains available during a resize pause;
  regular input still waits for actual/rendered epoch and geometry agreement.
  Disposal removes all observation listeners.
- The actual XRDP helper serves the new browser module. Its automated native input
  guard continues to allow only motion/reset on the operational lab desktop.

Contract: [input](INPUT.md), [Display Control](DISPLAY_CONTROL.md).

## Verification

- Narrow pure/Edge/control suite: **10/10**, including seven new pure cases and
  one new Edge/fake-control case, plus two existing input integration cases.
- Bundled `pnpm check`: **108/108**, no skips/cancellations, **111.22 s**.
  Typecheck, lint, formatting, native lifecycle integration and the sequential
  100-worker process/runtime-directory cleanup gate pass.
- Pure cases cover inferred-to-explicit sided migration, both physical sides,
  missed releases, focus/resize reset, composition/repeats, AltGraph and all eight
  lock masks. Exhaustive 256 physical sets × 16 aggregate snapshots verify bounded
  actions, convergence and only the eight known modifier codes.
- Actual Edge DOM with a fake control backend verifies right-side entry from
  outside canvas, no outside-focus forwarding, extended right Control scancode,
  missed keyup before a non-US logical character's physical key, composing modifier
  transitions, CapsLock edge/sync ordering, reset while regular input is paused,
  ignored paused characters, resume without a stale modifier and disposal.
  These keyboard events do not reach an actual RDP server.
- Bundled native CTest: **8/8**; foundation CTest: **3/3**. IPC/input/state now has
  **21 cases / 400 assertions**. The added case checks masks 0..7, failed synchronize
  handling and distinct left/right releases without losing tracked state. Existing
  release retry, public GDI/GFX, codec, cursor and Display Control fixtures pass.

## Separate actual XRDP / Edge regression

The authorized 192.168.21.149:3389 lab used its previously approved exact
session-only certificate fingerprint. Automated input remained motion/reset only:

- H.264 recovered once from the deliberately injected initial decoder failure.
  Before resize: 53 rendered frames, decode mean 3.23 ms / p95 2.80 ms. It rendered
  nonuniform decoded pixels at 1280×720 generation 3 and restored 1920×1080
  generation 4, with fresh configurations and IDRs (config counts 3 then 4;
  keyframes 13 then 15).
- JPEG independently rendered nonuniform pixels at the same changed/restored
  dimensions and generations, with config counts 2 then 3. Before resize:
  47 rendered frames, decode mean 15.37 ms / p95 20.90 ms.
- Both viewers survived exact no-op and invalid odd-width requests, reattached
  with fresh tokens and replayed matching actual/rendered display state and cursor
  shape. Each run sent one motion and four resets. Runtime directories were empty
  after shutdown. No keyboard, button or wheel events reached the lab.

These measurements are local-run observations, not FPS/latency guarantees or
remote modifier/lock acceptance.

Ignored logs: `build/iteration-020-{check,foundation,bundled,h264,jpeg}.log`.

## Retained acceptance

Stage 5 remains IN PROGRESS. Actual remote keyboard layouts, lock state and
AltGraph behavior, no-stuck-key verification after disconnect, real buttons/wheel,
precise trackpad accumulation, Unicode/IME, touch and pen are not accepted by
browser/fake/native state fixtures. Platform coverage and interactive soak remain
open. Scope exclusions in ADR-011 do not remove these requirements.
