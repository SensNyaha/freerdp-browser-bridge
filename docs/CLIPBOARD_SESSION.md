# Controller clipboard ownership

Implements the private session/controller portion of SPECIFICATION §2.7, using
the [typed native API and revoke barrier](CLIPBOARD_IPC.md). This is prepared
manager/native-adapter plumbing. Server control framing/credit now uses
[RWC1](CLIPBOARD_CONTROL.md) and the [reference client](CLIPBOARD_BROWSER.md);
actual remote/application
ownership acceptance remain open. The production `NativeSessionWorker` now
accepts explicit text selection with a matching item reservation and both
`clipboardText` / `clipboardRevoke` HELLO capabilities (Iteration 237).

Selection requires an explicit direction mode, text enabled, no unsupported
formats/files and a finite item maximum (default 1 MiB, range 1..16 MiB).
Missing backend read/write/revoke/source hooks refuse before backend start.
Omitted/off selection requires none of these hooks. Current control attachment
methods are `clipboardSnapshot`, `onClipboard`, `startClipboard`, `stopClipboard`,
`readClipboardText` and `writeClipboardText`; a media or stale control lease
cannot call them. No public wire grammar or larger control body is added here.
The factory can now receive a frozen nonsecret item-size reservation and pass it
to `NativeSessionWorker`; [chunk/reservation scope](CLIPBOARD_CHUNKS.md) documents
its finite IPC budget. Missing/mismatched reservations and unsupported formats
refuse before startup; a legacy/read-set-only peer refuses before CONFIGURE /
SECRET. Direct factories must forward the numeric limits explicitly. Omitted/off
selection retains its previous budget and behavior.

`ClipboardOwnership` keeps one opaque grant, one optional in-flight operation,
scalar source state and one retirement promise. It keeps no content queue or
clipboard history. Acquisition requires ready scalar state without a previous
local accepted/pending offer. Every operation rechecks the current lease,
connected state, immutable policy/generation and current remote revision.
Source snapshots copy known scalar fields only; unexpected backend fields cannot
be retained or exposed as clipboard metadata. Ready-source loss, generation /
policy changes or backwards revision cannot resurrect authority.

Read and write share one flight; concurrent attempts return busy without backend
dispatch. Unicode/item validation precedes write submission. The trusted backend
must copy borrowed write text before returning, as `WorkerProcess` does, and own
a finite per-operation deadline (seven seconds for the native API). Caller write
buffers remain caller-owned. Accepted read buffers transfer to the caller only
after current source/lease checks; stale, malformed or late content is wiped.
The session lease rechecks authority again after awaiting the grant. Consumers
own accepted read buffers and must clear them after use; content never appears
in scalar status, session snapshots, errors, metrics or manager events.

Stop, control detach or subscriber loss revokes JS authority synchronously.
Replacement acquisition waits for the existing native operation to drain. If
this owner attempted any local write, including an uncertain/refused write,
retirement issues one native revoke and requires accepted completion plus a
current ready source with local accepted/pending both false. Empty text is not
used as a substitute. Read-only use needs no remote mutation. Retirement never
retries or starts a read, and has one nonrenewing 15-second ceiling covering
drain and revoke. Timeout, refusal, lost source or backend fault permanently
fails this owner and asks the host to terminate the session once; a hanging or
throwing termination callback cannot grant a replacement.

The manager binds the grant to the exact control attachment symbol. A new
controller may use other supported session functions while clipboard is retiring,
but cannot acquire the old clipboard grant. Removing an old subscriber cannot
remove a later registration. Callback failure retires clipboard authority;
malformed backend metadata or unsafe native retirement fails the session with
fixed `WORKER_INVALID_STATE` / `CLIPBOARD_FAILED`, without backend diagnostics.
Selected clipboard cannot continue through an unsupported connection reconnect.

Session shutdown revokes grants and joins ownership retirement alongside the
existing worker close/forced-termination lifecycle. Its global shutdown deadline
takes precedence; the native worker must be joined even if a faulty backend does
not settle a clipboard promise. Whole-connection disconnect is distinct from
successful remote no-format ACK. Upstream retained copies/CPU/RSS, actual remote
revoke and network-loss cleanup remain separate acceptance work.

Evidence distinguishes pure fake-backend ownership/manager fixtures, an actual
Node child/private-IPC synthetic peer, linked pinned-CLIPRDR simulated transport
and the single authorized XRDP offer/empty-text ACK from Iteration 232. The latter
does not establish remote data consumption or revoke, and is not repeated here.

## Shared HTML authority in development

`feature/html-clipboard` additionally admits explicit `html:true` with text
enabled. The worker must implement both `readClipboardHtml` and
`writeClipboardHtml`; its frozen reservation must select HTML and its HELLO must
advertise `clipboardHtml` in addition to text/revoke. Missing hooks refuse before
backend start. Immutable source policy must match HTML selection exactly; a
later downgrade fails the session rather than silently continuing as text.

Current control leases add typed `readClipboardHtml` / `writeClipboardHtml`.
They share the existing opaque grant, flight, dirty flag and native revoke
barrier with Unicode operations. Read results carry owned `body` and optional
`text` buffers plus checked scalar ranges; unknown backend properties are not
copied. Both buffers are wiped on stale authority/revision, malformed results,
detach and late completion. Consumers clear accepted buffers after use.
Backend writes must copy borrowed body/text synchronously before returning.

Default retirement is 20 seconds for HTML selection, covering the private
12-second paired read and seven-second revoke; text-only retains 15 seconds.
An explicit host retirement override retains the original 20..15,000 ms range.
Neither traffic nor intermediate progress extends it. The session's global
shutdown deadline still takes precedence. Replacement controllers cannot gain
clipboard authority before the shared drain/revoke completes.

Synthetic ownership/manager fixtures and actual socket tests cover HTML/text
flight exclusion, controller replacement, native ACK barriers, quota refusal,
known-field metadata and late buffer wiping. Actual RDP HTML application and
browser acceptance remain required on this same feature branch.

## Shared image authority in development

After private handoff checkpoint `5b419f1`, `feature/image-clipboard` adds
explicit `images:true` to managed session selection. The factory receives a
frozen `clipboardImage:true` reservation with its finite `clipboardItemBytes`;
`NativeSessionWorker` requires an exact match and HELLO `clipboardImage` in
addition to baseline text/revoke before CONFIGURE/SECRET. Missing read/write
image hooks refuse before backend start. HTML selection and its hooks remain
independent. Files and disabling baseline Unicode remain unsupported.

The adapter reserves one selected item with the larger of the selected HTML
32-byte or image 16-byte inner metadata overhead, capped by the existing 16 MiB
payload maximum, plus existing envelope/queue allowance. Simultaneous format
selection does not add their item budgets or create another content queue.
An explicit insufficient host `maxWriteBytes` is refused, never silently raised.

Current control leases add `readClipboardImage(revision)` and
`writeClipboardImage({width,height,rgba})`; media and stale leases cannot use
them. Images share the text/HTML grant, flight, dirty state and native revoke
barrier. A write must produce a current accepted image source; text/HTML writes
must not leave image acceptance set. Image source selection is immutable and
copied as known scalar fields only. Policy downgrade or malformed source fails
the session rather than dropping image metadata.

Accepted reads transfer owned checked compact top-down straight-alpha sRGB
RGBA8 with only width/height/pixels. Unknown backend metadata is never copied.
Malformed, over-quota, stale, detached and late results wipe their owned pixels.
Caller write buffers remain caller-owned; the backend must copy synchronously.
Consumers wipe accepted read pixels after use. Native image quota validation
includes the complete DIBV5 overhead before dispatch. No host clipboard API or
image library is called by these owners.

Image-only retirement retains the existing 15-second budget covering the
seven-second private operation and revoke; selecting HTML retains 20 seconds
for its paired read. Host overrides and session shutdown retain their existing
limits. Replacement controllers cannot acquire until drain and actual no-format
revoke completion. Uncertain retirement fails closed, and late pixels cannot
revive authority.

Focused ownership/native-adapter checks pass **34/34**, including existing HTML
ownership, the synthetic private Node process and actual native image selection
against a strict-TLS refusal peer. Public transport checks are in
[the image control contract](CLIPBOARD_CONTROL.md#image-control-extension-in-development).
Full linked `pnpm check` passes Windows **1178 passed / 71 skipped** and Linux
UID1000/CapEff=0 **1149 passed / 108 skipped**, zero failures. Native sources
are unchanged from the accepted private handoff (Windows CTest 40/40,
GCC 8.3/Clang 41/41; GCC 11 foundation 24/24 plus three SDK modules).
These are source/ownership/lifecycle checks, not physical OS clipboard or
actual RDP image application acceptance. The local receipt is
`build/current-validation/image-public-acceptance.json`.

### Application integration for the developing image feature

This section describes `feature/image-clipboard`. Published 0.4.0 supports
text/HTML; installing 0.4.0 does not enable these developing image APIs. Image
merge/release remain open. The named actual Edge PNG application profiles pass
through Windows and Linux workers, including both Linux carriers;
[their exact scope](CLIPBOARD_BROWSER.md#actual-image-rdp-application-checkpoint)
does not imply universal browser/server support or a published image package.
Use matching development JS and native runtime until a versioned release passes.

Select images in the session configuration passed to your existing framework
adapter or standalone session endpoint:

```json
{
  "clipboard": {
    "mode": "bidirectional",
    "text": true,
    "images": true,
    "maxItemBytes": 1048576
  }
}
```

The same selection applies to Express, Fastify, NestJS and node:http; these
adapters share the session manager. Check `clipboardImage`, `clipboardText` and
`clipboardRevoke` in the runtime capabilities. The overall V1 `rdp:false` does
not replace those concrete capability checks. Use `server-to-browser` or
`browser-to-server` for a single direction; an unavailable image capability is
an explicit refusal, without silently selecting text/HTML or another runtime.

For a custom server-side control integration, acquire its current control lease
and subscribe with `onClipboard`. Wait for `clipboardSnapshot.state.ready`, then
request the shared grant with `startClipboard()`. A connected session alone is
insufficient: clipboard negotiation is asynchronous, and the grant may still be
retiring from a prior controller. A false return grants no access. Keep one
subscriber and one operation at a time; use the current generation/revision
from that lease's snapshot rather than caching them across source changes.

With a ready, granted lease named `control`, a small owned offer is:

```ts
const rgba = Buffer.from([255, 0, 0, 255, 0, 128, 255, 255]);
try {
  const status = await control.writeClipboardImage({
    width: 2,
    height: 1,
    rgba,
  });
  // Surface status to the application; accepted means an offer, not a paste.
  showOfferStatus(status);
} finally {
  rgba.fill(0);
}
```

The item is compact top-down straight-alpha sRGB RGBA8, not a PNG/JPEG/BMP file.
Its pixel length must be exactly `width * height * 4`; a local image decoder
belongs in the hosting application's bounded, trusted input path. The maximum
includes 124 bytes of the native DIBV5 representation: a 1 MiB setting permits
at most 1,048,452 pixel bytes on write. Unknown metadata or profile URLs are not
part of the item. The backend copies caller-owned pixels synchronously; clear
your copy when the application no longer needs it.

An accepted offer remains available while the grant is held. The remote user
must paste it in the target application separately. Do not immediately revoke
the grant after offering, or the target may lose the offer before requesting
the pixels. At controller detach, unsubscribe/stop through the owning lifecycle,
await `stopClipboard()`, then release the control attachment. Failed/uncertain
retirement is a terminal owner failure, not permission for a replacement.

For a read, require the snapshot's `remoteImage` and use that snapshot's current
revision. A successful result owns its pixel buffer:

```ts
const source = control.clipboardSnapshot.state;
if (source?.ready && source.remoteImage) {
  const result = await control.readClipboardImage(source.revision);
  const item = result.status === 'accepted' ? result.item : undefined;
  if (item) {
    try {
      await consumeOwnedPixels(item);
    } finally {
      item.rgba.fill(0);
    }
  }
}
```

`consumeOwnedPixels` must finish using the borrowed view before resolving; make
your own bounded copy if it must outlive the call. A stale or unsuccessful read
has no usable item and must not be replayed into the next source/controller.
Never put pixels or clipboard text into diagnostics, errors or metrics.

Browser applications normally use the existing reference image panel and
[explicit ClipboardItem actions](CLIPBOARD_BROWSER.md#explicit-image-actions-in-development)
instead of calling these server-side methods themselves. Paste creates a local
draft; Send offers it to RDP; Get retrieves the remote pixels; Copy writes the
received image to the browser's OS clipboard after a separate user gesture.
File clipboard and managed drives remain separate TODO items.
