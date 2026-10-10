# Iteration 66 — opt-in private PCM worker and Node source validation

Date: 2026-10-10. Implements SPECIFICATION §2.6/3.1/3.3, ARCHITECTURE §5/11/12,
MEDIA_PIPELINE §6/8 and pinned public channel lifecycle after `ede01e4`.

Windows selects the guarded static PCM owner only with settings schema 5 bit 2
and HELLO capability 4096. Source output uses the existing bounded priority writer;
20 ms maximum event waits and audio-before-video service preserve independent
progress. Public LoadChannels now loads addins after the core replaces channels.
Public disconnect covers pre-GDI failures; serialized retirement precedes join.
Node validates status/config/packet progress with scalar metadata only and exposes
private typed audio events. Public sessions explicitly refuse this incomplete
media route. Opus/microphone/configured latency remain explicit unsupported errors.

The initial real worker checks exposed two fixture/implementation issues:
the fake lifecycle state must have its full eight-byte record, and pinned
utils_reload_channels destroys registrations made during PreConnect. Loading now
uses the public LoadChannels callback. Synthetic TLS tests need supplied synthetic
credentials to reach certificate validation rather than auth refusal. Dependency
pin/source remain unchanged.

Narrow Node tests: codec/source **11/11**, private fake/actual native worker **6/6**.
Native v5 config has **84 assertions**; actual generic addin-loader static selection
has **15 assertions**. These linked-core fixtures do not establish remote audio.
Full `pnpm check` passes **182/182**, bundled CTest **14/14**, foundation CTest
**6/6**, MSVC `/W4 /WX /analyze`, clang-format and `git diff --check` pass.
IPC now has **45 cases / 5,979 assertions**; RDPSND **67 / 9,146**. The old
unsupported-settings fixture now checks Opus, since private PCM is implemented;
its targeted rerun passes **1/1** before the full rerun.

Actual Edge/XRDP desktop regression also passes after LoadChannels correction:
H.264/reset renders 23 frames, restores decoder state and replays cursor/display;
JPEG renders 33 frames. Both resize 1920×1080 → 1280×720 → 1920×1080 and reattach.
Each sends only authorized pointer motion/reset; no keyboard/buttons/wheel/text/
touch are sent. This is desktop regression, not audio or 30-minute soak acceptance.

Actual authorized XRDP: private PCM opt-in connects, publishes waiting status,
retains heartbeat, captures a 1024×768 JPEG and closes. Observed **zero audio
configs/packets** in the idle observation; final private source is closed and no
audible/browser acceptance is claimed.
The helper sends no remote input or sound-generation commands, stores only bounded
non-secret report metadata in ignored .local-tests and passes credentials via IPC.

Public ordered media negotiation/forwarding, browser activation, actual audible
RDP, microphone/Opus, clocks/latency/resource/transport fault/soak acceptance and
Linux remain open. [Private contract](IPC_FOUNDATION.md#private-pcm-worker-activation-iteration-66).
