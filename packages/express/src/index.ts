export {
  createRdpBridgeExpress,
  type RdpBridgeExpressOptions,
  type RdpBridgeExpressHandle,
} from './middleware.js';
export {
  resolveNativeRuntime,
  NativeRuntimeError,
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
  BridgeHandle,
} from '@freerdp-bridge/http';
