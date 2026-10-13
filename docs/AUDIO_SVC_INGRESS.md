# Complete RDPSND message ownership

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §11/12.

`AudioSvcIngress` is an isolated serialized owner, not yet installed in the
worker's receive callback. It composes the existing fixed 64 KiB assembler and
RDPSND PDU validator before calling a synchronous consumer. At most 4,096
fragments and 64 format descriptors with 1,024 bytes of extra data each are
accepted. Contradictory totals, framing, unsupported PDUs and malformed lengths
fail before forwarding. This does not select a device or establish supported
audio format, DSP, transport pool or whole-process memory limits.

One original 2 s deadline spans fragmented assembly and the legacy
WaveInfo/raw-Wave pair; later fragments do not renew it. Polling rejects backward
or overflowing clocks. Callers must poll while idle and on other channel traffic.
Refusal, exceptions and reentrant receive/poll permanently close the owner.
Nested normal close preserves the callback's sample borrow until return, then
wipes storage. Completed records also wipe the fixed arena. The caller must keep
the owner alive during its callback and serialize all calls.

Nine portable cases / 8,358 assertions cover exact capacity and fragment limits,
all splits of a volume PDU, format claims, legacy pairs, deadlines, clocks,
callback faults and retirement. Windows foundation CTest 9/9 and bundled CTest
21/21 pass. A libFuzzer/ASan/UBSan target and four seed records are prepared;
compiler/CI execution and actual hostile transport acceptance remain open.
Production static/dynamic fallback placement is the next block.

Iteration 167 installs this owner in the worker's static RDPSND receive path.
The isolated status above is historical; dynamic placement remains open.
[Production placement](RDPSND_RECEIVE_PLACEMENT.md).
