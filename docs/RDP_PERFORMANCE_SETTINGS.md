# RDP appearance/performance settings

Implements the appearance projection in SPECIFICATION §2.10 and the existing
`quality` booleans in CONFIG_SCHEMA. Native encoder FPS/bitrate/quality remain
described in [VIDEO_QUALITY.md](VIDEO_QUALITY.md); incoming decoder selection is
separate. This is a client request to the RDP server, not a guarantee that the
server or its policy implements every visual effect.

## Selection and compatibility

Only workers advertising `performanceSettings=true` receive the appearance
projection. Foundation/old workers report false. Existing encoding-only profile
behavior is retained for old workers; an explicitly supplied appearance boolean
always refuses with RDP_SETTING_NOT_IMPLEMENTED before CONFIGURE/SECRET if the
capability is absent. Explicit false is a selected value, not omission.

On capable workers, explicitly selected profiles contribute these values:

| Profile | Selected appearance defaults |
| --- | --- |
| low-bandwidth | wallpaper, fullWindowDrag, menuAnimations false |
| balanced | wallpaper false, fontSmoothing true |
| lan | all six booleans true |
| custom | none |

An explicit boolean overrides its profile. Other fields preserve SDK defaults.
Omitting `quality.profile` selects no appearance preset; ordinary video defaults
remain unchanged. Selecting only maxFps/bitrate does not alter remote appearance.
The current encoder ceilings/rates and Release compiler configuration are unchanged.

```json
{
  "quality": {
    "profile": "custom",
    "wallpaper": true,
    "fontSmoothing": false,
    "desktopComposition": true,
    "fullWindowDrag": false,
    "menuAnimations": true,
    "themes": false
  }
}
```

The configuration schema is unchanged: it already names these six optional
booleans and rejects unknown fields/types. No arbitrary FreeRDP flags/argv,
privileged settings, persistence, devices or secret class is added.

The [manual WEB form](WEB_CONNECTION_EXAMPLE.md) exposes each boolean as
profile inheritance / enabled / disabled, guarded by the actual capability.
Its [Edge/HTTP verification](history/iterations/301-350.md#iteration-322) is separate from the native SDK
and actual Windows connection evidence below. The named
[actual Windows JPEG/form smoke](history/iterations/301-350.md#iteration-323) also passes; neither accepts
remote visual-effect interpretation.

## Versioned private projection

HELLO schema-1 extension bit 5 (32) means `performanceSettings`; it requires base
connectCore and videoQuality. A missing extension/bit decodes false. Readers
which reject unknown feature bits must be upgraded together with the worker,
as in the existing [HELLO contract](IPC_FOUNDATION.md).

CONFIGURE schema 11 preserves all v10 fields, including the u32 clipboard item
maximum (zero when unselected), then appends two bytes: selection mask and enabled
values. The existing 2,048-byte maximum and separate password IPC remain. Both
bytes use only the low six bits; values outside the selection mask are refused.
Zero/zero is valid and changes no SDK appearance setting. Schemas 1..10 retain
their earlier byte layouts and select no appearance fields.

| Bit | Positive API boolean | Pinned public FreeRDP setting |
| ---: | --- | --- |
| 1 | wallpaper | DisableWallpaper, inverted |
| 2 | fontSmoothing | AllowFontSmoothing |
| 4 | desktopComposition | AllowDesktopComposition |
| 8 | fullWindowDrag | DisableFullWindowDrag, inverted |
| 16 | menuAnimations | DisableMenuAnims, inverted |
| 32 | themes | DisableThemes, inverted |

Selection is bounded and canonical before dispatch. The native
[mapper](../native/rdp-worker/performance_settings.hpp) validates again and
checks each public setter result on the owned pre-connect settings object.
Unselected keys are untouched. Pinned FreeRDP packs these public booleans into
Client Info performance flags itself; no private ABI is called by the bridge.
Connection/session cleanup and media/input ownership are unchanged.

## Explicit authorized lab smoke

```powershell
node scripts/test-rdp-performance-lab.mjs sha256:<approved-session-fingerprint> `
  build/native-clean-EXAMPLE/receipt.json
```

Run from the project root with built Node packages and a verified linked Windows
source-consumer receipt. The helper checks worker/helper hashes and the actual
capability before reading ignored lab credentials. It only uses the authorized
192.168.21.149 endpoint and exact approved session-only fingerprint. The four
fixed cases above use 5 FPS, actual 1080p JPEG/heartbeat and joined PID/runtime
cleanup. Each has a 25-second deadline. Password copies are retired after delivery,
JPEG bytes are wiped, and no remote app, input or system-setting action is used.

For the separate actual Windows Edge form smoke with all six explicit fields:

```powershell
node scripts/test-rdp-performance-form-lab.mjs sha256:<approved-session-fingerprint> `
  build/native-clean-EXAMPLE/receipt.json
```

It uses fixed loopback port 47996, one balanced/5 FPS JPEG session, exact
session-only certificate click, nonblank 1080p canvas/heartbeat and form
Disconnect. Port conflict fails without replacing a listener. No desktop image
or credentials are printed/saved. See iteration 323 for the retained initial
blank-frame failure, bounded wait correction and successful repeat.

[Current evidence](history/iterations/301-350.md#iteration-321) separates portable wire/synthetic IPC,
actual public SDK projection and Windows RDP smoke. Server visual interpretation,
other producer/server profiles, complete performance/resource budgets, CI and
sustained/interactive acceptance remain open.
