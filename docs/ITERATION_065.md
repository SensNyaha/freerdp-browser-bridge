# Iteration 65 — serialized audio session and bounded retirement policy

Date: 2026-10-10. Implements SPECIFICATION §2.6/3.1, ARCHITECTURE §5/12 and
MEDIA_PIPELINE §6/8 owner lifetime after browser source mode `1e28cd8`.

Isolated AudioSession pairs one guarded static PCM provider, sink and source-status
publisher on the RDP thread. Retirement publishes stop without samples, attempts
close and completion drain once per later owner call and applies a monotonic
20..1,000 ms policy window. Output credit does not prevent native resource cleanup;
publication faults still drain native ownership. Source device Free and remaining
channel confirmations are distinguished. Callbacks are externally nonblocking;
the policy cannot interrupt OS/public calls. Expired live ownership remains an
outer process fault. No worker selection/audio activation is added.

Four new actual linked RDPSND/fake-SVC cases cover cancelled confirmations with
an error drain result, repeated close refusal, missing completion/output deadlines,
publication/drain exceptions, reentry, foreign callers and clocks/policy validation:
**134 assertions**. One public real-core registration/disconnect/context-free
case adds **17 assertions**, including final callbacks on a later thread; it does
not connect a socket or claim real transport/audible audio.

The first runs corrected a fixture's redundant stop-event assumption: pinned
Disconnected already frees the sink before confirmations finish. The core fixture
also established that ContextFree does not emit TERMINATED; explicit public
disconnect is required. [Source audit](RDPSND_UPSTREAM_AUDIT.md) records exact
static callback placement and close/cancel/finalization semantics. Dependency pin
and source remain unchanged. RDPSND **66 cases / 9,131 assertions**, bundled
CTest **14/14**, foundation CTest **6/6**, MSVC `/W4 /WX /analyze`, clang-format
and `git diff --check` pass. Full `pnpm check` passes **174/174**, including real
Edge fixtures. An unrelated Windows ephemeral-port failure (`ERR_UNSAFE_PORT`
at 6665) was corrected separately in `79cca8c`; the targeted wheel case passes
**1/1** and the full rerun passes. Audio is still not selected by the worker.

Worker configuration/capability/output selection, Node listeners/media negotiation,
real transport fault/resource verification, audible RDP/microphone and LAN latency
remain open. Earlier broad core/security/codec allocation acceptance is not claimed.
