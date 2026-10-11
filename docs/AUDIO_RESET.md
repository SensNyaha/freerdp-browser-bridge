# Private audio reset IPC

Iteration 87 (2026-10-11) prepares bounded recovery messages for SPECIFICATION
§2.6 and MEDIA_PIPELINE §6. RWI1 envelope version remains 1; both new kinds require
a nonzero requestId, echoed by the result. Exact body length is checked before
allocation in native and TypeScript framing.

| Kind | Value | Body |
|---|---:|---|
| AUDIO_RESET | 37 | exactly 12 bytes: u8 schema=1, three reserved zero bytes, u64 BE expected source epoch (nonzero) |
| AUDIO_RESET_RESULT | 38 | exactly 4 bytes: u8 schema=1, u8 result, two reserved zero bytes |

Result codes are scheduled=0, stale=1, unavailable=2 and busy=3. Scheduled denotes
source reset scheduling, not pipe delivery, browser admission or audible playback.
Consumers must observe subsequent source status/config and fresh marked data.
The maximum u64 epoch is representable; implementations must refuse exhaustion
rather than wrap. Reserved bytes and unknown schema/result values are rejected.

In this preparatory block every valid HELLO-ready worker returns unavailable and
keeps heartbeat/shutdown healthy. No reset capability or high-level API is enabled.
Worker dispatch validates the body even when unavailable. Native output stores
typed results in the existing 64-record control FIFO, copies their bounded body,
preserves correlation and does not lock the startup audio profile. Requests are
never retained in output storage. No extra queue or timer is introduced.

Portable codec, header and output tests, TypeScript golden/boundary/fragmentation
tests and raw native lifecycle tests cover this contract. The fuzz target includes
both decoders, but local libFuzzer execution remains unverified. RDP-thread reset
dispatch, private Node correlation and compressed public recovery remain open.
