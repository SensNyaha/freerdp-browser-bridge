# Iteration 118 — bounded microphone media adapter

Date: 2026-10-11. Implements SPECIFICATION §2.6 / PROTOCOL §6 /
MEDIA_PIPELINE §7 after grant notifications `d6228dc`.

The prepared receiver has explicit start/stop, scalar status and separate packet
ACKs. It permits one private sample request and one retirement request, consumes
valid busy sequences, rechecks current authority before ACK, and retires on fixed
deadlines/backlog/parser/transport faults. Constructor/close own subscription and
socket hooks, including partial setup. No negotiation or permission activation,
packet retry/history or video credit change is introduced.

Seven new fake-socket/lease cases pass with the session suite **18/18**.
These are pure ownership fixtures, not actual sockets, browser permission,
physical capture or RDP acceptance. Full bundled `pnpm check` passes **340/340**,
without skips. Unchanged bundled CTest passes **17/17**, foundation **6/6**.
Formatting and diff checks pass.

Public media.hello/socket integration, permission/capture/resampling/Opus input,
real ready-source reset, remote/physical/LAN/platform and upstream core/lost-write
gates remain open. [Prepared contract](MICROPHONE_SOCKET.md).
