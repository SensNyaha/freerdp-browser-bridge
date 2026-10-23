# Iteration 442 — bounded standalone service foundation

2026-10-23, `feature/standalone-installers-0.2.5`, after shared master
`2a89210` accepts the completed [0.2.4 public delivery](ITERATION_441.md).
The new private workspace remains at product version 0.2.4 during development;
aligned 0.2.5 release preparation, installers and hosted publication are later
gates. No accepted npm archive or historical tag changes.

## Implemented scope

`apps/standalone` is a private TypeScript workspace, not another public npm
package. It assembles the existing Fastify/API lifecycle under `/rdp`, with
one separate native FreeRDP worker per session. Configuration is a regular
file capped at 64 KiB, strictly validated without unknown properties, private
signing keys, symmetric secrets or session credentials. Listener, Origins,
destinations, global/per-principal limits and public RSA verification keys are
bounded. Default identity/destination configuration denies sessions.

Pinned jose **6.2.13**, from official registry integrity
`sha512-7TIg10ZE1x82YediN+lcrPNvGMKge9yFHQD+Qho/b8y2adfugU3AsvvHfxV0fzyFllT6l9xCjf4RWY9g/Z9PJQ==`,
verifies RS256 against local public keys, issuer/audience, required subject,
issued-at/expiry, maximum token age, token type and rdp:connect scope. Cookie
headers are refused. Authorization size and concurrent verification are capped;
there is no remote key fetch or verification queue. Exact destination policy
refuses alternate gateway/proxy routes in this initial standalone profile.
The existing adapter policy and unfinished V1 requirements remain preserved.

The CLI takes only absolute public-config/runtime paths, resolves a matching
native package and joins shutdown on signals. Startup failures use a fixed
public code. Production/native wire code is unchanged. [Contract and deployment
configuration](STANDALONE.md), [default public example](../packaging/standalone/bridge.example.json).

## Verification

Five unit tests cover valid/malformed/expired/mis-scoped/wrong-key JWTs,
required claims, HMAC confusion refusal, ignored untrusted key URLs, cookies,
16-flight admission, config bounds/secrets/private keys, immutable snapshots,
bounded file reads and exact destination policy. All signing private keys and
tokens are ephemeral synthetic in-memory fixtures.

The standalone integration verifies authentication refusal, destination policy,
no secret echo, ownership isolation, an actual linked worker's strict TLS
rejection with zero application bytes, and an empty runtime after joined close.
The unlinked foundation case is separately named and capability gated; no fake
worker result is described as desktop/device integration.

| Complete pnpm check | Pass | Skip | Fail |
| --- | --- | --- | --- |
| Windows x64 / accepted linked worker | 976 | 63 | 0 |
| Linux x64 / accepted GCC 8.3 linked worker | 953 | 89 | 0 |

Both checks include version/readme guards, workspace build, lint, formatting
and the complete Node test suite. Final child exit status is zero. Logs:
`build/iteration-442-check-win32-final.log` and
`build/iteration-442-check-linux-final.log`; scalar receipts append `.json`.
Focused standalone checks also pass 7/1 skip on Windows. Existing native binary
acceptance is reused because this block changes no C++ or foundation build code.
This does not accept a new installed OS/service/installer profile.

Linux uses a fresh source-only checkout `/work/build/standalone-442`, frozen
offline pnpm install and the accepted linked worker. Only the new public jose
tarball and its official pnpm registry index are added to the existing offline
store. No account configuration, lab credential or private key is copied.

Failed harness attempts remain recorded: the first Windows full check has an
insufficient ten-minute limit (the accepted prior suite already exceeds it);
it is stopped before completion and is not counted as pass. The initial Linux
checkout lacks the root build output directory, causing eleven ENOENT fixture
failures. Creating that directory and using a twenty-minute bounded runner
produces the complete green results above. No product requirement or failing
assertion is removed. Initial Windows unit-loader URL handling is corrected
with pathToFileURL before the passing focused/full runs.

## Following gates

The first private-Node Windows assembly prototype uses public 0.2.4 production
dependencies; it is not accepted as an installer or 0.2.5 release. Portable
relocation, private-Node CLI/browser use, Windows service/MSI, DEB/RPM, upgrade/
uninstall, actual OS/RDP profiles and the main/master auto-release workflow
still require implementation and acceptance. Final artifact cleanup and
documentation consolidation follow them. Historical 0.2.3 pending stages are
unchanged; their manual queue remains stopped.
