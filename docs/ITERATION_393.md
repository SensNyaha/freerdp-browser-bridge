# Iteration 393 — accepted current Release Opus listening scenario

2026-10-21. Continues the user's P0 MVP sound criterion and the profile
comparison in [391](ITERATION_391.md). One separately authorized headed Edge /
Windows RDP session uses the current receipt-bound Release worker
`fff1781f42dcf64184a96b0c9655cbcfc3bc57d4661bc478f2f9676340b55056`
and the exact approved session-only certificate fingerprint. The fixed quiet
tone is a local draft only; the user manually sends, pastes and executes it in
their prepared PowerShell. No automated application launch or source execution.
No heavy local regression runs during the observation.

The first decoded packet starts the 180,000 ms observation. The helper exits 0
and the user reports **"отличный звук"**. This accepts the named multi-minute
Opus/200 ms listening scenario without systematic audible interruptions; it
does not assert that all numeric loss/reset counters are zero. The automated
report retains `audibleAcceptance:false` because that field cannot supply a
human assessment. Evidence: `build/iteration-393-release-audio.log`.

- H.264 1920×1080: 104 frames; Opus ready, final revision 16 / epoch 13;
- 9,015 records, 8,987 decoded/Worklet packets, 12 configurations;
- 8,617,984 played frames: **179.54 seconds of rendered samples**;
- Worklet underflow frames/events 384/4, overflow-skipped frames 0,
  reset-discarded frames 7,168, invalid calls 0, high-water 5,248 and queued
  frames 2,368. Cumulative buffering silence 3,735,936 frames includes source
  preparation and is not an active-stream outage duration;
- server/client Formats 1/1, Training 1, Waves 966, writes/completions
  1,935/1,935, cancellations/failures 0/0;
- native chunks 965, overflow resets 0, skipped PCM frames 89,945, late
  publication intervals 11, revisions 9, lifetime consumer resets 16,
  packets 9,006. First/formats causes 1/1, arrival gap 1, other source causes 0;
- one Node consumer reset request is scheduled, with no failed/unexpected
  recovery results. This counter alone is not complete recovery acceptance;
- encode mean/p95/max 27,533 / 36,941 / 111,929 us, maximum read batch
  48 checks / 30,032 us. Joined runtime close passes; post-run PID inventory
  finds no worker and the owned runtime has zero entries.

Compared with the separate Debug observation [390](ITERATION_390.md), the
Release run has fewer late intervals (11 versus 64) and browser configurations
(12 versus 40), with lower encode timings. Duration/profile/source shape are
similar, but desktop activity, host scheduling, arrival gaps and a scheduled
consumer reset differ. This supports avoiding Debug performance conclusions;
it is not proof of one cause for every skip or a controlled codec benchmark.
Serialized encoding can still exceed 20 ms. Numeric discontinuities remain
visible and no reset-free, zero-drop or measured end-to-end latency claim is made.

The product/native code, original Release artifact, Release configuration,
dependencies, 120/200 ms queues, PCM/Opus selections and protocol deadlines
are unchanged. The source/artifact audit still matches 353 native inputs, both
current Release outputs and seven protected inputs. Native CTest 34/34 and
full current Release Node 890 / 51 skips remain [391](ITERATION_391.md).
The named audible MVP slice passes; wider PCM/120 ms/platform, active recovery,
recording and LAN/resource gates remain separate full-v1 work. Remaining MVP
priorities are actual basic input/release and current platform/combined smoke
evidence, not a new audio diagnostics or architecture project.
