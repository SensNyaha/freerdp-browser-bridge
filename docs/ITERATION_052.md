# Iteration 52 — bounded browser PCM transport ownership

Date: 2026-10-10. Implements PROTOCOL §4, MEDIA_PIPELINE §6/8 and bounded
browser queue/resource ownership from SPECIFICATION §2.6 / ARCHITECTURE §7.
Continues actual AudioWorklet foundation `4563327` (iteration 51).

The browser parser validates fixed config/PCM envelopes before retaining samples.
The port owner has one posted command, one pending config and one pending PCM
packet; a 100-packet burst retains the latest only and forces discontinuity.
Config transitions discard stale unsent PCM. Sequence/PTS/epoch/boundary checks,
single-ID ACKs, coalesced stats and a bounded deadline cannot create a port backlog.

The user-activated running context is transferred exclusively to the playback
owner. Context/processor/transport loss or explicit close retires data, timer,
port, node and context idempotently. Observer/posting/close faults cannot retain
ownership. Actual Edge consumes generated RWB1 through real MessagePort/AudioWorklet,
verifies credits, counters and epoch discard, then suspends the context and
checks automatic closure. The statechange event is awaited separately from the
suspend promise so the test exercises automatic cleanup rather than manual close.

Narrow tests pass **8/8** (seven pure, including posting/close faults, plus actual
Edge). pnpm check **159/159**, no skips/cancellations, **98.81 s**; whitespace
checks pass. Native code is unchanged; latest native regression remains CTest
foundation **5/5**, bundled **13/13** from iteration 50.
Logs: ignored `build/iteration-052-*.log`.

The current viewer and public worker backend still do not activate audio. Worker
selection/capability, Node scheduling/backpressure, actual audible RDP/microphone,
other browsers/devices and end-to-end LAN latency remain open.
