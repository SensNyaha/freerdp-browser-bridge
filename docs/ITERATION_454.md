# Iteration 454 — aligned standalone upgrade and actual desktop acceptance

Version **0.2.5** remains a candidate on release/0.2.5. Stable tag/public npm
publication and final main/master installer delivery are not accepted yet.

## Actual artifacts and named OS upgrades

The new candidate payloads use exactly the 0.2.5 JS/native archives and unchanged
external graph from iteration 453. No old worker is relabelled. Public build
inputs/receipts are below `build/standalone-payload-ccelo6` on Windows and
`/work/source/build/standalone-payload-KoqxL2` in the owned Linux builder.

| Artifact | SHA-256 |
| --- | --- |
| Windows portable ZIP | 1240211141eca005bee42d35ffcb13335548b9dc5029ca019db2356f1f05d5b6 |
| Linux portable TGZ | 1fe60c7f8d376c0c75c59e165f47417e4b5a0f1c417aca7aa781ab41a1ac9a4f |
| Astra DEB | e3d9f615278caab43ae41e39dbc0e8196245f073419ccb51b93bbdb37e19d484 |
| RED OS RPM | 16c067c1c6c31933f98cf7d9af61a1e82e8f016f291121f723367d833f3bdb8e |

Independent DEB and RPM metadata/full-extraction checks pass 1/1 each. Actual
installed **Astra 1.7.5** and **RED OS 7.3** upgrades from the exact accepted
prototype 0.2.4 packages to these 0.2.5 packages pass, child exit zero. They prove
old live certificate-pending worker retirement, new service PID and actual
native version, preserved public config, old-session 404, empty runtime,
non-root identity, JWT/native TLS, crash recovery, reinstall and uninstall.
RED OS additionally preserves an administrator-stopped service during reinstall
and retains modified config as rpmsave. Default public configuration is restored.
Receipts/logs: `build/iteration-454-{astra,redos}-installed.{json,log}`. Private
SSH identity and sudo input remain pinned/private as before; no new secrets
are written to test inputs, artifacts or output.

## Real desktops and portable verification

All eight actual 0.2.5 profiles pass: Windows portable → Astra/RED OS and the
installed Astra/RED OS service → its RDP host, each with H.264 and JPEG. All
render 1280×720 then 1920×1080, reattach with fresh channel grants, report zero
browser errors and clean up every session/connection/runtime. Evidence:
`build/standalone-rdp-{win32,linux}-{astra,redos}-{h264,jpeg}.json`. This does not
newly accept audio quality, clipboard, input/device or a different RDP profile.

Windows portable independent inventory/relocation/native-TLS/private-runtime/
shutdown/permission-preservation test passes 1/1. Initial Linux portable test
in the isolated builder fails because its test-only JWT signer imports jose
from absent checkout dependencies. It now resolves jose from the extracted
service itself and repeats successfully **1/1 as UID 1000**, without workspace
node_modules or SDK loader paths. No product behavior/assertion is removed.

## External consumers and full regression

Exact-archive Express/HTTP/NestJS external consumers pass on Windows and Linux,
including strict TS, same-port HTTP/HTTPS/WS/native TLS, lifecycle and reinstall
matrices. Fastify external npm checks also pass on both platforms with the exact
runtime, but its helper repacks JS from source; this result does not yet prove
the exact accepted Fastify JS archive. The first Linux Fastify setup lacks
workspace links needed by pnpm pack; an offline/frozen install reuses all 261
cached dependencies, then the check passes. This is fixture preparation, not a
product failure. Logs: `build/iteration-453-<adapter>-consumer-<platform>.log`.

After the deterministic deadline-fixture correction, full Linux check passes
**977 / 90 skips / zero failures**, child exit zero, 238 seconds. Receipt/log:
`build/iteration-454-check-linux-final.{json,log}`. First aligned Windows full
check passes **1002 / 63 / zero failures**, 617 seconds; its following complete
repeat is still running here. Fresh linked native CTest remains MSVC36/GCC8.3
37 from iteration 453; no compiler result substitutes for the named OS checks.

## Actual candidate CI and observer correction

The public unstable candidate prerelease is **422280431** with unchanged six
archives, `prerelease: true`, not latest; public latest is independently still
`v0.2.4`. Candidate CI **40020498627** downloads without a token and its Ubuntu
job **120643595159** passes the actual two-version upgrade and full packaging
matrix. Windows builds candidate and previous-version installers, then its
supervisor test fails when cold PowerShell/CIM process inventory exceeds its
ten-second deadline. All other eight supervisor cases pass; logs are retained
as `build/iteration-446-job-120643594984.log`. The Windows upgrade step is not
reached, so no successful Windows upgrade is claimed from that run.

A test-only `bridge-process-inventory.exe` now uses Toolhelp, with RAII snapshot
ownership, bounded enumeration/output and only PID/parent/name for three fixed
process names. No command lines/environment/paths are read. It is built under
C++20 /W4 /WX, not copied into the production payload. All **9/9** actual local
supervisor/process-tree/foreign-data tests pass using it, without extending the
test timeout. The service-host binary hash remains exactly unchanged at
161c7dd74f8c3b262bcb55bb162eccd2b121e5b6140b1e020d84cbe017fba7bf.
Changed JS passes lint/format. Corrected hosted Windows upgrade/cross-job
verification, final registry-only publication and stable installer delivery
remain open gates.

## Final exact-consumer and full-check repeats

The following full Windows repeat completes successfully: **1002 / 63 skips /
zero fail**, child exit zero, 619 seconds. Together with Linux **977 / 90**,
both final logs/receipts are `build/iteration-454-check-{win32,linux}-final.*`.
These complete source checks precede only the subsequent explicit packaging
observer/dependency fixture and Fastify consumer-helper changes; their narrow
actual runtime checks remain separately recorded.

Fastify's helper now accepts `--npm --archives <accepted-directory>`, verifies
each real archive's metadata and reuses exact JS/runtime bytes. The first Windows
attempt times out during npm install; its previous helper inherits account
registry configuration and default network retries. The final recipe uses
empty user/global config, explicit official registry URLs, system CA validation
and bounded fetch/retries. Both Windows and Linux exact-archive consumers pass
strict TS, native build/TLS, same-port HTTP/WS isolation, binary media and cleanup.
Receipts are `build/fastify-consumer-K7jMEw/receipt.json` (Windows) and
`/work/build/release-453-consumers/build/fastify-consumer-jNCPn1/receipt.json`
(owned Linux viewer container). Every reported SHA-256 matches the accepted
0.2.5 audit; this supersedes the earlier repacked-JS limitation for those final
two runs. Changed helper passes lint/format; no archive is repacked or changed.
All four adapters now have exact 0.2.5 external consumers on both platforms.
