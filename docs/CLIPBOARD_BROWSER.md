# Explicit reference browser clipboard

Current HTML source status, 2026-10-26: implementation, named Windows/Linux
application profiles and all required hosted checks pass.
[Final source acceptance](#html-source-feature-acceptance). Public 0.3.0 remains
the Unicode-only release while versioned 0.4.0 npm/standalone delivery is prepared.

The additional owned XRDP 0.10.1 profile now passes actual headed Edge Clipboard
API ↔ CLIPRDR ↔ prepared Tk Unicode/emoji/multiline roundtrips across two fresh
RDP connections, permission refusal, revoke and PID/runtime cleanup
[404](history/iterations/401-450.md#iteration-404). Two further server-origin Copy/Get operations pass
before a native client write. The fixture's explicit Copy hook supplies the
XFixes notification omitted by stock Tk repeated copies. This does not fix the
old XRDP 0.9.21.1 surrogate conversion defect or accept RDP Unicode key input,
other formats or the full Stage 7 matrix. Full feature-branch regression passes
900 / 61 skips / 961 total; native/production code remains unchanged.

Current actual evidence: [Iteration 392](history/iterations/351-400.md#iteration-392) verifies a named
headed Edge / public API / Windows Notepad small-text chain in both directions,
including real local Clipboard API and Cyrillic/Japanese/emoji/multiline
readback, actual permission refusal, no-format revoke, cleared viewer fields
and joined PID/runtime cleanup in one passing invocation. Own-document clear
keystrokes follow verified readback; an empty application is not separately
read back. Earlier failed runs remain in [385](history/iterations/351-400.md#iteration-385) and [392](history/iterations/351-400.md#iteration-392).
This does not accept the complete Stage 7
direction/quota/isolation/resource or other-format matrix. Earlier fixture-only
statements below retain their historical scope.

Iteration 238, 2026-10-16. Implements the reference client portion of
SPECIFICATION §2.7 over [current RWC1 control transfer](CLIPBOARD_CONTROL.md) and
[controller/native ownership](CLIPBOARD_SESSION.md). Text selection is opt-in;
the connection form defaults to off, checks both native clipboard capabilities
and supplies a finite 1..16 MiB item maximum. HTML/images/files remain unsupported
and required follow-up work. Stage 7 remains in progress.

The quota input is disabled while off, so an empty draft quota cannot block an
ordinary clipboard-disabled connection. Current actual XRDP JPEG/H.264 desktop
regression verifies the disabled panel and zero native/browser clipboard events
with mocked-refusal OS APIs. [Scope/evidence](history/iterations/201-250.md#iteration-239).

The viewer shares the existing authenticated control socket and its sequence
with input. It sets binaryType to arraybuffer and routes only clipboard messages
to one ClipboardClient. Offers contain scalar metadata and never trigger reads,
permission prompts or OS clipboard operations. Current connected attachment,
source generation/directions/maximum, revision, request correlation, exact sizes /
offsets and issued credit are checked before allocation or delivery.
Operation readiness additionally checks native local/remote pending flags. A
fresh grant cannot start while an earlier native local offer is accepted or
awaiting ACK; an existing current grant may replace its accepted offer after the
shared flight drains. Send/Get remain disabled until their admission is ready.

One upload/download owns one byte item and at most eight copied 4 KiB records.
Upload windows start at least 64 ms apart. The client waits for server credit,
keeps local bufferedAmount plus each send at most 8 KiB, and polls a stalled
outbound queue using one finite host timer. Sent records remain owned until the
server's window ACK/result, then are wiped. The whole upload buffer is wiped
after its final record is prepared; the result still waits for native completion.
No item/history/retry queue is introduced.

Downloads assemble exact bytes, ACK complete windows (including offset zero for
an empty item) and expose no text before clipboard.data.complete. The accepted
native item remains a frozen snapshot when later offers announce a revision.
Generation/source/controller loss invalidates it. Whole UTF-8 is decoded strictly,
with a leading U+FEFF preserved; both UTF-8 and normalized/terminated UTF-16 quotas
are checked. Local strings are measured before encoding, reject NUL/lone
surrogates, and preserve complete Unicode scalars across chunk boundaries.
This follows the [Encoding Standard's BOM option](https://encoding.spec.whatwg.org/#interface-textdecoder).

The client uses original monotonic deadlines: 60 seconds for the item, two
seconds for an issued window/terminal read completion, eight seconds for native
completion. Partial records, input and unrelated offers cannot renew them.
Protocol, clock, deadline or backlog failure closes the viewer/control owner;
existing input reset and finite native drain/revoke apply. One timer services
the earliest transfer/pacing deadline and is cleared on disposal.

## Local actions and permission

The panel has a draft and a received field, with explicit send/get/local paste /
local copy/clear buttons. A local paste fills the draft only; the user separately
sends it to RDP. A remote read fills the received field only; copying it to the OS
clipboard is a separate click, including a valid empty result. Local clear erases
the fields and invalidates pending UI delivery; it does not send an RDP operation.
During a transfer the wire owner still drains through completion or disconnect.

The [Clipboard API](https://www.w3.org/TR/clipboard-apis/) is secure-context and
permission controlled. readText/writeText are invoked directly within their
respective click, before any await or remote request. Unavailable APIs disable
those two buttons; ordinary manual paste/copy in the fields remains available.
Denial uses a fixed message. One expiring permission token and a five-second
deadline reject late results after clear, expiry, source loss or detach. A
cancellable promise race releases UI continuations even if the browser request
does not settle. The owner does not query permission in advance or retry it.

Detach/source loss clears fields, owned byte buffers, timers and listeners. No
localStorage, persistence, logging, metrics content or automatic synchronization
is added. Browser/OS APIs and immutable JS strings can retain upstream copies;
an already invoked OS write cannot be rolled back by detach. This is not a full
memory-zeroization or physical clipboard acceptance claim. The two bounded UI
fields and an active item also require total-memory/CPU acceptance separately.

## Evidence boundaries

Pure composition tests use the actual Node transfer owner with virtual time,
full 16 MiB both ways, byte hashes, BOM/CRLF/scalar/quota boundaries, malformed
credit/identity/data, original deadlines, source loss, stalled backlog and wipe
checks. Actual Edge/HTTP/control WS/reference-viewer tests use a fake RDP backend
and mocked Clipboard API. They exercise all three directions, multi-window text,
input, explicit local actions, denial, expiry, clear/detach late results, empty
copy, native-revoke replacement cleanup and one JPEG frame.

These fixtures access no real OS clipboard or remote clipboard. A separately
authorized [Windows/XRDP/Edge probe](history/iterations/201-250.md#iteration-240) now passes fixed Unicode
offer ACK, no-format revoke ACK while ready, fresh-token replay and cleanup,
with zero remote reads or host Clipboard API requests. Actual application data
consumption/readback, browser permission/device behavior, latency/network,
total RSS/CPU and managed-drive release gates remain open. The one-test XRDP
mutation permission consumed in Iteration 232 is not reused.

## HTML byte client in development

On `feature/html-clipboard`, `clipboard-html.js` implements the
[inner item schema](CLIPBOARD_IPC.md#html-inner-item-in-development) with browser
`Uint8Array`/`DataView`, independent of Node Buffer and its codec. Fixed
metadata/length/quota checks precede content inspection. UTF-8/no-NUL inspection
does not allocate decoded strings; fallback text also fits its normalized,
terminated UTF-16 quota. Context/fragment/selection remain distinct byte ranges.
The codec does not parse HTML, access a DOM or access the operating system
clipboard.

`ClipboardClient` requires the explicit HTML offer descriptor
`{version:1,itemMetadataBytes:32}` plus matching scalar HTML flags. Its snapshot
adds `html`, `remoteHtml`, `canSetHtml` and `canReadHtml`. A changed format policy
or inconsistent descriptor retires the client. Text-only peers and existing
text methods retain their previous wire behavior.

`setHtml(item)` accepts a checked fragment-only item with optional text fallback,
validates the aggregate CF_HTML/CF_UNICODETEXT write quota, then synchronously
copies it into one encoded upload. Caller buffers remain caller-owned.
`readHtml()` returns `{status,item?}` only after the complete item, exact ACK and
terminal `clipboard.html.data.complete`. Body/text views then own the assembled
backing storage; the consumer must wipe both views after use, including when UI
delivery loses authority. Disposing the client cannot erase a buffer already
transferred to its consumer. Stale/malformed/partial items are wiped internally.

HTML and text share one active item, sequence, credit window, pacing, backlog
limit and timer. A second operation returns busy rather than queuing content.
HTML native-read progress allows 13 seconds; text reads and both writes retain
eight seconds. Issued-window and whole-item deadlines remain two/60 seconds,
and unrelated traffic cannot extend them. Encoded items including their 32-byte
header fit the absolute 16 MiB cap. There is no automatic read, clipboard access,
retry or HTML-to-text downgrade.

Pure composition tests use the actual Node transfer owner and virtual time,
including a full 16 MiB incoming item, aggregate outgoing quota, independent
golden bytes, malformed framing, context/selection ranges, ownership/wiping and
13-second timeout. Byte inspection is cross-checked against Node on Unicode,
overlong/truncated/surrogate UTF-8, newlines and quota boundaries. Real Edge
module/HTTP/WebSocket tests exercise all three directions with a synthetic RDP
backend, multi-window Unicode, unchanged contextual metadata, explicit owned
buffer clearing and no-format retirement. These fixtures refuse every OS
Clipboard API call and do not accept real remote HTML application behavior.

At checkpoint `57981d3` the reference panel/form still exposed text-only actions.
The branch now additionally implements the rich actions and conversion below.
Real RDP application acceptance still remains required before
the HTML TODO checkbox, merge and intended 0.4.0 release can be accepted.

Checkpoint `57981d3` passes full `pnpm check` on Windows **1103 passed / 71
skipped / 0 failed** and Linux UID1000 with zero effective capabilities
**1083 / 96 / 0**. Linked MSVC `/WX` + `/analyze` native CTest passes **39/39**.
The browser/legacy composition checks pass **14/14** and real Edge module /
HTTP/control-WebSocket checks **3/3**. C++ source remains unchanged; the prior
GCC 8.3/sanitizer/fuzz evidence keeps its separate native scope. Source/log
SHA256 values and explicit unaccepted ClipboardItem/RDP gates are recorded in
`build/current-validation/html-browser-client-acceptance.json`. Initial test
syntax and immutable-direction fixture setup errors were corrected before these
passing checks; their earlier logs remain retained.

A preparatory six-case Edge probe checks context-marker ranges in the
[template contents document](https://html.spec.whatwg.org/multipage/scripting.html#the-template-element)
and [Range cloning](https://dom.spec.whatwg.org/#dom-range-clonecontents): selected
table/list content requires its ancestor chain, while a marker inside an
attribute cannot define a range. No script/custom-element execution, live DOM
injection or resource request was observed during its 250 ms window. The local
`html-context-inert-probe.json` receipt under `build/current-validation` is a
prototype observation, not production normalization/security acceptance.

Peer planning also checks the
[XRDP 0.10.1 clipboard implementation](https://github.com/neutrinolabs/xrdp/blob/v0.10.1/sesman/chansrv/clipboard.c):
its canned format announcements and data dispatch cover text, bitmap and files,
with no `text/html` / `HTML Format` mapping. This source review means the owned
Unicode XRDP profile cannot be presumed to establish rich HTML roundtrips.
Actual HTML application acceptance must use a peer that negotiates HTML, and
the existing XRDP profile needs an explicit unsupported-format observation.
Neither the source review nor the browser fixtures replace those RDP checks.

## HTML selection conversion and ClipboardItem actions in development

The connection form adds an unchecked HTML option. It is disabled while
clipboard is off or native `clipboardHtml` is absent; config construction checks
text/revoke/HTML capabilities again. Off selection still ignores disabled HTML
and quota drafts. HTML is an additional explicit format alongside Unicode, with
the same direction and item quota.

The reference HTML panel has separate local Paste, Send, remote Get, local Copy
and Clear buttons. Local Paste reads one ClipboardItem into a draft; Send is a
separate RDP operation. Remote Get fills received fields; Copy is a separate
operating-system operation. Raw markup is shown in readonly textareas and is
never inserted into the viewer document. This panel is available only for the
current ready HTML selection, and its remote Get additionally requires a peer
HTML offer. The existing Unicode panel remains separately usable.

`normalizeClipboardHtmlItem(item, maximum)` validates the byte item and chooses
the optional selection, otherwise the fragment. An inert template containing
the original context is used only to determine ancestors and list numbering.
The output tree is built from the **original selected bytes** plus empty,
sanitized ancestors; unselected context text is not copied into it. A second
inert parse validates that repair/foster-parenting did not move surviving
selected nodes outside the marker range. Markers inside attributes, raw text or
ambiguous parser locations refuse the action. Active/foreign/template subtrees
are removed before range cloning. The result contains HTML, optional text and a
`sanitized` flag; caller byte buffers remain unchanged.

The reference conversion profile retains common static rich text:

| Content | Reference conversion |
| --- | --- |
| Text | Unicode, entities, paragraphs, headings and common emphasis/code/quote elements |
| Tables | Table/section/row/cell ancestry, bounded spans, dimensions and inline presentation |
| Lists | Bullets, ordered lists, reversed lists, start/value; selected items retain their original number |
| Inline styles | Known font, color, spacing, border, alignment, dimension and list properties; no URL/expression/custom-variable functions |
| Links | Absolute HTTP/HTTPS/mailto without embedded credentials or control characters; relative URLs are not resolved |
| Removed content | Scripts, frames, objects, images, stylesheets, foreign namespaces, embedded templates, event handlers and unknown attributes |

Unknown static HTML elements are unwrapped. Unsupported/active content removal
is reported in the panel; there is no automatic plain-text fallback after HTML
refusal. Stylesheet/class-based formatting is not evaluated; its removal is an
explicit reference-profile limitation. The exact tag/attribute/style allowlists
are in [the normalizer](../apps/reference-harness/clipboard-html-normalize.js).
The server/private APIs remain opaque HTML transport and do not apply this
reference UI profile. A host supplying another UI must preserve selected ranges
and provide its own safe conversion rather than displaying raw context.

Before DOM parsing, source admits at most 16,384 literal `<` bytes. Before range
cloning it admits 32,768 inspected nodes, depth 128 and 64 attributes per element.
Selected copied attributes are at most 4,096 characters; CSS has at most 64
declarations with values at most 256 characters. Serialization has a finite piece
count and checks escaped UTF-8 length before constructing expanded strings.
Body plus optional text stays within the configured maximum and the existing
16 MiB-minus-32 content ceiling; additional wrapper/escaping overflow refuses
without partial delivery. These bounds do not claim an exact browser/OS RSS cap.

Both panels share one local-action reservation. They disable competing clipboard
actions while a permission request is pending; input/media keep their ordinary
owners. Clipboard API read/write is invoked directly in a trusted active click.
There is no automatic permission query, synchronization or retry. Read admits at
most 16 items/formats but uses only the first item's HTML and optional text.
Both Blob types and their aggregate sizes are checked before `arrayBuffer()`.
Owned arrays are wiped after normalization or cancellation, including a late
arrayBuffer completion. Outgoing drafts are rechecked against the complete
CF_HTML/normalized Unicode wire quota before native admission.

One permission token has a five-second absolute expiry. Clear, detach, source
loss and expiry invalidate pending UI delivery and release the shared reservation.
Clear during a remote operation leaves its bounded wire owner to drain, then
wipes a late accepted item without filling fields. OS Copy constructs one
ClipboardItem with `text/html` and optional `text/plain`; absence and empty text
remain distinct. A browser operation already invoked cannot be rolled back;
immutable strings and browser/OS copies are outside the owned-array wipe claim.

Current focused evidence covers all three directions through the full Edge
viewer/actual local control WebSocket with a fake RDP backend, multi-window
Unicode, contextual table selection, explicit click/activation, shared blocking,
denial, five-second expiry, cancellation before getType/arrayBuffer and late
native-result wiping. Actual browser permission denial is additionally tested
for HTML and text without reading OS data or performing a remote transfer.
The normalizer tests include the full 16 MiB item ceiling, structural/output
bounds, active-resource traps, ordered numbering and 128 repaired-context
combinations. These are browser/synthetic integration results, not real remote
HTML application or physical OS ClipboardItem roundtrip acceptance.

The combined implementation checkpoints `a3542d7` (conversion) and `7019d7a`
(reference actions/form) pass full `pnpm check`: Windows **1113 passed / 71
skipped / 0 failed**, Linux UID1000 with zero effective capabilities
**1085 / 104 / 0**. Linked MSVC `/WX` + `/analyze` CTest passes **39/39**.
Focused UI/permission/config/codec checks pass **25/25**; final normalizer
checks pass **4/4**, including the additional 128 contextual-repair variants.
The full suites include all current cases; the narrower focused logs overlap.

`build/current-validation/html-ui-acceptance.json` binds the exact combined
product/test sources and terminal logs by SHA256, with physical OS and actual
RDP acceptance explicitly false. C++ is unchanged from the earlier native
handoff evidence. Initial full-viewer failures were missing input lifecycle
hooks in the synthetic backend; completing that fixture restored startup
without changing production input. An initial repair-refusal vector selected
the whole document and was correctly repairable; the final contextual vector
selects inside a table and verifies explicit refusal. Earlier logs are retained.

## Named Windows OS ClipboardItem acceptance

Checkpoint `c3447a5` passes a separate headed Microsoft Edge **156.0.4314.42** /
Windows system clipboard scenario. It uses the actual Clipboard API, not an API
override. The first browser copies an owned source selection with a table,
emphasis, numbered list and Japanese/Cyrillic/emoji. The reference panel reads
both formats into a draft without sending. A synthetic session API receives
that draft and supplies a separate contextual item; the reference Get excludes
unselected siblings and wipes its owned returned arrays.

The reference Copy writes one real ClipboardItem containing HTML and text. A
**second independent headed browser process** reads both formats back and checks
known selected content, formatting and exact text. This verifies interprocess OS
clipboard exchange rather than a renderer-only fixture. Owned clipboard data
is then cleared, fields disposed and both browsers closed. No RDP endpoint or
lab credentials are used; real remote application/peer/platform gates remain.

To repeat the explicit owned scenario from this development checkout:

```powershell
.\.tools\node-v24.21.0-win-x64\node.exe scripts/test-html-os-clipboard.mjs --owned-os-clipboard
```

This command replaces the system clipboard with its synthetic data and clears
only data carrying its invocation marker. It does not read or restore previous
clipboard contents. A foreign clipboard change fails verification without
clearing that foreign result. Omitting the flag or supplying duplicate/unknown
arguments refuses before browser/clipboard access; the guard test passes 1/1.
Ordinary `pnpm check` runs that guard, not the physical clipboard scenario.

The terminal scalar report is
`build/current-validation/html-os-clipboard-1792988838479-723cd2.json`;
`html-os-clipboard-acceptance.json` binds it and the current helper/fixture/product
sources by SHA256. It records physical OS acceptance true for this named profile,
`actualRdp:false`, `sessionApiMocked:true`, no Clipboard API mock, successful
cleanup and the independent-process check. Earlier narrower runs remain retained.
The earlier combined UI receipt's false physical-OS flag retains its historical
scope; this later report supplies that separate named gate.

## Owned actual-RDP HTML application fixture

`scripts/test-html-rdp-clipboard.mjs` implements the named Windows RDP
acceptance. The prepared-document Windows/Edge profile below now passes; broader
peer/platform gates remain. This does not close the HTML TODO or accept a release.

Checkpoint `75a6a93` passes the five focused fixture checks and full Windows
`pnpm check`: **1119 passed / 71 skipped / 0 failed**. A fresh linked MSVC
Release build passes CTest **39/39** and the native/lifecycle subset **54 passed /
2 skipped**.
`build/current-validation/html-rdp-helper-acceptance.json` binds the full log,
helper/fixture sources and clean native receipt by SHA256. These results verify
the preparation and existing product regression; that historical preparation
receipt records actual remote HTML unaccepted. The later named application run
below supplies its separate acceptance.

### Named Windows RDP HTML application acceptance

The terminal prepared-document run
`build/current-validation/html-rdp-clipboard-1792995501741-245c90.json` passes
actual Windows worker → Windows RDP peer → user-prepared Edge application and
headed local Edge **156.0.4314.42**, with real Clipboard API and public HTTP/control
WS. There is no synthetic session backend or clipboard API override.

One explicit browser HTML Send is pasted in the remote application; its checked
receipt verifies both formatted HTML and exact Unicode fallback. Two subsequent
ordinary remote Copy operations produce different revisions, each read through
the reference HTML panel, copied to the local OS and read back. Known table,
bold/italic, ordered-list start/items and Cyrillic/Japanese/emoji content pass.
Native calls are one HTML write, two HTML reads and two explicit text receipt
reads. Detach confirms one accepted no-format revoke; local owned OS data is
cleared, the worker PID retires and the private runtime directory is empty.
Closing the owned document is requested through its control attachment, with
the same limited close-request claim described below.

The first address-entry attempt did not produce the owned page receipt and
stopped without any clipboard read/write. The operator then opened an owned
HTML file. Its first run verified the browser-to-application direction, but the
helper incorrectly waited to click disabled Clear before its first HTML read.
The helper now clears only when enabled. The final run above passes both
directions and cleanup. Neither failed run is discarded or counted as success;
no production clipboard restriction was relaxed.

`build/current-validation/html-rdp-windows-acceptance.json` binds the terminal
report, exact current helper/product sources and verified native cohort. Final
prepared-document/guard/document/public-WS fixture checks pass **7/7**; the full
Windows 1119/71 result above precedes the later test-helper corrections and extra
guards. Product and native inputs have not changed between these runs.

For reliable operator preparation, generate a fresh nonce document with
`htmlLabDocument(nonce)` from `scripts/html-rdp-lab-fixture.mjs`, save its returned
`document` as an HTML file and open that file in the separate remote Edge window.
Pass that same public 32-hex nonce in place of the first flag:

```text
node scripts/test-html-rdp-clipboard.mjs --prepared-remote-document=<32-hex-nonce> --owned-os-clipboard sha256:<approved-64-hex-digest> build/native-clean-<id>/receipt.json
```

This mode skips address entry and still requires the exact nonce-bound receipt
before sending HTML or requesting document close. The file contains only the
synthetic fixture, with no credentials, server addresses or network requests.

The operator first opens and focuses a **separate blank Edge window** on the
authorized Windows RDP lab. The helper does not launch an application or run a
remote shell. It types its bounded, self-contained synthetic HTML data URL into
that prepared window through public control WS input. A nonce-bound, strictly
checked scalar receipt establishes the owned document before other application
actions. No screenshots or pre-existing clipboard reads are used.

Run manually from the project root with Node 24, an approved exact certificate
fingerprint and a verified current `build/native-clean-*/receipt.json`:

```text
node scripts/test-html-rdp-clipboard.mjs --prepared-remote-edge --owned-os-clipboard sha256:<approved-64-hex-digest> build/native-clean-<id>/receipt.json
```

Both flags are required. The fixed external Windows target is checked against
the ignored authorized lab configuration before loading its credentials. The
helper never accepts a replacement target or certificate bypass. Lab secrets
remain in memory and reach the worker through private IPC; they are absent from
arguments, environment, reports and logs.

The scenario uses real HTTP/control WS, the actual `ClipboardClient`, native
worker, CLIPRDR and reference HTML panel. Remote physical key/text input uses
the same public control sequence, without a browser-reserved Ctrl+L shortcut
being intercepted locally. It tests explicit local Paste without Send, HTML
Send followed by ordinary remote Paste, HTML/Unicode application receipt,
remote table/list/bold/italic selection, explicit Get/Copy and real OS readback.
A second remote source revision must replace the first. The bounded source URL
fits within the native CF_HTML 4 KiB header profile.

Cleanup requests closing only the nonce-verified document, disposes the panel
and control attachment, checks acknowledged native revoke, joins the worker and
checks an empty private runtime directory. It clears the local OS clipboard
only while that invocation's marker is still present. A close key is reported
as a request, not independent proof of remote window termination. Reports contain
only fixed names, scalar results and source/native hashes, including a failed
phase on refusal. There is no automatic retry or fallback after refusal.

Automated fixture tests exercise the self-contained document and real public
WS composition with a **synthetic** session backend; they do not connect to RDP
or read the OS clipboard. Actual remote HTML, unsupported peers, declared
platforms and final release acceptance remain separate gates. This control-only
scenario does not establish a new media/latency acceptance profile.

### Owned XRDP negative peer probe

The independent `scripts/test-html-xrdp-peer.mjs` verifies the named peer-absence gate.
It uses the existing Debian 13 XRDP/Tk fixture, a new invocation-owned container
on loopback port 3393 and generated in-memory credentials. It does not read old
lab files, use an external host or access the OS clipboard. Its argument guard
passes; the actual Windows-worker/owned-XRDP profile now passes as recorded below.

```text
docker build --file tests/fixtures/xrdp-lab/Dockerfile.unicode --tag freerdp-bridge-html-xrdp-peer:lab tests/fixtures/xrdp-lab
node scripts/test-html-xrdp-peer.mjs --owned-xrdp-peer build/native-clean-<id>/receipt.json
```

The probe copies the owned Tk fixture's known Unicode source through ordinary
RDP keys, verifies that the peer advertises text without named HTML, requires
public `clipboard.html.request` to refuse with zero bytes and zero native
HTML/text reads, then separately requests and verifies the Unicode item over
actual RWC1 chunks. Thus an explicit text read cannot be mistaken for implicit
HTML fallback. Cleanup verifies the invocation's container ID/label before
removal and joins the native worker/runtime. Reports retain actual image/package
versions and hashes. This is a named remote-source profile, not a claim that all
XRDP versions or both HTML directions are unsupported.

The terminal run
`build/current-validation/html-xrdp-peer-1792996195863-cf9f18.json` passes with
**xrdp 0.10.1-3.1+deb13u2 / xorgxrdp 1:0.10.2-1**. The actual remote source
offers Unicode without HTML; public HTML refusal dispatches zero native reads
and no binary content. The subsequent explicit Unicode read dispatches one native
text read and passes exact known UTF-8 comparison, RWC1 ACK/completion and cleanup.
The worker PID retires, the runtime is empty and the exact owned container is
removed after its ID/label is verified. The image ID and source/log hashes are
bound in `build/current-validation/html-xrdp-peer-acceptance.json`.

Initial attempts did not show the Tk editor before selecting its text. A
diagnostic RDP frame of this isolated synthetic desktop confirmed the hidden
field; showing it with F3 before its F4 preparation restored ordinary Copy.
No server clipboard implementation or production fallback policy was changed.
The helper may retain one bounded diagnostic JPEG of this owned fixture on
failure, under the operator's explicit GUI-capture permission. It never captures
the external Windows lab. Failed setup/probe reports remain retained. The first
image build failed at Debian DNS resolution; a per-build mapping to the host's
current public DNS response completed without changing system Docker settings
or disabling Debian package signature verification.

### Linux backend preparation

The Linux lab viewer server now has an explicit private `htmlClipboard:true`
bootstrap mode and optional `ipcTransport:"framed-pipes"` selection. Its existing
legacy/soak defaults remain available. The bounded 1024-byte stdin bootstrap
admits only known fields, wipes mutable input and converts parser failures to a
fixed error. The ephemeral bearer is never an argument, environment value or log.

HTML mode serves the same reference panel and actual byte client at `/html-lab/`
and provides bearer-protected scalar clipboard counters/source state through
`/lab/stats`. It does not automatically connect, copy, paste or access the host
clipboard. The trusted test host can select its linked binary directory through
`BRIDGE_TEST_BINARY_DIR`; this is not a browser-controlled worker path.

`scripts/test-linux-viewer-bootstrap.mjs --linked-native` verifies legacy,
HTML/auto and HTML/framed startup/authorization/assets/shutdown in an isolated
Linux lab with the current linked worker. It requires Node 24, a non-root UID,
zero effective capabilities and the configured native binary directory. The
three actual linked profiles pass under UID1000 with the exact GCC 8.3 SDK;
three bounded bootstrap/CLI checks pass on Windows and Linux. No external RDP
connection or OS clipboard operation occurs in these preparation tests.

The terminal log is
`build/current-validation/html-linux-server-start-stop-capabilities.log`;
`html-linux-server-acceptance.json` binds it and the current helper sources.
This proves Linux backend preparation, not a Linux-worker HTML application
roundtrip. The latter and broader direction/platform/release gates remain open.

### Windows browser to Linux worker application driver

`scripts/test-linux-html-rdp.mjs` now drives the prepared Edge document through
the actual Linux backend's public HTTP/control WS. Before generating a bearer
or reading lab credentials, it verifies the dedicated container's immutable
GCC 8.3 image, UID1000, read-only root/SDK mount, dropped capabilities, fixed
working directory/label, absence of loader hooks and exclusive loopback port
publication. RDP credentials remain in memory and use the public loopback API
and private native IPC; no credential is a Docker argument, environment value
or log field.

The exact `connectCore`/input/clipboard hooks gate this scenario. The overall
V1 `rdp` flag stays false, as required by the existing experimental capability
contract. The helper checks Linux/x64, FreeRDP 3.32.1 and the actual RWS1 or
framed HELLO transport, not just a caller-selected transport name.

The following preflight loads the real client in headed Windows Edge, probes
the actual Linux worker, checks source capability/transport metadata and joins
server cleanup. It does **not** read lab credentials, connect to RDP or call
the host Clipboard API:

```text
node scripts/test-linux-html-rdp.mjs freerdp-bridge-linux-viewer-<id> --prepared-remote-document=<32-hex-nonce> sha256:<approved-64-hex-digest> --owned-os-clipboard auto --bootstrap-only
```

Both preflights pass: `auto` reports `unix-seqpacket-rws1`, and `framed-pipes`
reports the explicit carrier. Seven argument/profile/capability/document/public-WS
checks pass. Initial preflight incorrectly required the overall `rdp` flag;
the corrected helper requires the concrete hooks, with a regression proving
that `rdp:false` remains valid. An initial browser shortcut fixture timed out;
the document-reset check now reloads the document independently, while the
actual socket fixture verifies physical F5 forwarding. No production capability
flag or assertion was weakened. Terminal reports and hashes are bound in
`build/current-validation/linux-html-driver-preflight-final-acceptance.json`.

For the actual operator-prepared document, omit `--bootstrap-only`. The first
carrier can use `--keep-owned-document` instead: after both HTML directions and
the second remote revision, the helper refreshes only its nonce-verified remote
page and checks a third receipt proving reset. The next carrier then uses the
same page and requests its close at completion. This avoids relaunching an
application between the two controlled runs. Actual application acceptance for
this driver now passes in the named profile below; preflight retains its separate
non-RDP scope.

### Named Linux-worker HTML application acceptance

Both actual source-checkpoint `45f1a05` runs now pass with headed Windows Edge
**156.0.4314.42**, the prepared Windows RDP application and the actual Linux
worker under UID1000/dropped capabilities/read-only root and SDK. The primary
run identifies `unix-seqpacket-rws1`; the other identifies `framed-pipes` through
the real HELLO metadata. Both use FreeRDP **3.32.1**, real HTTP/control WS,
reference ClipboardItem actions and the actual Windows OS clipboard. There is
no synthetic session backend or browser clipboard override.

Each run verifies the nonce-bound application before the first HTML write,
local Paste without Send, one native HTML offer/application paste, two remote
HTML reads with different source revisions, static table/list/bold/italic and
Cyrillic/Japanese/emoji content, explicit OS Copy/readback and one accepted
no-format revoke. The first run refreshes its verified page and checks a third
text receipt proving reset; the second checks two text receipts and requests
closing that same owned page. Both clear only their owned local OS data,
dispose the UI, retire the native worker PID and leave the runtime empty.

Terminal reports are
`build/current-validation/linux-html-rdp-1793000368452-auto.json` and
`linux-html-rdp-1793000458477-framed-pipes.json`.
`linux-html-rdp-acceptance.json` binds them, current helper/product source hashes
and the immutable Linux native cohort. Their development bridge version is
still 0.3.0; they are source acceptance, not a published 0.4.0 artifact claim.
Full current Windows `pnpm check` passes **1129/71 skips/0 failures**, separately
bound to its terminal log. Full Linux `pnpm check` under UID1000/zero effective
capabilities passes **1097/108 skips/0 failures**. Hosted checks and final
versioned distribution/release acceptance remain open; no old archive is repacked.

### Source CI compatibility correction

The first public feature run (`6f5a445`) exposed two foundation-profile failures:
the CLI emitted `clipboardHtml:false` while HELLO correctly omitted the optional
property, and one synthetic browser fixture hard-coded `build/bundled` instead
of the CI-selected native directory. Private correction `98a88c4` / public
`8f67972` aligns unavailable CLI reports with the existing optional-property
contract and makes that fixture honor `BRIDGE_TEST_BINARY_DIR`. Exact
CLI/HELLO/REST equality remains asserted; no capability or RDP assertion is
relaxed. The linked FreeRDP-enabled CLI branch is unchanged.

Both failures now pass with the actual Windows foundation worker. Post-fix
native CTest passes Windows foundation **22/22**, Windows linked **39/39** and
exact GCC 8.3 foundation **23/23**; the latter also passes the actual CLI/HELLO
probe. Public source bytes match the private feature checkpoint across every
changed feature file. The hash-bound audit is
`build/current-validation/html-ci-fix-source-audit.json`. The failed hosted run
and its logs are retained. Both Linux build jobs in
[the corrected foundation run](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40294830780)
and [the corrected GCC 8.3 run](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40294830711)
pass. Post-correction full Windows `pnpm check` passes **1129/71 skips/0
failures** (`html-post-cli-windows-regression.json`).

The sanitizer job passes native ASan/UBSan and Node **983/222 skips/0 failures**,
then exposes a missing HTML decoder dependency in the general `ipc-fuzz`
target's direct source list. Correction `ebc0fef` adds that instrumented source
without changing production code. All local Clang 18 fuzz targets now link;
sanitized CTest passes **23/23**, followed by **568,847 IPC**, **71,118 CF_HTML**
and **256,312 clipboard-wire** runs in three 21-second seeded runs without
failures or suppressions. The terminal log is
`build/current-validation/html-all-fuzz-clang18-check.log`. Hosted acceptance
of this final build correction subsequently passes as recorded below; versioned
release acceptance remains open.

### HTML source feature acceptance

Source checkpoint private **`bba3c98`** / public **`04fd0cc`** passes all four
[foundation jobs](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40296584437):
Windows MSVC, both Linux GCC profiles and sanitizers. All twelve hosted fuzz
steps pass, including general IPC, CF_HTML and clipboard wire validation.
[Exact GCC 8.3 foundation](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40296584361)
also passes. Full linked local regression is Windows **1129/71 skips/0 failures**
and Linux UID1000 **1097/108/0**; linked native CTest is Windows **39/39** and
Linux **40/40**. The later unavailable-CLI correction is additionally checked
with Windows/GCC 8.3 foundation workers and the final hosted suites.

`build/current-validation/html-source-acceptance.json` binds every required CI
result and the real OS/Windows/Linux RDP reports. Its audit verifies matching
public/private source bytes, unchanged application-tested browser product code,
both HTML directions, static formatting/Unicode, a fresh remote revision,
explicit no-fallback XRDP refusal and cleanup. Actual Linux reports identify
RWS1/framed through HELLO, independently of the requested transport. The only
native change since their source checkpoint is the unavailable CLI property's
representation; the linked HTML branch is unchanged.

This completes the source HTML item in SPECIFICATION §2.7 and TODO Stage 7.
The reference safe static formatting profile and explicit browser permission /
Paste/Send/Get/Copy semantics above remain its documented behavior. This is not
image/file clipboard, drive redirection, the full original Stage 7 or blanket
browser/peer/OS acceptance. Versioned **0.4.0** archives, independent consumers,
standalone upgrade/installation and public delivery are separate release gates.

### 0.4.0 archive preparation

`release/0.4.0` aligns all ten product manifests and CMake. The new Windows
linked source consumer passes **39/39 CTest** and **54 lifecycle/IPC checks**
(two Linux-only checks skipped); exact GCC 8.3 Linux passes **40/40 CTest**,
runtime relocation and CLI/HELLO/REST agreement. The Windows source receipt is
`build/native-clean-RljYC8/receipt.json`. Both reuse the pinned FreeRDP SDK.

Ten exact JS/native tarballs are in `build/release-0.4.0-archives`.
`build/current-validation/html04-exact-archives.json` records their SHA-256 /
SHA-512 and the two standalone lock hashes. Lock advancement verifies an
unchanged external dependency graph and binds the exact archives. All archives
contain explanatory root README files and matching repository identities.

Four independent npm consumers pass on each OS: Fastify, node:http/https,
Express and NestJS with its two host adapters. Strict TypeScript, same-port
HTTP/WS, native strict TLS refusal, cleanup and installed recovery remain
checked. The shared installed fixture also starts the relocated real worker,
requires **0.4.0** HTML/text/revoke HELLO capabilities, loads the three HTML
browser modules through the adapter's installed browser export and checks a
Unicode HTML item roundtrip plus aggregate-quota refusal. This test does not
connect to a desktop or access the OS clipboard.

Canonical terminal logs are `html04-windows-fastify-consumer.log`,
`html04-windows-{http,express,nestjs}-consumer-final.log` and
`html04-linux-consumers-full-final.log` under `build/current-validation`.
The initial orchestration passed a Fastify-only `--npm` flag to node:http;
its explicit usage refusal is retained, then the remaining adapters pass with
their supported `--archives` arguments. Initial Linux configure inputs and a
missing packaging pnpm mount were corrected without changing production code
or weakening any acceptance check. The locks initially refused the new product
version, then all **21** focused version/lock/publisher guards pass after exact
lock advancement. Full release suites, versioned standalone acceptance and
public delivery remain open; none of these archives has been published.

### 0.4.0 local release checkpoint

Checkpoint **`679abc5`** passes full release-source `pnpm check` on Windows
**1131/71 skips/1202 total** and Linux UID1000 **1099/108/1207**, zero failures.
All eight exact npm consumers pass. Windows standalone payload checks pass
**10/10**, including private Node/native process retirement and guarded recovery.
Both new portable formats pass exact byte inventory, extraction/relocation,
startup orphan recovery, strict TLS refusal and joined launcher shutdown.

Windows production-mode MSI is built at
`build/standalone-msi-AFRwKS/freerdp-bridge-0.4.0-win32-x64.msi`, SHA-256
`bdde86a472f6a748944fb5f056b5fddb1a4bb36fed6855b9732690ddff0c9217`.
The Linux candidate DEB is built at SDK-volume path
`/bridge/check-source/build/standalone-deb-oHTYhB/freerdp-bridge_0.4.0_amd64.deb`,
SHA-256 `e1cbbc976ec551ad4cc89ccccb6b215a8eab936950cb783b307477eea21b2d9f`.
Building either installer is separate from installation/upgrade acceptance.

`build/current-validation/html04-local-release-checkpoint.json` verifies the
terminal results and binds all logs, archive/lock hashes and Windows MSI bytes.
Linux consumer/full-check logs and receipts are exported from the SDK volume to
that same validation directory. None of the ten npm archives has changed since
its exact consumer checks.

The initial Windows WiX CAB helper failed on the long/non-ASCII workspace path;
the same payload builds successfully through a short workspace alias. The
initial portable run fails because its restricted PowerShell child cannot
resolve its owned Temp directory. An unchanged test repeated with ordinary
owner access passes; no launcher/ACL/assertion changes are made. The diagnostic
copy is not acceptance evidence. Linux's task cache directory is created for
UID1000 without broad permission changes. Its npm build explicitly uses the
supported single public `--build-ca` input, scoped to build subprocesses and
excluded from the payload; TLS verification is retained. All failed logs remain.

Still required: release-source hosted checks, RPM assembly, installed two-version
upgrades including Astra/RED OS, versioned actual RDP/HTML artifact profiles,
stable tags, npm/GitHub publication and fresh registry-only consumers. The public
release remains **0.3.0**; this checkpoint is not final release acceptance.

### 0.4.0 candidate and hosted installer checks

The unstable [candidate](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/standalone-candidate-0.4.0-574de3ca4500)
binds annotated public source `574de3c` to six exact prepublication core archives.
Each uploaded size/SHA-256 matches the accepted local tarball; the two production
locks retain their SHA-512 binding. This prerelease supplies installer CI only.
It is not npm publication or a stable `v0.4.0`; the candidate pointer refuses
production-main assembly and must be removed before stable delivery.

Public release source **`ab7fefd`** passes all four
[foundation jobs](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40304572531)
and [exact GCC 8.3](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40304572756).
The [first installer run](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40304572449)
passes Linux production assembly, both archive inspections, portable acceptance
and actual systemd 0.3.0-to-0.4.0 installed lifecycle/upgrade/crash-recovery/
reinstall/uninstall checks. Its collected Linux receipt retains `candidateOnly`.
Windows builds the production namespace and passes payload checks, then its
portable test terminates `tar.exe` at the 45-second extraction timeout with
empty stderr. This failed job is retained, not counted as an installed upgrade.

Private correction **`2a5802f`** / public **`0bbc128`** changes only test IO budgets:
finite 120-second extraction and a 240-second enclosing test. Exact inventory,
hashes, ACL, strict TLS, readiness and process-retirement assertions/deadlines
are unchanged. The same local ZIP again passes complete acceptance in 25 seconds.
The [repeat installer run](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40306308000)
is active; its Linux job also passes. Windows remains pending at this checkpoint.
No product code or accepted archive bytes change for this correction.

The separately built local RPM passes independent gzip/header/digest/noreplace
policy and full extracted inventory checks, SHA-256
`9579f63e7cc27cce072828cc5695ab57b8e5a2b34bc5d82899bb6e21d9089209`.
The local DEB independently passes exact staged-byte, ownership, configuration
and maintainer-script inspection. These package inspections do not accept an OS.
`build/current-validation/html04-candidate-ci-checkpoint.json` binds the source,
candidate, initial jobs, retained failure and local correction/inspection logs.

Both approved Astra 1.7.5 / RED OS 7.3 SSH labs pass absence/default-config
preflight. Dedicated mode-0700 contexts contain hash-verified published **0.3.0**
seed packages, pinned Node and test sources; preparation changes no service.
Published seed bytes match both GitHub asset digests and the immutable 0.3.0
standalone manifest. The `.local-tests` credentials remain in RAM/private SSH
and never enter uploaded files or command arguments. Current preparation does
not establish a 0.4.0 installed/platform result. CI artifact downloads preserve
partial data and verify final full digests before any installer is used.

### 0.4.0 versioned distribution acceptance

The checkpoints above retain their historical status. Final versioned acceptance
at private `9bb4d2a` verifies the following additional results:

- Public `0bbc128` passes all four
  [foundation/sanitizer/fuzz jobs](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40306308025)
  and [exact GCC 8.3](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40306308015).
  All 526 product files match the privately accepted source bytes.
- The [final installer run](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40306308000)
  passes Windows and Linux production assembly, independent inspections,
  installed 0.3.0-to-0.4.0 upgrades and combined verification. Downloaded artifact
  ZIPs and extracted files match their complete SHA-256 digests. Receipts remain
  `candidateOnly`; stable delivery must assemble and verify its own final assets.
- Those verified CI DEB/RPM candidates pass actual upgrades from the immutable
  published 0.3.0 packages on Astra 1.7.5 and RED OS 7.3: private service identity,
  strict TLS, old-worker retirement, crash recovery, reinstall, uninstall and
  retained public configuration. The first RED OS attempt ran out of disk and
  is retained as a failure. Removing four hash-verified obsolete lab archives
  freed 308,747,770 bytes; the unchanged package and test then pass. No user files
  or unrelated services were removed.
- Eight actual 0.4.0 desktop profiles pass: Windows CI portable and installed
  Linux CI packages against Astra/RED OS, each with JPEG/H.264. They verify
  nonblank 1080p output, resize/restore, browser reattach and cleanup. These
  desktop tests do not establish clipboard/device support.
- The operator-prepared Windows/Edge HTML application passes again with the
  actual 0.4.0 worker: both HTML/Unicode directions, newer remote revision,
  static formatting, local-paste separation, revoke and OS/PID/runtime cleanup.
  Report `html-rdp-clipboard-1793011958453-245c90.json` binds the source hashes and
  clean native receipt. Worker SHA-256
  `d72b0df0b86838313461d95891c877a44d2a74bccec773cda04ea5322962bf5f`
  matches both the frozen npm runtime and the accepted CI portable. Linux rich
  application RWS1/framed evidence remains the accepted source-feature profile;
  since that accepted source checkpoint, native code is unchanged and CMake
  changes only the version. It is not represented as a new 0.4.0 Linux rich
  application run. Named browser/peer limits and explicit XRDP HTML refusal
  continue to apply.
- Actual RED OS 7.3 / GCC 11.4.1 foundation CTest passes **23/23**. This uses no
  FreeRDP link or RDP session and is separate from installed OS acceptance.
- All ten official npm dry runs pass with isolated empty configuration and
  exact integrity/size checks. All ten tarballs are scanned for known local lab
  secrets. Previously accepted Windows/Linux consumer/full-check/native results
  remain bound to the same immutable archive bytes and production locks.

`build/current-validation/html04-versioned-platform-acceptance.json` hashes 27
input receipts/reports and verifies the above assertions, unchanged product
source, locks, package bytes and worker identity. Delivery input copies in
`build/release-40-archives` are byte-identical to `release-0.4.0-archives`; they
are not repacked. Their exact acceptance inventory is:

| Package | Bytes | SHA-256 |
| --- | --- | --- |
| `@freerdp-bridge/api@0.4.0` | 108874 | `a941ff7e9de5be0a0620f86b9411c1ad3c9a2fcba26da98f30e59efd4b2a9d4f` |
| `@freerdp-bridge/config@0.4.0` | 9511 | `e75bb0be6c4fb85291165fd8ac0780dd2a7e27a52878a69caf6e2f791a9931e5` |
| `@freerdp-bridge/express@0.4.0` | 5409 | `f1154e2332aa486babbc5d703cccf755b1500d2f2e4794bf7786e08a03033580` |
| `@freerdp-bridge/fastify@0.4.0` | 3987 | `77f11640e71f7eb03b9435225f77d907e647eb299e28ec8a487e008c32d8bfb6` |
| `@freerdp-bridge/http@0.4.0` | 7941 | `499ad40818031f0259285370ca78e52ac868ece0d388a0e77ee4dcca22dd3354` |
| `@freerdp-bridge/nestjs@0.4.0` | 8689 | `9741dd5effe142e201041e8abf0b9df4de22dd6d7a318a581faef79286f6d0f0` |
| `@freerdp-bridge/node@0.4.0` | 124678 | `be8770cedd03c96b5794ca067343f5c62bd99053de428d2b8f68baefae53e64f` |
| `@freerdp-bridge/protocol@0.4.0` | 41925 | `48221ae275e1070ced46b0f9e3f27fb076d9a9ac2cccde6a79f47ea552f36219` |
| `@freerdp-bridge/runtime-linux-x64-gnu@0.4.0` | 76517817 | `c4d7481829f91f0a3538b7dcd169506523ab307f046abe2254035c15e57f0970` |
| `@freerdp-bridge/runtime-win32-x64@0.4.0` | 6933088 | `d65a0a3817176b2cac2eb8327f75261fb0db9922cf980f9a709340186ea23bd8` |

The candidate pointer is removed before stable export. Public stable npm/GitHub
and standalone publication, final public asset checks and registry-only consumers
remain delivery gates. Until those complete, this section accepts the versioned
distribution inputs and does not claim public 0.4.0 availability. File/image
clipboard, drives, the full original Stage 7 and original V1 remain open.

### 0.4.0 public delivery

All ten exact accepted npm archives are public at **0.4.0**, with matching
SHA-512 integrity and `latest` tags. All five GitHub repositories retain their
old history/tags and have published `v0.4.0` Releases. The accepted private tag
is `53b5edb181afe8d713a16a2b0616bfcebfc7e783`; public core is
`b11db42dde8a68fcffcbbda62cae93d1defdb5a2`. No accepted archive is repacked.

The successful OIDC workflows are
[core](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40315491066),
[Fastify](https://github.com/SensNyaha/freerdp-bridge-fastify/actions/runs/40318835699),
[NestJS](https://github.com/SensNyaha/freerdp-bridge-nestjs/actions/runs/40318890822),
[HTTP](https://github.com/SensNyaha/freerdp-bridge-http/actions/runs/40318970115) and
[Express](https://github.com/SensNyaha/freerdp-bridge-express/actions/runs/40319636076).
Four fresh independent npm registry-only consumers pass on **each** OS: strict
TypeScript, HTTP/HTTPS/WS, native strict TLS refusal and joined recovery, plus
actual relocated 0.4.0 worker HTML capabilities and installed browser modules.
They import no checkout product code and use no development archives. These
consumer checks do not establish OS clipboard or real RDP application behavior.

[Stable main-push standalone CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40318439435)
passes both production builds, Windows/Ubuntu installed 0.3.0-to-0.4.0 upgrades,
combined verification and publication. Both receipts are `candidateOnly:false`.
The [public core Release](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.4.0)
contains MSI, DEB, RPM, ZIP, TGZ, both corresponding-source archives, standalone
manifest/checksums and the seven original core release inputs. Downloaded CI
artifact ZIP digests and all seven extracted SHA-256/SHA-512 values are verified
against the published assets. The actual public manifest and checksums are
downloaded and validated independently, including immutable source/tag binding.

Final published DEB/RPM bytes separately pass actual **0.3.0-to-0.4.0** upgrades
on **Astra 1.7.5 / RED OS 7.3**: service identity, strict TLS, old-worker retirement,
crash recovery, reinstall, uninstall and retained public configuration. Their
digests match the public assets before installation. Existing candidate lab
evidence is retained; the final package uses a distinct filename and logs, with
the previous logs preserved. Preflight and final absence/default-config checks
pass; unrelated programs/services remain untouched.

| Public file | SHA-256 |
| --- | --- |
| `freerdp-bridge_0.4.0_amd64.deb` | `0d2d796a2a82cb3d642ce5e74e47e2f17ea5ba603325b2a2a18ce211f00348e0` |
| `freerdp-bridge-0.4.0-1.x86_64.rpm` | `a45ba8778c2e2d7198532eb97a6179b123b7d0d77354970c6fb57d2915e76c68` |
| `freerdp-bridge-0.4.0-corresponding-source-linux-x64-gnu.tar.gz` | `be87e944b2745d2b9bc65912ada52f4c0ffcb137a0bd4d0caec9a5a86128aa8a` |
| `freerdp-bridge-0.4.0-corresponding-source-win32-x64.tar.gz` | `fd7a5ed84f4b421d702d218ce1fad5643698d0341053de25e12445672a7d38ca` |
| `freerdp-bridge-0.4.0-linux-x64-gnu.tar.gz` | `19afcc6ddd73d6fb23106702d33ac6a9b3821ebce4ac277a499a2c835d5fde8e` |
| `freerdp-bridge-0.4.0-win32-x64.msi` | `b51fb354e49282e2b32b51d7d8081c59c382ae658529c3e9cfea56179d64bae8` |
| `freerdp-bridge-0.4.0-win32-x64.zip` | `0b4ec72e2cc4e82e87b6846055c8129c42bee090b0043b4a83831da97387adad` |

`build/current-validation/html04-public-delivery-acceptance.json` hashes the
public metadata, eight registry consumer logs, final platform reports, stable CI
receipts and the earlier scoped versioned acceptance. The five OIDC and stable
installer workflow URLs above are authoritative public delivery results.

Retained delivery failures: the first export stops on a local Git 10-second
timeout; its unchanged NestJS guard passes 9/9 and the complete fresh export
passes. Fastify's new draft is initially absent from GitHub's immediate read;
the existing matching draft is later found and continued without duplicate
creation. Core's first publish attempt accepts the Linux runtime but its version
endpoint remains absent beyond the five-minute read budget. After exact public
integrity is observed, only the failed publish job is repeated; both public
runtimes are skipped and the remaining JS archives publish successfully.
There is no manual per-package 2FA queue or replay of an uncertain upload.

All foundation/sanitizer/fuzz jobs and GCC 8.3 pass on the final public tag.
The additional same-commit main run passes Linux/sanitizers/GCC 8.3 but Windows
hits two external tool deadlines: local Edge navigation (5 seconds) and OpenSSL
test-certificate generation. Its failed log is retained. Only that unchanged
Windows job is repeated and passes; all four jobs in
[the final main run](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40318439576)
are now successful. No test assertion, timeout or product code is changed.
The versioned Windows rich HTML application and eight desktop profiles above
retain their precise tested inputs/scope; final public installed lifecycle is a
separate result. Image/file clipboard, drives and the full original V1 remain open.
## Image byte client in development

On `feature/image-clipboard`, the independent browser `clipboard-image.js`
codec validates the 16-byte inner schema before borrowing RGBA8 pixels. Its
encoder owns a compact top-down straight sRGB RGBA8 copy; canonical native
write admission includes the additional 124-byte DIBV5 header. Invalid geometry,
flags, truncation and aggregate/item limits are refused before allocation.
Node Buffer and native codecs are not imported into the browser module.

`ClipboardClient` now requires an explicit image offer descriptor with
`version: 1`, `itemMetadataBytes: 16` and `pixelFormat: rgba8-srgb-straight`, plus
the complete selected image scalar state. Selection, directions, generation and
maximum remain immutable for the attachment. `setImage`/`readImage` use
`clipboard.image.*` events, the same shared flight as text/HTML, existing RWC1
windows, 60-second whole-operation and two-second progress deadlines, and an
eight-second native completion budget. There is no implicit format conversion,
text fallback or OS clipboard access.

Uploads synchronously copy the caller's pixels. Downloads expose a checked item
only after terminal `data.complete`; the consumer then owns and must wipe the
returned `rgba` view. Every interrupted retained buffer/frame is wiped. A later
remote revision does not mutate the accepted native snapshot, while source,
selection or controller loss terminates transfer authority, including another
selected format's transfer.

The module also provides a fixed 33-byte PNG signature/IHDR/CRC/dimension guard
for later explicit ClipboardItem actions. This guard follows the
[PNG specification](https://www.w3.org/TR/2025/REC-png-3-20250624/) header rules;
it does not validate an entire PNG, decode pixels, inspect ancillary chunks or
bound a decoder's CPU/total memory. A caller must separately bound its complete
Blob and decoded result. Browser permission and OS operations remain follow-up
work under the [Clipboard API](https://www.w3.org/TR/2026/WD-clipboard-apis-20260624/).

Focused browser/legacy composition checks pass **25/25**, including independent
goldens, byte-offset views, native write overhead, 16 MiB items, window pacing,
shared flight, malformed headers and cleanup. Actual Edge/HTTP/WebSocket image
profiles in all three directions and retained HTML/helper checks pass **8/8**
with synthetic RDP and an OS clipboard API that refuses every call. These are
not physical OS clipboard or actual RDP image application acceptance. Full linked
`pnpm check` passes Windows **1191 passed / 71 skipped** and Linux UID1000 /
CapEff=0 **1159 passed / 111 skipped**, zero failures. Native and public backend
sources remain unchanged from the accepted image handoff/control components.
The receipt `build/current-validation/image-browser-client-acceptance.json`
binds the source snapshot and logs.

The initial Linux full run lacked Docker `--init`: Python PID 1 did not reap
orphaned children, and five existing parent-death assertions failed. A separate
before/after probe observes zombie versus reaped state; all five unchanged
cases then pass with init, followed by the unchanged full check. The initial
failure and probe logs are retained. No product/test deadline, assertion or
skip was relaxed. ClipboardItem actions, actual OS/RDP image application
acceptance, hosted whole-feature gates and merge/release remain open.

## Explicit image actions in development

The reference connection form now independently selects `clipboard.images:true`
only when the native `clipboardImage`, text and revoke capabilities are present.
Disabled mode omits all clipboard settings; HTML remains independently selected.
The existing item maximum and both directional policies apply. For example,
`clipboard:{mode:"bidirectional",images:true,maxItemBytes:1048576}` selects
images with a 1 MiB maximum; native image writes include 124 bytes of DIBV5
overhead within that maximum. This is a `browser-virtual` device origin under
[ADR-006](adr/ADR-006-device-origin-model.md), not host filesystem access.

The image panel has five explicit actions: paste a local PNG into a draft,
offer that draft to RDP, get the remote image, copy the received image locally,
and clear both local items. Sending does not paste into a remote application;
use its Paste command separately. Getting does not write the OS clipboard.
No automatic synchronization, URL/file loading or text/HTML fallback is added.
Each retained draft/received item owns one checked RGBA view. Clear, source loss
and detach wipe both views and reset the preview canvases; stale remote results
are wiped without publication. The UI shares local permission reservation and
the existing control client's transfer flight with text/HTML.

Local actions require a trusted user gesture, secure context, ClipboardItem
PNG support, module workers, OffscreenCanvas and createImageBitmap. Browser
read/write APIs are invoked directly in that gesture. Copy supplies a promised
PNG Blob to ClipboardItem while conversion proceeds asynchronously, as allowed
by the [Clipboard API](https://www.w3.org/TR/2026/WD-clipboard-apis-20260624/).
One nonrenewing five-second permission deadline cancels late publication.
An already invoked OS write cannot be rolled back; the browser/OS may retain
opaque or immutable copies. No restoration of unknown prior clipboard content
is attempted.

`clipboard-image-conversion.js` owns at most one disposable module worker,
terminates it on cancellation/disposal or its five-second deadline, and admits
only a checked item/PNG result. The worker bounds the complete PNG to 16 MiB,
checks its fixed IHDR signature/CRC/geometry and native write quota before
createImageBitmap, checks decoded dimensions, then converts through an sRGB
OffscreenCanvas. PNG export copies the checked pixels synchronously before
transfer to the worker. Temporary retained pixels are wiped, bitmaps closed
and canvas storage reset. Decoder internals/ancillary metadata and aggregate
CPU/RSS remain browser implementation/resource acceptance concerns; the header
guard is not an entire PNG parser. A failed/unsupported decode returns a fixed
refusal, without downscaling the transferred item or trying another format.

Only the local preview scales: nearest-neighbour sampling uses at most 320×240
pixels/iterations and wipes its temporary ImageData. It does not allocate a
full-sized DOM canvas or alter the transfer pixels. Browser canvas color/alpha
conversion follows the [HTML canvas model](https://html.spec.whatwg.org/multipage/canvas.html#pixel-manipulation);
arbitrary translucent RGB values can quantize during premultiplication. Exact
wire RGBA preservation does not establish lossless browser/OS color conversion.
Named opaque and broader alpha/color profiles require their own acceptance.

The browser modules ship in the existing npm/standalone reference assets.
Custom hosting must serve the worker/module files with JavaScript MIME types
and allow same-origin workers (`worker-src 'self'`); standalone already permits
them. The reference/lab hosting policies now include that permission.

Focused pure conversion/config checks pass **19/19**. Actual Edge/reference
viewer/WS tests with synthetic RDP pass **13/13**, including all three image
directions, trusted PNG actions, shared text/HTML reservation, permission expiry,
late type/result refusal, worker cancellation, no automatic OS calls and joined
revoke. Additional Edge preview and real permission-refusal checks pass **4/4**:
large preview geometry/selected pixels and clear/source/dispose buffer wiping,
plus a browser denial set before any clipboard read. These tests do not read
physical OS clipboard contents or connect to an RDP image application. Full linked
`pnpm check` passes Windows **1207 passed / 71 skipped** and Linux UID1000 /
CapEff=0 **1170 passed / 116 skipped**, zero failures. Native and public backend
sources remain unchanged from accepted image components. The local receipt
`build/current-validation/image-ui-acceptance.json` binds source, all test logs
and the independent actual OS profile below. Actual RDP, broader platform/color/
resource, hosted whole-feature and release gates remain open.

### Named Windows/Edge PNG OS profile

An independent headed **Edge 156.0.4314.42 / Windows** run passes with real
ClipboardItem APIs and an owned **opaque 32×32 PNG**. Before its first clipboard
read, the helper writes its own nonce-bound image. The reference panel pastes
it locally without sending, then explicitly sends exact pixels to the synthetic
session backend. The borrowed source pixels are observed cleared after success.
Remote get/copy uses that synthetic backend; a second independent browser
process reads the actual OS PNG and compares every pixel. A new remote revision
also passes exact readback. Local retained pixels, UI and owned OS clipboard
are cleared, and both browsers close.

The report `build/current-validation/image-os-clipboard-1793043616262-17cfe3.json`
binds the tested reference sources by SHA256. Its helper/fixture bytes are also
bound by the UI acceptance receipt. No unknown previous clipboard content is
read or restored, and no PNG/pixel contents are written into logs. This named
profile is **not RDP application acceptance**: its session API is synthetic.
It does not accept arbitrary alpha/color/metadata conversions, other browsers
or platforms, aggregate decoder resources or the complete Stage 7 requirement.

### Prepared image application helper

The manual `scripts/test-image-os-clipboard.mjs --owned-os-clipboard` helper
reproduces the named OS scenario using the tracked
`tests/fixtures/image-os-clipboard.html`. Run it with Node 24 from the project
root on Windows. It replaces the OS clipboard with its own image before the
first read, opens its own headed Edge processes, verifies exact independent
readback and clears the owned clipboard. This is a synthetic session API test,
not RDP acceptance. It writes a new timestamped, source-hashed report under
`build/current-validation/`; unknown previous content is never read/restored.

For actual RDP, `scripts/image-rdp-lab-fixture.mjs` generates an operator-owned
single HTML document from `tests/fixtures/image-rdp-application.html`. The
document contains only a strict 32-hex nonce, finite deterministic 32×32 opaque
images, F8 PNG copy, F9 paste target and F2 bounded scalar receipt. Paste checks
the 16 KiB PNG ceiling, signature/IHDR/CRC and exact 32×32 geometry before
decoding. It compares all pixels, wipes owned arrays and never emits clipboard
contents in the receipt. There is no application/URL/shell launch path.

Open the generated file on the authorized Windows lab in a separate active Edge
window, with title **Owned image clipboard lab**. The manual driver is:

```text
node scripts/test-image-rdp-clipboard.mjs --prepared-remote-document=<nonce> --owned-os-clipboard sha256:<approved-certificate-pin> build/native-clean-<id>/receipt.json [--keep-remote-document]
```

The driver requires the exact previously approved certificate fingerprint and
a verified clean linked native receipt. It reads the already authorized lab
configuration/credentials only from ignored `.local-tests/` files; credentials
reach the native worker through private IPC, never argv/environment/artifacts.
The target remains the named Windows lab. It verifies the remote document's
receipt before sending an image, performs local PNG paste/send and actual remote
Paste/readback, then remote image copy/read/local OS copy with a fresh revision.
It uses the real public control WebSocket and reference image actions. Only
F2/F5/F8/F9 and Ctrl+C/V/W input sequences are admitted; no arbitrary text input
is provided. PNG source copy is F8 alone, because this document writes PNG
directly through ClipboardItem.

The optional keep flag reloads and verifies zeroed document counters through
another owned receipt, leaving the page for a later transport profile. Otherwise
the driver requests closing its verified owned document. It joins native revoke,
worker/PID/runtime cleanup and clears the owned local OS clipboard. Diagnostics
contain only fixed status/phase/scalar metadata and source/native hashes.

Eight document/receipt/profile/CLI and actual-WS/synthetic-backend checks pass;
they do not use real RDP or OS clipboard data. The initial narrow test expected
revoke after a read-only fixture: that fixture never dirties a native offer,
so its correct expectation is zero; all eight pass after that test-only correction.
Its original failure log is retained. A fresh source-only linked Windows build
passes CTest **40/40** and the standard native/process/clipboard Node subset
**60 passed / 2 skipped**. Full helper regression is recorded below.

The helper block now passes full `pnpm check`: Windows with the fresh clean
linked worker **1215 passed / 71 skipped**, Linux UID1000/CapEff=0
**1176 passed / 118 skipped**, zero failures. The tracked OS helper independently
passes its actual headed Windows/Edge PNG scenario, including exact second
browser-process and new-revision readback and owned cleanup. Its new report is
`build/current-validation/image-os-clipboard-1793073638636-c36994.json`.
`build/current-validation/image-application-acceptance.json` binds helper and
product source, native receipt, terminal logs and that named OS report.

The current actual RDP gate is environmental: `192.168.21.149:3389` times out
at TCP connect. A no-credentials certificate preflight accepts no certificate,
performs no RDP application/clipboard operation and leaves its runtime empty.
This is not image application evidence; the Stage 7 checkbox remains open.
The user requested postponing the next availability check until **2026-10-27
09:58 Samara / 05:58 UTC**. A single local delayed TCP-only probe is scheduled;
it supplies no credentials and starts no RDP application session. Earlier
prepared-window confirmations for HTML do not establish readiness of this new
image document.

### Linux image application preparation

The private Linux lab bootstrap now independently selects `imageClipboard:true`
with `ipcTransport:"auto"` or `"framed-pipes"`. Image/HTML/soak combinations that
would select two scenarios are refused before server startup; the existing
1024-byte bootstrap ceiling, chunk/storage wiping and legacy return shape are
preserved. The server instruments only finite scalar image/native-call state,
serves the prepared image reference client and its worker modules, and joins
worker/runtime retirement. This bootstrap is a local development tool, not a
public API or production secret store.

`scripts/linux-image-lab-profile.mjs` admits only the dedicated pinned GCC-image
container with UID1000, dropped capabilities, read-only root/SDK volume,
loopback-only 47998→47999 publication, the image-acceptance label and exact
`/bridge/image-linux-node-source` working directory. The native path is the
accepted GCC 8.3 image-handoff build; duplicate/foreign worker paths and loader
hooks are refused before bearer generation or lab-credential reads.

The Windows host driver uses this profile:

```text
node scripts/test-linux-image-rdp.mjs freerdp-bridge-linux-image-viewer-<id> --prepared-remote-document=<nonce> sha256:<approved-pin> --owned-os-clipboard auto [--bootstrap-only|--keep-remote-document]
```

Use `framed-pipes` instead of `auto` for the second carrier. In bootstrap-only
mode the driver verifies actual Linux HELLO/capabilities/carrier and browser
module loading, with Clipboard APIs mocked to refuse every call. It is headless,
creates no RDP session and reads no private lab configuration. Actual mode uses
headed Edge and the same bounded PNG/pixel/receipt checks as the Windows helper;
the optional keep flag verifies a remote document reset for the next profile.
The current RDP access deferral still applies to actual mode.

`scripts/test-linux-viewer-bootstrap.mjs --linked-native` now checks five
independent server start/stop profiles: legacy, HTML auto/framed and image
auto/framed. Each observes the real native carrier; image profiles additionally
check worker/module routes and zero native clipboard calls. Eleven focused
bootstrap/profile checks pass, including retained legacy HTML selection.
All five linked Linux bootstrap profiles pass under UID1000/CapEff=0. Both
Windows Edge 156 browser bootstrap profiles also pass against the real Linux
worker, observing `unix-seqpacket-rws1` and `framed-pipes`, respectively. Each
loads the image modules, makes zero native clipboard calls, retires the worker
and cleans its runtime. The dedicated container was then removed. These two
headless profiles mock Clipboard APIs to refuse access and create no RDP session.

Full helper regression passes Windows 1220/71 skips and Linux UID1000/CapEff=0
1181/118 skips, zero failures. Native sources and the accepted clean Windows
artifacts are unchanged. The initial five-profile helper incorrectly applied an
HTML-only page assertion to the image profile; its failing log is retained,
the test condition is corrected, and the five profiles and full suites pass
after the correction. Evidence is bound in the ignored local
`build/current-validation/image-linux-acceptance.json` report. Actual image
application acceptance, including both Linux carriers, remains open.
