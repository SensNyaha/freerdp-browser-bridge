export {
  createRdpBridgeHttp,
  type RdpBridgeHttpOptions,
  type RdpBridgeHttpHandle,
  type BridgeHttpServer,
} from './server.js';
export {
  resolveNativeRuntime,
  NativeRuntimeError,
  recoverRuntimeSessions,
  RuntimeRecoveryError,
  discoverHostDevices,
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
  RuntimeRecoveryOptions,
  RuntimeRecoveryReport,
  HostInventoryRequest,
  HostInventoryReport,
  BridgeHandle,
} from '@freerdp-bridge/api/fastify';
