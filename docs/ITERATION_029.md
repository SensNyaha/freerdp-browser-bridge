# Iteration 29 — opt-in native and private Node touch dispatch

Date: 2026-10-10. Implements SPECIFICATION §2.5, ARCHITECTURE §7 and Stage 5
under ADR-008 / ADR-009 / ADR-011. FreeRDP pin and single-display scope unchanged.
Implementation commit: `6a34e2f`.

The worker now creates the bounded Contacts owner on its RDP thread when opted in,
publishes negotiated readiness, validates generation-bound requests and shares a
fixed 64-record FIFO with physical input. Reset and requested resize drain contacts;
spontaneous resize holds gestures immediately. Cleanup failure tears down rather
than retrying uncertain gestures. Experimental Node methods expose readiness and
private dispatch; this is not yet public lease/browser touch support.

Configuration v4 and INPUT_TOUCH v2 preserve older layouts. TOUCH_UPDATE kind 32
and HELLO bit 11 are strict and capability gated. Invalid transition/unavailable/
stale generation/full failures are nonfatal. Public usable RDP remains false.

Verification:

- Bundled pnpm check: **133/133**, no skipped/cancelled tests. Strict TypeScript,
  lint, formatting and sequential lifecycle cleanup passed.
- Bundled CTest **10/10**, foundation **4/4**, MSVC /W4 /WX /analyze. Portable
  touch: **16 cases / 15,253 assertions**; IPC: **25 / 478**. RDPEI remains
  **62 / 12,612**. Fixed queue overflow/wrap/FIFO and independent v2 vectors pass.
- Narrow protocol/config **18/18**; fake-worker/private lifecycle **4/4** cover
  opt-in, generation, ten-contact limits, invalid transitions, suspension and reset.
  The fake worker contains no RDP connection; native refusal tests are lifecycle tests.
- Actual authorized XRDP inventory: **ready, ten contacts, 1920×1080** after DVC
  handshake, with heartbeat and JPEG capture. No remote contact/key/button/wheel/text
  was sent. Initial unavailable metadata is a handshake observation, not a failure.
- The fuzz decoder route is updated; no Windows libFuzzer/sanitizer campaign claimed.
- Private Windows bundle relocation **1/1** passed with local dependencies only.

Logs: Git-ignored build/iteration-029-*.log. Remaining: public controller ownership,
browser capture, real device/application touch, keyboard/wheel/layout gates,
no-stuck remote acceptance, RDPEI timestamp/v1.0 compatibility, same-plugin reopen,
host/reassembly/resource audit, Linux/sanitizers/soak. Stage 5 remains in progress.

