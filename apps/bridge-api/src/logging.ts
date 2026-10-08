import pino, { type DestinationStream } from 'pino';
import { redactSecrets } from '@freerdp-bridge/config';

/** Never serialize bodies, headers or URLs: query attach credentials are confidential. */
export function createSecureLogger(destination?: DestinationStream) {
  const options: pino.LoggerOptions = {
    level: 'info',
    serializers: {
      req: (request: { method?: string }) => ({ method: request.method }),
      res: (response: { statusCode?: number }) => ({
        statusCode: response.statusCode,
      }),
      err: () => ({ code: 'INTERNAL_ERROR' }),
    },
    formatters: {
      log: (object) => redactSecrets(object) as Record<string, unknown>,
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
