# Iteration 365 — bounded listening-preview evidence

2026-10-20. The user confirms that the continuous tone in
[iteration 363](ITERATION_363.md) was started through `mstsc`. The route into
the subsequent Bridge connection remains unverified. The existing one-minute
visible Opus/200 ms listening preview now queries fresh Worklet stats before
timed cleanup and reports only fixed video/source/decoder/playback counters.
If the viewer has closed or the query cannot finish, the observation is `null`;
it cannot silently reuse an older stats response. No audible pass is inferred.

The schema-1 `lab.browser.audio-preview` observation is followed by the existing
native negotiation footer after joined cleanup, now enabled for manual audio
modes as well as automatic modes. The preview duration, output-only activation
and user ownership of remote source commands remain unchanged. The prepared
next lab scenario is a user restart of the source inside this active Bridge
viewer after connection, rather than another unattended source launch.

An actual headless Edge fixture with synthetic viewer stats verifies delayed
fresh-reply ownership, fixed scalar projection, unavailable-query refusal and
closed-page rejection. It does not use RDP, a microphone or device capture.
Focused observation, PCM/Opus viewer, option, window-lifetime and negotiation
tests pass 10/10; the final observation fixture also passes its targeted repeat,
including absent PCM decoder evidence represented as `null`. Repository-wide
ESLint and format checks, helper syntax and `git diff --check` pass. The full
Node 750 / 101 skips and existing native CTest 29/29 run immediately before
this local preview block are recorded in [364](ITERATION_364.md); they are not
claimed as a full-suite rerun of this preview change.
Actual listening-preview execution and the current Windows source route remain
open. No production code, Release setting or dependency pin changed.
