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

## Explicit connected RSS-limit control

```powershell
node scripts/test-rdp-resource-lab.mjs --memory-breach `
  sha256:<approved-session-fingerprint> build/native-clean-EXAMPLE/receipt.json
```

This separate mode sets a **one-byte fixture RSS cap**, keeps CPU at 100% of one
logical core and polls both resources every five seconds. It creates no memory
load, allocation ceiling or production budget. Both breach switches together
are refused before private configuration access.

Connected RDP, heartbeat and a 1080p JPEG must precede any CPU/RSS sample. The
helper then waits at most seven seconds for the ordinary first RSS result, under
the same overall 25-second deadline. Acceptance requires exactly
`WORKER_MEMORY_LIMIT`, a failed worker and one positive over-cap RSS sample
which is both the first global sample and already connected. Earlier/nonconnected
sampling, another failure or a missing result cannot pass. Final joined PID/
runtime cleanup is mandatory, as in the healthy mode. No remote application,
input, stored image or server setting is used.

The [named actual Windows result](ITERATION_316.md) verifies this private
connected failure slice. Synthetic result checks are separate. Public registry
propagation, connected siblings, startup/between-sample/total-session budgets,
hard OS failures, other producer/server profiles and soak remain open.

## Manager-composition control

```powershell
node scripts/test-rdp-resource-session-lab.mjs `
  sha256:<approved-session-fingerprint> build/native-clean-EXAMPLE/receipt.json
```

This separate Windows-only helper runs the one-byte RSS control through the
ordinary NativeSessionWorker and SessionManager. Its observation seam delegates
to the real sampler; no synthetic resource result or lifecycle adapter replaces
production behavior. Certificate approval and JPEG use actual manager leases.
It requires a connected frame before the first sample, then exact fixed session
failure, one error event, refused stale tokens/media authority, joined adapter
close, zero active capacity and empty native/query/runtime ownership. A second
creation must refuse before its factory while the first session is active.

The same explicit receipt/fingerprint, private credential, 25-second overall
deadline and no-remote-application/input/image-persistence rules apply. Its
named actual Windows connected check now passes after access restoration and a
test-only cleanup-wait correction. The separate
loopback TLS/native composition passes the pending-certificate failure slice,
which does not implement a connected desktop. Connected public RSS failure is
covered below; sibling isolation, CPU composition, full budgets and soak remain open.
[Evidence and failed runs](ITERATION_317.md).

The automatic [public HTTP/WS native regression](ITERATION_318.md) separately
checks the pending-certificate RSS failure through the ordinary server, control
error, both channel closes, failed GET snapshot and expired token authority.
It uses a real linked worker and local synthetic TLS peer, not an RDP desktop.
It runs with a linked profile in normal Node checking; foundation profiles
explicitly skip that integration case. Connected public resource-error delivery
is covered separately below.

## Connected public HTTP/WebSocket RSS control

```powershell
node scripts/test-rdp-resource-api-lab.mjs `
  sha256:<approved-session-fingerprint> build/native-clean-EXAMPLE/receipt.json
```

The Windows-only helper verifies the same receipt/worker/helper before private
configuration or listener acquisition. It hosts the ordinary API on loopback
with an ephemeral in-memory host credential and exact Origin/subprotocol.
RDP creation uses POST, certificate decisions use control WS and JPEG config/
frames use media WS. Attach credentials use private Authorization headers.
No credentials/tokens or raw server diagnostics are printed or persisted.

The one-byte RSS fixture and paired five-second policy are unchanged. The first
1080p JPEG must arrive before sampling. The Node receiver checks bounded RWB1
framing/dimensions/JPEG markers, ACKs each frame and wipes bytes; it does not
decode or render an image. A 25-second overall bound covers observation and
requests owned-worker/socket termination on expiry, followed by joined shutdown.

Acceptance requires exactly one fixed WORKER_MEMORY_LIMIT control error, both
channels closing 1000 / `session terminal`, HTTP 200 failed snapshot with the
same error, refused new tokens (409), refused previously unused token upgrade
(401), pre-factory overflow refusal and joined native/query/runtime retirement.
[Actual Windows evidence](ITERATION_319.md) retains the measured values and
separates the passing transport slice from browser rendering, other resource
budgets, connected siblings and sustained/OS-failure acceptance.
