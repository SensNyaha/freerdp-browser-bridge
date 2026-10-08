# Iteration 8 — bounded physical input and release ownership

Date: 2026-10-08. Implements the physical keyboard/pointer portion of
SPECIFICATION.md §2.5 and ARCHITECTURE.md §7, needed for the interactive Stage 4
desktop gate. The normative blueprint and remaining input requirements are
preserved. [INPUT.md](INPUT.md) specifies the actual control and native wire contract.
Implementation and verified tests: commit `3a8ad71`.

The worker now advertises a separate `basicInput` capability, accepts bounded
fixed-size records and dispatches them on the RDP thread using FreeRDP 3.32.1
public input APIs. Pressed key/button state supports repeat, duplicate suppression
and reset. Failed releases remain tracked for another cleanup attempt.

Node serializes input and reserves reset capacity. A detached lease invalidates
its unsent input; an in-flight command is followed by reset before commands from
a new controller. Graceful native session shutdown requests reset too. Failure
of delivery terminates the session through the existing bounded cleanup path.

The harness now focuses the desktop, scales absolute coordinates, captures
mouse drags, coalesces only pointer movement and releases input on focus loss,
cancellation, page hiding and detach. The default local cursor remains in use;
separate remote cursor shape/hotspot/visibility transport is the next media task.

## Verification

- MSVC /W4 /WX /analyze: foundation and bundled profiles pass; foundation has
  two CTest targets and bundled has four. Native IPC/input: 11 cases / 152
  assertions; AVC: 2 / 19; JPEG: 1 / 13; H.264: 2 / 66.
- Bundled `pnpm check`: 58/58 Node tests, build, lint and format pass.
- Foundation Node profile: 51 passing / 7 linked-connection tests skipped.
- Private native bundle relocation passes with dependency PATH removed; CLI
  reports `basicInput: true` and `rdp: false`. JPEG/AVC runtime roundtrips pass.
- Protocol vectors cover extended right modifiers, wheel sign, extra button
  IDs, fixed IPC limits, additional field rejection and invalid input records.
- Native state tests cover repeats, duplicate downs/ups, dimension clamps,
  complete releases, idempotent reset and retry after a failed release.
- Explicit fake-backend tests cover control/media ownership, queue limits,
  immutable queued events, stale lease cancellation, reserved reset and ordering
  across reattachment. Control WS validates data and resets after transport loss.
- Edge input fixture uses a fake remote backend: CSS coordinate scaling,
  movement coalescing, keyboard blur/disposal, captured right-button drag outside
  the canvas and both wheel axes are checked without sending remote actions.
- Actual authorized XRDP through H.264/Edge: 1920x1080, 33 frames / 671,112 AVC
  bytes during the 15-second warmup check; image variation and fresh-token
  reattachment pass. One mouse movement traversed browser control → Node →
  native IPC → the FreeRDP API and received its native ACK. A detach reset also
  received ACK. The helper forbids key/button/wheel events on this lab desktop.
  This proves API delivery, not remote application input behavior or a sustained
  FPS/latency target.
- Linux sanitizers/fuzz execution remains pending; the existing fuzz target now
  dispatches INPUT records into the bounded input decoder.

Actual remote keyboard layouts, button/wheel behavior and no-stuck-keys acceptance
on a controlled desktop remain pending. Unicode/IME, automatic modifier/toggle
reconciliation, precise trackpad accumulation, touch, pen and separate cursor
transport remain open. Full usable-desktop `rdp` capability remains false.
