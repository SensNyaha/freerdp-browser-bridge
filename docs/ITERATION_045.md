# Iteration 45 — failed RDPSND host close recovery

Date: 2026-10-10. Continues SPECIFICATION §2.6 / §3.1 bounded resource lifetime
and ARCHITECTURE worker/channel ownership. [Retirement contract](AUDIO_PCM.md#public-static-channel-callback-adapter).

Pinned rdpsnd sets its private OpenHandle to zero before CloseEx. A close failure
returns before format/device cleanup, so the prior adapter retained a host handle
but could not finish retirement. The public gate now retains the close status and
retries once per later owner call, after write completions drain. A successful
retry invokes the pinned public Disconnected callback again to finish its skipped
cleanup with no active upstream handle. No private layout is inspected or edited.

Repeated host Disconnected events cannot replay incomplete cleanup. Errors and
exceptions preserve gate/sink/provider ownership, close clears queued PCM, and
successful recovery retires resources/restores the previous provider exactly once.
The initial channel error stays recorded: recovery concerns cleanup, not resumed
audio. Wrong-thread retirement never touches the host. An unresolved host failure
still requires the future worker's finite deadline/process termination policy.

Actual linked guarded RDPSND + fake SVC fixtures exercise status refusal and thrown
host calls across three failures, idempotent duplicate events, deferred confirmations
before retry, host-initiated failure and owner-only completion. No real transport,
remote/browser audio or worker activation is inferred.

Verification:

- Native RDPSND **34 cases / 1,092 assertions**.
- Portable audio **33 cases / 407,939 assertions** remain green.
- Bundled CTest **12/12**, foundation **5/5**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **124.96 s**.

Logs are ignored build/iteration-045-*.log. Packet-clock gaps, earlier core limits,
worker/media scheduling, browser playback, microphone and actual Stage 5/6 gates
remain open.
