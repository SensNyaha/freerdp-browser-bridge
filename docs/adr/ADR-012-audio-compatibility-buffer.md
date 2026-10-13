# ADR-012: Optional 200 ms output compatibility buffer

Status: Accepted — explicit user decision, 2026-10-13.

The user selected “Добавить режим около 200 мс” after actual XRDP delivered
roughly 186 ms PCM callbacks into the native 120 ms handoff. Add an explicit
immutable output profile selected by `media.audioOutputBufferMs: 200` for PCM
or Opus. Omission or 120 retains the existing profile. This setting controls
only native RDPSND PCM storage, not browser microphone or Worklet capacity.

The compatibility ring has exactly 9600 stereo frames at 48 kHz, with fixed
allocation and the same overflow, reset, retirement and raw-loss accounting.
The ordinary ring remains 5760 frames. Private settings schema 9 and a HELLO
feature gate prevent accidental selection on older or unsupported workers.
No arbitrary FreeRDP argument, host audio backend or credential path is added.

This explicitly permits a native 200 ms queue for the compatibility profile;
the standard <150 ms LAN target remains required for the ordinary profile.
Neither value guarantees total source-to-speaker latency. Real quality,
transport recovery, measured latency/resources, microphone, platform and soak
acceptance remain separate. Preserve the original blueprint and historical
120 ms reports; they describe the default profile, not this optional exception.
