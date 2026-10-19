import net from 'node:net';
import tls from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Local adversarial RDP negotiation/TLS endpoint. Does not implement an RDP desktop. */
export async function createRdpTlsFixture(host = '127.0.0.1', port = 0) {
  if (!['127.0.0.1', '::1'].includes(host))
    throw new Error('TLS fixture host must be loopback');
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('TLS fixture port must be bounded');
  const directory = await mkdtemp(join(tmpdir(), 'bridge-tls-fixture-'));
  const sockets = new Set();
  let server;
  let applicationBytes = 0;
  let connections = 0;
  try {
    const openssl =
      process.platform === 'win32'
        ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
        : 'openssl';
    await promisify(execFile)(
      openssl,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
        '-keyout',
        join(directory, 'fixture-key.pem'),
        '-out',
        join(directory, 'fixture-cert.pem'),
      ],
      {
        windowsHide: true,
        timeout: 15000,
        // The system CLI must use its own matching libraries, not the worker's
        // private SDK LD_LIBRARY_PATH. This only generates a dummy certificate.
        env: Object.fromEntries(
          ['SystemRoot', 'WINDIR', 'PATH'].flatMap((key) =>
            process.env[key] === undefined ? [] : [[key, process.env[key]]],
          ),
        ),
      },
    );
    const secureContext = tls.createSecureContext({
      key: await readFile(join(directory, 'fixture-key.pem')),
      cert: await readFile(join(directory, 'fixture-cert.pem')),
      minVersion: 'TLSv1.2',
    });
    server = net.createServer((socket) => {
      ++connections;
      sockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => sockets.delete(socket));
      let request = Buffer.alloc(0);
      const negotiate = (chunk) => {
        request = Buffer.concat([request, chunk]);
        if (request.length > 4096) {
          socket.destroy();
          return;
        }
        if (request.length < 4 || request.length < request.readUInt16BE(2))
          return;
        socket.off('data', negotiate);
        // X.224 Connection Confirm with RDP_NEG_RSP selecting PROTOCOL_SSL.
        socket.write(
          Buffer.from('030000130ed000001234000200080001000000', 'hex'),
          () => {
            if (socket.destroyed) return;
            const encrypted = new tls.TLSSocket(socket, {
              isServer: true,
              secureContext,
            });
            sockets.add(encrypted);
            encrypted.on('error', () => {});
            encrypted.once('close', () => sockets.delete(encrypted));
            encrypted.on('data', (data) => {
              applicationBytes += data.length;
            });
          },
        );
      };
      socket.on('data', negotiate);
    });
    await new Promise((done, reject) => {
      server.once('error', reject);
      server.listen({ port, host, ipv6Only: host === '::1' }, done);
    });
    return {
      port: server.address().port,
      get connections() {
        return connections;
      },
      get applicationBytes() {
        return applicationBytes;
      },
      async close() {
        for (const socket of sockets) socket.destroy();
        await new Promise((done) => server.close(done));
        await rm(directory, { recursive: true, force: true, maxRetries: 3 });
      },
    };
  } catch (cause) {
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise((done) => server.close(done));
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    const error = new Error('TLS fixture initialization failed');
    if (cause?.code === 'EADDRINUSE') error.code = 'TLS_FIXTURE_PORT_BUSY';
    throw error;
  }
}
