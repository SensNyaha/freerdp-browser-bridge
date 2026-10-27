# Clipboard Unicode text conversion

Implements the conversion portion of SPECIFICATION §2.7. The isolated C++20
codec in `native/clipboard/text.*` does not access the operating system clipboard,
load CLIPRDR or activate a public clipboard capability.

Browser-side text is strict UTF-8 without embedded NUL. RDP CF_UNICODETEXT is
UTF-16LE with a required NUL terminator. Outgoing CR, LF and CRLF normalize to
CRLF; incoming CR and CRLF normalize to LF. Supplementary characters use checked
surrogate pairs. BOM and Unicode noncharacters remain text. Incoming zero padding
after the terminator is accepted; nonzero trailing content is refused. This
matches the [Microsoft standard clipboard format definition](https://learn.microsoft.com/en-us/windows/win32/dataxchg/standard-clipboard-formats).

Each call has an explicit 1..16 MiB item limit, applied to both input and converted
output including the RDP terminator. Conversion is allocation-free and takes
immutable input and disjoint caller-owned output. A complete validation/measurement
pass precedes writing. Invalid text, excessive size, insufficient capacity and
overlap leave output unchanged. Capacity results carry the exact required length;
other refusals carry zero bytes. Callers must keep input immutable throughout
both passes and enforce policy before allocating either input or output storage.

CF_TEXT/codepage handling, HTML, images, file clipboard, channel ingress limits,
direction/attachment ownership, IPC, public transport and browser controls remain
separate required work. No clipboard contents may enter diagnostics or metrics.

The seeded libFuzzer target checks malformed inputs, refusal atomicity and canonical
UTF-8 → UTF-16LE → UTF-8 → UTF-16LE agreement. Its 16 KiB fuzz-input limit is a
test budget; the production codec retains the documented 16 MiB hard maximum.

## HTML codec in development

`feature/html-clipboard` adds allocation-free `native/clipboard/html.*` for
SPECIFICATION §2.7 and the open Stage 7 HTML item. At this codec checkpoint,
worker/SDK/browser HTML selection was still refused. The branch now additionally
implements [private worker/Node HTML handoff](CLIPBOARD_IPC.md#private-worker-html-negotiation-and-handoff-in-development);
shared public ownership and the [HTML control extension](CLIPBOARD_CONTROL.md#html-control-extension-in-development)
are also implemented, along with the [browser byte client](CLIPBOARD_BROWSER.md#html-byte-client-in-development).
The branch now also implements reference ClipboardItem actions and inert
selected-byte conversion. Named Windows/Edge physical OS acceptance and prepared
Windows application roundtrips through Windows and Linux workers now pass; the
Linux runs cover RWS1 and framed IPC. The owned XRDP negative profile verifies
explicit HTML refusal followed by a separate Unicode request. These later
results supersede the pending application status at the codec checkpoint below;
broader platform/versioned release gates remain open.
[Current application evidence](CLIPBOARD_BROWSER.md#named-linux-worker-html-application-acceptance).
Existing
Unicode selection and public 0.3.0 artifacts retain their accepted behavior.

The registered RDP format name is `HTML Format`; its numerical ID must be
negotiated per offer. The codec follows Microsoft's
[CF_HTML description](https://learn.microsoft.com/en-us/windows/win32/dataxchg/html-clipboard-format):
versions 0.9/1.0, ASCII description lines, UTF-8 content, decimal byte offsets,
CRLF/LF/CR header endings, optional leading zeroes and paired optional selection
offsets. A `StartHTML`/`EndHTML` pair of `-1` permits a fragment without context.
The project additionally limits the description to 4,096 bytes and 32 lines.
Duplicate known fields, unpaired/missing offsets, overflow, crossed ranges,
split UTF-8 scalars, embedded NUL and nonzero trailing bytes are refused.
Only zero terminator/padding bytes may follow the declared context.

`inspect_html_clipboard` borrows separate context, fragment and optional
selection ranges. It never returns or resolves `SourceURL`, parses a DOM,
executes HTML or accesses the host clipboard. Keeping these ranges distinct is
required: forwarding all context as selected content could disclose unselected
text, while discarding every ancestor can lose table/list formatting. Public
transport and browser conversion must resolve this before enabling HTML.

`encode_html_clipboard` wraps an immutable UTF-8 fragment with minimal HTML and
fragment markers, calculates byte offsets and adds one final NUL. The configured
1..16 MiB limit includes the complete CF_HTML representation, not just the
fragment. Validation and measurement precede output writes. Disjoint caller-owned
output, refusal atomicity and exact capacity reporting match the Unicode codec.
This byte codec does not validate or sanitize HTML syntax; later browser handling
must not insert untrusted markup into the viewer document.

Tests include an independently specified complete CF_HTML golden value,
Unicode, contextual tables, separate selection, line endings, unknown bounded
extension fields, malformed metadata and exact 4 KiB/32-line/16 MiB boundaries.
`clipboard-html-fuzz` checks arbitrary CF_HTML inspection, fragment roundtrips
and unchanged output on refusal under libFuzzer/ASan/UBSan. Synthetic codec
checks do not establish actual CLIPRDR, application or browser HTML acceptance.

The codec checkpoint `dd4b530` passes Windows MSVC `/WX` + `/analyze` foundation CTest
22/22 and the complete `pnpm check` (995 passed, 127 explicitly skipped, zero
failures). Exact GCC 8.3 linked CTest passes 40/40. GNU 13.3 ASan/UBSan Unicode
and HTML codec tests pass 2/2 without suppressions; Clang 18 libFuzzer with
ASan/UBSan completes 231,435 runs in 61 seconds without a crash. Workflow syntax,
lint and formatting pass. Hosted execution of the newly added HTML fuzz step
and real HTML/browser/application acceptance remain pending.

Local evidence is `build/current-validation/html-codec-acceptance.json`, with
source and log SHA256 values. Its Windows native log also retains a later
workspace setup failure: `pnpm` was missing from the helper's PATH before its
checks started. The corrected complete run is `html-codec-windows-check.log`.
The initial GNU 13 compile log retains a test-only range-loop copy warning;
reference iteration fixes it before the passing sanitizer run. Neither failure
is hidden or treated as an earlier successful run.

## Image codec in development

`feature/image-clipboard` checkpoint `696f1c8` starts SPECIFICATION §2.7 / TODO Stage 7 image work with
`native/clipboard/image.*`. It is an allocation-free component, not an enabled
image capability, OS clipboard reader, browser integration or RDP acceptance.
Product manifests retain the published 0.4.0 version during development.

The implementation follows the pinned FreeRDP 3.32.1 public WinPR declarations
in `winpr/include/winpr/user.h` (commit
`bf217a504e54cc719880c228e82353382cd7d4fa`) and Microsoft's
[packed clipboard format definitions](https://learn.microsoft.com/en-us/windows/win32/dataxchg/standard-clipboard-formats)
and [DIBV5 structure](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv5header).
It handles 40/108/124-byte headers: uncompressed BGR24/BGRX32 and 32-bit
BI_BITFIELDS with disjoint whole-byte RGB/optional alpha masks. A 40-byte
BI_BITFIELDS header has exactly three external masks; extended headers carry
their masks internally. Row padding and both row orientations are checked.
BGRX's unused byte is opaque; only an explicit alpha mask supplies alpha.

Inspection borrows input and admits encoded bytes, decoded RGBA bytes, signed
dimensions, row sizes, exact body length and declared nonzero image size before
pixel access. Both representations must fit the explicit 1..16 MiB budget.
The conversion output is compact top-down straight RGBA8. The encoder emits a
top-down sRGB 32-bit DIBV5 with explicit alpha and `LCS_GM_IMAGES` intent.
Output capacity is probed without allocation; malformed, unsupported, over-limit,
overlapping or insufficient storage leaves output unchanged. Refused inspection
returns no partially trusted dimensions or offsets.

Extended headers currently accept only sRGB/Windows sRGB without profiles.
Palettes, compressed DIBs, other channel widths and linked/embedded profiles are
explicitly unsupported here. No image library, path/profile resolution, host
bitmap handle, logging or host clipboard call is made. These are component
limits to evaluate in the later negotiated application profiles, not a waiver
of the original image requirement or a blanket claim about real peers.

Seven focused native scenarios cover complete independently serialized DIBV5
bytes, alpha, opaque BGRX, 24-bit row padding/orientation, mask placement,
truncation, invalid/huge dimensions, quotas, unsupported formats and atomic
capacity/overlap refusal. MSVC `/WX` component checks and full Windows foundation
`pnpm check` pass **1065/137 skips/1202 total/zero failures**. Native CTest passes
Windows **23/23**, exact GCC 8.3 **24/24**, RED OS GCC 11.4.1 **24/24** and Clang
18 ASan/UBSan **24/24**. All Clang fuzz targets link; the new seeded image target
completes **170,987 runs in 61 seconds**, without sanitizer errors or suppressions.
Workflow lint and C++ formatting pass. These are compiler/component results,
not actual image clipboard or installed OS acceptance. The seeded
`clipboard-image-fuzz` target is included in the CI fuzz plan; hosted execution
of this new feature checkpoint remains separate.

`build/current-validation/image-codec-acceptance.json` binds source/log hashes.
The initial GCC 11 report wrapper still expected 23 tests after all 24 passed;
the corrected report rechecks the same source/build. A recovery attempt that
inherited SSH's group-writable file creation mask correctly fails existing
runtime ownership tests. Repeating with the original controlled 0077 mask and
minimal environment passes all 24, without changing native assertions or code.
The failed logs are retained. The Clang host PowerShell wrapper labels fuzzer
stderr as a native error record despite all checked subprocesses and the terminal
fuzz marker succeeding; no sanitizer failure is counted as a pass.

Shared text/HTML/image ownership, explicit IPC/public negotiation, browser
permission/actions, actual image roundtrips and feature acceptance remain open.

## Shared native image owner in development

The existing `TextSession` public CLIPRDR callback owner now additionally accepts
an explicit native-only `TextPolicy.image`. Defaults remain disabled. Receiving
images requires an image consumer as well as server-to-client permission; local
writes require client-to-server permission. The current worker/private/public
configuration does not select this policy or advertise an image capability.

Remote format lists select fixed public WinPR `CF_DIBV5` (17) in preference to
`CF_DIB` (8). These standard IDs cannot be duplicated or reused as a named HTML
or other registered format in the selected image profile. No remote read occurs
on a format announcement: the caller must request its current revision with a
nonzero correlation. Text, HTML and image requests share one flight and the
existing five-second deadline. A newer list makes the old result stale before
image parsing; there is no automatic format retry or Unicode fallback.

A successful image response is inspected and measured before allocation under
the existing encoded/decoded byte limit, then converted to compact top-down
straight-alpha sRGB RGBA8. Its callback borrows only validated pixels, dimensions
and the admitted encoded length until return. Unsupported or over-quota raster
formats return an empty refusal; malformed data retires ownership. Refused and
stale results disclose no dimensions or pixels. Temporary RGBA storage is wiped
after the callback, including callback exceptions and reentrant close.

Local writes measure the complete canonical DIBV5 representation before
allocation. A rejected write preserves the previous accepted item. Successful
replacement wipes previous text, HTML and image representations and advertises
only CF_DIBV5, without a text or CF_DIB fallback. Peer requests receive data only
after its matching format-list ACK. ACK refusal, replacement, close and the
existing content-free revoke barrier wipe stored image bytes. One pending ACK
must drain before another offer or revoke; revocation does not stand for an
empty image. No host clipboard API, bitmap handle, file or image library is used.

Eight new native scenarios use the actual pinned CLIPRDR addin with an owned
simulated SVC transport. Windows passes **829 assertions** covering independent
canonical bytes, both format-name encodings, DIBV5/DIB reads, alpha, shared
text/HTML flight, exact write quota, prior-item preservation, ACK/revoke,
direction policy, ambiguous IDs, stale/malformed/unsupported input, consumer
faults, deadline, foreign-thread refusal and reentrant close. Full linked
native CTest passes Windows **40/40**, exact GCC 8.3 **41/41** and Clang 18
ASan/UBSan **41/41**, without suppressions. Full Windows linked `pnpm check`
passes **1136/71 skips/1207 total/zero failures**, including existing text/HTML
interfaces and native lifecycle checks. RED OS 7.3 / GCC 11.4.1 separately
compiles the production owner and image codec objects with `-Werror`; this is
not GCC 11 linked, device or actual RDP acceptance. Its SDK headers use the same
`-isystem` treatment as the imported CMake targets; an initial manual `-I` check
correctly reported deprecated declarations inside upstream SDK headers and its
log is retained.

The first complete linked Clang run exposes a pre-existing stack-use-after-scope
in two AUDIN test fixtures: their provider outlives its scope-local registration.
Test-only checkpoint `ead5e4d` explicitly closes the provider while registration
is alive. The original failing log is preserved, and targeted AUDIN plus full
native checks pass afterward. Production microphone code and assertions about
actual microphone recording are unchanged. Early isolated configure refusals
also remain recorded: the stale Windows SDK lacks the required DSP override;
Linux source snapshots initially lack the real SDK feature report/license path.
The passing runs supply the existing verified SDK inputs without changing build
guards or rebuilding accepted SDK binaries.

`build/current-validation/image-owner-acceptance.json` binds source/log hashes
and the exact test-only adjustment to the original isolated source archive.
These checks are distinct from actual RDP, browser/OS image clipboard and
installed-runtime acceptance. Worker handoff, private/public negotiation,
browser actions, actual image application profiles, full hosted feature checks
and a versioned release remain open.
