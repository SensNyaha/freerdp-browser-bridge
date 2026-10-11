# Private Opus encoder foundation

Current update — iteration 129: output selection/ownership is described in
[the current public output contract](AUDIO_OPUS_PUBLIC.md). An isolated
[native input decoder](AUDIO_OPUS_INPUT_DECODER.md) now complements this encoder;
it does not enable Opus microphone settings or capture. Historical output-gating
statements below describe the original encoder foundation.

Stage 6 implements MEDIA_PIPELINE §6 using privately bundled libopus **1.6.1**.
The vcpkg baseline and source SHA-512 are recorded in `native/dependencies.json`.
The local overlay retains the baseline source and patches, then fixes its version
helper to propagate the explicit pinned version to CMake and the runtime. It does
not discover a version from the surrounding bridge repository. The version patch
hash and installed receipt appear in the build report; BSD copyright and the
overlay accompany the private native package. FreeRDP remains pinned to 3.32.1.

`SoftwareOpusEncoder` has one serialized owner and accepts exactly **960 frames**
of interleaved S16LE, 48 kHz stereo: **3,840 bytes / 20 ms**. It converts each
little-endian word explicitly, including unaligned input. Fixed sample and output
scratch lives on the heap. There is no bridge packet queue or sample history;
the returned packet borrows output storage until a successful encode, reset or
destruction. The owner must consume/copy it before that point.

The provider uses the audio application, complexity 5, forced stereo, constrained
VBR and a 16..128 kbit/s target (default 64 kbit/s). DTX, in-band FEC, DRED and QEXT
are disabled. A build without an optional extension may report UNIMPLEMENTED
only for its disable request; other failed controls retire construction. The
**1,275-byte output buffer is a bridge policy**, not a universal Opus packet
limit. Constrained VBR is not an instantaneous wire bitrate guarantee. The actual
encoded length must be positive and within that buffer.

Input PTS uses the worker's monotonic microsecond clock unchanged. After the first
packet, ordinary PTS advances exactly 20,000 µs; a discontinuity allows a strictly
forward gap and resets prediction before encoding. Replayed/backward timestamps,
inconsistent byte length and timestamps without room for another interval fail
before prediction, lifetime packet count or borrowed output changes. Explicit
reset allows a new clock origin and marks the next unit discontinuous; the caller
must separately enforce its source epoch and global worker clock. Lifetime packet
count survives reset and fails closed before overflow.

The encoder queries SDK lookahead and exposes it in 48 kHz frames, bounded here
to 0..960. It does not subtract that delay from PTS or invent a fixed pre-skip.
Future decoder configuration/scheduling must handle the queried delay. Encode or
reset SDK failure invalidates the provider and zeroes scratch; it cannot be reused.
That failure branch is implemented but has no SDK fault-injection acceptance yet.
SDK internal allocations, CPU budgets, Linux and sanitizer gates remain open.

The imported CMake target is resolved only from the private dependency prefix.
Windows consumers explicitly declare DLL imports so the relocation probe resolves
the actual Opus module address. The probe performs real encode/decode and the
packaging test checks the loaded DLL path, runtime version, license and overlay
hash with dependency PATH removed.

This is an isolated provider. `codecProviders: [.., "libopus"]` describes build
inventory. It does not advertise usable Opus audio: worker selection, private/public
Opus framing, source/publisher ownership, browser decode and audible acceptance
remain open. Public `media.audioOutput: "opus"` is still explicitly unsupported;
the existing negotiated PCM path is unchanged. Subsequent isolated preparations
are documented in [wire framing](AUDIO_OPUS_WIRE.md),
[browser ownership](AUDIO_OPUS_BROWSER.md) and [native publishing](AUDIO_OPUS_PUBLISHER.md);
they do not establish public Opus selection or audible RDP acceptance.

Public SDK authority: [pinned Opus API](https://github.com/xiph/opus/blob/v1.6.1/include/opus.h)
and [pinned controls](https://github.com/xiph/opus/blob/v1.6.1/include/opus_defines.h).
