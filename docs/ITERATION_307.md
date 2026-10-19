# Iteration 307 — Windows active-source browser audio and recovery

2026-10-19. The user confirms that a sound source is running on the current
Windows lab. Existing PCM/Opus browser helpers run sequentially through the
unchanged linked Windows worker, local API and headless Microsoft Edge.
The exact approved fingerprint remains required. No host application command,
file save, policy change or physical capture is issued by the agent.

Both `--audio-compat-recovery-test` and `--audio-opus-compat-recovery-test`
pass with H.264 1920×1080 and the existing 200 ms native profile. They activate
the output-only browser gesture, receive ready source/config/data, observe
AudioWorklet played frames, then detach and reattach with fresh tokens. Input
is limited to the existing motion/reset fixture. Clipboard stays off; its
rejecting browser API sentinel observes zero requests.

| Browser observation | PCM | Opus |
| --- | --- | --- |
| Rendered video frames / custom cursor shapes | 27 / 6 | 29 / 6 |
| Worklet configurations / packets | 101 / 590 | 102 / 589 |
| Worklet played frames | 502,912 | 512,064 |
| Decoded Opus packets | n/a | 590 |
| Worklet invalid calls / overflow-skipped frames | 0 / 0 | 0 / 0 |
| Underflow frames / events | 1,536 / 23 | 2,112 / 25 |
| Buffering-silence / reset-discarded frames | 248,704 / 62,528 | 229,888 / 52,864 |
| Replay previous → current source epoch | 106 → 112 | 109 → 117 |
| Fresh replay configs / packets / played frames | 2 / 5 / 2,880 | 3 / 13 / 9,600 |

Opus replay additionally observes one actual scheduled native reset and 23
decoded packets. The larger epoch change also includes ordinary source churn;
it is not attributed entirely to that one request. Both checks exit zero and
joined server/native shutdown leaves the runtime empty. No resize is performed
by these audio modes; previous resize evidence remains separate.

The existing private ten-second PCM/Opus/200 ms checks then also observe ready
source, exactly one scheduled reset, fresh config/data afterward, heartbeat,
1920×1080 capture and clean native close. PCM reports nonzero bytes. PCM has
81 configs / 342 packets, Opus 85 / 258. Fixed native counters report:

| Private observation | PCM | Opus |
| --- | --- | --- |
| Chunked source callbacks / overflow resets | 17 / 0 | 12 / 0 |
| Playback-skipped frames / late intervals | 24,144 / 71 | 17,832 / 79 |
| Publisher consumer resets | 84 | 90 |
| Block / arrival-gap / timestamp-gap causes | 8 / 8 / 8 | 6 / 6 / 6 |
| Format / Training records | 19 / 19 | 22 / 22 |
| Native write failures / audio guard faults | 0 / none | 0 / none |

These are counts, not independent additive reset causes or proof of a root
cause. Significant config/epoch churn, buffering silence and underflows remain.
No continuous audible-quality, LAN latency, host/total-session CPU/RSS, long
soak or microphone recording acceptance is inferred from successful admission
and recovery. The user subsequently confirms **short sounds with pauses**, not
a continuous music/speech stream. Some source gaps are therefore expected;
these counters alone do not establish a continuous-source transport defect.
A continuous-source baseline is still needed to assess interruptions and
latency. No unverified guard relaxation is made.

Evidence is ignored `build/iteration-307-browser-{pcm,opus}.log` and
`iteration-307-native-{pcm,opus}.log`. The existing browser metrics artifact is
overwritten per run; the two scalar result logs preserve their distinct counts.
Browser canvas snapshots are produced by the existing test, without an
additional screenshot-analysis workflow. No production code or Release artifact
changes are needed for this observation. Local links and `git diff --check`
are checked before commit; ordinary full suites belong to iteration 306.
