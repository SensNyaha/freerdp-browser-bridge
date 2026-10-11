# Private microphone reset foundation

Current update — iteration 111: guarded Windows/AUDIN now emits the schema-1
HELLO extension and microphoneReset=true. Private worker/Node reset is active;
historical no-activation statements below describe iteration 110.

The worker has a separate input ResetControl under the microphone mutex, with
one pending request and a 1 s owner-service deadline. It observes only status
already admitted to output. IPC wakes the RDP loop; root service runs before
the PCM handoff, rechecks actual open source/epoch and invokes source reset
without a transport write. Old queued PCM is cleared, input epoch advances,
and replacement ready status must be admitted before new samples. The bounded
handoff rechecks actual authority, so pending old samples cannot cross reset.
Ending completes pending reset as unavailable before microphone retirement.
Output reset/source and provider scopes remain independent.

WorkerProcess.resetMicrophone(expectedEpoch) requires the extension capability.
Old PCM-input peers throw MICROPHONE_RESET_NOT_IMPLEMENTED without dispatch.
Inactive/off/not-ready input returns unavailable; old epoch returns stale;
concurrent sample/reset or repeated scheduled epoch returns busy. A scheduled
result pauses sending for that epoch until a fresh ready state. A new epoch may
arrive before the correlated result; it remains authoritative. Typed result
validation precedes correlation completion. No retry, sample history or host
capture is introduced. Public lease/permission integration is still pending.

The new reset-specific fake IPC peer is a readable bounded Node script. Tests
explicitly subclass the protected process-creation seam to launch that script
with the normal Node executable; production/native spawning continues to launch
one native worker with an empty argv. This does not implement FreeRDP in Node.
The separate actual-linked C++ AUDIN/fake-DVC fixture establishes native source
clearing and delayed publication; actual native TLS tests retain real spawning.

Iteration 110 implements the private reset contract for SPECIFICATION §2.6 /
MEDIA_PIPELINE §7. RWI1 **42 MICROPHONE_RESET** has a fixed 12-byte body:
schema byte 1, three zero reserved bytes, then a nonzero big-endian u64 expected
input epoch. **43 MICROPHONE_RESET_RESULT** has four bytes: schema 1, result
0 scheduled / 1 stale / 2 unavailable / 3 busy, then two reserved zero bytes.
Both kinds require nonzero request correlation and exact lengths before body
allocation. The bounded codecs reuse output reset's representation; the kinds,
input authority and operation remain independent. They carry no captured samples.

Scheduling will mean old input samples/interpolation are cleared and a new source
epoch is created on the RDP owner. It will not mean remote delivery, permission,
or automatic replay. A sender must await fresh ready authority before resuming.
Worker reset execution and Node reset API are not active in iteration 110.
Current workers validate the request and explicitly reply unavailable, preserving
heartbeat/shutdown; they advertise `microphoneReset: false`.

All base HELLO u16 bits are assigned. The build decoder now recognizes one
optional **eight-byte capability extension**, appended after the seven strings:
big-endian u16 extension schema 1, u16 reserved zero, u32 feature mask. Bit 0
means private microphoneReset, requiring base pcmInput (and thus connectCore).
No extension means false, including existing PCM-input workers. An all-zero
extension is valid. Unknown bits, other schema/reserved values, partial/repeated
extensions and trailing bytes fail before CONFIGURE/SECRET. This is a fixed
versioned extension, not arbitrary optional data or a list to allocate.

No native worker emits the extension or true reset capability yet. Consumers
must be upgraded before later reset-capable workers: old consumers reject the
extension before session setup; new consumers read both legacy and extended
reports. RWI1 envelope version remains 1. Future feature bits require explicit
implementation/docs/tests; the decoder currently knows only mask bit 0.

Native and Node tests check independent vectors, malformed clocks/epochs/body
fields, result codes, framing/correlation and every split. Node tests also check
extension version/mask/dependency and legacy absence. Actual native process TLS
fixtures issue early reset and receive unavailable without activation. Fuzzer
dispatch and valid corpus seeds are prepared; local sanitizer/Clang campaign
remains unrun. No browser/host device is captured.

Owner execution, handoff/reset ordering, private Node and public lease integration,
browser permission/transport/resampling/Opus input, actual remote/physical /
LAN/platform acceptance and earlier core/lost-write bounds remain open.
