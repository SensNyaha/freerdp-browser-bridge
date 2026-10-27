import Fastify from 'fastify';
import {
  rdpBridgePlugin,
  type BridgeHandle,
  type RdpBridgePluginOptions,
  resolveNativeRuntime,
  recoverRuntimeSessions,
  type RuntimeRecoveryOptions,
  type RuntimeRecoveryReport,
} from '@freerdp-bridge/fastify';
import { referenceBrowserDirectory } from '@freerdp-bridge/fastify/browser';
import type { SessionManager, SessionCreate } from '@freerdp-bridge/fastify';

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
