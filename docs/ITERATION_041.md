# Iteration 41 — public static RDPSND callback boundary

Date: 2026-10-10. Continues SPECIFICATION §2.6 and resource/lifecycle requirements.
The native public SVC adapter validates bounded ingress before the actual RDPSND
callback, resets open PCM streams on Close and idle suspend/resume, refuses split
Wave transitions and reentrant dispatch, and tracks bounded outgoing completions.
[Exact contract](AUDIO_PCM.md#public-static-channel-callback-adapter).

Verification:

- RDPSND **24 cases / 774 assertions**. Actual linked channel + fake SVC covers
  fragmented PCM, Close clears queued samples and next sound is accepted,
  advertised size/count and raw flag rejection, deferred completion draining,
  64-write capacity, unknown-token refusal, transition boundaries, reentrant data
  and retirement refusal, and final host Terminated after owner retirement/join.
- Portable audio **24 cases / 14,606 assertions** remain green.
- Bundled CTest **12/12**, foundation **5/5**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **109.27 s**. TypeScript,
  lint/format and existing native/fake/Edge regressions pass; final native-only
  callback guards additionally pass CTest. No Node/worker audio activation is claimed.

Logs: ignored build/iteration-041-*.log. Expected upstream error diagnostics in
negative fixtures prove bounded write/reentrant refusal; they contain no secrets.

The adapter must survive until host Terminated. It cannot retire while the host
still owns write streams, or treat a failed host close as detachment. Future worker
integration must pump within a deadline and use process supervision for unresolved
host failures. Close-fault injection and real transport lifetime acceptance remain.

Top-level provider selection, worker scheduling/IPC, compressed DSP and earlier
core allocation audit, timestamp gaps, dynamic RDPSND, browser playback and actual
Stage 5/6 gates remain open. This block has not enabled AudioPlayback or advertised
audioOutput capability. No dependency source/pin or public wire contract changes.
