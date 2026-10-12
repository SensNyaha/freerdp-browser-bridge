# Iteration 144 — explicit reference-viewer Opus microphone

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after selected
browser client `6ecfe61`. Explicit Opus input now probes fixed browser support
before sockets and requires a matching ready profile. There is one document-wide
query, a 2 s deadline and one replaceable attachment consumer. Detach, unsupported
support, timeout and late results cannot open stale sockets or acquire a device.
Encoder creation stays behind explicit permission and ready grant; no fallback
occurs. Output-gesture and microphone retirement ownership remain independent.

New local helper flags distinguish Opus input from existing Opus-output modes;
private inventory accepts an independent input argument. Four portable capability/
mode cases and twelve actual Edge/reference-viewer/WS cases cover both codecs,
stop/restart/detach, source loss, denial/unresolved permission and provider refusal,
late response, timeout and repeated attachment during one pending query. All
capture streams/results are synthetic, RDP backend is fake and no physical
getUserMedia runs. Actual ready AUDIN/device/recording/LAN/platform/resource /
failure injection and soak acceptance remain open. [Viewer](MICROPHONE_VIEWER.md).

Focused capability/mode/viewer cases pass **16/16**. Actual authorized XRDP /
Edge with explicit Opus input and output off passes **57 H.264 frames at
1920×1080**, cursor replay and reattachment; one motion/reset, no physical capture.
Microphone metadata remains waiting revision 1 / epoch 0, requests and samples
zero. The helper exits successfully with empty runtime.

Sequential actual XRDP private Opus input with output off/PCM/Opus passes selected
capabilities, source inventory, heartbeat, JPEG and cleanup. Input remains waiting
epoch 0 in all three; selected output stays waiting too. Every report has no
samples, physical capture or remote application input and empty runtime. This is
actual activation/selection evidence, not ready AUDIN/recording/audible acceptance.

Full pinned-Node-24 `pnpm check` passes **490/490**. CTest bundled **17/17**
and foundation **6/6**, formatting and diff checks pass. No public wire shape or
native ABI changes; viewer selection consumes the existing guarded profile.
