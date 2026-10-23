# Standalone service and installers

Development for the next distribution, **0.2.5**, starts in
`feature/standalone-installers-0.2.5`. Product manifests remain 0.2.4 until the
aligned release preparation. The currently public npm/GitHub plugin delivery
is [0.2.4](ITERATION_441.md). Installers, their hosted workflow and clean-machine
acceptance are not complete yet.

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
