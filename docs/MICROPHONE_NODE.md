# Experimental private Node PCM microphone

Iteration 109 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7. HELLO bit 15 (32768), `pcmInput`, advertises the guarded
Windows/AUDIN private PCM dispatch path. It requires connectCore; old peers
decode false. CLI, build and capability REST expose the same implementation
flag. This does not claim browser permission, device or remote acceptance.
All u16 HELLO bits are now assigned; future input codecs require a deliberate
capability extension. Opus output does not authorize Opus input.

`WorkerProcess.connect` accepts explicit `media.microphone: 'pcm'` only with
this bit, selecting schema 7/input flag 16. Omitted/off retains previous schema
selection. Opus input and peers without the bit refuse before CONFIGURE/SECRET.
Microphone input remains independent of output PCM/Opus.

`microphoneState` returns a scalar copy; the `microphone` event contains a frozen
copy. Kind 41 requires the selected capability, zero correlation, enabled profile
and increasing revision/nondecreasing epoch/worker time. Ready before connection
or after terminal connection state, unsolicited input status, invalid profile
and replay fail IPC. Closing accepts valid ordered metadata without emitting
application events; cleanup clears authority. No samples enter status or metrics.

`sendMicrophone(packet)` accepts the private fixed 960-frame PCM packet. It
returns accepted/stale/unavailable/busy/invalid. Missing capability throws
MICROPHONE_NOT_IMPLEMENTED; inactive/off/not-ready source returns unavailable.
One packet can be in flight. Concurrent sends return busy before encoding;
old epochs return stale locally. Native admission still rechecks source authority
and its 20 ms handoff deadline. Accepted means source admission, not remote
delivery. No automatic resending or retained sample history is introduced.
The existing global request/write bounds and timeout remain; uncertain timeout
fails the worker. Owned IPC PCM copies are wiped after writing/completion;
the caller's buffer remains owned by the caller.

Public NativeSessionWorker still explicitly refuses non-off microphone before
spawning a process. Public control lease, permission/capture/resampling, reset
and browser transport are pending. No local host capture is performed by this
private API or the test fixtures.

Fake native IPC tests cover state ownership, one-flight completion/shutdown,
epoch replacement without retry, unavailable states, malformed/replayed metadata
and results, old peers and public refusal. A real native process connects to a
local TLS fixture, rejects its untrusted certificate, publishes closed input,
remains heartbeat-responsive and cleans up. It sends no RDP application bytes.
These are synthetic IPC/lifetime tests, not negotiated microphone or audible
acceptance. Actual remote/physical microphone, LAN latency, platforms, upstream
core allocation/lost-write limits and connected-worker wakeup remain open.
