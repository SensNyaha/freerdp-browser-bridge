# Iteration 323 — actual Windows appearance-form smoke

Requirement: SPECIFICATION §2.10 and TODO Stage 9 browser-to-RDP appearance
integration. The manual controls accepted in [iteration 322](ITERATION_322.md)
now have a bounded actual Windows/Edge connection smoke, separate from server
visual-effect interpretation.

The explicit `test-rdp-performance-form-lab.mjs` helper validates the isolated
native receipt and both executable hashes, then probes actual pinned FreeRDP
version/capability before reading ignored lab configuration/credentials. It binds
only loopback with one ephemeral host identity/session and uses the authorized
Windows endpoint and exact supplied approved session-only fingerprint. It fills
the existing manual form with balanced / 5 FPS and alternating explicit values
for all six appearance fields. The native adapter checks the exact quality
object received through the public session route. Edge clicks Connect and the
matching certificate dialog, renders JPEG, checks heartbeat and disconnects
through the form. Audio/microphone/clipboard stay off. No remote application
launch, saved image, OS-setting change, device capture or clipboard read is used.

Credentials are not emitted or persisted; the DOM and mutable local password
clear after creation. Only scalar image statistics, fixed phase/error codes,
nonsecret quality values and artifact hashes are reported. Sampled pixel copies
are wiped inside Edge and never returned. The 45-second overall observation
timer, original 15-second rendering deadline, finite page waits and joined
browser/server/native cleanup remain bounded. Cleanup independently attempts
all three owners even if another close fails.

## Retained failure and actual repeat

The first run reaches the real desktop connection and receives one 1920×1080
frame, but its sampled range is zero. The initial test prematurely checks the
first frame and fails at render; joined cleanup, empty runtime and absent PID
all pass. The helper is corrected to wait within the original 15-second bound
for a nonblank frame, polling every 200 ms. No production code or acceptance
threshold is relaxed. Original evidence is retained in
`build/iteration-323-rdp-form.log`.

The corrected repeat exits zero and observes **4 frames, 1920×1080, maxFps 5,
sampled range 241**, actual native heartbeat, one session factory and exact
quality values. Form Disconnect completes; browser storage is empty, joined
close passes, runtime is empty and the worker PID is absent. Evidence:
`build/iteration-323-rdp-form-repeat.log`.

Worker/helper are the unchanged iteration-321 Release source consumer:
`dfdf03c5b34dbcb77d5114ceb2a8634fe00fb770c43fadb68cd7df92a4c6101c` /
`80a787b7cfe170dbb6baaf94f476c35b7559185033e326f26f81e377621af864`.
Release settings, old artifacts, SDK/dependency versions and source are unchanged.

## Local regression scope

CLI guard checks pass **2/2** on Windows, including both private and new form
helpers. Missing/invalid/foreign/missing-receipt selections refuse before private
credentials or listeners. Linux also passes **2/2** early-refusal cases, without
RDP/Edge acceptance. Repository-wide lint and format checks pass on both hosts.
The retained-failure/repeat audit checks exact scalar results, both complete
cleanup triples and the unchanged native artifacts; seven protected inputs and
original SDK/dependency/runtime origin checks also pass. Local documentation
links and `git diff --check` pass. Logs: `build/iteration-323-{cli,static,
linux-check}.log`.
Production form/API/native code is unchanged from iteration 322, whose full
Windows Node 765 / 51 skips, Linux 665 / 154 skips and native CTest 32/32 / 17/17
remain the relevant baseline; they are not claimed as rerun here.

This accepts the named Windows JPEG/form projection chain. It does not establish
that server policy honors every wallpaper/font/composition/animation setting,
other producer/server profiles, complete UI/platform/device/resource acceptance
or sustained budgets. Those original TODO gates remain open.
