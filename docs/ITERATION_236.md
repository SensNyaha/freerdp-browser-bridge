# Iteration 236 — bounded RWC1 server control transfer

2026-10-15. Implements the server transport portion of SPECIFICATION §2.7 using
the controller owner and prepared chunks from `d878deb` / `2396acc`.
[Current wire/credit/lifetime contract](CLIPBOARD_CONTROL.md).

Explicit backend hooks now support clipboard.set/request/ack and scalar offers
on the existing authenticated control socket. A declared current item/direction /
quota precedes allocation. One upload/download has an eight-record window, strict
offset/correlation and no content queue. Complete UTF-8/normalized UTF-16 quota
validation precedes native write; set result waits for the backend ACK. Read
completion waits for receiver ACK and transport write; accepted native snapshots
are not retargeted by later offers. Owned and late buffers are wiped.

The original 4 KiB message/64 KiB backlog/256-total/32-command limits remain.
Binary data adds a 128-message/s ceiling. One timer covers a nonrenewing 60-second
whole item, two-second issued window and eight-second native phase; download
windows start at least 64 ms apart. Clock/timeout/protocol/credit failure closes
control and triggers existing input reset/clipboard retirement. Fake RDP remains
connected when retirement is safe; unsafe native retirement can still fail it.

Eight pure transfer cases include byte-exact 16 MiB both ways with virtual time,
cross-scalar chunks, no premature completion, original deadlines, credit replay,
late callbacks and buffer wiping. Five actual loopback WebSocket cases with fake
RDP exercise multi-window Unicode, keyboard interleave, directional refusal,
malformed offsets/header, wrong ACK, independent stalls, a 4,097-byte over-limit
message, binary flooding and an old-write/revoke barrier before replacement.
Combined focused transfer/socket/manager/private-composition tests pass 21/21.
The first upload fixture used 40,000 ASCII bytes with a 65,536-byte UTF-16 quota
and correctly refused before dispatch; its intended passing profile is now
100,000 bytes. No Unicode limit or assertion was weakened.

Full bundled Linux `pnpm check` passes 625 with 54 platform skips / 679 cases.
The first Windows full check has 629 passes, 49 platform skips and one failure:
the unrelated touch fixture cannot listen on 127.0.0.1:49669 (`EACCES`). Its log
is retained; the unchanged full repeat passes 630 with 49 skips / 679 cases.
Native CTest passes Windows
29/29 and Linux 30/30. C++ parser/channel code is unchanged, so earlier
sanitizer/fuzzer evidence is not relabeled as a new run.

Production native adapter selection and browser client/permission/gesture
activation remain gated for the next block. These socket fixtures do not read or
write any OS clipboard and are not actual RDP acceptance. The single approved
XRDP mutation from Iteration 232 is not repeated. Remote data/revoke, resource /
input-media latency, lossy-network and full Stage 7/managed-drive gates stay open.
