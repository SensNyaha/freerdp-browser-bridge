import Fastify from 'fastify';
import {
  rdpBridgePlugin,
  type BridgeHandle,
  type RdpBridgePluginOptions,
  resolveNativeRuntime,
} from '@freerdp-bridge/fastify';
import { referenceBrowserDirectory } from '@freerdp-bridge/fastify/browser';

const app = Fastify();
let bridge: BridgeHandle | undefined;
const options: RdpBridgePluginOptions = {
  worker: {
    workerPath: '/trusted/native/rdp-worker',
    runtimeRoot: '/private/run',
  },
  allowedOrigins: ['https://app.example'],
  authenticate: (request) =>
    request.headers.authorization ? { id: 'verified-principal' } : undefined,
  upgradeMode: 'manual',
  onReady(handle) {
    bridge = handle;
  },
};
app.register(rdpBridgePlugin, { ...options, prefix: '/rdp' });
app.server.on('upgrade', (request, socket, head) => {
  if (bridge?.handleUpgrade(request, socket, head)) return;
});
const directory: string = referenceBrowserDirectory;
void directory;
const nativeOptions = await resolveNativeRuntime({
  runtimeRoot: '/private/run',
});
const nativePath: string = nativeOptions.workerPath;
void nativePath;
const invalid: RdpBridgePluginOptions = {
  ...options,
  // @ts-expect-error Arbitrary modes must fail the public declaration.
  upgradeMode: 'catch-all',
};
void invalid;
