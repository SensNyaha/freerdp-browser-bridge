import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  RdpBridgeModule,
  RdpBridgeService,
  resolveNativeRuntime,
  type RdpBridgeModuleOptions,
} from '@freerdp-bridge/nestjs';
import { referenceBrowserDirectory } from '@freerdp-bridge/nestjs/browser';

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
