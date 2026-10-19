# Iteration 326 — IP-family controls in the manual WEB form

Requirement: SPECIFICATION §2.1/2.10, existing CONFIG_SCHEMA target fields and
TODO Stage 9 manual controls. Builds on [backend selection](ITERATION_325.md).

The form exposes default/system/IPv6-first preference and default/IPv4-only/
IPv6-only family choice. Defaults omit keys, system order sends false, and the
selected family sends numeric 4/6. Returning to default removes the force key
for the next new worker. Explicit null remains supported by the typed API; the
form needs no separate null option for its fresh-worker lifecycle. Independent
ipSettings capability gates controls and submission. Old/unsupported fields
remain disabled with an explicit message. No persistence, schema/wire/native,
Release or dependency change is introduced.

## Focused and actual evidence

Focused Windows checks pass **11/11**: seven pure form/ownership cases and four
actual Edge/synthetic HTTP capability combinations (neither, appearance-only,
IP-only, both). Nine preference/family combinations preserve strict schema and
exact types; old/missing capability and malformed inputs refuse. Edge checks
explicit false / force 6 in POST, default omission after disconnect, independent
disabled fields, active-form locking, auth refusal, password clearing and late
create cancellation/cleanup. Synthetic layout snapshots are retained in
`build/iteration-326-form-*.png`; the capable IP section is visually readable.
These fixture endpoints do not run RDP.

The existing appearance-form helper gains only explicit `--ip-test` mode;
default invocation retains its previous contract. The new mode verifies actual
appearance/IP capabilities before ignored credentials, selects prefer true /
force 4 through the form, and checks exact fields in the native adapter.
CLI guards pass **3/3**, including missing/foreign/repeated-mode refusals.

Actual authorized Windows RDP / Edge passes: exact approved session-only
certificate, the fixed IP selection alongside six appearance overrides,
**3 frames / 1920×1080 / maxFps 5 / sampled range 241**, native heartbeat and
form Disconnect. Browser storage is empty; joined browser/server/native close,
empty runtime and absent worker PID all pass. Scalar output is retained in
`build/iteration-326-rdp-form.log`; no remote app/input/device/system-setting
action, image save or credential output occurs. Native worker/helper remain the
unchanged iteration-325 source consumer. This is an IPv4 RDP case despite the
preference flag; it does not accept dual-stack DNS ordering or IPv6 RDP desktop.

Linux focused checks pass **10 / 4 Edge platform skips / 14 total**. Full Linux
`pnpm check` passes build/lint/format and Node **675 passed / 162 skips / 837
total / zero failures** (140.83 s), using the unchanged iteration-325 foundation
worker. This is common/foundation coverage, without linked Linux IP acceptance.

Full Windows `pnpm check` passes build/lint/format and Node **783 passed /
51 skips / 834 total / zero failures** (589.07 s), using the unchanged
iteration-325 linked worker. Logs: `build/iteration-326-{focus,cli,windows-full,
linux-full,rdp-form}.log`. Post-regression native/protected-input hashes, actual
form scalar/cleanup audit, local documentation links and `git diff --check` pass.
The unchanged native CTest 33/33 Windows and 17/17 Linux remain the preceding
baseline, not new runs. Linked Linux, dual-stack DNS history, actual IPv6
RDP/server profiles and broader resource/platform/soak gates remain open.
