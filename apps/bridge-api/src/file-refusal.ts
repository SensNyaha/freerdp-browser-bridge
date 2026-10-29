import type { IncomingMessage } from 'node:http';

// Do not fully close a socket over a modest in-flight rejected body: TCP reset
// can erase its error response. Discard without buffering or native authority.
// Larger, unknown, Expect/continue and slow bodies keep the immediate refusal.
const maximumBytes = 4 * 1024 * 1024;
const maximumMs = 250;
export async function discardRejectedFileBody(
  request: IncomingMessage,
): Promise<void> {
  const declared = request.headers['content-length'];
  if (
    request.headers.expect !== undefined ||
    request.headers['transfer-encoding'] !== undefined ||
    typeof declared !== 'string' ||
    !/^[1-9][0-9]{0,7}$/.test(declared) ||
    Number(declared) > maximumBytes ||
    request.destroyed ||
    request.readableEnded ||
    request.complete
  )
    return;
  await new Promise<void>((resolve) => {
    let bytes = 0;
    const done = () => {
      clearTimeout(timer);
      request.off('data', data);
      request.off('end', done);
      request.off('close', done);
      request.off('error', done);
      request.pause();
      resolve();
    };
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes >= Number(declared) || bytes >= maximumBytes) done();
    };
    const timer = setTimeout(done, maximumMs);
    request.on('data', data);
    request.once('end', done);
    request.once('close', done);
    request.once('error', done);
    request.resume();
  });
}
