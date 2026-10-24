# Iteration 438 — aligned 0.2.4 local release acceptance

2026-10-23, `release/0.2.4`, after Express feature `3c13ff6` and alignment
`325ef0e`. Native/package metadata checkpoint `94ea13a` binds GitHub delivery
to the user's final owner **SensNyaha**; npm remains **@freerdp-bridge**.
Accepted public 0.2.2 publication `6eb8ab7` is merged in `f710298`.

All local 0.2.4 release gates below pass. This accepts immutable tag `v0.2.4`
and the ten exact local archives, not npm 0.2.4 or hosted GitHub/OIDC execution.
The user stops manual per-package approvals; none are restarted for 0.2.4.
Separate local delivery repositories, actual trusted publisher configuration,
public npm integrity/registry-only consumers and standalone installers remain
in the active goal.

## Final checks

| Check | Windows x64 | Linux x64 |
| --- | --- | --- |
| Full linked pnpm check | 951 pass / 61 skips / 0 fail | 928 pass / 87 skips / 0 fail |
| Fresh native clean linked build | MSVC 19.44; CTest 36/36 | exact GCC 8.3.0; CTest 37/37 |
| Native lifecycle matrix | 27 pass / 1 skip | 40/40 |
| Exact Express installed graph | strict TS; 11/11 | strict TS; 11/11 |
| Exact HTTP installed graph | strict TS; 10/10 | strict TS; 10/10 |
| Exact NestJS installed graph | strict TS; 15/15 | strict TS; 15/15 |
| Exact Fastify installed graph | strict TS; native TLS/HTTP/WS pass | same |
| Uninstall/missing import/reinstall all four adapters | pass; entire matrices repeat | pass; entire matrices repeat |
| Clean offline source build | strict workspace build | eight discovered packages; production deploy/import; unchanged lockfile |

Fresh native source hash on both platforms:
`fa47e50649c1cecea7d4f5fdc68b469257a3776c499a6efe46f97aa28ac11274`.
Windows fixture `build/native-clean-YQk1rT`; Linux fixture
`/work/build/native-clean-VAVyx5`. Original pinned FreeRDP 3.32.1 commit
`bf217a504e54cc719880c228e82353382cd7d4fa` and previously rebuilt SDK/dependency
receipts are unchanged. Node is 24.21.0, pnpm 10.11.0; warnings-as-errors/native
compiler checks remain in force. This does not replace installed-Astra/compiler
or mandatory RED OS/GCC 11 acceptance with a foundation/other-host result.

## Exact installed consumers and actual desktop

Windows: Express `build/express-consumer-JWPoWp`, HTTP
`build/http-consumer-KDxH6R`, NestJS `build/nestjs-consumer-jm6bQo`, Fastify
`build/fastify-release436-APFn9v`. Linux under the owned viewer project's
`/work/build/nestjs-427-check/`: Express `build/express-consumer-vryGV1`, HTTP
`build/http-consumer-oBqBuj`, NestJS `build/nestjs-consumer-4Tsjoz`, Fastify
`build/fastify-release436-xdNzx2`. Each uses exact archives, no checkout imports,
strict declarations without skipLibCheck, installed browser assets and a real
linked runtime. These are local archive consumers, not registry-only claims.

All **eight versioned Express 0.2.4 actual RDP profiles** pass: Astra Linux
1.7.5 and RED OS 7.3 targets × automatic/manual upgrades × H.264/JPEG. Checks
include nonuniform 1920×1080 output, confirmed 1280×720 resize and 1920×1080
restoration, fresh-token reattach, host HTTP, one-session/two-socket diagnostics,
native PID/runtime and host cleanup. H.264 exercises the reference session form.
No RDP device support is inferred from desktop/fake-media/TLS success.
Credentials stay in the authorized ignored lab/private IPC path; logs, argv,
env, archives and source commits contain none of them.

Evidence under `build/`:

- `iteration-436-{windows,linux}-check.log`;
- `iteration-436-{windows,linux}-native.log` and parsed `release-436-native-{win32,linux}.json`;
- `iteration-436-express-exact-{win32,linux}.log`;
- `iteration-436-{http,nestjs,fastify}-exact-{win32,linux}.log`;
- `iteration-436-{http,nestjs,express}-reinstall-{win32,linux}.log`;
- `iteration-436-consumer-regressions-{win32,linux}.log`;
- `iteration-436-clean-node-linux.log`;
- `iteration-436-express-rdp-matrix.log` and eight `iteration-436-{astra,redos}-express-{automatic,manual}-{h264,jpeg}.log`.

## Artifact and metadata acceptance

`build/release-436-archives/` contains eight JS packages and both native
runtimes. All ten pass bounded tar/parser/packlist checks, root README,
license/notices/source companions, public exact dependency versions, absence
of known lab-secret sentinels and exact intended repository URL. Official npm
dry-run SHA-512 matches each accepted archive; no upload or approval occurs.
Final native candidates: Windows `build/npm-native-win32-4aYYSw`, Linux
`/work/build/npm-native-linux-CckSNy`.

Repository binding is prepared for `SensNyaha/freerdp-browser-bridge` (shared
JS/native) and `SensNyaha/freerdp-bridge-{fastify,nestjs,http,express}` (adapters).
Remote repositories/workflows/trust are not claimed created. Earlier drafts
using the initially supplied owner are superseded before acceptance and never
published. URL-only metadata corrections do not change native source/wire;
final exact archive/consumer checks verify the corrected candidates.

Digest/audit evidence: `release-436-artifact-audit.json`,
`release-436-npm-dry-run.json`, `iteration-436-artifact-audit.log`,
`iteration-436-npm-dry-run.log`. Accepted bytes must not be repacked or replaced
for later publication. Original setup/parser failures and preceding feature
evidence remain in [iteration 436](history/iterations/401-450.md#iteration-436) and
[iteration 435](history/iterations/401-450.md#iteration-435); no assertion, timeout or certificate policy
is relaxed.

Original full V1 scope is preserved. [Framework selection](FRAMEWORK_SELECTION.md)
records why Koa/Hono/Next-specific adapters are not accepted without a concrete
unmet requirement and their own installed/RDP evidence. [OIDC plan](NPM_TRUSTED_PUBLISHING.md)
records the user's publication direction and remaining external gates.

## Accepted archive SHA-256

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| `@freerdp-bridge/api@0.2.4` | 99565 | `793a86f42159d75c5f26541972e7e12e269e51777925240af6329b5c5d9bb5fc` |
| `@freerdp-bridge/config@0.2.4` | 9343 | `9cb8b3c61f9b60567eee3e18961161407c259b95f6786f778f8e386928834399` |
| `@freerdp-bridge/express@0.2.4` | 4988 | `07890806943fd92a923aeb7a95f4256bb8fd02b36637ef0390c34c56bc8c6b27` |
| `@freerdp-bridge/fastify@0.2.4` | 3585 | `268929ee8f8619aa14f06625d7f9ae4f41aed84b899b5b8723a6d560cc6de705` |
| `@freerdp-bridge/http@0.2.4` | 7528 | `51665ce50fb1f1d0af465f31d029b31e420a61d66242b7f0eb46d8c670fd2d88` |
| `@freerdp-bridge/nestjs@0.2.4` | 8213 | `644a023d3300b86962c47f45c0e3dd005a8d3073a1f1943a11e45172ea8b9da6` |
| `@freerdp-bridge/node@0.2.4` | 110718 | `0956df7a8ae5d697cf6f9067a1752a0777871680d9edfb387074ed533614daf4` |
| `@freerdp-bridge/protocol@0.2.4` | 38903 | `0a589c72f4c1221af9df6f3824fb790fc0cfee64dcd95bd816797f2eec0229ba` |
| `@freerdp-bridge/runtime-linux-x64-gnu@0.2.4` | 76474575 | `a6fae0dc8b96d27e9d99b891cd4187e8fe448afd7c2133ab96ecdb3d660dc9f7` |
| `@freerdp-bridge/runtime-win32-x64@0.2.4` | 6902262 | `5fa4c8b8693ddf404634542dd034e6b66b9eb5415257763884e9281f42e247de` |
