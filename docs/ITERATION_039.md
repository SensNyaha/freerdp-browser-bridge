# Iteration 39 — scoped RDPSND backend and actual linked static channel

Date: 2026-10-10. Continues SPECIFICATION §2.6 / ARCHITECTURE §5 preparation.
The exact public rdpsnd/browser device entry is scoped to one synchronous owner
context, preserving other addin loading and retiring resources before restoration.
No worker audio activation or dependency source/pin change.
[Contract and upstream audit](AUDIO_PCM.md#scoped-rdpsnd-backend-loading).

The actual pinned static RDPSND plugin is loaded through its public entry with a
fake SVC transport, chooses our browser backend, negotiates PCM, dispatches Wave2,
returns two wave confirmations and yields identical signed stereo PCM. The host
uses the actual opaque plugin/context API; there is no fake opaque pointer lookup.

Native fixtures also cover synchronous settings, missing/type/ABI selectors,
overlapping audio scopes, foreign-thread refusal, context mismatch, uncertain void
registration without retry, and preserving a foreign provider replacement. The
client-context constructor replaces the global provider, so all contexts must be
created before scope binding. This constraint is explicit in the contract.

Verification:

- RDPSND **14 cases / 465 assertions**, including the actual static channel + fake
  SVC fixture. Portable PCM/queue **16 cases / 9,633 assertions** remain green.
- Bundled CTest **12/12**, foundation **5/5**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **113.34 s**; TypeScript,
  lint/format and native/fake/Edge regressions passed.

Logs are ignored build/iteration-039-*.log. The test tier is actual linked channel
+ fake SVC, not remote RDP, physical audio or browser playback.

Known gaps retained: upstream SVC/DSP allocations precede backend limits;
SNDC_CLOSE does not call device Close (fixture verifies retained queued PCM), and
Play carries no server timestamp. Dynamic RDPSND integration, packet-clock/reset
handling, worker media transport, AudioWorklet/Opus/microphone and actual Stage 5/6
acceptance remain open. Playback capability remains disabled.
