# Iteration 219 — bounded AUDIN negotiation diagnostics and real audio recovery

2026-10-15. Implements SPECIFICATION section 2.6 / PERFORMANCE instrumentation
for unresolved real microphone readiness. AudinDvcGate retains fixed saturating
lifetime counters for accepted channel handoff, validated Version/Formats/Open,
policy refusal, completed recording epochs and failure transitions. Original /
filtered format counts are read only after successful bounded ingress parsing.
Close preserves these statistics; quiescent owner-thread snapshots flow through
MicrophoneSession. Enabled workers write one fixed numeric retirement record.
There are no peer strings, devices, samples, new queues or public/IPC changes.

Actual linked AUDIN/fake-DVC tests verify counts before/after negotiation,
successful format change, malformed change, no common formats, two short-Open
refusals followed by compatible Open, session retirement and foreign-read refusal.
The fixed lab parser handles every split position and byte-at-a-time delivery,
CRLF, exact uint64 extrema, version/order/range/overlong/truncated/untrusted text
rejection and copied latest-only ownership. It stores numeric state only and
does not forward raw stderr. These fixtures are separate from remote recording.

Windows linked CTest passes 23/23; Linux linked CTest passes 24/24 and unchanged
private ELF closure is 34 files / 274 edges. Native builds retain warnings as
errors and touched files pass clang-format. Two new parser cases pass. Complete
Node checks and actual receipts are under build/iteration-219-*.
Full checks pass Windows bundled 563 / 47 platform skips and Linux 556 / 54,
610 cases on each, zero failures.

The restored XRDP Opus-input/Opus-output primary probe connects, renders 1080p,
survives heartbeat and cleans up. Input remains waiting epoch 0. All nine AUDIN
counters are zero: no accepted channel handoff is observed at this gate, rather
than a nonzero offer/Open counter with a format refusal. This narrows the stage
of the observed absence but does not establish a server misconfiguration or
physical/remote capture. No microphone samples or permission requests are made.

During this probe real output becomes ready. Subsequent actual 200 ms PCM and
Opus runs receive 449 / 442 packets respectively; PCM is nonzero. Both schedule
one ready-source reset and receive fresh config/data in a newer epoch, retain
heartbeat, capture 1080p and close. Public Linux/API/Edge H.264/Opus then renders
actual decoded audio into Worklet: first receipt 13 decoded / 1,408 played
frames; fresh-token reattachment has 15 decoded / 4,352 played frames, epoch
3→7 and exactly one additional scheduled native reset. Actual resize/restoration
1920x1080→1280x720→1920x1080 has fresh config/IDRs, and cleanup passes.
The separate actual PCM browser run also passes resize/restoration and replay:
1,024 played frames initially and 1,408 after reattachment, with clean shutdown.

Native output counters also report zero overflow and zero late intervals but
nonzero skipped source frames and block/arrival/timestamp gaps in these short
probes. Periodic identical format offers are counted without clearing the clock
baseline by the existing table policy. No cause is inferred for the gaps, and
no uninterrupted/audible/latency/soak acceptance is claimed from these receipts.
The current release image receipt remains Iteration 217; this newer native
diagnostic build is separately tested rather than retroactively assigned to it.
