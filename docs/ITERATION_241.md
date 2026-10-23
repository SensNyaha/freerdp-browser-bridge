# Iteration 241 — actual Linux clipboard offer/revoke carriers

2026-10-16. Continues SPECIFICATION §2.7 and Iteration 240's authorized
fixed-sentinel offer/no-format revoke scope. No remote content reads or host
Clipboard API access are requested.

The private inventory helper now has a separate `offer-revoke` action. It
requires private stdin, the authorized 192.168.21.149:3389 target, both clipboard
capabilities and browser-to-server text with a 1,024-byte maximum. After initial
ACK admission it writes the exact Iteration 240 Unicode item once, checks its
accepted offer, revokes all formats once, and requires accepted ACK with a ready
connected source, unchanged generation and no local/remote pending operation.
An uncertain set permits one bounded cleanup revoke, never a content retry;
disconnect cannot count as ACK. Read calls are blocked before dispatch and the
owned input buffer is wiped. Existing inventory and historical `set-sentinel`
remain separate; the latter offers empty Unicode and is not executed here.

The new host runner bounds each ignored JSON file before parsing, validates the
private bootstrap and exact target before Docker, sends credentials only over
private stdin, bounds output and suppresses raw runtime stderr. Five synthetic
process cases reject wrong target/port, invalid credential type, oversized input
and malformed JSON without leaking their synthetic private value or launching
Docker. With existing private-input/numeric-diagnostic cases, focused checks
pass 10/10.

The owned Linux RDP container was idle before replacing only its matching
worker/addon/manifest and built protocol/Node packages, not node_modules or lab
files. Actual worker SHA-256 is
`2246cb7c24a714dffb296b1cba82e4f74a26aca75abd7cb7d2ba4b4c277fbaac`;
addon is `bceb050c30f6f07f33595698f841eb7dc1e8653ad30b1a54726000ccf3252e3e`,
matching its manifest.

Both actual XRDP invocations pass:

| Carrier | Set / revoke | Ready after revoke | Heartbeat / close / empty runtime | Reads |
| --- | --- | --- | --- | --- |
| Automatic `unix-seqpacket-rws1` | accepted / accepted, one each | true | all true | 0 |
| Explicit `framed-pipes` | accepted / accepted, one each | true | all true | 0 |

Both final sources retain generation 1 / revision 0 / maximum 1,024,
to-server=true, from-server=false and no accepted local offer. The exact approved
session-only fingerprint is used; credentials remain in ignored host files and
private IPC. Logs are `build/iteration-241-linux-primary.log` and
`build/iteration-241-linux-framed.log`. After both runs a separate process/runtime
inspection finds no worker and an empty private runtime.

These are private Node/native Linux RDP lifecycle checks, separate from the
Windows/Edge public control result in Iteration 240. Application consumption,
reverse readback, Linux browser/OS permissions, total resources/network, other
clipboard formats and managed-drive CRUD remain open. C++/production packages
are unchanged; native CTest baseline remains Iteration 238 Windows 29/29 and
Linux 30/30. Full bundled Linux Node check passes 645 with 57 platform skips /
702 cases and zero failures. The first Linux full-check command omitted
`BRIDGE_TEST_BINARY_DIR` and selected a stale foundation executable: 553 passed,
145 skipped and four failures (clipboard commands, CLI/handshake agreement and
paused-parent cleanup). That invalid current-build selection is retained in
`build/iteration-241-linux-check.log`; the corrected command explicitly selects
`build/bundled` and passes in `build/iteration-241-linux-bundled-check.log`.
Windows full Node check against its current foundation worker passes 609 with
90 skips / 699 cases and zero failures (`build/iteration-241-windows-check.log`).
This is the foundation profile, not a new bundled Windows TLS pass; Iteration
240's full bundled Windows result remains separate evidence. Both full checks
include the new bootstrap guard cases and current helper lint/format checks.
