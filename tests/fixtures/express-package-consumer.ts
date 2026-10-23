import { createServer } from 'node:http';
import express, { type RequestHandler } from 'express';
import {
  createRdpBridgeExpress,
  resolveNativeRuntime,
  type RdpBridgeExpressOptions,
  type RdpBridgeExpressHandle,
} from '@freerdp-bridge/express';
import { referenceBrowserDirectory } from '@freerdp-bridge/express/browser';

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
