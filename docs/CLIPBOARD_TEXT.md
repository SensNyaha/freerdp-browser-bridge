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
