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
selected-byte conversion; physical OS and real remote HTML acceptance remain.
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
