export {
  createRdpBridgeExpress,
  type RdpBridgeExpressOptions,
  type RdpBridgeExpressHandle,
} from './middleware.js';
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
} from '@freerdp-bridge/http';
export type {
  BridgeHttpServer,
  WorkerOptions,
  Principal,
  SessionCreate,
  NativeRuntimeOptions,
  RuntimeRecoveryOptions,
  RuntimeRecoveryReport,
  HostInventoryRequest,
  HostInventoryReport,
  BridgeHandle,
} from '@freerdp-bridge/http';
