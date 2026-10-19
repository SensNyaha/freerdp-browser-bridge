// Synthetic IPC peer only: no FreeRDP, RDP endpoint, desktop or appearance effect.
import {
  Kind,
  PacketDecoder,
  encodePacket,
} from '../../packages/protocol/dist/index.js';
const mode = process.argv[2];
if (!['legacy', 'capable'].includes(mode)) process.exit(2);
const decoder = new PacketDecoder();
const send = (kind, requestId, payload = Buffer.alloc(0), done) => {
  const bytes = encodePacket({ kind, requestId, payload });
  if (process.stdout.writableLength + bytes.length > 65536) process.exit(2);
  process.stdout.write(bytes, done);
};
process.stdin.on('data', (bytes) => {
  try {
    decoder.push(bytes, (p) => {
      try {
        const report = { kind: p.kind };
        if (p.kind === Kind.Configure) {
          report.schema = p.payload.readUInt16BE(0);
          if (report.schema === 11) {
            report.mask = p.payload.at(-2);
            report.values = p.payload.at(-1);
          }
        }
        process.send?.(report);
        if (p.kind === Kind.Hello) {
          const parts = [Buffer.from([0, 1, 1, 5])];
          for (const value of [
            '0.1.0',
            'synthetic-performance',
            '3.32.1',
            '3.32.1',
            'fake',
            'x64',
            'framed-pipes',
          ]) {
            const text = Buffer.from(value),
              length = Buffer.alloc(2);
            length.writeUInt16BE(text.length);
            parts.push(length, text);
          }
          if (mode === 'capable')
            parts.push(Buffer.from([0, 1, 0, 0, 0, 0, 0, 32]));
          send(Kind.HelloAck, p.requestId, Buffer.concat(parts));
        } else if (p.kind === Kind.Heartbeat)
          send(Kind.HeartbeatAck, p.requestId);
        else if (p.kind === Kind.Configure)
          send(Kind.ConfigureAck, p.requestId);
        else if (p.kind === Kind.Secret) send(Kind.SecretAck, p.requestId);
        else if (p.kind === Kind.Connect) {
          send(Kind.ConnectAck, p.requestId);
          send(Kind.State, 0n, Buffer.from([0, 3, 0, 0, 0, 0, 0, 0]));
        } else if (p.kind === Kind.Shutdown)
          send(Kind.ShutdownAck, p.requestId, undefined, () => process.exit(0));
        else process.exit(2);
      } finally {
        p.payload.fill(0);
      }
    });
  } catch {
    process.exit(2);
  }
});
process.stdin.on('end', () => process.exit(0));
