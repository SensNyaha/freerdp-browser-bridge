# Iteration 75 — bounded Opus IPC payload preparation

Date: 2026-10-10. Implements SPECIFICATION §2.6, MEDIA_PIPELINE §6 and bounded
parser discipline after encoder `6cc179b` and stable build helper `02f7cd2`.

Native/TypeScript payload schema 1 separates codec-1 Opus config from unchanged
codec-2 PCM. Config remains exactly 20 bytes and carries the queried lookahead,
48 kHz stereo / 20 ms and a nonzero epoch. The 24-byte private packet metadata
preserves capture PTS, source/silence frame accounting and discontinuity; encoded
payload is bounded to 2..1,275 bytes. Decode borrows input, and encode validates
before writing/copying bounded storage.

RWI1 prepares AUDIO_OPUS **kind 36**, request ID zero, with **26..1,299-byte** body
bounds checked before allocation. The restricted TOC profile requires one stereo
20 ms frame and excludes other durations/packing modes and empty DTX frames.
It bounds framing/duration rather than decoding compressed entropy. The libFuzzer
target receives Opus branches before the current PCM-only queue can refuse them;
local Clang/sanitizer execution remains unavailable.

Four native payload/envelope cases pass **377 assertions**, including independent
golden layouts, every TOC byte, boundaries, integer/epoch/lookahead limits, borrowed
storage and refusal by the inactive output lane. Six actual linked SDK encoder
cases pass **990 assertions**; real tone/silence packets at 16/64/128 kbit/s satisfy
the parser and public SDK one-frame/stereo/960-frame queries. Four Opus Node cases
plus existing PCM/envelope cases pass **17/17**, including bytewise fragmented
admission and invalid header claims. An initial test used the wrong PacketDecoder
method name; it was corrected to the existing push/callback API before verification.

Full `pnpm check` passes **217/217**. Bundled CTest passes **15/15**, foundation
**6/6**, private relocation **1/1** and CLI/HELLO/build REST probes **1/1** per build.
Current bundled IPC totals are **49 cases / 6,356 assertions**. MSVC /W4 /WX and
/analyze, clang-format, strict TypeScript, lint, format and `git diff --check` pass.

Actual authorized XRDP/Edge H.264 with the existing PCM path passes with **21
frames**, real pixels, cursor replay and reattachment, one motion and one reset.
The browser AudioWorklet acknowledges the waiting source status; **zero audio
sample packets** are observed. No remote sound generation or keyboard/button/wheel
input occurs. This verifies the existing PCM/desktop path, not negotiated audible
audio or end-to-end Opus.

No HELLO bit, settings flag, Opus source status, publisher/output-lane selection,
public media framing/negotiation or browser decoder is activated. Public Opus
continues to fail explicitly. Those owners, decoder priming/resources, audible
RDP/microphone, latency, platforms and soak remain open.
[Payload contract](AUDIO_OPUS_WIRE.md).
