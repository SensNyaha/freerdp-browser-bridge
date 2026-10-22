# Fastify embedding (0.2.1)

Implements SPECIFICATION §2.1/2.11/3.1/3.2 and ADR-001 using the existing
worker/API/media owners. Implementation is accepted from `feature/fastify-0.2.1`
and finalized in `release/0.2.1`. [Release acceptance and registry status](ITERATION_424.md).
NestJS 0.2.2, node:http 0.2.3 and Express 0.2.4 follow
after this adapter's acceptance.

```ts
import Fastify from 'fastify';
import { rdpBridgePlugin } from '@freerdp-bridge/fastify';

const app = Fastify();
app.get('/application', async () => ({ ok: true }));
app.register(rdpBridgePlugin, {
  prefix: '/rdp',
  worker: { workerPath: '/trusted/runtime/bin/rdp-worker', runtimeRoot: '/private/run/bridge' },
  allowedOrigins: ['https://app.example'],
  authenticate: async request => verifyApplicationBearer(request),
  onReady(bridge) {
    // Retain bridge.close(), bridge.diagnostics() if independently managed.
  },
});
await app.listen({ host: '127.0.0.1', port: 8080 });
```

`verifyApplicationBearer` is application-owned identity verification returning
`{ id: string }` or undefined. There is no default identity or password. RDP
credentials arrive in session creation and are passed to a separate native
worker through private IPC. `workerPath` is trusted host configuration, never
a browser-selected path. Node.js 24 and Fastify 5.12.5 are the initial tested
profile. HTTP/1.1 WebSocket operation uses the host's server; TLS may terminate
there or at a configured reverse proxy. HTTP/2-only servers are not accepted.

The plugin defaults to one `NativeSessionWorker` per session. Supplying
`sessions.workerFactory` explicitly replaces the backend, chiefly for tests.
It does not change feature capabilities or turn fake-worker evidence into RDP
desktop acceptance. Product/native versions are aligned at 0.2.1; their final
clean builds and installed-package acceptance are recorded in the release report.

## Routes and ownership

Fastify's `prefix` must be nonempty, at most 128 ASCII characters and at most
16 slash-separated `[A-Za-z0-9_-]+` components. Trailing slashes, escapes and
dot components refuse before worker probing. At most 16 non-overlapping bridge
mounts are permitted on one HTTP server. Fastify itself rejects duplicate HTTP
routes. The mount's routes, strict validator, error/not-found/cache hooks and
body limits are encapsulated; they do not replace the application's handlers
or change `server.maxConnections`, listener port or global timeouts.

Under `/rdp` the routes are `/healthz`, `/readyz`, `/v1/build`,
`/v1/capabilities`, `/v1/sessions`, `/v1/sessions/:id`,
`/v1/sessions/:id/attach-token`, `/metrics` and `/v1/diagnostics`.
Sessions, tokens, diagnostics and metrics require the configured identity.
Session ownership and token/channel scoping are unchanged. Cookie-based
authentication remains refused; an existing cookie login needs a separately
designed CSRF/Origin identity adapter. Exact allowed Origins are bounded to
32 entries, each at most 2,048 characters.

Bridge request validation does not inherit host coercion or removal of unknown
fields. Bodies are limited to 64 KiB before parsing. Request logs for bridge
routes are suppressed, with fixed rejection codes sent to the bridge's secure
logger. Application hooks, custom loggers and reverse-proxy access logs remain
the host's responsibility: never record bridge request bodies or attach query
tokens. The plugin does not rewrite the application's logger or auth hooks.

WebSocket routes are `/rdp/v1/sessions/:id/control` and `/media`, with the
existing `freerdp-bridge-v1` protocol, single-use tokens, Origin checks,
control/media limits and binary media credit. Multiple WS connections use the
same TCP listener/port; no auxiliary server or proxy port is opened.

## Existing application WebSockets

The default `upgradeMode: 'automatic'` adds one prefix-selective upgrade
listener. It leaves every request outside the mount untouched. Use this only
if the other listeners also select their own routes. A catch-all WebSocket
plugin that rejects unknown routes must share one dispatcher with bridge.

For applications already owning upgrades, use `upgradeMode: 'manual'` and
retain the handle from `onReady`. The application's existing dispatcher calls
`bridge.handleUpgrade(request, socket, head)` first; true means bridge owns
it, false means continue host routing. On false, no socket listener, credential
parsing, response or buffer consumption is performed. Do not add a second
catch-all handler or call `removeAllListeners('upgrade')`.

`bridge.close()` is idempotent and joins bridge sockets and session retirement.
It unregisters only its own automatic listener. Application routes, unrelated
WS connections and the HTTP listener remain alive. Requests under a closed
mount refuse with 503. Host Fastify close runs the same retirement. Manual
dispatchers should retain the closed handle until host shutdown so late bridge
upgrades are explicitly refused rather than left unowned. The Fastify mount
reservation lives until host close; dynamically remounting after listen is
not supported. Failed installation/ready callbacks retire owned resources.

## Browser and diagnostics

`@freerdp-bridge/fastify/browser` exports `referenceBrowserDirectory`, a local
directory of the packaged reference HTML/JS. Serve it through the application's
static-file routing. It is an optional example UI, not a new profile database.
The reference client can be configured for the same prefix:

```js
window.bridgeConnection.configure({ basePath: '/rdp', authorize: applicationHeaders });
await window.bridgeConnection.refresh();
// Or attach an existing created session:
window.bridgeViewer.attach(createdSession, { basePath: '/rdp', codecs: ['jpeg'] });
```

`applicationHeaders` returns the application's verified bearer header; it must
not supply RDP credentials. Viewer JPEG/H.264/audio/Clipboard/browser-permission
requirements remain unchanged. The assets include audio Worklets and local
cursor/input code. The app controls presentation and credential-entry UI.

`bridge.diagnostics()` is a fixed local snapshot of active sessions, totals,
connection/pending-upgrade counts and closing state. Its authenticated HTTP
projection is `/rdp/v1/diagnostics`; it is aggregate operator telemetry, not
remote desktop contents. `sessionDiagnostics: 1` in capabilities advertises
the additive control-channel schema documented in PROTOCOL. A controller sends
`session.diagnostics.request` with empty data and receives one
`session.diagnostics` reply with its request sequence, owned session ID/current
state, bounded control-buffer length and optional display dimensions. The
shared 32-command/second budget and 64-KiB control-send bound apply. No timer,
history, raw native logs, credentials, target names, paths, screen/Clipboard
contents or cross-session detail is added. This is not the original full V1
performance report or private pipeline-counter exposure.

## Accepted profile and limits

Focused tests cover prefix/HTTP/WS composition, strict admission, diagnostic
privacy, independent shutdown, refused installation and actual native strict
TLS rejection. An external pnpm tarball consumer has passed fake binary media,
same-port host WS survival and native build probing. Real npm installation
and external actual-native strict TLS rejection also pass in a fresh consumer.
The external Linux consumer also passes strict TypeScript declarations and
actual native strict TLS rejection. Actual Astra Linux 1.7.5 and RED OS 7.3 prefixed Edge H.264/JPEG,
resize/restoration, reattachment and runtime cleanup now pass with installed
native npm packages. [Current-address acceptance and retained failures](ITERATION_421.md). Full Linux regression
and both native CTest profiles pass. [Current evidence](ITERATION_419.md).
Native npm runtime packages and resolver are included in the accepted release;
[interface and evidence](NATIVE_NPM_RUNTIME.md). The supported install explicitly includes the platform runtime package.
Final aligned 0.2.1 packaging, source companions, external consumers and both
named real RDP profiles pass; [final evidence](ITERATION_424.md). Registry publication
is recorded separately there. Automatic optional installation remains a future
convenience. [Real-project usage guide](FASTIFY_USAGE.md).
No new device/audio/platform support is inferred from adapter tests.
