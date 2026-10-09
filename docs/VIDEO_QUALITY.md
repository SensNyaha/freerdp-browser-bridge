# Configurable native video quality

Implements SPECIFICATION §2.3 / §2.10, MEDIA_PIPELINE §3–4 and ADR-003.
Configuration applies to native browser-video encoding, not incoming FreeRDP
AVC decoding or remote Windows appearance/performance flags.

## Profiles and bounds

| Profile | H.264 FPS cap | JPEG FPS cap | Target/max H.264 bitrate | JPEG quality |
| --- | ---: | ---: | ---: | ---: |
| balanced (default) | 30 | 20 | 4/4 Mbit/s | 80 |
| low-bandwidth | 10 | 10 | 1/1 Mbit/s | 60 |
| lan | 30 | 20 | 8/8 Mbit/s | 90 |
| custom | 30 | 20 | 4/4 Mbit/s | 80 |

`quality.maxFps` overrides the profile ceiling, with a schema range of 1..60.
The effective cap is the smaller of that value and the current provider-path
ceiling (30 for H.264, 20 for JPEG). It is a maximum, not a measured or promised
browser frame rate. `media.ready.maxFps` reports the effective codec cap.

`targetBitrateKbps` and `maxBitrateKbps` override the profile rates. If only maximum
is given, the default target is lowered when needed. If only target is given,
maximum is raised when needed. Explicit target greater than explicit maximum is
invalid. Current OpenH264 supports 100..20,000 kbit/s: otherwise valid schema
requests outside this provider range fail with `RDP_SETTING_NOT_IMPLEMENTED`.
Rates configure OpenH264 rate control; maximum is not a strict instantaneous
network-byte budget. JPEG uses profile quality and retains the fixed 8 MiB
encoded-payload ceiling. Direct JSON JPEG percentage overrides are not exposed.

```json
{
  "quality": {
    "profile": "custom",
    "maxFps": 5,
    "targetBitrateKbps": 750,
    "maxBitrateKbps": 1000
  }
}
```

Appearance fields such as wallpaper/font smoothing remain explicit unsupported
settings in the current native mapper. Codec negotiation remains browser-offer
based; hardware/provider selection is retained work.

## Scheduling and transport

The manager retains only resolved non-secret quality values. The native settings
use [CONFIGURE v2](IPC_FOUNDATION.md), capability gated; credentials still travel
separately through private IPC. Legacy v1 settings keep historical defaults.
Both native capture pacing and Node pull pacing use the selected cap. No raw
frame queue is introduced. Render credit remains one frame, and only the latest
desktop revision is captured. JPEG/H.264 encoders remain lazy and session owned.
Node forwards compressed records without changing their codec settings.

Intervals round up to whole milliseconds. Default scheduling retains 34 ms AVC
and 50 ms JPEG native intervals, with existing JPEG post-ACK polling behavior.
Low caps also apply to forced IDR captures. Adaptive bitrate/FPS adjustment and
automatic congestion profiles remain open.

## Verification

Native tests validate independently encoded v1/v2 vectors, all truncations and
bounds, actual JPEG quality output and decode, and low-FPS H.264 with distinct
target/maximum rates. Fake transport tests check reported caps and delayed pulls
after immediate render ACK; they do not measure an RDP desktop.

The authorized XRDP helper accepts `--quality-test` after its codec mode. It uses
the low-bandwidth profile with 5 FPS, 750/1000 kbit/s, verifies browser rendering,
then makes three sequential native captures after browser detach to test pacing
independently of Node. It does not send remote keys/buttons/wheel.
Evidence is recorded in [iteration 16](ITERATION_016.md).
