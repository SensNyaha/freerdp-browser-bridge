# Linux API and native runtime image

The image assembles the verified Linux amd64 native TGZ and production Node
package onto pinned Node 24 Bookworm slim. The final `runtime` target contains
compiled JS, production dependencies, private worker/libraries, licenses and
metadata. No SDK, TypeScript source, devDependencies, lab files or test identity
fixture enters that target.

After the Linux bundle and frozen pnpm installation pass, run from the root:

```sh
node scripts/package-node-runtime.mjs
node scripts/prepare-service-runtime.mjs
docker build --target runtime -t freerdp-bridge-service build/service-runtime
```

The Node packager builds workspaces in dependency order and runs offline
`pnpm deploy --prod` from the installed store. Workspace injection and post-build
synchronization are explicit; `files: [dist]` limits deployed workspace content.
Registry versions/integrities are unchanged. See the [pnpm deployment contract](https://pnpm.io/10.x/cli/deploy).

`node scripts/test-node-clean-build.mjs` separately verifies a fresh source-only
workspace, frozen offline install, build and production deployment/import with
an unchanged lockfile. It requires the build packages in pnpm's cache and leaves
its generated fixture under build. [Evidence](ITERATION_213.md).

Context preparation copies only two bounded project-local archives, Dockerfile
and a separate probe into a whitelist context. Two explicit alternate archive
paths below the build directory can be supplied when exporting Linux artifacts.
The image has assembly/runtime stages; source/native builds and frozen Node
installation remain upstream pipeline steps, separate from fresh-checkout/distro
acceptance.

```sh
docker run --rm --init --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /run/freerdp-bridge:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=700 \
  -p 127.0.0.1:8080:8080 freerdp-bridge-service
```

The image uses UID1000 (`node`). Default CMD serves health/build/capabilities
and denies protected routes until the application host supplies an identity
hook. No default password, trusted identity header or anonymous RDP session
access is provided. HTTPS/authentication and exact browser Origins remain host /
reverse-proxy responsibilities under SECURITY.

A trusted application can replace CMD with its read-only mounted bootstrap:

```js
import { createSessionServer } from '/opt/freerdp-bridge/api/dist/session-server.js';
import { NativeSessionWorker } from '/opt/freerdp-bridge/api/node_modules/@freerdp-bridge/node/dist/index.js';
import { authenticate } from './identity.mjs'; // application-owned verification

const worker = {
  workerPath: process.env.BRIDGE_WORKER_PATH,
  runtimeRoot: process.env.BRIDGE_SESSION_RUNTIME_DIR,
};
const server = await createSessionServer({
  worker,
  authenticate,
  allowedOrigins: ['https://rdp.example.test'],
  sessions: { workerFactory: () => new NativeSessionWorker(worker) },
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => { void server.close(); });
await server.listen({ host: '0.0.0.0', port: 8080 });
```

`identity.mjs` is application code, not a credential file. Session RDP secrets
still arrive over the authenticated API and private worker IPC. The baseline
mounts no devices, host sound server or Docker socket; optional devices remain
policy/capability gated. Existing `rdp=false` records incomplete product
acceptance, separately from compiled experimental capabilities.

The `verification` target adds synthetic identity logic and is not production:

```sh
docker build --target verification -t freerdp-bridge-service-check build/service-runtime
docker run --rm --network none --init --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /run/freerdp-bridge:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=700 \
  freerdp-bridge-service-check
```

It checks actual HTTP readiness/build, default auth refusal, synthetic host /
native connection failure, primary IPC, SIGTERM and empty runtime without lab
credentials, outside network or physical capture. [Evidence](ITERATION_211.md).

## Current verified image refresh

The local runtime image was refreshed after the logger correction in c1cc41a.
The new production Node archive, schema-validated application/native companion,
final-image SPDX and restricted runtime receipt are recorded together in
[Iteration 217](ITERATION_217.md). Earlier image receipts remain historical
evidence; they do not contain that later logger correction.
