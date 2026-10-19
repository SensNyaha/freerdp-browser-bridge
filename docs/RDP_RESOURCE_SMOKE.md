# Windows RDP CPU/RSS policy smoke

`scripts/test-rdp-resource-lab.mjs` is an explicit local developer test for the
authorized Windows lab at 192.168.21.149. It starts one native worker from an
isolated source-consumer receipt. It never starts remote applications, sends
input, accesses the host clipboard or saves desktop images.

```powershell
node scripts/test-rdp-resource-lab.mjs sha256:<approved-session-fingerprint> `
  build/native-clean-EXAMPLE/receipt.json
```

Run from the project root after building the Node packages. The current helper
supports a Windows producer only; other producer platforms refuse explicitly.
The fingerprint must be the exact previously verified/approved value. Unknown
certificates are refused; no persistent trust or default verification policy
is changed. The endpoint must match the authorized lab. Existing ignored
`.local-tests/xrdp-lab.json` and `xrdp-lab.secrets.json` supply configuration and
credentials under the project's development exception. Credentials enter the
worker only through private IPC, never argv/env or emitted diagnostics.

Before reading lab credentials, bounded receipt parsing checks source-only,
linked, platform/build type, fixture path and exact pinned SDK commit. Worker
and colocated query-helper bytes must match the receipt's SHA-256 values; the
artifact has a 64 MiB bound. Invalid/missing source selection refuses before
private lab configuration access. This selects a trusted local build result;
it is not a signed installer or proof against arbitrary changes by the host.

The helper enables both ordinary host policies: 256 MiB worker RSS, 100% of one
logical CPU, equal 500 ms polls and a 1,000 ms CPU minimum window. The production
query owner and its existing deadlines/enforcement are unchanged. Observation
only delegates to the ordinary samplers and accumulates fixed count/peak/first/
last scalars; it creates no second query timer, fake counter or history queue.
Sampling policy starts at HELLO; reported sample counts/peaks are restricted to
the observed connected state. At least eight connected samples of each resource,
heartbeat, a 1920×1080 JPEG and continued connection are required. The 25-second
test deadline requests termination and joined cleanup on expiry.

Diagnostics contain only state, build/source hashes, limits, counts, cumulative
CPU growth and sampled RSS/frame dimensions/encoded length. No raw OS/RDP
diagnostics, credential values or remote text are emitted. The compressed frame
is wiped after use and is not decoded or saved. Final cleanup must join query/
worker retirement, observe the PID gone and leave an empty private runtime.

This is a short healthy connected-policy control. It does not prove connected
cap-breach enforcement, between-sample/startup/Node/session-total budgets, exact
CPU utilization, dirty-to-send/audio/network latency, broad recovery or sustained
resource/soak behavior. Debug developer-host results do not substitute for
Release deployment/packaging acceptance. [Observed scope](ITERATION_314.md).

## Explicit connected CPU-limit control

```powershell
node scripts/test-rdp-resource-lab.mjs --cpu-breach `
  sha256:<approved-session-fingerprint> build/native-clean-EXAMPLE/receipt.json
```

This opt-in control uses a **1% fixture CPU cap**, not a recommended desktop
budget. Equal CPU/RSS polls are five seconds apart; the minimum CPU window
remains one second and RSS remains 256 MiB. The helper first requires connected
RDP, heartbeat and one 1080p JPEG before any CPU sample. The initial CPU sample
must then be the first global sample and already connected, preventing startup/
authentication work from masquerading as the load baseline.

After that observed baseline, the helper drives ordinary private IPC heartbeats
to the same owned worker. At most 16 requests are pending; each batch joins
before another is admitted. Load stops on worker failure or an eight-second
observation deadline, inside the unchanged 25-second overall test deadline.
It sends no keyboard/mouse/clipboard/device input or extra remote program action.
The source RDP connection remains ordinary; no server/network policy is changed.

Acceptance requires real cumulative counter growth and exactly
`WORKER_CPU_LIMIT`, followed by joined query/process retirement and empty runtime.
Another resource/transport failure, premature baseline or no limit observation
fails the check. Synthetic driver tests cover admission, wrong failures and
deadline behavior separately from the [actual RDP control](ITERATION_315.md).
This verifies the named private connected CPU breach, not public API/registry
failure propagation, other connected sessions, RSS breach, hard OS stalls or soak.
