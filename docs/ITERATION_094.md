# Iteration 94 — public Opus session, media and harness

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §6 following
bounded socket recovery `35e1602`.

Public managed Opus creation now uses its fixed typed source and requires backend
reset ownership. Native startup checks reset capability before private connect.
Exact additive hello/ready negotiates the selected audio codec; ACK credit stays
independent of video. Existing gesture activation now selects the raw Opus
decoder/Worklet owner. Metrics separate two fixed codec profiles with shared
instances and balanced per-consumer accounting. Local browser helpers serve both
Opus modules and expose explicit test/manual Opus modes.

Narrow native-adapter/lease/manager/Edge checks pass **23/23**; actual linked native
PCM/Opus session-manager strict TLS cases pass **2/2**. Two new actual WebSocket /
fake-backend cases verify fresh epoch on attach/replacement, preserved ACK, bytes /
timestamps, fixed separate metrics, mismatch/fault and balanced cleanup. Existing
26 media cases passed; a test-only metrics lookup typo failed the initial combined
run and the corrected Opus cases pass **2/2**. The Edge Opus harness case uses actual
pinned SDK tones, AudioDecoder and Worklet admission; it makes no remote/audible
claim. Full bundled `pnpm check` passes **276/276** Node cases without skips;
existing native bundled CTest passes **16/16**, foundation **6/6**. Native wire /
implementation is unchanged.

Actual restored XRDP `h264 --audio-opus-test` passes **17** 1080p frames, independent
cursor, browser reattachment and audio gesture/status/Worklet admission. Initial
helper preparation failed because its static route list omitted both Opus modules;
the routes were added and the rerun passed. Source remains waiting, with zero
encoded/decoded/played audio packets. No remote sound was generated; only the
previously authorized motion/reset checks ran. Private runtime cleanup passed.
Actual PCM `h264 --audio-test` regression also passes **5** 1080p frames, cursor,
reattachment, gesture/source/Worklet credit and cleanup; source is waiting with
zero audio packets. Both codecs retain audibleAcceptance:false.

Audible server audio, ready-source actual native reset, microphone and
platform/core-resource/LAN/A/V/soak acceptance remain open.
[Current wire/ownership contract](AUDIO_OPUS_PUBLIC.md).
