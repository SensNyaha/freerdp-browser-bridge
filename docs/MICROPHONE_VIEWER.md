# Reference-viewer microphone controls

Iteration 127 composes the production media client and startup owner in the
reference viewer for SPECIFICATION §2.6 / MEDIA_PIPELINE §7. Explicit
`bridgeViewer.attach(created, { microphone: 'pcm' })` selects the separate
stream-4 PCM profile; omitted/off stays disabled. Opus input is refused.
Output audio selection, video and cursor remain independently negotiated.

The enable button is available only while this viewer has a connected control
attachment and an actual ready microphone source. Waiting metadata never
acquires a device, requests permission or creates a context. Clicking enable
uses the production gesture/context/permission/grant/Worklet path. Stop ends
tracks synchronously and joins local graph/context and the server retirement
barrier. Denial is recoverable and keeps the desktop attached.

Source/control loss invalidates local authorization immediately. Detach closes
control, stops tracks and keeps only microphone replies on the media socket
until the finite retirement completes, then closes that socket. Video/render
work and output playback are already stopped. A shared retirement barrier
prevents a replacement attachment from acquiring another microphone during old
cleanup. Failed cleanup or an unresolved old permission/activation latches
microphone admission for this document; reload is required. Late permission
tracks are still stopped by their old owner. No session/device data is logged.

The diagnostics expose copied scalar counters, owner state and source metadata;
64-bit source fields are decimal strings. No PCM, streams, tracks, device IDs or
permission tokens are exposed through `bridgeViewer.stats`.

Four actual Edge/reference-viewer/WS/Worklet cases use replaced getUserMedia and
synthetic streams over a fake RDP backend. They cover waiting-before-gesture,
signal delivery, stop/restart/detach, fresh-source cancellation, denial and
detaching an unresolved permission before reattachment. Two existing output
viewer cases also pass. This establishes browser composition, not native RWI1,
negotiated AUDIN, physical capture, audible/remote application, LAN or soak
acceptance. Native SessionWorker PCM selection remains gated until the next
verified block. Native resampling, Opus input and upstream limits remain open.

[Startup owner](MICROPHONE_OWNER.md), [media client](MICROPHONE_MEDIA_CLIENT.md).

Iteration 128 enables explicit native PCM selection only with both private PCM
and microphone-reset capabilities. The lab helper exposes manual input and
optional PCM/Opus output modes. Actual XRDP/Edge H.264 plus microphone replay
passes without capture; waiting epoch 0 is not negotiated recording acceptance.
[Evidence](history/iterations/101-150.md#iteration-128).

Iteration 144 enables explicit `bridgeViewer.attach(created, { microphone:
'opus' })` for a matching selected Opus session, using the iteration-143 client.
PCM/off behavior remains available; input and output choices are independent.
The historical unsupported-Opus-input statement above is superseded.

Before opening sockets, a fixed-profile AudioEncoder capability query verifies
Opus 48 kHz stereo / 64 kbit/s / 20 ms / complexity 5 and AudioData availability.
It constructs no codec, AudioContext or device. One document-wide query, one
replaceable pending attachment and a 2 s deadline prevent query/consumer buildup.
Detach clears the consumer; late results cannot open its sockets. Unsupported,
rejected or timed-out support yields MICROPHONE_UNSUPPORTED without PCM fallback.
The result is cached for this document; a timed-out provider requires reload.
Only a successful query proceeds to the existing output-gesture/socket flow.
Actual Opus encoders remain lazy until explicit microphone permission and ready
source/grant input. Ready must match the requested microphone codec exactly.

Twelve actual Edge/reference-viewer/WS cases cover both codecs across capture
stop/restart/detach, source loss, denial and unresolved permission, plus unsupported
provider, late query after detach, timeout and ten replacements during one pending
query. All permission/streams are synthetic and RDP admission is fake. Actual
codec/context/track retirement passes; no physical or remote recording acceptance
is implied. [Evidence](history/iterations/101-150.md#iteration-144), [client](MICROPHONE_MEDIA_CLIENT.md).
