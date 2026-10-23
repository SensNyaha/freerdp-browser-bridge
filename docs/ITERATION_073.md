# Iteration 73 — private Opus encoder

Date: 2026-10-10. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6 with an
isolated encoder after PCM consumer metrics `0e2d991`.

Private vcpkg now builds pinned libopus 1.6.1 from the recorded source SHA-512.
The baseline port's version helper reported CMake/runtime `0` despite a 1.6.1
receipt; the local overlay propagates an explicit pinned version without consulting
the bridge's Git repository. The native package carries BSD copyright, the overlay
and its MIT license, source lock and version-patch hash. CMake resolves the exact
imported target from the private prefix, including when a different cached Opus_DIR
exists. FreeRDP's source pin and guarded PCM offer policy are unchanged.

The serialized provider takes one 20 ms S16LE stereo packet, converts unaligned
little-endian samples explicitly and writes into fixed heap scratch. It preserves
input PTS, queries algorithmic lookahead, marks initial/reset units discontinuous
and resets prediction on a forward discontinuity. Invalid input is rejected before
state/output mutation; SDK errors retire the encoder. Bitrate target is 16..128
kbit/s with a fixed 1,275-byte bridge output ceiling. No packet queue, source
selection, worker Opus capability or browser decoder is activated.

Real SDK tests pass **5 cases / 567 assertions**: independent stereo waveform
correlation after queried lookahead, 20 ms public decode, negative samples and
unaligned input, packet bounds, atomic length/time rejection, replay/overflow,
prediction/control recovery, lifetime counters and silence at three bitrates.
The runtime probe performs encode/decode and reports `libopus 1.6.1` with the actual
private `opus.dll` module address. The relocated package passes **1/1** with
dependency PATH removed, checking DLL location/version, roundtrip, copyright and
overlay hash, plus existing JPEG/AVC/FreeRDP and worker lifecycle probes.

Full bundled CTest passes **15/15**, foundation **6/6**. CLI/HELLO/build REST
comparison passes **1/1** for each build. MSVC /W4 /WX and /analyze, clang-format
and `git diff --check` pass. Full `pnpm check` passes **213/213** against the earlier
bundled worker; targeted build-report checks and relocation subsequently pass
against the newly built artifacts. No Node audio transport implementation changed.
The ZIP is approximately **5.91 MiB**, excluding Node.js and installer integration.

The first full-build outer PowerShell invocation reported failure despite completed
CTest/ZIP output; a repeated invocation with explicit helper-exit propagation
confirmed helper exit **0**. Dependency builds also exposed a changing temporary
PATH in vcpkg ABI keys, causing unnecessary complete rebuilds. Stabilizing that
build environment is the next block; no fresh-checkout reproducibility gate is
claimed here.

SDK failure injection/internal resource limits, Linux/sanitizers, codec framing,
publisher/backpressure integration, browser priming/decode, actual audible RDP,
microphone and measured LAN latency remain open. Public `audioOutput: "opus"`
continues to fail explicitly. [Encoder contract](AUDIO_OPUS.md).
