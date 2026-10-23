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

## Required distribution acceptance

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
