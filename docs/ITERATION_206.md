# Iteration 206 — bounded RDPSND negotiation diagnostics

2026-10-14. Implements PERFORMANCE instrumentation-before-change and the
SPECIFICATION 2.6 investigation after `16bde65`. Adds fixed scalar lifetime
counters for filtered server/client PCM counts, admitted Training/Wave records,
host write attempts/failures/completions/cancellations. Counters saturate; no
payload, peer identity, credential, sample, variable label or queue is retained.
They describe guard/host boundaries, not proof of remote receipt or audibility.
The code-owned retirement line is explicitly version 1; the lab parser admits
only complete bounded decimal fields and refuses partial/unknown/overflow records
without inventing zero. Existing source counters remain unchanged.

Six additional assertions in the actual linked RDPSND/fake-SVC padded Training /
legacy PCM case verify selected counts, Training, write accounting, no failures
and Wave admission. Linux CTest 24/24 and Windows linked CTest 23/23 pass. The
new pure diagnostic/privacy/boundary parser case passes separately. These are
fixtures, separate from actual RDP observations below.

Actual Linux primary run: one filtered PCM format offered/returned, 18 Training
records, 54 writes/completions and zero failures, but zero Waves/samples. A framed
repeat receives nine Waves and 375 packets, then schedules ready-source reset
with fresh config/data, retains heartbeat and closes. A subsequent primary
repeat exits early with WORKER_EXITED. Windows control on the same lab receives
201 Opus packets and ready-source reset. This does not establish a general
Linux codec/server rejection or a sole network/IPC cause.

Inspection then finds a separate carrier deadline defect: idle wait is counted
against the first record's assembly deadline. The following iteration adds a
real-socket failing-before/passing-after regression and fixes that boundary.
The controlled diagnostic observations themselves are preserved rather than
rewritten as successful Linux primary audio acceptance.

The helper gains explicit framed selection for comparison and consumes only
private stdin credentials from the authorized host wrapper. Raw stderr remains
discarded; only the fixed grammar reaches scalar receipts. A separate one-shot
echo confirms container-to-host-loopback connectivity; it does not test RDP or
alter server configuration. Logs: `build/iteration-206-*`. Broader audible,
latency, Linux/Windows-server, hostile transport and device gates remain open.

Full Node verification passes: Windows 545 passed /34 platform skips and Linux
508 passed /70 platform skips; zero failures. Windows also sees the subsequent
Linux-only idle heartbeat case as a skip (579 total vs Linux 578 here). The
next block's actual Linux worker regression/results are recorded separately.
