# Experimental keyboard and pointer input

This implements part of SPECIFICATION.md §2.5 and supports the interactive desktop
gate of Stage 4. Stage 5 remains open until keyboard layouts and mouse/wheel
behavior are verified on a controlled remote desktop.

The linked Windows worker advertises `basicInput` (HELLO bit 5); the foundation
worker does not. This capability covers physical set-1 keyboard events, absolute
mouse coordinates, five buttons, vertical/horizontal wheel, toggle synchronization
and release of tracked pressed input. It does not imply Unicode/IME, RDPEI touch,
pen or complete focus/modifier reconciliation. `rdp` remains false.

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
`input.sync`; the harness does not yet reconcile toggle/modifier state automatically.

`code` identifies a physical key, preserving left/right modifiers and extended
navigation/numpad keys; it does not translate a logical character using a US
layout. The accepted table is in `packages/protocol/src/input.ts`. Pause,
international keys beyond IntlBackslash and consumer/media keys remain unsupported.
The harness ignores unsupported physical codes and composition events. Remote
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
means native input queue overflow. ACK/error echoes the nonzero request ID.

Verification is separated: native state/record tests, fake-backend ownership and
ordering tests, Edge DOM tests, and a real XRDP movement-only smoke test.
See [iteration evidence](ITERATION_008.md). Actual remote keyboard, buttons,
wheel, keyboard layouts and no-stuck-keys acceptance remain pending.
