import { createServer } from 'node:http';
import {
  createRdpBridgeHttp,
  resolveNativeRuntime,
  recoverRuntimeSessions,
  type RuntimeRecoveryOptions,
  type RuntimeRecoveryReport,
  type RdpBridgeHttpOptions,
  type RdpBridgeHttpHandle,
} from '@freerdp-bridge/http';
import { referenceBrowserDirectory } from '@freerdp-bridge/http/browser';
import type { SessionManager, SessionCreate } from '@freerdp-bridge/http';

async function host() {
  const server = createServer((request, response) => {
    if (bridge.handleRequest(request, response)) return;
    response.end('host');
  });
  const worker = await resolveNativeRuntime({ runtimeRoot: '/private/run' });
  const options: RdpBridgeHttpOptions = {
    prefix: '/rdp',
    worker,
    authenticate: (request) =>
      request.headers.authorization
        ? { id: 'synthetic-verified-owner' }
        : undefined,
    allowedOrigins: ['https://app.example'],
    upgradeMode: 'manual',
  };
  const bridge: RdpBridgeHttpHandle = await createRdpBridgeHttp(
    server,
    options,
  );
  server.on('upgrade', (request, socket, head) => {
    const owned: boolean = bridge.handleUpgrade(request, socket, head);
    void owned;
  });
  const count: number = bridge.diagnostics().activeSessions;
  await bridge.close();
  const invalid: RdpBridgeHttpOptions = {
    ...options,
    // @ts-expect-error Upgrade modes are a closed contract.
    upgradeMode: 'catch-all',
  };
  // @ts-expect-error The verified identity callback is mandatory.
  void createRdpBridgeHttp(server, { prefix: '/rdp', worker });
  return { count, invalid };
}
const browser: string = referenceBrowserDirectory;
void [host, browser];

async function recoverBeforeListen(options: RuntimeRecoveryOptions) {
  const report: RuntimeRecoveryReport = await recoverRuntimeSessions(options);
  if (!report.supported || !report.complete)
    throw new Error('RDP_RUNTIME_RECOVERY_INCOMPLETE');
  return report;
}
void recoverBeforeListen;

// Compile the installed adapter declarations, including the new image surface.
type ClipboardLease = ReturnType<SessionManager['attach']>;
async function imageClipboard(lease: ClipboardLease) {
  const rgba = Buffer.from([19, 41, 63, 255]);
  try {
    await lease.writeClipboardImage({ width: 1, height: 1, rgba });
    const read = await lease.readClipboardImage(1n);
    read.item?.rgba.fill(0);
    // @ts-expect-error Geometry is mandatory in the installed image API.
    await lease.writeClipboardImage({ width: 1, rgba });
    // @ts-expect-error Image reads use exact bigint revisions.
    await lease.readClipboardImage(1);
  } finally {
    rgba.fill(0);
  }
}
const imagePolicy: NonNullable<SessionCreate['clipboard']> = {
  mode: 'bidirectional',
  maxItemBytes: 65536,
  images: true,
};
void [imageClipboard, imagePolicy];
