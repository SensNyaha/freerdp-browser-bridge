import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  RdpBridgeModule,
  RdpBridgeService,
  resolveNativeRuntime,
  recoverRuntimeSessions,
  type RuntimeRecoveryOptions,
  type RuntimeRecoveryReport,
  type RdpBridgeModuleOptions,
} from '@freerdp-bridge/nestjs';
import { referenceBrowserDirectory } from '@freerdp-bridge/nestjs/browser';
import type { SessionManager, SessionCreate } from '@freerdp-bridge/nestjs';

class HostConfig {
  origin = 'https://app.example';
}
class HostConfigModule {}
Module({ providers: [HostConfig], exports: [HostConfig] })(HostConfigModule);
const options: RdpBridgeModuleOptions = {
  prefix: '/rdp',
  worker: { workerPath: '/trusted/worker', runtimeRoot: '/private/run' },
  authenticate: (request) =>
    request.headers.authorization
      ? { id: 'synthetic-verified-owner' }
      : undefined,
};
class RootModule {}
Module({
  imports: [
    RdpBridgeModule.forRootAsync({
      imports: [HostConfigModule],
      inject: [HostConfig],
      useFactory: async (config: HostConfig) => ({
        ...options,
        allowedOrigins: [config.origin],
        worker: await resolveNativeRuntime({ runtimeRoot: '/private/run' }),
        authenticate: (request) =>
          request.headers.authorization
            ? { id: 'synthetic-verified-owner' }
            : undefined,
      }),
    }),
  ],
})(RootModule);
const sync = RdpBridgeModule.forRoot(options);
const invalid: RdpBridgeModuleOptions = {
  ...options,
  // @ts-expect-error Upgrade mode is a closed public contract.
  upgradeMode: 'catch-all',
};
// @ts-expect-error A verified identity callback is mandatory.
RdpBridgeModule.forRoot({ prefix: '/rdp', worker: options.worker });
async function host() {
  const app = await NestFactory.create(RootModule, new FastifyAdapter());
  const service = app.get(RdpBridgeService);
  const count: number = service.diagnostics().activeSessions;
  app
    .getHttpServer()
    .on(
      'upgrade',
      (
        request: Parameters<RdpBridgeService['handleUpgrade']>[0],
        socket: Parameters<RdpBridgeService['handleUpgrade']>[1],
        head: Buffer,
      ) => {
        const owned: boolean = service.handleUpgrade(request, socket, head);
        void owned;
      },
    );
  await service.close();
  await app.close();
  return count;
}
const browser: string = referenceBrowserDirectory;
void [sync, invalid, host, browser];

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
