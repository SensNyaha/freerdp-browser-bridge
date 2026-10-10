# Iteration 69 — negotiated PCM media socket

Date: 2026-10-10. Implements SPECIFICATION §2.6, ARCHITECTURE §5/11 and
MEDIA_PIPELINE §6/8 using record credit `a07827d`.

Media hello optionally selects `{audio: {codec: 'pcm', sourceStatus: true}}`.
The selected session must expose PCM lease ownership. Ready confirms stream 3,
one record of credit and a 2,000 ms ACK timeout. The same ordered media socket
forwards status/config/PCM; `audio.ack` is independent of video `media.ack`.
Legacy viewers receive no audio extension or records. NativeSessionWorker still
refuses public PCM creation until the reference browser admission path is ready.

The route subscribes to future lease events and seeds only scalar metadata. It
uses one copied latest pending packet, clears it on stop/reset, and unsubscribes
immediately on retirement. One 20 ms progress timer checks receiver and local
admission deadlines. Audio admission waits for zero local socket backlog; existing
TCP writes cannot be preempted. Eligible audio is flushed before video admission.
An encoded but unsent AVC unit discarded during this check forces the next IDR.
This is bounded scheduling, not a measured LAN latency guarantee.

Wrong, duplicate or absent ACK, consumer faults and blocked local admission close
only media with fixed diagnostics. Negotiated PCM permits a bounded 128 incoming
commands/sec for audio plus video ACKs; legacy attachments retain 32/sec.

Five actual local WebSocket/fake-backend cases pass: metadata-only join, independent
video/audio credit, exact ordered configuration/sample records, 100 pending packet
replacements, Close without samples, fresh-epoch recovery, opt-in/schema/backend
refusal, unchanged legacy output, wrong/duplicate/absent ACK, listener retirement,
50 valid PCM ACKs in a second and an actual valid-ACK rate-limit failure.
Two additional pure socket-owner cases verify the absolute local admission
deadline through newer status replacement, subscription retirement and writable
recovery before video. These pass **2/2**, including targeted lint/format checks.
Full `pnpm check` passes **202/202** (started before these two cases were added),
including actual native lifecycle/TLS and Edge synthetic Worklet fixtures.
Strict TypeScript, lint, format and `git diff --check` pass. These are transport
fixtures, not actual RDP or audible acceptance. Native code/layout is unchanged.

Browser Worklet admission ACK, gesture activation, public native selection, actual
audible RDP, microphone/Opus, metrics, transport-fault/resource/latency/soak/platform
acceptance remain open.
