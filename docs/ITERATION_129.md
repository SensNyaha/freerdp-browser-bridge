# Iteration 129 — isolated native Opus input decoder

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after native
PCM selection `ca08445`. FreeRDP remains 3.32.1 and private Opus remains 1.6.1.

One serialized decoder owns fixed sample/PCM scratch and two bounded SDK states.
Profile/clock checks precede decode; a preallocated candidate isolates attempts
before successful state/output commit. Reset restores prediction, clears borrowed
PCM and retains lifetime count. There is no worker/input capability, transport,
browser encoder selection, queue or host device added.

Focused native decoder: **4 cases / 78,189 assertions** pass with the actual SDK.
They cover exact public-SDK predictive PCM agreement, signal, unaligned packets,
complete TOC-profile/size boundaries, atomic clocks, discontinuity/reset/upper
clock limit and a bounded 128-body compressed-input corpus. Corpus SDK-valid
payloads are accepted; this is not malformed-content detection or a fuzz run.

Bundled C++20 MSVC `/W4 /WX /analyze` build, CTest **17/17**, private install and
ZIP generation pass. Foundation configure/build/CTest **6/6** pass. The first two
build attempts rejected ambiguous modulo/conditional operators in test signal /
corpus generators under C6336; explicit comparisons fixed them without disabling
analysis or warnings. Decoder implementation emitted no warning.

Full `pnpm check`: **406/406** pass; clang-format and `git diff --check` pass.
Final CTest remains bundled **17/17** and foundation **6/6**. Combined Opus SDK
encoder/decoder suite: **10 cases / 79,179 assertions**.

SDK failure injection, compressed-input CPU/internal-allocation audit, sanitizers /
Linux, worker/wire/AUDIN, browser encoding, physical/remote/LAN/soak, resampling
and complete Opus input remain open. [Contract](AUDIO_OPUS_INPUT_DECODER.md).
