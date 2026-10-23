import net from 'node:net';

/** One local test connection to an explicit IP; no inspection or payload history. */
export async function createLabRdpProxy(host, port) {
  if (
    typeof host !== 'string' ||
    !net.isIP(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('LAB_PROXY_TARGET_INVALID');
  let client, upstream, timer, closePromise;
  let accepted = false;
  let stopped = false;
  const stats = {
    accepted: 0,
    refused: 0,
    connected: false,
    interrupted: false,
  };
  const interrupt = () => {
    stopped = true;
    clearTimeout(timer);
    client?.destroy();
    upstream?.destroy();
  };
  const server = net.createServer(
    { pauseOnConnect: true, highWaterMark: 16384 },
    (socket) => {
      if (accepted || stopped) {
        stats.refused++;
        socket.destroy();
        return;
      }
      accepted = true;
      stats.accepted++;
      client = socket;
      client.on('error', interrupt);
      client.once('close', interrupt);
      upstream = net.createConnection({ host, port, highWaterMark: 16384 });
      upstream.on('error', interrupt);
      upstream.once('close', interrupt);
      timer = setTimeout(interrupt, 5000);
      upstream.once('connect', () => {
        if (stopped) return interrupt();
        clearTimeout(timer);
        stats.connected = true;
        client.pipe(upstream).pipe(client);
        client.resume();
      });
    },
  );
  server.maxConnections = 1;
  server.on('drop', () => {
    stats.refused++;
  });
  server.on('error', interrupt);
  try {
    await new Promise((done, reject) => {
      const deadline = setTimeout(
        () => reject(new Error('LAB_PROXY_LISTEN_FAILED')),
        5000,
      );
      const fail = () => {
        clearTimeout(deadline);
        reject(new Error('LAB_PROXY_LISTEN_FAILED'));
      };
      server.once('error', fail);
      server.listen({ host: '127.0.0.1', port: 0 }, () => {
        clearTimeout(deadline);
        server.off('error', fail);
        done();
      });
    });
  } catch {
    interrupt();
    server.close(() => {});
    throw new Error('LAB_PROXY_LISTEN_FAILED');
  }
  return {
    host: '127.0.0.1',
    port: server.address().port,
    snapshot: () => ({ ...stats }),
    interrupt() {
      stats.interrupted = true;
      interrupt();
    },
    close() {
      if (!closePromise) {
        interrupt();
        closePromise = new Promise((done, reject) => {
          const deadline = setTimeout(
            () => reject(new Error('LAB_PROXY_CLOSE_FAILED')),
            2000,
          );
          server.close((error) => {
            clearTimeout(deadline);
            if (error) reject(new Error('LAB_PROXY_CLOSE_FAILED'));
            else done();
          });
        });
      }
      return closePromise;
    },
  };
}
