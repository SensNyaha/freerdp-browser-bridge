import type { RequestHandler } from 'express';
import {
  createRdpBridgeHttp,
  type BridgeHttpServer,
  type RdpBridgeHttpHandle,
  type RdpBridgeHttpOptions,
} from '@freerdp-bridge/http';

export type RdpBridgeExpressOptions = RdpBridgeHttpOptions;
export interface RdpBridgeExpressHandle
  extends Omit<RdpBridgeHttpHandle, 'handleRequest'> {
  /** Mount at the application root, before any body parser or URL rewrite. */
  readonly middleware: RequestHandler;
}

/** Prepare before listen, then app.use(handle.middleware) at the root. */
export async function createRdpBridgeExpress(
  server: BridgeHttpServer,
  options: RdpBridgeExpressOptions,
): Promise<RdpBridgeExpressHandle> {
  const snapshot = { ...options };
  const bridge = await createRdpBridgeHttp(server, snapshot);
  const prefix = snapshot.prefix;
  const owns = (url: string) =>
    url.startsWith(prefix) &&
    [undefined, '/', '?'].includes(url[prefix.length]);
  const middleware: RequestHandler = (request, response, next) => {
    // originalUrl is the external URL. Express strips req.url in a mounted
    // router. Never restore/rewrite it or let a rewrite redirect foreign
    // application traffic into the authenticated bridge namespace.
    if (!owns(request.originalUrl)) {
      next();
      return;
    }
    if (request.baseUrl || request.url !== request.originalUrl) {
      response.writeHead(500, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(
        '{"code":"EXPRESS_BRIDGE_ROOT_REQUIRED","message":"Mount bridge middleware at the application root before URL rewriting","retryable":false}',
      );
      return;
    }
    bridge.handleRequest(request, response);
  };
  return {
    middleware,
    handleUpgrade: (request, socket, head) =>
      bridge.handleUpgrade(request, socket, head),
    diagnostics: () => bridge.diagnostics(),
    close: () => bridge.close(),
  };
}
