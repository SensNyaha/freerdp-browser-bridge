# One-off clipboard control probe

Prepared 2026-10-16 after Iterations 236–239. This helper checks the actual
reference viewer/control/manager/native offer and no-format revoke path. It is
lab-only and changes the remote clipboard; explicit operator authorization is
required within its stated scope. The one-test permission consumed in Iteration
232 does not authorize this series. On 2026-10-16, after the first new invocation
failed before backend dispatch, the user authorized necessary further controlled
offer/revoke runs. This permits repeats of the same fixed-item scope, not reading
existing remote content or accessing the real host Clipboard API.

Safe synthetic check (no credentials, RDP connection or OS clipboard):

```powershell
node scripts/test-xrdp-clipboard-control.mjs --synthetic
```

After explicit permission, one real invocation is:

```powershell
node scripts/test-xrdp-clipboard-control.mjs <previously-approved-sha256-fingerprint> --offer-revoke
```

The helper reads bounded ignored lab JSON only for a real invocation. Passwords
stay out of argv/env/logs and reach FreeRDP through private IPC. A headless Edge
instance and loopback API use one ephemeral in-memory host authorization bearer.
The certificate decision requires the exact supplied previously approved
fingerprint; changed certificates are not accepted.

Only the explicitly authorized 192.168.21.149:3389 target is accepted. It selects
browser-to-server text only, with a 1,024-byte maximum, waits for initial native
offer/ACK admission to be quiescent, and proposes
the fixed `FreeRDP browser clipboard probe Ж😀` text with a final newline exactly
once through the viewer. It waits for native ACK and accepted source state,
detaches, and requires one content-free revoke ACK while RDP/source are still
ready, with no accepted/pending local format. A fresh-token viewer then renders
again without another write or revoke. The existing remote clipboard contents
will be lost. No previous contents are read or restored.

Read hooks throw before native dispatch; non-reset input is refused. Clipboard
OS APIs are mocked with refusal and requests counted, so the host clipboard is
untouched. The report contains only phase/status/counters and cleanup booleans.
The helper performs no automatic write/revoke retries; the ownership layer owns
one finite native drain/revoke. Failure cleanup requests detach and waits a
bounded interval for that existing retirement before joining server/worker.
If the revoke is uncertain the report fails; disconnect does not count as ACK.

The synthetic invocation passes one set, one revoke, ready-source barrier,
fresh viewer replay, zero reads/OS requests and empty runtime. The first separately
authorized real invocation failed during offer before backend write dispatch:
zero write/revoke calls, three source events and empty runtime. Its exact cause is
unverified. A reproducible UI initial-ACK readiness gap is now corrected and the
probe records known scalar admission/failure metadata. The corrected actual
Windows/XRDP/Edge repeat passes one accepted write, one accepted no-format revoke,
ready-source barrier, fresh-token replay and empty runtime, with zero remote
reads or host API requests. See [Iteration 240](ITERATION_240.md) for exact scope
and retained failure evidence. Further controlled runs are covered by the user's
subsequent repeated-test authorization. Neither an offer ACK nor a revoke ACK
establishes actual application text consumption, reverse readback, physical OS
permission, resource/network or complete Stage 7 acceptance.
