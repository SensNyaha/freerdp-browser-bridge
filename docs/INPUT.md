# Experimental keyboard and pointer input

This implements part of SPECIFICATION.md §2.5 and supports the interactive desktop
gate of Stage 4. Stage 5 remains open until keyboard layouts and mouse/wheel
behavior are verified on a controlled remote desktop.

An isolated [native touch foundation](#native-touch-foundation) is also tested.
It is not connected to worker IPC or browser input and does not advertise RDPEI support.

The linked Windows worker advertises `basicInput` (HELLO bit 5); the foundation
worker does not. This capability covers physical set-1 keyboard events, absolute
mouse coordinates, five buttons, vertical/horizontal wheel, toggle synchronization
and release of tracked pressed input. It does not imply Unicode/IME, RDPEI touch,
pen or complete remote keyboard-layout acceptance. A separate experimental
`unicodeInput` (HELLO bit 10) implements committed text as described below, without
claiming remote Unicode acceptance. Browser focus/modifier and
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
| `input.text` | `{text: string}`; bounded committed Unicode batch below |

Coordinates are desktop pixels: x 0..7679, y 0..4319. The native thread clamps them
to the current desktop dimensions. Button numbers follow DOM: 0 left, 1 middle,
2 right, 3 back, 4 forward. Wheel delta is -255..255 excluding zero; positive
vertical means upward, positive horizontal means rightward. The harness accumulates
fractional DOM deltas into 120-unit steps, using the client policy below, and
reverses DOM vertical direction. Actual trackpad/application acceptance is pending.
Toggle bits are 1 scroll lock, 2 num lock, 4 caps lock. Hosts can send
`input.sync`; the harness automatically reconciles browser-reported toggles and
modifiers before focused input. Lock key edges precede their synchronize event,
so synchronization does not set the new lock value before the physical key toggles it.

`code` identifies a physical key, preserving left/right modifiers and extended
navigation/numpad keys; it does not translate a logical character using a US
layout. The accepted table is in `packages/protocol/src/input.ts`. Pause,
international keys beyond IntlBackslash and consumer/media keys remain unsupported.
The harness ignores unsupported physical text keys and composing character events;
modifier transitions/reconciliation remain active during composition. Remote
keyboard layout selection and full remote IME/layout acceptance require subsequent
work. An explicit committed Unicode/IME fallback is available below.

No positive application-level ACK is emitted for physical input on the browser
control channel. Committed text has a correlated transport/API result below.
The native ACK confirms that the FreeRDP input API returned success, not that the
remote application consumed the event. Failure closes the control attachment
with a fixed error. Control payloads remain at most 4 KiB, with a total limit of
256 messages/second, including at most 32 text/non-input commands/second.

### International physical positions

The physical table additionally recognizes these codes without using locale
characters or translating text. Code names follow [W3C UI Events code values](https://www.w3.org/TR/uievents-code/);
the set-1 values agree with the Windows column of [Chromium's mapping table](https://raw.githubusercontent.com/chromium/chromium/main/ui/events/keycodes/dom/dom_code_data.inc)
and [pinned FreeRDP public scancodes](https://github.com/FreeRDP/FreeRDP/blob/bf217a504e54cc719880c228e82353382cd7d4fa/include/freerdp/scancode.h).

| Browser code | Set-1 | Pinned public constant |
|---|---:|---|
| IntlRo | 0x73 | RDP_SCANCODE_ABNT_C1 |
| IntlYen | 0x7D | RDP_SCANCODE_BACKSLASH_JP |
| KanaMode | 0x70 | RDP_SCANCODE_HIRAGANA |
| Convert | 0x79 | RDP_SCANCODE_CONVERT_JP |
| NonConvert | 0x7B | RDP_SCANCODE_NONCONVERT_JP |
| Lang1 | 0x72 | RDP_SCANCODE_HANGUL |
| Lang2 | 0x71 | RDP_SCANCODE_HANJA |
| NumpadComma | 0x7E | RDP_SCANCODE_ABNT_C2 |

The native worker asserts this agreement at compile time. Existing 12-byte INPUT
and input.key shapes are unchanged. Composing non-modifier events stay local;
Unicode text uses its separate explicit commit path. Native tracking releases all
held positions on reset. This does not select the server keyboard layout or prove
Japanese/Korean/Brazilian hardware or remote IME behavior. Unsupported physical
codes remain explicit; broader layout acceptance is retained. [Iteration 34](ITERATION_034.md).

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

## Committed Unicode text

This Stage 5 slice adds kind 30 INPUT_TEXT and separate HELLO bit 10 `unicodeInput`.
Legacy kind 22 remains exactly 12 bytes and does not accept text/internal Unicode
event types. New Node peers decode absent capability false and refuse kind 30 for
older workers. The foundation build advertises false. The linked worker checks
the server-negotiated public `FreeRDP_UnicodeInput` setting after post-connect;
unsupported servers return nonfatal ERROR 9 without sending any Unicode events.
The [Microsoft Input Capability Set](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/b3bc76ae-9ee5-454f-b197-ede845ca69cc)
defines server Unicode support; pinned FreeRDP input.h and input.c are authoritative
for the send API and return values.

INPUT_TEXT is 1..256 UTF-16 units in network byte order (2..512 bytes, no BOM).
Empty, odd and oversized lengths are rejected before body allocation. Native and
Node validate surrogate pairing before dispatch, rejecting NUL and C0/C1 controls
except tab/LF/CR. Combining marks, supplementary pairs and exact line endings are
retained without Unicode normalization. Behavior of line endings, supplementary
characters and IME output in actual remote applications still requires acceptance.

One batch occupies one existing queue slot, using a fixed 256-unit owned array;
there is no new text queue or per-unit IPC round trip. The RDP thread first releases
tracked physical keys/buttons, then sends each UTF-16 unit down/up via public
`freerdp_input_send_unicode_keyboard_event`, checking every BOOL. Failure stops the
batch immediately. One accepted Unicode down whose release failed is retained for
teardown/reset retry; no following units are sent. Partial batches cannot be undone.
Detach invalidates queued lease work; a batch already dispatched can finish. Resize
rejects text with nonfatal input pause and does not replay it.

The public control extension is [specified here](../PROTOCOL.md#experimental-committed-unicode-text-v1-additive-extension).
Result contains only sequence and `sent/unavailable/paused/failed`, never text.
Unavailable support does not fail the session; a later physical command still works.
Native read and Node encode/write IPC buffers are cleared when released;
native queued/state copies and immutable JS/upstream copies
are not claimed to be securely erased. No text is persisted in files, history,
metrics, logs or errors.

The harness provides a labeled textarea for explicit Unicode/IME entry. Browser
composition edits stay local until the user completes IME and submits; native
candidate windows/preedit are not mirrored. Only one submission can wait for a
result. The field is bounded and disabled during that wait, a draft clears on sent
or detach, and unavailable/paused retains it. Reset cancels a not-yet-dispatched
submission and disposal removes listeners. Ordinary canvas physical input stays
separate for shortcuts. [W3C composition/input events](https://www.w3.org/TR/input-events-2/)
are the browser-side contract; actual OS IME and remote application acceptance
remain separate from synthetic composition DOM tests.

[Iteration 21](ITERATION_021.md) records native, pure, fake-IPC/control and Edge
fixture evidence. Operational XRDP automation remains movement/reset only.

## Fractional wheel and trackpad accumulation

The harness uses a bounded per-canvas accumulator for both axes. Its explicit
conversion policy is 100 CSS pixels or three DOM lines per RDP notch. DOM page
deltas use the canvas CSS width/height for their respective axes, divided by 100.
The [W3C Wheel Events contract](https://w3c.github.io/uievents/split/wheel-events.html)
defines pixels/lines/pages and leaves precise measurements to the device, OS and
application configuration. These thresholds are client policy; real mouse/trackpad
and remote application scroll sensitivity remain acceptance work.

Each complete notch emits a separate signed 120-unit `input.wheel`. Vertical comes
before horizontal when both axes complete a step in the same event. Remaining
fractions stay independent and cancel reversed movement. Up to two notches per
axis/event (four records total) are emitted; excess from a large spike is discarded
and never becomes a backlog. The existing public -255..255 schema/native wheel
wire remains unchanged. Separate notch records also avoid collapsing several
steps on a server path that maps a wheel event to one button click; see the
[XRDP source](https://github.com/neutrinolabs/xrdp/blob/devel/xrdp/xrdp_wm.c).
This source inspection does not establish the lab's XRDP version or behavior.

State contains two fractions, one fixed nine-value context and a monotonic last
event time. CSS dimensions, remote target coordinates, modifier snapshot or DOM
mode changes discard the old fraction. Keyboard/button transitions, focus loss,
input reset, resize pause, pointer cancellation, page hiding and disposal clear it.
Unfocused/paused wheel events cannot accumulate. A gap over 500 ms or backward
clock starts a new gesture on the next event; zero-delta events do not prolong
its lifetime. Nonfinite deltas/times and invalid mode/geometry clear state without
emitting. Rounding within 1e-9 notch removes floating-point threshold drift.

No timer or delivery queue is introduced. Earlier coalesced motion is flushed
before wheel processing, even below a notch threshold. Input rate/lease/resize
limits still apply. Deterministic pure and Edge/fake-control evidence is in
[Iteration 22](ITERATION_022.md); actual remote wheel/physical trackpad acceptance
remains separate from the movement/reset-only operational XRDP regression.

## Native touch foundation

`native/input/touch.*` is an isolated, RDP-thread-owned contact state machine with
ten fixed slots, matching the pinned public common-client
`FREERDP_MAX_TOUCH_CONTACTS`. It adds no queue, timer, parser, capability bit or
public command. The worker does not yet link/use it, enable MultiTouchInput or
accept `input.touch`; the existing unknown-command handling still applies.

Internal events contain begin/update/end/cancel, an external ID 0..INT32_MAX and
desktop coordinates x 0..7679 / y 0..4319. Invalid records/dimensions, duplicate
begins and updates/ends/cancels without an owned contact fail before dispatch.
Coordinates are clamped to an observed nonzero desktop no larger than 7680×4320.
An eleventh begin returns full without changing any contact. IDs can be reused
only after a successful terminal transition or cleanup; state cannot be copied.

The [MS-RDPEI contact state contract](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpei/797930c0-d5ca-4da5-a801-97813d3b750e)
forbids a position change on the transition out of engagement. An end with a new
position therefore emits UPDATE before UP at that same position. Cancellation
uses the last attempted contact position, without introducing another engagement
update. The projection uses only DOWN/UPDATE + INRANGE + INCONTACT, UP, or
UP + CANCELED, as defined by the
[touch contact flags](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpei/fd7a6696-fe0a-493d-95f4-5b8c1e71b503).

An API failure or sink exception retains the uncertain contact, including a failed
begin, and latches cleanup-required: no further input is replayed. Release tries
all owned contacts once and retains only unsuccessful cancellations for explicit
cleanup retry. An already failed write makes the remote position/outcome uncertain;
retained coordinates are best-effort cleanup metadata, not proof of remote state.
`abandon()` drops local ownership only after channel destruction/loss and does not
claim remote release. The future channel owner must release before resize/detach
and establish synchronous-thread/lifetime/suspension ownership.

`native/input/rdpei.*` projects validated internal events through the pinned public
`RdpeiClientContext::TouchRawEvent`, with no private upstream structures or raw
`AddContact` indexing. It checks both the status and returned contact ID. Pinned
FreeRDP can return CHANNEL_RC_OK with contact ID -1 when its pool is exhausted;
that is treated as failure. Pressure/orientation/hover and pen are not implemented
by this foundation. Upstream encodes its own contact rectangle; the helper requests
no optional fields and does not implement another RDPEI encoder.

### Handshake and suspension integration

RDPEI enters its running phase only after the server/client readiness exchange,
and can be suspended/resumed by the server; see the
[MS-RDPEI overview](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpei/eff22485-b00b-4483-95c4-9253cfa36dd8).
The pinned public client context has no SC_READY/CS_READY completion callback.
Its GetVersion is initialized to v3 before server negotiation, and the real addin
returns success for a contact before SC_READY. DVC ChannelConnected also precedes
that exchange. None of these is a valid negotiated-readiness gate.

Consequently the foundation does not activate touch in Connection or infer support
from the compiled channel inventory. [Iteration 23](ITERATION_023.md) records the
initial state/API foundation; the observable transport gate below is the next
isolated component. Plugin/worker ownership, contact cleanup during suspension,
bounded/versioned private IPC, current-control-lease delivery and browser contact
capture/cancellation remain required before enabling input. Actual Windows/XRDP
touch and physical-device acceptance remain open.
The [registration owner](#public-rdpei-registration-owner) now composes the isolated
transport gate with public plugin/listener lifecycle; Connection/contact ownership
is still open.

### Public DVC transport gate

`native/input/dvc_gate.*` wraps one public `IWTSVirtualChannel` and its delegated
`IWTSVirtualChannelCallback`. It does not register a plugin or enable a channel in
the worker. It borrows the transport and owns the delegated callback through
OnClose. The adapter must outlive host callbacks, close on its bound RDP thread
before plugin termination, and rebind only after the host relinquishes the old
callback. Synchronous dynamic channels are required; asynchronous channel/update
modes are rejected. The pinned FreeRDP public DVC/client headers remain the ABI
authority; no dependency patch or version change is involved.

Its fixed state is closed, handshake, running, suspended or failed. Running is
published only after a valid SC_READY, a matching CS_READY successfully written to
the borrowed transport, and successful delegated receive completion. Negotiated
version and upstream contact count are then retained; this is native transport
acceptance, not application delivery acknowledgement. Server v1.0/v1.1/v2/v3 are
supported; a future version uses the pinned addin's v3 ceiling. Only the known
CS_READY flags and 1..64 upstream contacts are accepted; bridge contact state still
has its separate ten-contact limit. See
[CS_READY fields](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpei/cc0712ec-3521-4ad3-9cea-91e59bea6eb6).

Already reassembled server PDUs are checked before delegated parsing: exact
six-byte framing, total length 6..14, valid SC_READY version/shape and six-byte
SUSPEND/RESUME in the running/suspended phase. Unknown, duplicate readiness and
out-of-phase messages fail closed. Outbound framing is limited to 8,192 bytes
before buffer inspection. CS_READY fields are inspected; TOUCH/PEN body encoding
remains upstream's responsibility. The adapter allocates no packet storage and
does not impose limits on upstream DVC reassembly itself.

SUSPEND closes the transport gate before delegation. Periodic TOUCH/PEN output is
discarded with a saturating counter, without a deferred queue, replay or changing
the global FreeRDP_SuspendInput setting. Successful RESUME reopens **transport
only**. This follows the protocol's Boolean
[input transmission suspension](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpei/7dba715a-f0c9-4c5a-a52d-1eb9f7de60c6).
The adapter does not own `touch::State` or stop the upstream periodic encoder.
An owner must cancel/reset and drain outstanding contact state, reconcile the
current control lease and publish input readiness only after that cleanup; held
upstream state must not become a stale gesture on resume. That owner integration
is still open, so this component is not linked into rdp-worker.

Transport errors and delegated exceptions latch failure and remove negotiated
readiness. Close invalidates state immediately; if a delegated method is active,
its potentially self-owning callback is destroyed only after that method returns.
Close is idempotent. Foreign-thread operations are rejected. No WS/private IPC or
capability contract changes in this block.

[Iteration 24](ITERATION_024.md) distinguishes fake public-interface tests and
actual linked RDPEI addin tests with a fake DVC endpoint from remote RDP/device
acceptance. Bounded header mutation tests are deterministic checks, not a
libFuzzer/ASan campaign or a physical touch test.

### Public RDPEI registration owner

`native/input/rdpei_plugin.*` loads the pinned linked static RDPEI addin, captures
its public plugin interface and registers a wrapper under the exact RDPEI DVC
name. Its default entry comes from the linked inventory; an explicit entry is
native test injection, with no browser/IPC setting or global provider change.
One object permits one installation and one channel attempt; duplicate/replacement
channels fail closed. Same-plugin DVC reopening remains retained follow-up.

The object and RDP context must outlive host Terminated. Delegated cleanup and
borrowed host-manager calls belong to the bound RDP thread. Its destructor cannot
unregister a stored host pointer. Explicit retirement permits a later host
Terminated no-op on the context-free thread; see the provider lifecycle below.
Other foreign-thread and reentrant lifecycle calls are rejected. This pinned synchronous
FreeRDP profile is stronger than Microsoft's general
[plugin threading contract](https://learn.microsoft.com/en-us/windows/win32/api/tsvirtualchannels/nn-tsvirtualchannels-iwtsplugin).
Actual remote RDPEI/drdynvc thread and lifetime acceptance remain to be tested.

Public pInterface/context identity is preserved. Optional notifications and public
manager lookup methods retain host behavior. The wrapped listener routes channels
through DvcGate and cannot activate a failed Initialize, even with a partial host
listener. Disconnect/Terminate close the gate before delegation. Termination inside
an active gate callback is rejected to avoid destroying an executing upstream
object. Normal host Terminated ends ownership; see the
[Microsoft contract](https://learn.microsoft.com/ru-ru/windows/win32/api/tsvirtualchannels/nf-tsvirtualchannels-iwtsplugin-terminated).
Repeated termination has no repeated addin/listener cleanup.

Entry failure retains the pinned entry's own cleanup contract. After successful
entry creation, failed host registration terminates that addin once. Host failure
must not retain a plugin pointer. Pinned host source satisfies that pointer rule,
but its name-list append before plugin-list append can leave inconsistent
bookkeeping; that upstream resource failure audit remains open. No private host
storage is accessed or patched.

Pinned generic Initialize dereferences its returned listener even on CreateListener
failure. The proxy supplies a local fallback listener, preserves the error and
blocks channel activation. Partial host listeners are reclaimed on termination.
DestroyListener errors ignored by upstream are retained and returned by the
wrapper. Handles are retired once because failure may already have freed them;
a host cleanup failure is not proof of complete resource reclamation.

This owner adds no input dispatcher/contact state. TouchRawEvent may accept a
cancellation into dirty local state before a periodic frame is written; success
cannot confirm terminal-contact transport delivery. Contact cancel/reset/drain
across suspend and resume, control leases, Connection activation, bounded IPC,
browser capture and real touch acceptance remain open. No new worker channel or
capability is enabled. [Iteration 25](ITERATION_025.md) distinguishes actual-addin/
fake-DVC lifecycle tests from fake-interface errors and remote RDP/device evidence.

### Terminal contact ownership and drain

`native/input/contacts.*` composes the public registration, ten-contact State and
a synchronous gate observer. It must be constructed, serviced and destroyed on
the RDP thread while registration/context remain alive. The observer may change
the output hold, but cannot re-enter input or lifetime APIs. A broken destruction
contract terminates the worker rather than leaving a dangling observer.

An external/native ID pair remains owned until the actual borrowed transport
successfully writes its terminal UP. A locally accepted end/cancel cannot free
that ID for reuse yet. At most ten active/pending-terminal IDs are owned in fixed
storage. Invalid transitions and untracked native IDs fail before transport writes;
the helper additionally returns native ID/status so partial API failures remain
distinguishable from acceptance.

Server SUSPEND immediately requests reset and holds all touch output. Service
cancels active contacts through public TouchRawEvent, including any original
terminal already pending. The gate discards gesture frames, but an observer retains
up to ten encoded native terminal records, at most 31 bytes each. Native periodic
encoding may consume and remove its UP state while suspended; the bridge ownership
does not disappear. No DOWN/UPDATE records or gesture FIFO are retained.

After RESUME or a local reset, normal touch output remains held. Once all terminal
records have been observed, service re-envelopes those native UP records in one
fresh bounded frame of at most 320 bytes. Record fields/coordinates/flags are
copied from the pinned encoder, not reconstructed as another gesture encoder.
Whole-frame validation occurs before any ownership mutation. Only successful
transport writing releases terminal IDs and lifts the hold. Resume before service
or before the next native pump cannot prematurely enable input.

This cleanup profile requires RDPEI **1.0.1 or later** with the actual CS_READY
DISABLE_TIMESTAMP_INJECTION flag. Fresh cleanup frame timing fields are zero;
the negotiated flag instructs the server to ignore them, per
[CS_READY](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpei/cc0712ec-3521-4ad3-9cea-91e59bea6eb6).
The transport gate still accepts v1.0, but the contact owner reports unavailable
for timestamp-remoting mode. Correct v1.0/timestamp-remoting cleanup is retained
compatibility work, not removed from the requirement for negotiated touch.

`touch_frame.*` validates a pinned single-frame TOUCH profile before allocation:
6-byte exact framing, total 10..8192 bytes, one frame, 1..64 distinct native IDs,
variable integer boundaries, permitted contact flags, known optional fields and
orientation/pressure limits. Borrowed record views last only for the observer call.
The owner accepts only its DOWN/UPDATE and UP/UP+CANCELED profile; hover/pen are
not newly supported. Format authority is
[RDPINPUT_TOUCH_CONTACT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpei/fd7a6696-fe0a-493d-95f4-5b8c1e71b503)
and the pinned public headers/encoder. This does not bound upstream DVC reassembly.

Drain has a two-second deadline while running, without a new timer. Suspension
does not expire a legitimate long server pause. API/cleanup-write/deadline failure
blocks input; **the Connection owner must tear down on Drain::failed**, with no
gesture or uncertain-write replay. Channel loss permits local abandonment only;
it does not establish remote release. Success is transport acceptance, not remote
application acknowledgement. Current control-lease checks remain the caller's
responsibility.

[Iteration 26](ITERATION_026.md) records pure parser/re-enveloping and actual-addin/
fake-DVC contact tests. Worker/lease/reset/resize wiring, bounded IPC/browser
capture, actual server/physical touch and timestamp-remoting compatibility remain
open. No worker capability or channel is enabled by this isolated component.

### Scoped addin provider and worker lifetime

`native/input/addin_provider.*` uses the pinned public provider APIs. FreeRDP's
client-context creation installs its default process-wide provider, so Connection
binds the bridge scope **after** context creation/configuration, on its RDP thread,
before connect. A second active scope is rejected. Provider/context changes and
scope destruction must be serialized; no callbacks may run concurrently with
close. This matches one worker process/context per session, not a shared Node host.

Only `rdpei` with the exact dynamic-channel entry ABI is intercepted. Other addin
names/classes are forwarded to the previously installed provider. Wrong selectors,
foreign-thread and nested RDPEI lookups return a non-null refusal entry, preventing
FreeRDP's null-result dynamic-library fallback for that intercepted request. The
entry verifies the public `GetRdpContext` identity before installing the owned
registration. No private DVC manager storage, command-line options or library-path
configuration are exposed. This scope is not a general dynamic-library allowlist.

Entry points supplied by drdynvc are stack-borrowed. The registration proxy clears
its borrowed host reference when the entry returns, and rejects later proxy
registration/context/data lookups. The host's retained plugin wrapper is separate.

Connection disconnects on the RDP thread, then closes the provider scope before
publishing `finished`. Close retires the addin/gate/listener on that thread and
restores the previous provider, including null. A foreign provider replacement is
reported as an error and is not overwritten. Reentry/foreign close cannot retire
active resources. Destruction with a still-bound scope violates its lifetime
contract and terminates instead of leaving a global dangling callback.

Registration retirement publishes its completed result with release/acquire. Its
wrapper survives until after context destruction; a later host Terminated reads
only the published result and never touches the delegate, manager or gate. Cleanup
errors remain errors; repeated calls do not retry potentially freed handles. This
permits context creation/free on the owner thread and addin cleanup on the joined
RDP thread without permitting general asynchronous channel execution.

Worker integration is guarded by `CHANNEL_RDPEI_CLIENT`. `MultiTouchInput` remains
explicitly false while IPC/control/browser dispatch is absent. No touch capability
or remote input is newly enabled. [Iteration 27](ITERATION_027.md) separates public
provider/actual-addin fake-host tests from worker regressions and actual XRDP
connection evidence. Real server RDPEI host/reassembly/resource audits remain open.

### Touch IPC codec foundation

`native/input/touch_ipc.*` decodes the separate fixed-size INPUT_TOUCH record;
`packages/protocol/src/touch.ts` provides matching typed shape checks and codecs.
The [16-byte versioned layout](IPC_FOUNDATION.md#touch-input-codec-foundation)
validates before dispatch/allocation and preserves the external 31-bit contact ID.
It carries one action and bounded absolute coordinates, without gesture queues,
pressure, orientation, pen or arbitrary channel options. All legacy input records
are unchanged. See [Iteration 28](ITERATION_028.md) for independent vectors and
boundary/native-lifecycle evidence.

This foundation does not grant a control lease, channel readiness or contact-state
ownership. Current workers advertise no touch capability and explicitly reject
the request; no Node worker method or browser command sends it. Future dispatch
must check session opt-in, current lease/display generation and negotiated owner
readiness before touching FreeRDP, and reset/drain on lease/resize/focus loss.
Actual remote/physical touch remains open.

### Opt-in worker touch dispatch

[Iteration 29](ITERATION_029.md) activates the preceding isolated components under
CHANNEL_RDPEI_CLIENT and input.touch=true. HELLO advertises an experimental private
capability, distinct from negotiated readiness. Versioned IPC carries the observed
display generation; the RDP thread alone validates and dispatches contacts through
the bounded owner. Legacy 16-byte requests are refused without dispatch.

Physical and touch input share a fixed 64-record FIFO. Reset waits for terminal
ownership to drain; stale generations and unavailable/suspended channels cannot
submit gestures. Layout submission waits for old contact cleanup. Spontaneous GDI
resize holds input until cleanup completes. Drain/write/API failure closes the
connection without gesture replay. The owner is destroyed on the RDP thread before
addin retirement, and the wrapper survives subsequent context destruction.

This supersedes the historical no-capability statements in Iterations 27/28.
Actual XRDP reported RDPEI ready with ten contacts after handshake; no contact was
sent by that inventory probe. Public lease/browser capture, physical touch and
remote application acceptance remain separate gates. Timestamp-remoting/v1.0,
same-plugin reopening and resource/reassembly audits remain open.

### Public touch controller and browser capture

[Iteration 30](ITERATION_030.md) connects touch to the existing control lease and
bounded serialized input path. Readiness/geometry/generation are checked both at
admission and delivery, including queued commands. Lease loss discards stale
commands and queues reset before a replacement controller. TOUCH_UPDATE is
forwarded as decimal-string `touch.info`, replayed only on control attachment.

The reference harness uses rendered display ownership before capturing a touch
pointer. At most ten active contacts are retained; there is no gesture queue or
automatic touch-to-mouse conversion. Terminal events remove local ownership before
releasing capture; subsequent lost capture cannot duplicate UP. A single lost
touch capture cancels that contact. Global focus/visibility/dispose/readiness/epoch
loss clears local state and sends reset when active. Physical input is unchanged.
Semantic unavailable/stale/invalid-transition errors preserve the session and
request local reset without replay. Device and remote application gates remain.

### Explicit unsupported pen capability

[Iteration 32](ITERATION_032.md) exposes penInput=false consistently through
HELLO decoding, worker CLI and capability REST. The pinned addin defaults its
public clientFeaturesMask to all bits; the owned registration now removes
ENABLE_MULTIPEN_INJECTION before initialization. A server offering multi-pen gets
a touch-only CS_READY; touch visuals/timestamp profile and other mask bits remain.
Standalone upstream behavior is distinct from the bridge's owned registration.

Browser pen Pointer Events remain ignored without mouse/touch fallback. This is
the Stage 5 unsupported placeholder, not pen support or a change to optional pen
requirements. A future implementation requires a bounded pen owner, pressure/
orientation validation, lease/generation dispatch and actual device acceptance.
