# Bounded AUDIN server negotiation

Iteration 98 implements preparatory allocation-free server-PDU validation and
PCM offer filtering for SPECIFICATION §2.6 / ARCHITECTURE §5 / MEDIA_PIPELINE §7.
It is exercised ahead of the actual pinned static AUDIN parser in fake-DVC
fixtures. Production listener/plugin placement and worker microphone activation
remain open; the general [provider channel entry](AUDIO_AUDIN_PROVIDER.md) is
still refused.

AudinIngress accepts serialized complete records of at most 65,536 bytes.
Negotiation is ordered Version → Formats → Open → Format Change. Only versions
1 and 2 are accepted. A malformed/out-of-order/unknown record permanently marks
failure until explicit reset; replacement tables/repeated Open are refused for
the current connection profile. Accepted parsing alone does not prove transport
completion or device readiness. Downstream dispatch failure requires owner cleanup.

Formats claims are bounded to 1..64 before walking the table. Every descriptor
needs its full 18-byte header and declared extra-format bytes (at most 1,024).
WAVE_FORMAT_EXTENSIBLE requires exactly 22 extra bytes. The whole table is checked
before retained output changes. Only consistent PCM16 48 kHz mono/stereo with
no extra-format data survives; compressed/DSP, wider/different-rate and inconsistent
offers are omitted. The selected table occupies a fixed 1,161-byte array, keeps
order and becomes the index domain used by subsequent Open/Format Change.

The server's reserved cbSizeFormatsPacket is ignored, as required by
[MS-RDPEAI Sound Formats](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpeai/c4e53155-f577-43c6-ac1d-fad49540d02d).
Trailing arbitrary ExtraData is ignored within the complete-record budget.
The canonical forwarded table omits unsupported descriptors/extra data and sets
its size consistently. If no supported format remains, inspect returns an explicit
unsupported/non-forward result; it must never enter upstream's zero-count table
parser. The future channel owner must implement the bounded refusal response /
capability state; these fixtures do not establish that production path.

[Open](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpeai/97db7244-249b-4a79-ad50-7e45e2f760a0)
requires its complete capture-format preference, including bounded declared extra
bytes, no unparsed tail, a selected client index and 1..4,800 frames (100 ms max
at the fixed rate). Capture preference is structurally validated but not retained;
pinned AUDIN captures using the selected negotiated format. Different preferred
capture rates/codecs do not activate DSP in this prepared path. Format Change
requires an existing recording phase and a selected index; the device then owns
its fresh input epoch. Larger callbacks, other projection profiles and table
renegotiation remain retained compatibility work.

Returned Version/Open/Change records borrow the caller's input through dispatch;
Formats borrows the fixed array through reset/overwrite. No retained raw server
data, variable table allocation, queue, thread or timer is introduced. Caller
must serialize inspection/dispatch and preserve borrowed bytes. This parser
does not own callbacks, stop capture or negotiate through a real transport.

Six portable cases cover field/count/length/version/sequence/format/callback
boundaries, ignored reserved/tail fields, no-common-format and copied table
ownership. Actual linked AUDIN/fake-DVC fixtures verify filtered mixed offers,
selected mono silence and oversized count/FramesPerPacket refusal before device
Open/reply. This establishes fixture placement, not production DVC or microphone
acceptance. Earlier core drdynvc reassembly/decompression, allocation/DSP audit,
guarded callback lifetime/transport writes, worker scheduling/IPC/browser permission /
capture and hardware/remote/LAN acceptance remain open.

A dedicated audin-fuzz target and four-phase seed corpus are prepared for Linux
Clang ASan/UBSan/libFuzzer CI. No local Clang compiler is available (the Visual
Studio LLVM directory contains formatting/tidy tools only); corpus generation
ran locally, but the fuzz campaign/sanitizer gate has not run and is not counted
as passing evidence.
