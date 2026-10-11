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
[Evidence](ITERATION_128.md).
