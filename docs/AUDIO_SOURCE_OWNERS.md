# Typed audio source ownership

Iteration 83 (2026-10-11) prepares SPECIFICATION §2.6 and MEDIA_PIPELINE §6/8.
The internal generic `AudioSource` shares scalar state/configuration ownership
and capture-clock rules. `PcmSource` retains its existing API and uses a frozen
PCM profile; isolated `OpusSource` supplies a frozen codec-1 profile. Typed
parsers and validators remain codec-specific. No raw samples are synthesized
to reuse PCM validation and no Opus packet is treated as PCM.

Wire admission checks the profile before shared state can advance. Status must
be enabled, strictly increase revision and preserve epoch/status-time progress.
It clears configuration and requires a marked next packet. Config requires ready
state, matching epoch and a strictly newer configured epoch. Capture PTS remains
independent from status observation time; it strictly increases and ordinary
packets advance 20 ms. Rejected records leave these guards intact. Close/reset
without samples clears configuration; future ready/config requires a new epoch.

Owners retain only scalar state and configuration. Snapshots and returned events
copy metadata, while sample/encoded bytes borrow input for immediate dispatch.
No queue, decoder, timer, socket or sample replay is added. The common state type
contains no codec descriptor; codec descriptors are checked by each wire parser.
Typed event configurations and packets still distinguish PCM from Opus.

The Opus owner is isolated and is not imported by WorkerProcess or the public
backend. Private worker selection, HELLO/settings gating, public negotiation,
audible RDP and microphone, resource/platform/LAN latency/A/V scheduling and
soak acceptance remain open. [Wire payloads](AUDIO_OPUS_WIRE.md).
