import { randomInt } from 'node:crypto';

// Some hosts assign port 0 from a low ephemeral range containing browser-blocked
// ports (e.g. 2049). Use the high dynamic range without browser policy overrides.
export async function listenBrowserLoopback(
  listen,
  selectPort = () => randomInt(49152, 65536),
) {
  let lastError;
  for (let attempt = 0; attempt < 8; ++attempt) {
    const port = selectPort();
    if (!Number.isInteger(port) || port < 49152 || port > 65535)
      throw new Error('Invalid browser fixture port');
    try {
      await listen(port);
      return port;
    } catch (error) {
      if (
        error?.code !== 'EADDRINUSE' &&
        !(process.platform === 'win32' && error?.code === 'EACCES')
      )
        throw error;
      lastError = error;
    }
  }
  throw new Error('Browser fixture port attempts exhausted', {
    cause: lastError,
  });
}

export function listenBrowserHttp(server, selectPort) {
  return listenBrowserLoopback(
    (port) =>
      new Promise((resolve, reject) => {
        const failed = (error) => {
          server.off('listening', ready);
          reject(error);
        };
        const ready = () => {
          server.off('error', failed);
          resolve();
        };
        server.once('error', failed);
        server.once('listening', ready);
        server.listen(port, '127.0.0.1');
      }),
    selectPort,
  );
}
