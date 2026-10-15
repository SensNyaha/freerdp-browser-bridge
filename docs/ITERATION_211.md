# Iteration 211 — non-root API/native service runtime

2026-10-15. Implements the Stage 10 non-root multi-stage image and read-only-root
deployment example from BUILD_AND_DEPLOY 3 / SECURITY 2. The artifact assembly
stage extracts verified native and production Node archives; the final pinned
Node 24 Bookworm slim runtime has compiled JS, required libraries, licenses and
metadata, with no source SDK, lab files or test host identity fixture.

The API CLI supports the documented BRIDGE_LISTEN_HOST policy variable while
retaining loopback as its ordinary default. The container explicitly selects
0.0.0.0 internally; the deployment example publishes host loopback only.
Protected routes remain denied until an application host supplies the existing
identity hook/native worker factory. This is a library runtime distribution,
not a new authentication scheme or anonymous RDP gateway.

`pnpm deploy --prod` now creates the portable Node artifact from the pinned
lockfile. Workspace injection and post-build synchronization are explicit;
per-package builds run in dependency order so injected compiled output is fresh.
Workspace files lists include dist only. Lockfile registry versions/integrities
are unchanged (only the workspace-injection setting is added).
The [pnpm deployment documentation](https://pnpm.io/10.x/cli/deploy) describes the
isolated package and the legacy mode's different lockfile behavior.

The initial legacy/offline attempt correctly refuses absent registry metadata.
An attempted isolated builder install lacks its registry cache; the known pnpm
process is stopped. A minimal host seed fetches exactly 54 production packages
with normal TLS and frozen lockfile, transfers only their content-addressable
cache to the offline SDK, and the ordinary deploy then reuses all 57 packages
(54 registry /3 workspace), downloading zero. No CA bypass or new registry
version is introduced. CI's frozen installation supplies this store normally.

Actual independent runtime verification passes under UID1000, read-only root,
no network, init, no capabilities, no-new-privileges and a private 16 MiB tmpfs:

- real HTTP readiness/build reports pinned FreeRDP and primary packet IPC;
- default session requests are denied with 401;
- a separate synthetic host supplies identity and NativeSessionWorker, creates
  an actual asynchronous session, observes local connection refusal, deletes it
  and joins SIGTERM with no runtime leftovers;
- source/dev tool absence and no external workspace are checked.

The first fixture has incorrect expected HTTP 201 and connection error spelling;
both are corrected to the existing 202 / RDP_CONNECT_FAILED contract without
changing production behavior. Successful receipt reports API/private worker /
primary IPC/default auth denial/host native lifecycle/cleanup all true. The
verification target alone contains synthetic identity logic. The separate final
runtime target is also built: image fc306575ede8…, 109,876,863 bytes by Docker
image inspection. This is local image size, not a compressed installer size.

Node TGZ: 3,368,781 bytes, SHA-256
`06479a92d45d4dec7ac4ca8b4aa82f37b510d3e4de28365c130cf9e54f913c32`.
Native TGZ: 24,781,412 bytes, SHA-256
`ffeb66a24b4c08221dc776d13cc30e9c54e558bd06188fce4a50ac58fb760c15`.
The final image includes Node.js; each TGZ separately excludes it.

Linux clean TypeScript rebuild and complete pnpm check pass 539/54 platform
skips; Windows check passes 547/46. Each has 593 cases and zero failures.
Changed packaging/probe/workflow lint/format
passes. Native code is unchanged since the passing Linux 24/24, Windows 23/23
and foundation 11/11 CTest block. Logs: `build/iteration-211-*`.

The manual bundled workflow now assembles and verifies these artifacts after its
existing native/Node checks. GitHub CI has not actually run here. Fresh source /
distro builds, complete production identity/deployment integration, installers,
resource/concurrency soak and actual RDP/device acceptance remain open. Network
unavailability still prevents a new remote microphone test.
