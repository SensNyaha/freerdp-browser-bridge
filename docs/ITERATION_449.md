# Iteration 449 — standalone payload acceptance before npm publication

The service stays on `feature/standalone-installers-0.2.5`; these verification
inputs are the accepted **0.2.4** archives, not a published 0.2.5 release.

`build-standalone-payload.mjs` accepts optional `--candidate-archives <directory>`.
It verifies the five required core/runtime archives against the production
lock's exact SHA-512 and dependency/platform metadata. Missing, changed or
foreign archives fail. Other dependencies retain their exact public registry
URLs and integrity. Cache seeding uses batches of eight; final npm ci runs
**offline** against the unchanged lock. No URL substitution or repacking is used.

Candidate installers can therefore be tested before npm publication. Final
delivery must still verify public registry integrity and a fresh registry-only
payload. Candidate mode alone does not prove public availability.

## Independent actual builds

Empty isolated candidate and separate registry-only caches produce identical
complete regular-file inventories on both platforms:

| Platform | Files | Production lock SHA-256 | Match |
| --- | --- | --- | --- |
| Windows x64 | 4100 | a91513437fc27f4330bb892d84298d245a4822d5466345cf32281ab555694881 | all bytes identical |
| Linux x64/glibc | 4208 | cf780d8c63a0114fbc807fceb99adbcb8008a95198aeab67e4e85c9a9db95aaf | all bytes identical |

Windows candidate/registry directories are `build/standalone-payload-7J6qtt` and
`build/standalone-payload-JBEfHZ`. Linux equivalents are
`/work/source/build/standalone-payload-HvlyUw` and `standalone-payload-wAxaTQ`
in owned container `freerdp-bridge-payload-449`. Receipts:
`build/iteration-449-candidate-{win32,linux}.json`. Linux omits npm executable
links by the existing rule. These comparisons concern payload bytes, not
reproducible installer archive metadata or installed OS acceptance.

Candidate-cache and existing production-lock guards pass **4/4**: both platforms,
unchanged locks, metadata/version/dependency/engine/CPU drift, changed bytes and
a missing required archive. Actual builds read real tarball manifests.

## Build-only TLS environment

The viewer image lacks tar on PATH, so the first setup does not build a payload.
A separate pinned GCC-image container with dropped capabilities and
no-new-privileges supplies tar/xz. Initial Node extraction attempts to restore
archive owners; `--no-same-owner` corrects the setup without adding capabilities.
No product assertion or production privilege is weakened.

The local HTTPS proxy's public CA is absent from that image. Automatic approval
review rejects adding it to system trust as a persistent trust expansion; the
rejected command does not execute. Optional `--build-ca <file>` instead validates
one bounded public CA certificate and passes it only to npm children through
NODE_EXTRA_CA_CERTS. TLS verification stays enabled. System trust is unchanged;
the CA is absent from payload/config/launcher. Build reports record its public
SHA-256. Both actual Linux builds pass with this scoped option.

Complete pnpm check passes **Windows 990 / 63 skips** and **Linux 965 / 90**,
zero failures and actual child exit zero. Logs/receipts:
`build/iteration-449-check-{win32,linux}-final.{log,json}`. Windows takes 621
seconds, Linux 245 seconds in this environment. Native source is untouched;
previous CTest results remain separately scoped. The aligned 0.2.5 worker will
require fresh native checks. Changed JavaScript also passes ESLint/Prettier.

A public-only historical registry read confirms that 0.2.3 still has both native
runtimes public and seven JS names absent. Receipt:
`build/iteration-449-historical-023-public.json`. It starts no stage/publish/
approve, and the user's stopped manual queue remains stopped. This status is
separate from the complete public 0.2.4 delivery.
