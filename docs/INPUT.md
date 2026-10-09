# Experimental keyboard and pointer input

This implements part of SPECIFICATION.md §2.5 and supports the interactive desktop
gate of Stage 4. Stage 5 remains open until keyboard layouts and mouse/wheel
behavior are verified on a controlled remote desktop.

The linked Windows worker advertises `basicInput` (HELLO bit 5); the foundation
worker does not. This capability covers physical set-1 keyboard events, absolute
mouse coordinates, five buttons, vertical/horizontal wheel, toggle synchronization
and release of tracked pressed input. It does not imply Unicode/IME, RDPEI touch,
pen or complete remote keyboard-layout acceptance. Browser focus/modifier and
toggle reconciliation is implemented as described below; `rdp` remains false.

## Control channel

Use the existing v1 control envelope, increasing `seq`, with these exact data
objects. Additional properties, invalid coordinates and unknown physical codes
are rejected. Input belongs only to the current connected control lease.

| Command | Data |
|---|---|
| `input.key` | `{code: string, down: boolean, repeat: boolean}` |
| `input.pointer` move | `{action: "move", x: integer, y: integer}` |
| `input.pointer` button | `{action: "button", x: integer, y: integer, button: integer, down: boolean}` |
| `input.wheel` | `{delta: integer, horizontal: boolean}` |
| `input.sync` | `{toggles: integer}` |
| `input.reset` | `{}` |

Coordinates are desktop pixels: x 0..7679, y 0..4319. The native thread clamps them
to the current desktop dimensions. Button numbers follow DOM: 0 left, 1 middle,
2 right, 3 back, 4 forward. Wheel delta is -255..255 excluding zero; positive
vertical means upward, positive horizontal means rightward. The harness sends
120-unit steps and reverses DOM vertical direction; precise trackpad accumulation
is pending. Toggle bits are 1 scroll lock, 2 num lock, 4 caps lock. Hosts can send
`input.sync`; the harness automatically reconciles browser-reported toggles and
modifiers before focused input. Lock key edges precede their synchronize event,
so synchronization does not set the new lock value before the physical key toggles it.

`code` identifies a physical key, preserving left/right modifiers and extended
navigation/numpad keys; it does not translate a logical character using a US
layout. The accepted table is in `packages/protocol/src/input.ts`. Pause,
international keys beyond IntlBackslash and consumer/media keys remain unsupported.
The harness ignores unsupported physical text keys and composing character events;
modifier transitions/reconciliation remain active during composition. Remote
keyboard layout selection, Unicode text and IME require subsequent work.

No positive application-level ACK is emitted on the browser control channel.
The native ACK confirms that the FreeRDP input API returned success, not that the
remote application consumed the event. Failure closes the control attachment
with a fixed error. Control payloads remain at most 4 KiB, with a total limit of
256 messages/second, including at most 32 non-input commands/second.

## Bounded delivery and cleanup

Node serializes input for each session, with at most 64 pending user commands and
one reserved reset. An event is copied when queued. Detach invalidates queued
commands from that lease immediately; an already dispatched command completes,
then reset runs before a new controller's commands. Media leases cannot send input.
Duplicate detach is idempotent. Reset failure fails the session and starts bounded
worker cleanup rather than accepting further controller input.

Native IPC parsing never calls FreeRDP input APIs. A mutex-protected queue of at
most 64 records wakes the RDP thread through its existing event handle. That thread
tracks pressed scancodes and buttons, suppresses duplicate transitions, preserves
explicit key repeats and expands reset into individual releases. Queue overflow
rejects further records until the accepted queue is processed and tracked input
is released. A failed input send fails the transport; teardown attempts all known
releases before disconnect. Graceful Node shutdown also requests reset before
worker shutdown. A broken remote transport cannot guarantee delivery of releases.

The harness scopes keyboard and wheel to canvas focus, uses pointer capture for
dragging and maps CSS coordinates to remote pixels. Only adjacent unsent pointer
moves are coalesced to one requestAnimationFrame; key/button/wheel transitions
flush preceding motion. Blur, page hiding, pointer cancellation, lost pointer
capture and disposal discard unsent motion and request reset. Socket close also
releases input through the server lease even if the browser cannot send reset.

## Native wire extension

RWI1 kind 22 INPUT has exactly 12 bytes; kind 23 INPUT_ACK is empty. All integers
are big endian. INPUT layout: u8 type, u8 flags, u16 a, u16 b, u16 c, u32 reserved=0.

| Type | Flags | a | b | c |
|---|---|---|---|---|
| 1 key | bit 0 down, bit 1 repeat; repeat requires down | set-1 scancode, optional bit 8 extended | 0 | 0 |
| 2 move | 0 | x | y | 0 |
| 3 button | 0 up / 1 down | x | y | DOM button 0..4 |
| 4 wheel | 0 vertical / 1 horizontal | signed i16 delta | 0 | 0 |
| 5 reset | 0 | 0 | 0 | 0 |
| 6 synchronize | 0 | toggle bits 0..7 | 0 | 0 |

Scancode base bytes must be 1..127; the public browser boundary further restricts
them to the supported physical table. Unknown types, flags, reserved data and
lengths are fatal native protocol errors. ERROR 5 means not connected; ERROR 6
means native input queue overflow. ERROR 8 means input was paused for a queued/active
private Display Control request. Native tracking releases held input before layout,
rejects non-reset records without replay and resumes before the completion reply.
Reset remains accepted. WorkerProcess exposes a nonfatal INPUT_DISPLAY_TRANSITION;
public control delivers nonfatal `input.paused`, and the viewer waits for matching
actual/rendered display state before resuming regular input.
ACK/error echoes the nonzero request ID. [Display contract](DISPLAY_CONTROL.md).

Verification is separated: native state/record tests, fake-backend ownership and
ordering tests, Edge DOM tests, and a real XRDP movement-only smoke test.
See [iteration evidence](ITERATION_008.md). Actual remote keyboard, buttons,
wheel, keyboard layouts and no-stuck-keys acceptance remain pending.

## Browser modifier/focus reconciliation

The harness observes only the eight Shift/Control/Alt/Meta physical sides in its
document, without forwarding events outside canvas focus or recording character
data. It keeps at most eight observed and eight remote modifier slots plus one
lock snapshot. Before focused key/pointer/wheel input, aggregate DOM flags release
tracked modifiers whose keyup was missed and restore held modifiers before the
user's event. When observed in the document, left/right sides are preserved across
canvas focus changes and resize input pauses. Window blur/page hiding discards
observations; disposal removes the capture listeners.

If a modifier was held outside the browser and its side has never been observed,
DOM aggregate flags cannot identify that side. The documented fallback is left
Shift/Control/Alt/Meta; a logical AltGraph snapshot uses right Alt. Explicit physical
edges replace inferred sides and preserve both known physical sides. Ctrl is never
invented merely because AltGraph is active; a browser reporting an actual composite
Ctrl+Alt snapshot retains both. This is physical-state recovery, not a character
or keyboard-layout translation. The [W3C UI Events contract](https://www.w3.org/TR/uievents/)
defines aggregate state, sided keyboard events and platform-dependent AltGraph behavior.

Caps/Num/Scroll Lock use only KeyboardEvent.getModifierState snapshots; pointer
events cannot overwrite the lock cache. The first keyboard event after reset
synchronizes even an all-off mask, changes synchronize once, and lock key edges
force a following synchronization even when the cached mask repeats. Browsers /
platforms not reporting a lock state cannot establish its correctness; no Kana
lock or cross-platform layout acceptance is claimed.

Transitions flush older coalesced motion. Reset discards unsent motion and clears
remote modifier/toggle state; a canvas/resize reset can retain locally observed
physical sides for the next focused snapshot. The installInput disposer exposes
`reset()`, and an optional fifth predicate allows reset while regular input is
paused. The viewer resets before its resize request and on pending/new observed
display epochs. Reset is still accepted by the session/native resize path, and
regular input resumes only after actual/rendered display state agrees.

No new WS/IPC input type or capability bit is added: the existing bounded
`input.key`, `input.sync`, `input.reset` and HELLO basicInput are used.
[Iteration 20](ITERATION_020.md) separates pure reconciliation, fake control/Edge
and native state fixtures from actual XRDP movement/reset-only regression.
