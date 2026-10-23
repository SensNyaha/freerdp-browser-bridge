import type { Readable } from 'node:stream';

/** Private parent-to-service lifetime pipe: one shutdown byte, never credentials. */
export function bindStandaloneSupervisor(
  input: Readable,
  stop: (failed: boolean) => void,
) {
  let stopped = false;
  const finish = (failed: boolean) => {
    if (stopped) return;
    stopped = true;
    input.destroy();
    stop(failed);
  };
  input.once('data', (bytes: unknown) =>
    finish(!Buffer.isBuffer(bytes) || bytes.length !== 1 || bytes[0] !== 1),
  );
  input.once('end', () => finish(false));
  input.on('error', () => finish(true));
}
