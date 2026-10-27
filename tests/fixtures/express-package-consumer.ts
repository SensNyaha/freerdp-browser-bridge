import { createServer } from 'node:http';
import express, { type RequestHandler } from 'express';
import {
  createRdpBridgeExpress,
  resolveNativeRuntime,
  recoverRuntimeSessions,
  type RuntimeRecoveryOptions,
  type RuntimeRecoveryReport,
  type RdpBridgeExpressOptions,
  type RdpBridgeExpressHandle,
} from '@freerdp-bridge/express';
import { referenceBrowserDirectory } from '@freerdp-bridge/express/browser';
import type { SessionManager, SessionCreate } from '@freerdp-bridge/express';

async function host() {
  const app = express();
  const server = createServer(app);
  const worker = await resolveNativeRuntime({ runtimeRoot: '/private/run' });
  const options: RdpBridgeExpressOptions = {
    prefix: '/rdp',
    worker,
    authenticate: (request) =>
      request.headers.authorization
        ? { id: 'synthetic-verified-owner' }
        : undefined,
    allowedOrigins: ['https://app.example'],
    upgradeMode: 'manual',
  };
  const bridge: RdpBridgeExpressHandle = await createRdpBridgeExpress(
    server,
    options,
  );
  const middleware: RequestHandler = bridge.middleware;
  app.use(middleware);
  server.on('upgrade', (request, socket, head) => {
    const owned: boolean = bridge.handleUpgrade(request, socket, head);
    void owned;
  });
  const count: number = bridge.diagnostics().activeSessions;
  await bridge.close();
  const invalid: RdpBridgeExpressOptions = {
    ...options,
    // @ts-expect-error Upgrade modes are a closed contract.
    upgradeMode: 'catch-all',
  };
  // @ts-expect-error The verified identity callback is mandatory.
  void createRdpBridgeExpress(server, { prefix: '/rdp', worker });
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
