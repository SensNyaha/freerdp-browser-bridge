export {
  RdpBridgeModule,
  RdpBridgeService,
  type RdpBridgeModuleOptions,
  type RdpBridgeModuleAsyncOptions,
} from './module.js';
export {
  resolveNativeRuntime,
  NativeRuntimeError,
  NativeSessionWorker,
  WorkerProcess,
  SessionManager,
  SessionError,
  createSecureLogger,
} from '@freerdp-bridge/api/fastify';
export type {
  WorkerOptions,
  Principal,
  SessionCreate,
  NativeRuntimeOptions,
  BridgeHandle,
} from '@freerdp-bridge/api/fastify';
