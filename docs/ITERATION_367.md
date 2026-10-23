# Iteration 367 — audible Windows fixed-source Opus preview

2026-10-20. The user clarified that reconnecting with `mstsc` would replace
Bridge, then explicitly authorized the agent to start the source while the
user only evaluates the sound. One visible output-only Opus/200 ms preview
uses the previously approved exact certificate fingerprint, without persistent
trust or a concurrent `mstsc` connection. The user answers: “Да, тон слышен”.
They then clarify that short interruptions make it sound like Morse code;
the observation accepts audibility only, with a user-confirmed continuity defect.

The new explicit `--audio-opus-compat-tone-listen` lab mode is restricted to
`192.168.21.149:3389`. Private RDP input opens Windows PowerShell and types
only a fixed in-memory quiet 440 Hz PCM8 source. The source requests 45 seconds
of looping playback, then Stop/Dispose/exit in `finally`. There is no arbitrary
command argument, WAV file, download, microphone or host Clipboard API request.
Text chunks obey the existing 256-UTF-16-unit limit, input state is reset on
completion/failure, and credentials retain their existing private IPC path.
Command dispatch is reported separately from unverified remote execution or
process readback; the helper never infers an audible pass from counters alone.

The actual minute preview exits 0 with:

- H.264: 232 frames, 1920×1080.
- RDPSND: server/client formats 1/1, Training 1, Wave 240;
  writes/completions 483/483, cancellations/failures 0/0.
- Browser: ready Opus source, revision 570 / epoch 568, 3,506 records,
  2,369 decoded packets and matching Worklet packets.
- Worklet: 2,014,016 played frames, 10,944 underflow frames / 135 underflows,
  1,045,632 buffering-silence frames, 258,816 reset-discarded frames,
  567 configurations, high-water 2,944 frames, invalid calls/overflow skips 0/0.

Frequent epochs/configurations and silence are retained quality gaps, not a
continuous-output pass. The preceding waiting runs remain historical evidence;
this successful active-source repeat does not prove their precise root cause.
No recovery/reattachment, microphone, LAN latency, total resource or soak pass
is claimed. Local browser/server/worker close joins, runtime is empty and port
47999 is no longer listening. The bundled Release worker SHA-256 remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
The ignored receipt is `build/iteration-367-windows-audio-tone-preview.log`.
Remote source process termination is requested by the recipe, not independently
verified by process inventory.

Before RDP execution, focused source-dispatch, target/refusal, key retirement,
WAV grammar, real Windows PowerShell AST-only parsing, viewer options/lifetime,
numeric negotiation and synthetic Edge observation tests pass 12/12. The parser
control does not execute the sound source locally. Repository-wide ESLint and
format checks, helper syntax and `git diff --check` pass. The immediately
preceding full Node 753 / 101 skips and unchanged native CTest control belong
to [iteration 366](ITERATION_366.md); no new full-suite/native run is claimed
for this lab-helper block. Production code, Release settings and pins are
unchanged by this iteration.
