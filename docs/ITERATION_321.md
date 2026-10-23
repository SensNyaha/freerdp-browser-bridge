# Iteration 321 — quality profiles and explicit RDP performance settings

2026-10-19. Implements the existing six `quality` appearance fields and selected
profile projection from SPECIFICATION §2.10 / CONFIG_SCHEMA / TODO Stage 9.
[Contract and invocation](RDP_PERFORMANCE_SETTINGS.md). No dependency version,
Release compiler profile, old native artifact or system security setting changes.

## Implementation and compatibility

The pure bounded resolver selects only named profile defaults and explicit
booleans. Explicit false overrides a preset; omitted keys preserve SDK defaults.
Low-bandwidth selects wallpaper/drag/menus off, balanced wallpaper off plus font
smoothing on, LAN all six on, custom only explicit fields. No profile selection
leaves appearance unchanged. Existing video FPS/bitrate/provider ceilings remain.

HELLO schema-1 extension bit 32 advertises performanceSettings and requires
connectCore/videoQuality. New workers/CLI/REST agree; foundation/old peers are
false. Old workers retain encoding-only profile behavior, while any explicit
appearance field refuses before CONFIGURE/SECRET without the capability.
Synthetic IPC separately verifies both paths and omission's legacy bytes.

CONFIGURE schema 11 appends canonical six-bit selection/value bytes after all
v10 fields. Values outside selection/known bits refuse; all legacy layouts and
the 2,048-byte cap remain. Native tests cover all 65,536 byte pairs (729 accepted),
all truncations and old-version refusal. The checked public SDK mapper inverts
only Disable* keys on the owned pre-connect settings. Pinned FreeRDP's public
performance-flag builder (used by Client Info) is verified independently:
two baseline states × 729 valid
selections, exact preset/override golden flags and unchanged state on invalid
selection. Its standalone suite passes **2 cases / 13,170 assertions**.
No new queue, raw-frame path, private SDK ABI or arbitrary FreeRDP argv is added.

## New source-only native outputs

The new isolated Windows Release consumer `build/native-clean-fNRgNe` builds
all **405** compile/link steps against the unchanged verified pinned SDK and
dependency receipts. Actual MSVC 19.44.35228.0 / Ninja / CMake 3.31.6-msvc6 and
matched Release CRT are retained. CTest passes **32/32**, process/TLS/lifecycle
**27 passed / 1 profile skip**. No old binary/object is copied.

The new Linux GCC 13.3.0 Debug foundation `build/native-clean-1UMcyg` builds
264 steps, passes **17/17 CTest** and **15 lifecycle / 1 absent-primary skip**.
It reuses only prepared tool/Catch2 inputs, with no SDK/RDP or network. Both
source copies bind **348 files / 1,917,900 bytes**, remain unchanged and share:
`cd4f6d7d0702f46f569f0a183be3f7e8172027775e790618296153c6ecc27eeb`.
This is a current working-tree source-only build, not a new OS/CI/full checkout
or Linux linked-performance acceptance.

Windows worker SHA-256:
`dfdf03c5b34dbcb77d5114ceb2a8634fe00fb770c43fadb68cd7df92a4c6101c`.
Colocated helper:
`80a787b7cfe170dbb6baaf94f476c35b7559185033e326f26f81e377621af864`.
Actual private module/codec probe passes. Original SDK/dependency receipts and
pre-existing Release outputs remain separate protected inputs.

## Actual authorized Windows RDP smoke

The explicit helper checks the new receipt/hashes and actual capability before
reading ignored lab credentials. It connects only to the authorized Windows lab
with the approved exact session-only fingerprint, 1920×1080 and 5 FPS. Four
separate workers select low-bandwidth, balanced, LAN and custom with all six
explicit alternating booleans. All receive JPEG/heartbeat and remain connected
through a second heartbeat; joined close leaves empty runtime and absent PID.
JPEG lengths are **33,267 / 33,267 / 35,347 / 33,267 bytes** respectively.
Bytes are wiped, not saved; no remote app launch, input or system setting action
is used. These lengths also depend on encoder quality and do not prove server
visual interpretation. No browser/render/appearance/performance budget is inferred.

Logs: `build/iteration-321-{windows-native-clean,linux-native,sdk-performance,
runtime-probe,rdp-performance}.log`; the two source receipts preserve full inputs.
Focused Windows wire/profile/synthetic checks pass **16/16**, and lab argument
refusals **1/1**. Linux focused checks pass **17/17** and full `pnpm check`
passes build/lint/format and Node **664 passed / 153 skips / 817 total / zero
failures**, duration 135.04 s. Full Windows `pnpm check` also passes build/lint/
format and Node **763 passed / 51 skips / 814 total / zero failures**, duration
557.03 s. All seven protected pre-existing inputs and both old consumer artifacts
remain byte-identical. Five actual module origins, eleven SDK DLLs, four codec
roundtrips, four complete lab retirements, local documentation links and
`git diff --check` pass. New source outputs are not production package adoption.

Server visual-effect/policy acceptance, Linux linked/other platform/server
profiles, complete UI appearance controls, performance/resource/interactive
budgets, CI/deployment and sustained regression remain open. Original suggested
profile targets and all unrelated requirements remain preserved.
