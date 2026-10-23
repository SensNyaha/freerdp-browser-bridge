# Fixed managed audio source profiles

Iteration 94 activates the prepared Opus profile through public media/harness
ownership. Startup gates described below are historical preparation; current
requirements are in [AUDIO_OPUS_PUBLIC](AUDIO_OPUS_PUBLIC.md).

Iteration 92 (2026-10-11) implements the typed server boundary for SPECIFICATION
§2.6 / ARCHITECTURE §5. A SessionAudioSource chooses PCM or Opus once at creation.
Both delegate to the existing strict source clock/epoch owners. No sample packet
is retained or replayed by this wrapper. Snapshots contain the fixed codec and
copied current state/configuration only; shared state semantics do not infer a
codec from an audio sample.

SessionWorker and NativeSessionWorker now forward the explicit PCM/Opus event
union. The managed media lease exposes a discriminated metadata snapshot and
one union listener. Packet narrowing requires exactly one PCM/encoded property;
configuration narrowing requires the selected codec. Narrowing does not replace
the existing full size, TOC, readiness, epoch, timestamp and discontinuity checks.
Mixed-profile events fail before source clock/history changes. The PCM socket
explicitly requires PCM snapshot/event ownership.

Public Opus creation remains refused before backend allocation, and the native
session adapter retains its startup gate. This change prepares types and tests,
not public activation. Four new isolated cases cover fixed profiles, malformed
and mixed events, atomic refusal, reset/capture ordering and metadata-only
snapshots. Existing fake managed PCM, private-IPC handoff and socket fixtures
continue to pass. Actual ready-source reset/audio, browser socket Opus delivery,
microphone and platform/resource/LAN/A/V/soak acceptance remain open.
