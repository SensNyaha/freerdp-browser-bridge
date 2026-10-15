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
    hooks: {
      logMethod(args, method) {
        const first = args[0];
        if (first instanceof Error) {
          method.call(
            this,
            { err: first },
            typeof args[1] === 'string' ? args[1] : 'Operation failed',
          );
        } else if (
          args.length === 1 &&
          first &&
          typeof first === 'object' &&
          'err' in first
        ) {
          // Pino otherwise uses err.message as the message before serialization.
          method.call(this, first, 'Operation failed');
        } else method.apply(this, args);
      },
      // Pino resets the bindings formatter when creating a child. Apply the
      // same policy to the completed record, including child/setBindings data.
      streamWrite: (line) => {
        if (Buffer.byteLength(line) <= 65536) {
          try {
            return JSON.stringify(redactSecrets(JSON.parse(line))) + '\n';
          } catch {
            // Never echo malformed/custom-serialized record text.
          }
        }
        return '{"level":40,"code":"LOG_RECORD_REJECTED","msg":"Log record rejected"}\n';
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
