# Iteration 317 — native adapter resource-failure composition

2026-10-19. Continues TODO Stage 10 / SPECIFICATION §2.12 and §3.1 resource
failure propagation and joined cleanup. Production worker, adapter, manager,
Release configuration/artifacts and dependency pins remain unchanged.

## Actual native worker with synthetic local TLS peer

The new integration test uses the existing loopback TLS negotiation fixture,
an actual linked worker, ordinary OS RSS sampling, the production
NativeSessionWorker and SessionManager. A one-byte cap at two-second polls
fails the owned worker while its synthetic certificate prompt is pending.
No certificate is accepted and the peer receives zero application bytes. This
fixture does not implement a desktop or establish connected-RDP acceptance.

The manager preserves exactly WORKER_MEMORY_LIMIT / `Session worker memory
policy exceeded` / retryable false and emits one session error. A full registry
refuses before another factory invocation. Failure refuses new tokens, a spare
old token and the prior certificate decision. Active capacity becomes zero
only after the observed native adapter close returns. The PID is absent,
runtime empty and shared query active/waiting owners are both zero.

The first local attempt omitted the fixture's explicit TLS profile and did
not reach its expected prompt; its original finite deadline failure is kept in
`build/iteration-317-windows-focus.log`. Matching the established fixture's TLS
selection and synthetic credentials corrects the test. No timeout is raised.
Focused Windows checks then pass **2/2** (native composition and explicit lab
entry-point refusals), retained in `build/iteration-317-windows-focus-corrected.log`.

## Actual connected lab check after restored access

`scripts/test-rdp-resource-session-lab.mjs` selects the same verified isolated
Windows receipt and approved exact session fingerprint before private lab
configuration. It uses ordinary manager control/media leases for certificate
decision and JPEG, then requires a first connected over-cap RSS sample, exact
public failure envelope, token/lease refusal, joined close and capacity/PID/
runtime/query retirement. Output contains fixed scalars only; no remote
application launch, input, saved image or server change occurs.

The first attempt fails before connected state; a second diagnostic attempt
identifies WORKER_MEMORY_LIMIT while still connecting. Both clean their runtime
but do not satisfy connected acceptance. The previously passing direct healthy
control also now fails before the certificate prompt, and a separate single
TCP connection to the authorized endpoint's port 3389 does not complete in
five seconds. This is evidence of current unavailability, not proof of a server
root cause. No authentication retry loop, deadline extension, server setting
change or alternative target is used. The user was asked about availability.

Retained logs: `build/iteration-317-rdp-registry-{memory,diagnostic}.log` and
`build/iteration-317-rdp-direct-control.log`. Earlier actual connected
[CPU](ITERATION_315.md) and [RSS](ITERATION_316.md) controls retain their named
acceptance; they do not establish this manager composition by themselves.

The user then requested a new access check. TCP 3389 responds again and the
manager reaches connected. Its first restored run fails an assertion; fixed
phase/close-code diagnostics localize it to the test's cleanup wait. The new
early-failure guard incorrectly treats the expected failed session state as a
reason to stop waiting for registry capacity retirement. Neither a close error
nor forced termination is observed. Allowing the expected failed state only
for that cleanup wait corrects the fixture without changing production code or
timeouts. Failed restored/phase/close runs remain retained in
`build/iteration-317-rdp-registry-{restored,phase,close-diagnostic}.log`.

The corrected actual run passes: JPEG **1920×1080 / 47,290 encoded bytes** and
heartbeat precede the first connected/global RSS sample, **163,389,440 bytes**.
The native adapter and manager preserve exactly WORKER_MEMORY_LIMIT with the
fixed message/retryable false envelope and one error event. Overflow refuses
before a second factory, old/new token authority is refused, old media authority
fails after retirement, adapter close returns, active capacity is zero, query
active/waiting owners are zero, native PID is gone and runtime is empty.
`build/iteration-317-rdp-registry-corrected.log` exits zero. This accepts the
named private manager/lease slice, not public HTTP/WebSocket delivery or sibling
isolation. No remote application action or server setting is used.

Linux focused checking passes **1 / 1 explicit linked-profile skip**; existing
foundation CTest passes **17/17**. Full Linux `pnpm check` passes build/lint/
format and Node **655 passed / 152 skips / 807 total / zero failures**, duration
132.14 s. This is common foundation evidence; the linked synthetic-TLS test
does not run with that foundation worker. Full Windows `pnpm check` also passes
build/lint/format and **753 passed / 51 skips / 804 total / zero failures**,
duration 492.32 s. These full common suites precede the final helper-only
diagnostic/cleanup-wait correction. After that correction, current Windows and
Linux profile/entrypoint unit checks pass **6/6** each; changed-file ESLint and
Prettier pass, and the corrected actual Windows helper passes above. No
production/foundation code changed after the full suites.
Current isolated Release native CTest passes **31/31** in 23.34 s. Seven
protected inputs remain byte-identical, and the retained module/DLL/codec
provenance control, local documentation links, structured actual-result audit
and `git diff --check` pass.

Public HTTP/WS resource-failure delivery, connected siblings, CPU composition,
hard OS failures, full resource budgets,
platform/CI and soak gates remain open.
