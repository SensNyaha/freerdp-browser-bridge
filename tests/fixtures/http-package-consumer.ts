import { createServer } from 'node:http';
import {
  createRdpBridgeHttp,
  resolveNativeRuntime,
  type RdpBridgeHttpOptions,
  type RdpBridgeHttpHandle,
} from '@freerdp-bridge/http';
import { referenceBrowserDirectory } from '@freerdp-bridge/http/browser';

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
