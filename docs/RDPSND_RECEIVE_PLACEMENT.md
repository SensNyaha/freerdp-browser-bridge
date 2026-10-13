# Static RDPSND receive placement

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §11/12 on
`3dda6f4`, using pinned FreeRDP 3.32.1 public APIs.

The worker now passes a public `rdpsnd` ID resolver to `DvcReceiveGuard`.
Its optional independent audio owner withholds static RDPSND fragments from
the original ReceiveChannelData callback until complete PDU validation. This
includes the automatic audio-off `sys:fake` path and explicit PCM/Opus output.
It does not change the device choice, settings, wire protocol or capabilities.
Lower public fixtures may omit the audio resolver; unrelated SVC arguments
remain unchanged. Resolved audio and drdynvc IDs must be distinct and stable
for the connection. All traffic and the RDP idle loop poll both owners.

The fixed 64 KiB arena and 4,096-fragment limit apply before the pinned static
RDPSND StreamPool_Take/EnsureRemainingCapacity and parser. The forwarded whole
record has FIRST|LAST and equal actual/advertised length, preserving accumulated
SHOW_PROTOCOL/SHADOW_PERSISTENT metadata. Unsupported raw flags, null nonempty
data, contradictory lengths and malformed format claims fail before dispatch.
The generic validator does not select PCM or bound DSP by itself; explicit
browser output retains its existing guarded format/DSP path.

Only separate empty SUSPEND/RESUME notifications are allowed. Pinned RDPSND
ignores them, so forwarding preserves both sides' legacy Wave state and the
original nonrenewing deadline. Resetting only the bridge would permit a new PDU
while the SDK still expects raw Wave bytes. Borrowed complete records survive
nested retirement; arena wiping follows callback return. Void native event
dispatch can still report downstream errors through the core channel error.

Five public ABI cases and three actual linked static RDPSND/fake-SVC cases pass
189 assertions. The actual fake backend negotiates PCM and consumes a legacy
Wave pair; refused records do not enter its callback or emit replies. No host
sound or capture backend is selected. Linked DVC suite: 135 cases / 7,759
assertions; bundled CTest 21/21 passes with MSVC /analyze /W4 /WX.

Dynamic `AUDIO_PLAYBACK_DVC` still requires its own placement ahead of the
RDPSND stream copy/parser. Transport preallocation, retained stream pools,
total RSS/CPU, actual hostile/lost transport, Windows-server, Linux, sanitizers,
fuzzer and soak acceptance remain open. This is not audible audio acceptance.

Iteration 168 adds [dynamic RDPSND admission](RDPSND_DYNAMIC_ADMISSION.md).
The dynamic-placement gap above is historical; retained pools/core/RSS and
actual audio/resource acceptance remain open.
