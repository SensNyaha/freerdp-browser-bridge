export {
  rdpBridgePlugin,
  NativeSessionWorker,
  WorkerProcess,
  SessionManager,
  SessionError,
  createSecureLogger,
  resolveNativeRuntime,
  NativeRuntimeError,
  recoverRuntimeSessions,
  RuntimeRecoveryError,
} from '@freerdp-bridge/api/fastify';
export type {
  RdpBridgePluginOptions,
  BridgeHandle,
  WorkerOptions,
  SessionCreate,
  Principal,
  NativeRuntimeOptions,
  RuntimeRecoveryOptions,
  RuntimeRecoveryReport,
} from '@freerdp-bridge/api/fastify';
