# Standalone service and installers

Development for the next distribution, **0.2.5**, starts in
`feature/standalone-installers-0.2.5`. Product manifests remain 0.2.4 until the
aligned release preparation. The currently public npm/GitHub plugin delivery
is [0.2.4](ITERATION_441.md). Installers, their hosted workflow and clean-machine
acceptance are not complete yet.

User clarification, 2026-10-23: retain the standalone web server and installers;
exclude a separate desktop GUI application. The service uses the browser
interface. No desktop application shell is planned.

Final delivery boundary, 2026-10-23: complete this web service and its installers,
then clean the project and stop development. Intended consumers are VM portals,
Java/Python/Go/.NET backends, internal-network gateways, training/test systems,
operator portals and RDP integration checks. Applications authorize users and
provision machines/accounts; bridge supplies the approved RDP connection and
browser transport. Multiple applications may use the service with one configured
issuer; that issuer must assign distinct subjects to distinct owners across
those applications. The JWT subject is the owner key. Do not add
shared viewing, recording, a file manager, VM provisioning or new USB/smartcard
support to this delivery. Existing capability gates and accepted profiles apply.

## Service contract

The standalone service uses the same API/native lifecycle as the adapters.
Node.js runs HTTP; one separate C++ worker runs FreeRDP for each session.
The target layout includes a private Node.js 24 runtime, compiled production
JS, exact platform runtime, notices/source companions, launcher and service
integration. Installation must not require globally installed Node, npm,
compilers or system FreeRDP.

The new private `apps/standalone` entry point accepts only:

```text
node dist/main.js --config <absolute-public-config-path> --runtime-root <absolute-private-runtime-directory>
```

The launcher may append `--supervised`: a private stdin pipe carries exactly
one shutdown byte `01`; EOF also stops the service. No commands or credentials
are accepted on that pipe. The fixed `STANDALONE_READY` record is written only
after the listener is ready. Linux CLI startup refuses UID 0.

It resolves an installed, matching native package; the packaging step must
provide that package. This source entry point alone is not an installer.
SIGINT/SIGTERM and Windows SIGBREAK join service/worker cleanup with a bounded
shutdown deadline. The HTTP API is under `/rdp`. Native build/readiness remains
separate from the ability to authenticate or reach an RDP desktop.

## Integration in real applications

| Deployment | Application responsibility | Bridge responsibility |
| --- | --- | --- |
| VM portal | Provision the VM, check this user's entitlement, obtain credentials through the approved interactive flow | Connect to an approved host and transport its desktop |
| Java/Python/Go/.NET backend | Call HTTP with the owner's short-lived JWT; retain ownership/session mapping in the application | Enforce JWT subject ownership, session limits and native lifecycle |
| Internal network | Route HTTPS/WSS ingress to loopback; constrain the bridge host's RDP egress | Connect from the bridge host, without requiring browser access to the RDP network |
| Training/test environment | Allocate and later return machines/accounts; close the bridge session before recycling a machine | Run and retire each RDP worker independently |
| Operator portal | Authorize the destination and choose its accepted device/media profile | Expose actual capability results, image, input and supported channels |
| Integration runner | Observe application and desktop results, apply deadlines and delete created sessions | Provide bounded HTTP/native diagnostics and joined shutdown |

Use a backend-mediated flow when different users have different machine rights:

1. The portal verifies its own user and checks the chosen machine's entitlement.
   The browser must not select a different upstream target or an arbitrary owner.
2. The backend obtains a bridge JWT with a stable subject for that owner and
   sends `POST /rdp/v1/sessions` over its protected service connection. The body
   follows the common [session contract](SESSION_API.md); passwords remain in
   memory and travel to the native worker through private IPC.
3. A 202 response means accepted asynchronous creation. Poll the owner's
   `GET /rdp/v1/sessions/:id`; it does not prove a connected or rendered desktop.
4. Supply the created snapshot and separate control/media attach grants to the
   application's viewer through its authenticated, no-store response. The
   browser connects using the allowed external Origin and `freerdp-bridge-v1`.
   Grants are single-use and channel scoped. Keep them in page memory.
5. For reattachment, the backend verifies the same user's entitlement again
   and requests `POST /rdp/v1/sessions/:id/attach-token` separately for each
   required channel. The JSON body is `{ "channel": "control" }` or
   `{ "channel": "media" }`. Refresh the application JWT when necessary.
6. On logout, allocation expiry, VM recycling or an explicit disconnect, the
   backend sends owner-authenticated `DELETE /rdp/v1/sessions/:id` and observes
   its result. A lost browser/WebSocket alone does not delete the session.

The built-in `/viewer/` is useful for direct diagnostic connections. For a
portal that must keep a broad create JWT on its backend, use the application's
own viewer/authenticated orchestration. The built-in page is not an entitlement
broker and refuses iframe embedding. Its token panel currently refuses token
replacement while a connection is active or pending; a long-running portal
must refresh backend JWTs independently for later HTTP management requests.
This limitation does not imply expiry of an already attached desktop transport.

No language-specific SDK is required for the backend: HTTP status, bounded JSON
and owner identity are the contract. Do not forward raw upstream failures or
request objects to application logs. Handle 401 by refreshing the application's
identity flow, 403 as a destination-policy refusal, 404 as unknown/foreign owner
without disclosing which, and 429/503 as bounded admission/unavailability.
Retrying a session-create POST is not idempotent: if its response was lost, do
not assume that no worker was created. Retain application-side request/session
coordination and treat that allocation as uncertain. Aggregate diagnostics do
not recover a lost session ID, and this API has no idempotency-key lookup.

Health can be checked without a token from the server host:

```sh
curl --fail --silent --show-error http://127.0.0.1:8080/rdp/healthz
curl --fail --silent --show-error http://127.0.0.1:8080/rdp/readyz
```

Readiness, the reported native build and capabilities are separate from RDP
desktop, browser-audio, clipboard and installed-OS acceptance. Test the actual
deployment profile before routing users to it. Bridge installation does not
provision VMs, create RDP users or guarantee attachment to a physical console
session; that behavior belongs to the selected RDP server.

## Public configuration

Start from [bridge.example.json](../packaging/standalone/bridge.example.json).
The default configuration allows health/build checks but denies sessions:
no identity verifier and no approved targets. The schema rejects unknown keys,
private keys, passwords and symmetric JWT secrets. Its JSON reader accepts
only regular files up to 64 KiB. Limit values, key count, Origin count and target
count are bounded before service startup. Restart to apply configuration/key
rotation; no remote JWKS fetch or unbounded key cache is introduced.

Only loopback listeners are accepted. Place an HTTPS reverse proxy in front
for remote access; forward WebSocket upgrades and exclude Authorization,
Cookie, session bodies and attach query tokens from access logs. TLS private
keys and session credentials do not belong in the bridge configuration.
`allowedOrigins` uses exact HTTPS origins; localhost HTTP origins are permitted
for local development. This setting does not implement cross-origin CORS.

An administrator explicitly adds exact `targets` as host/port pairs. A missing
session port means 3389. Host comparison is case-insensitive; no hostname suffix
or network wildcard is inferred. Gateway/proxy overrides and a different
`serverName` are refused by this initial standalone policy, because they would
introduce destinations outside that list. The adapters retain their existing
host-orchestrated behavior. Network egress rules and trusted DNS remain the
administrator's responsibility; the list is not an IP firewall or DNS pin.
This initial list is global: a valid `rdp:connect` identity may request any listed
destination. It is not a per-user or per-application machine entitlement map.
For a VM portal with different user entitlements, keep session creation behind
the portal backend: check the user's right to the selected machine there,
create the session with that owner's subject, and pass only the scoped browser
attach grant to its viewer. Do not give that browser a general bridge create JWT
unless access to every approved destination is intended.
Privileged host devices/paths and unfinished channels remain subject to the
existing configuration policy and actual native capability gates.

## JWT identity

Optional `auth` contains `issuer`, `audience` and `jwks.keys`. It accepts one to
eight public RSA signing JWKs: `kty: RSA`, `alg: RS256`, `use: sig`, unique `kid`,
public `n`, and `e: AQAB`. Use the public verification keys of the application's
identity provider; private signing keys remain at that provider. Key rotation
may temporarily include old and new public keys with different kids.

[jose jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)
checks the signature and claims using a
[local JWKS](https://github.com/panva/jose/blob/main/docs/jwks/local/functions/createLocalJWKSet.md).
The verifier accepts RS256 only, exact issuer/audience, required `sub`, `iat`
and `exp`, token age at most 15 minutes, five seconds of clock tolerance,
`typ` JWT or at+jwt, and the space-separated `rdp:connect` scope. The subject is
the session owner. Authorization must be `Bearer <JWT>`; any Cookie header is
refused. An untrusted token cannot select a remote key URL. Headers are capped
at 8192 characters; at most 16 verifications run concurrently, with excess
requests denied rather than queued. Verification failures return no decoded
token or cryptographic error details.

Obtain short-lived application access tokens through the existing identity
flow and retain them only in memory. Send RDP credentials separately in the
authenticated session-create body; the common core forwards them to the
worker through private IPC. Never place application/RDP/attach credentials in
argv, env, config, logs, metrics or saved profiles. Session/attach ownership
and the [cookie boundary](HOST_AUTHENTICATION.md) remain unchanged.

## Browser entry point

`/` redirects to `/viewer/`. The standalone packages the reference browser and
adds an application-token panel. Apply a short-lived JWT, then enter the approved
RDP destination and credentials in the separate connection form. The token
remains in page memory and is sent in Authorization headers to `/rdp`; the
application-token input clears immediately. No local/session storage, URL token
handoff or saved connection profiles are used. Closing the page requests owner
session deletion; service-side expiry/shutdown limits still apply if a browser
cannot complete network cleanup during exit.

The built-in page disallows iframe embedding through CSP. A portal can open it
as a page, or use its own browser integration with the bridge API. The portal's
identity flow must supply the JWT without query strings or saved credentials.
This initial page is a diagnostic connection interface, not a desktop GUI.
Full checks and actual browser/private-Node lifecycle evidence:
[iteration 443](ITERATION_443.md).

The Windows C++ supervisor builds with `scripts/build-standalone-host.ps1`.
It launches only the private bundle and joins its process tree through a Windows
Job. Its console/control, crash recovery and preservation tests pass;
[iteration 444](ITERATION_444.md). SCM identity/ACL and MSI acceptance remain open.

Development MSI and DEB artifacts now build and pass independent database/
archive-byte checks; the Linux private-Node CLI also passes from UID 1000.
[Iteration 445](ITERATION_445.md) distinguishes those checks from installation.
`scripts/build-standalone-msi.mjs` takes an immutable payload, WiX executable
and Util extension path; `scripts/build-standalone-deb.mjs` takes the matching
Linux payload. The Windows payload must include the pinned
[WiX Util notice](../packaging/standalone/notices/README.md). Use a short build
path for WiX native CAB tooling. Neither tool installs the produced package.

The [pinned-assembly/hosted gate](ITERATION_446.md) uses clean Windows and Linux CI
machines for actual service installation and removal. Named Windows Server 2025
and Ubuntu 24.04 jobs pass identity/native TLS/crash recovery/reinstall/uninstall;
the evidence records their exact commits and remaining matrix/profile gates.
The workflow has no publication permission. These results do not accept Astra/
RED OS service installation, newer-version upgrade or a 0.2.5 release.

`scripts/build-standalone-rpm.mjs` uses the same Linux staging contract and
creates an actual gzip RPM with protected config(noreplace). Header and complete
extracted-byte verification pass; installed RED OS/systemd remains separate.
[Distribution license references](../packaging/standalone/THIRD_PARTY.md) point to
the shipped Node, npm and native inventories rather than assigning one license
to every bundled component.

## Portable launchers in development

`scripts/build-standalone-portable.mjs <payload-directory>` creates Windows ZIP
or Linux TGZ with a versioned root and a complete regular-file inventory.
The payload must already contain its matching private Node, service and native
runtime; building is separate from installing. The archive includes usage,
public default-deny configuration and component license inventories.

After extraction, Windows uses `./start.ps1`; Linux uses `./start.sh` as an
ordinary user. Optional configuration/runtime paths must be absolute. Launchers
create a private runtime when absent and refuse foreign/permissive existing
directories rather than changing their permissions. No system service is
registered by these portable commands. Stop before replacing the extracted
program; keep public configuration outside it when it must survive replacement.

Actual relocated Windows ZIP and Linux TGZ/private-Node/native-TLS shutdown pass;
Linux runs as UID 1000. Neither format is a released 0.2.5 artifact.
[Iteration 447](ITERATION_447.md) records this boundary and retained failure
evidence. MSI/DEB/RPM provide the separately tested OS-service lifecycle.

## Automatic acceptance and retained configuration

The standalone workflow builds pinned public payloads and runs portable
relocation/native shutdown plus actual installed-service checks on fresh
Windows/Ubuntu runners. The same installed fixture has explicit owned-lab modes
for Astra 1.7.5 and RED OS 7.3; both prototype service profiles pass. It refuses
ordinary developer execution, a different OS, or a pre-existing program/service
in owned-lab mode. A repeated owned-lab run may reuse only the exact retained
public default with root ownership, protected modes and no additional files;
deployment configuration is refused. Tests cover identity/JWT, native TLS, crash
recovery, running reinstall, retained public config and uninstall. The RED OS
case also checks that reinstall preserves an administrator-stopped service.
The repeatable `tests/packaging/standalone-rdp.mjs` driver additionally passes
eight actual desktop profiles through Windows portable and installed Astra/RED OS
services with H.264/JPEG, resize, reattachment and joined cleanup;
[iteration 448](ITERATION_448.md). It runs from Windows with Edge and the explicit
owned-lab inputs; it is not part of a credential-free hosted job. Its Linux
backend requires an already pinned SSH key and an exact package path/hash.
The pure sudo-control tests run in hosted acceptance without SSH or credentials.
Devices, newer-version upgrade and final aligned 0.2.5 remain separate gates.

The installed fixture also supports a `previous` package record in its build
receipt: an earlier `0.2.x` version, exact package path and SHA-256. This path
is prepared for testing an upgrade with an old live native worker, preserved
public config, new service PID and unavailable old session. It additionally
checks the installed service/native version and private Node after replacement.
Baseline Astra/RED OS runs pass with these checks; the actual two-version path
is still pending aligned 0.2.5 artifacts, [iteration 450](ITERATION_450.md).

DEB/MSI uninstall retain the public `bridge.json` configuration. RPM moves a
modified config to `bridge.json.rpmsave`; administrators should review and restore
that public configuration when reinstalling. RPM running upgrades use try-restart:
a running service restarts, while an intentionally stopped service stays stopped.
The package retains its non-login service account. These behaviors are checked
explicitly rather than assuming identical installer semantics across OSes.

Ordinary `pnpm check` verifies workspace versions, package README presence, build,
lint, formatting and source regression. It does not run every installer/RDP
profile: packaging checks need their explicit artifact inputs and installed
checks need fresh CI or the selected owned lab. In iteration 447 the full local
suite takes about 12 minutes on Windows and 4.5 minutes on Linux; platform jobs
can run in parallel. Native dependency rebuilds and real RDP/device profiles
have their own cost. A green unit suite alone does not accept those profiles.

For release preparation, `build-standalone-payload.mjs` also accepts
`--candidate-archives <directory>`. All five local core/runtime tarballs must
match the production lock's SHA-512 and exact package metadata; npm ci then runs
offline from an isolated seeded cache. The lock keeps official registry URLs.
After publication, verify public integrity and a fresh registry-only payload;
candidate mode alone does not prove publication. Actual Windows/Linux payloads
match byte for byte in [iteration 449](ITERATION_449.md).

If the developer's build network requires a local public CA, optional
`--build-ca <public-CA-file>` scopes it to npm build children. It changes no
system trust and packages no CA into the service. The input must be one regular,
bounded public CA certificate. Do not disable TLS verification or supply a
private key here.

Before initial npm publication, CI can optionally consume exact candidate
archives from an explicitly named draft prerelease. The temporary public
`packaging/standalone/candidate-release.json` contains only schema/version/tag/
source commit, never credentials. The annotated source tag, unchanged application
inputs, archive sizes/SHA-256 and production-lock SHA-512 are checked before
assembly. A separate download step receives the repository token; npm and
packagers do not. See [iteration 452](ITERATION_452.md).

These receipts/manifests are marked `candidateOnly`; neither the main/master
plan nor the final publisher accepts them for publication. Remove the pointer
and rebuild from verified public registry inputs for final delivery. Candidate
CI transport and upgrade acceptance require their own actual run; unit tests
alone do not prove that profile.

## Required distribution acceptance

The actual candidate CI attempt shows that a read-only token cannot see a
private draft. The final transport uses a separate **public prerelease** marked
as an unstable installer candidate. The build job keeps contents-read and its
candidate step receives no token. A stable release cannot serve as candidate
input. Source/hash checks and candidate publication refusal still apply;
[recorded correction](ITERATION_453.md). This supersedes the private-draft
transport preparation described above.

The prepared [standalone release workflow](../.github/workflows/standalone-release.yml)
builds both platform sets, verifies portable and installed-service lifecycle,
and appends installers/source companions to an existing core Release on pushes
to main/master. First publish the accepted matching core npm archives through
the separate OIDC workflow, then advance public main. All six core package
integrities must match the committed standalone locks. Feature-branch validation
never publishes. Actual pipeline execution/publication remains an acceptance
gate; [iteration 451](ITERATION_451.md).

After a complete installer release, further pushes with the same product version
verify its manifest/server digests and skip rebuilding those immutable assets.
Use a new aligned version for changed release bytes. A failed upload must resume
the original publish job with its retained artifacts; a fresh build refuses a
partial previous upload. No tag movement, clobber or automatic uncertain retry
is performed. Hosted Windows/Ubuntu checks do not replace the named Astra/RED OS
or actual RDP profiles.

Portable Windows ZIP/Linux TGZ, Windows service/MSI, Astra DEB and RED OS RPM
must each prove install, launch without system Node/FreeRDP, authenticated native
lifecycle, shutdown/worker cleanup, upgrade/recovery and uninstall. Compiler
results alone do not accept an installed OS or its security/device profile.
No macOS, ARM or musl acceptance is claimed.

Installers belong in Releases of **SensNyaha/freerdp-browser-bridge**. The
requested workflow must generate them on pushes to main/master, publishing
only verified assets and preserving existing version tags and release bytes.
No separate standalone repository is to be created. Final project-owned
artifact cleanup and documentation consolidation follow these delivery gates.
