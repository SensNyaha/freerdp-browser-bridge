# Iteration 455 — aligned 0.2.5 local release acceptance

2026-10-24, release/0.2.5, after standalone candidate and exact-library checks.
All local release gates below pass. This accepts the immutable v0.2.5 source
snapshot and ten exact npm archives; public npm/GitHub/main installer publication
remains separate. Existing stable tags and archive bytes stay immutable.

## Verified local and candidate gates

Final hosted source matrix **40022937678** at `65bf758` succeeds on Windows,
both Ubuntu compiler profiles and sanitizers/all fuzz targets. Separate GCC 8.3
foundation **40022937667** succeeds. Their source/native/library inputs are
unchanged by subsequent documentation and clean-verifier corrections; the
latter have their own two unit cases and successful full clean offline run.
Receipt: `build/iteration-455-source-ci.json`.

| Check | Windows x64 | Linux x64/glibc |
| --- | --- | --- |
| Full linked pnpm check | 1002 pass / 63 skips / zero fail | 977 / 90 / zero fail |
| Fresh clean linked worker | MSVC 19.44, CTest 36/36 | exact GCC 8.3.0, CTest 37/37 |
| Exact Express/HTTP/NestJS consumers | strict TS, installed native TLS and full matrices pass | same |
| Exact Fastify consumer | strict TS, native TLS, same-port/media/lifecycle pass | same |
| Portable extraction/inventory/private Node/native TLS/cleanup | ZIP passes | TGZ passes as UID 1000 |
| Actual installed-service version upgrade | MSI 0.2.4→0.2.5 in Windows Server 2025 CI passes | Ubuntu 24.04 DEB, actual Astra 1.7.5 DEB and RED OS 7.3 RPM upgrades pass |
| Source companion and combined artifact verification | three files | four files; combined set seven, source-bound |
| Clean offline source/deploy | strict exact installed consumers | nine workspaces, 28 declared outputs, production API deploy/import and unchanged lock pass |

New clean native source hash on both platforms:
`ef00d6a207dd2ee3b36cc2b4bc7e84159ffe962f05f472570bf81d777d9df085`.
Fresh fixtures are `build/native-clean-ROjNo4` and
`/work/build/native-clean-8Vmc9G`. FreeRDP 3.32.1 remains pinned to
`bf217a504e54cc719880c228e82353382cd7d4fa`; the previously rebuilt SDK/dependency
receipts are reused explicit inputs, not new dependency rebuild claims.
All ten new archive versions match the native product version.

All **eight actual standalone 0.2.5 RDP profiles** pass: Windows portable to
Astra/RED OS and each installed named Linux service to its lab, H.264/JPEG,
1280×720/1920×1080 resize, fresh-grant reattachment, zero browser errors and
joined empty-runtime cleanup. Audio quality, clipboard and device acceptance
retain their separately documented common-core profiles; no new channel/device
profile is inferred from these desktop tests. JWT owner isolation, target
allowlists, strict certificate defaults and memory/private-IPC credentials
remain enforced. Provisioning/sharing/recording/desktop GUI are not introduced.

Installed upgrade checks retire an old live certificate-pending worker, confirm
new PID/native version and old-session 404, preserve public config, recover from
a crash and verify reinstall/uninstall. RED OS additionally preserves the
stopped-service state and standard rpmsave behavior. Prototype 0.2.4 is an exact
test seed, not a previously public standalone release. Compiler/foundation,
actual installed OS and actual RDP evidence remain distinct.

Candidate pipeline **40022102839** at `1f5a8ac` completes Windows/Ubuntu and
seven-file cross-job verification; publication is intentionally skipped. The
temporary candidate pointer is removed from final source so production assembly
must use matching public npm integrities. The separate unstable prerelease
remains explicitly candidate-only and never becomes stable latest.

## Exact library archives and publication boundary

`build/release-453-archives` contains the exact ten accepted candidate npm
archives. Bounded audit verifies metadata, intended SensNyaha repository,
root README/licenses/native notices/source companions, exact product
dependencies and absence of known authorized lab-secret sentinels. Official
npm publish --dry-run matches each SHA-512. Actual exact consumers pass on both
OSes without checkout imports. No accepted archive is repacked for delivery.

The production locks name official registry URLs and these exact SHA-512 values.
Core npm publication must precede adapter publication, HTTP before Express.
Prepare the exported public core release branch/tag first; advance its public
main only after core OIDC publication is verified. That main push then runs the
registry-only installer workflow. This preserves the public main ancestry and
existing tags without forcing the original workspace's history over it.

Remaining publication gates: real OIDC writes and public exact integrity for
all ten names, fresh registry-only consumers, automatic main/master installer
publication and public asset read-back/verification. Candidate acceptance does
not prove those gates. Historical 0.2.3 pending JS publication is still separate;
the user's stopped manual approval queue must not be restarted automatically.

Failure history and detailed receipts remain in
[iteration 453](ITERATION_453.md) and [iteration 454](ITERATION_454.md). Full
logs/receipts are `build/iteration-454-check-{win32,linux}-final.*`; archive audit
and official dry-run are `build/release-453-{artifact-audit,npm-dry-run}.json`.
Named service/upgrade evidence is `build/iteration-454-{astra,redos}-installed.*`;
real RDP receipts are `build/standalone-rdp-<platform>-<lab>-<codec>.json`.

The first additional clean-source check in `build/node-clean-Rr5UjS` compiles
successfully but its old verifier assumes every workspace emits dist/index.js.
Standalone correctly emits dist/main.js. The verifier now checks all declared
exports/declarations/fixed Node CLI entry points, refusing missing/unsafe output
contracts rather than skipping a workspace. Two unit tests pass and the actual
full clean repeat in `/work/build/node-clean-YOW8lB` passes all nine workspaces,
28 outputs, offline production deployment/import and unchanged frozen lock.
These are verification-tool changes; accepted library archive bytes are unchanged.

## Accepted archive SHA-256

| Package | Bytes | SHA-256 |
| --- | --- | --- |
| `@freerdp-bridge/api@0.2.5` | 99564 | `9aef7491f4f16ba9d23b6ad69a9eba6445417ecd8d1c1953a4dcd610544331fa` |
| `@freerdp-bridge/config@0.2.5` | 9343 | `08635694841fcb409b294db17e81849ceda5764bae313d64555329b38c313c03` |
| `@freerdp-bridge/express@0.2.5` | 4988 | `3b07082a9e648bc635d880ff1f094f5aae31e14c1d440ee00e1aadd1a204cd43` |
| `@freerdp-bridge/fastify@0.2.5` | 3582 | `f398b4adc1a4973bde08a1039f33f0dbad3f298b9f56f3a15e3b56d8c8ae7c29` |
| `@freerdp-bridge/http@0.2.5` | 7527 | `adaffec4dc1abf0a4155cecc072dbfcdf588ab87e8c6732f8b1d97df1f5d3797` |
| `@freerdp-bridge/nestjs@0.2.5` | 8213 | `6f0c1ed398f0f4fa4c3e0aff807a23ac80aaa567145bd94deb39a8a10f292765` |
| `@freerdp-bridge/node@0.2.5` | 110717 | `c4f2130c8da9e6dce45da2071760023629e41e3c4b6f6d75482e8d65e15075ae` |
| `@freerdp-bridge/protocol@0.2.5` | 38903 | `8a6f82d0ca724d7a368797e1213aceeb0b91f5c7b39aa105c81532eef7fb7606` |
| `@freerdp-bridge/runtime-linux-x64-gnu@0.2.5` | 76474581 | `a717e6e2647eb2cd38807cd19fbc8c96b0eeee8db9054e3ff93348af2a77963a` |
| `@freerdp-bridge/runtime-win32-x64@0.2.5` | 6902264 | `cc9515469501f9911aa9bbf44e561f8512b05c724a6a448bdb4d0204dc655394` |
