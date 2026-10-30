// Synthetic IPC peer only; never enumerates or opens host devices.
import {
  Kind,
  PacketDecoder,
  encodePacket,
  decodeHostInventoryRequest,
  encodeHostInventoryReport,
} from '../../packages/protocol/dist/index.js';
const mode = process.argv[2];
const decoder = new PacketDecoder();
function send(kind, requestId, payload = Buffer.alloc(0)) {
  const bytes = encodePacket({ kind, requestId, payload });
  if (process.stdout.writableLength + bytes.length > 131072) process.exit(2);
  process.stdout.write(bytes, () => bytes.fill(0));
}
function build() {
  const strings = [
    '0.6.0',
    'synthetic-inventory',
    '',
    '3.32.1',
    process.platform === 'win32' ? 'windows' : 'linux',
    'x64',
    'framed-pipes',
  ];
  const parts = [Buffer.from('00010001', 'hex')];
  for (const text of strings) {
    const bytes = Buffer.from(text);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    parts.push(length, bytes);
  }
  if (mode !== 'legacy') parts.push(Buffer.from('0001000000002000', 'hex'));
  return Buffer.concat(parts);
}
process.stdin.on('data', (chunk) => {
  decoder.push(chunk, (packet) => {
    if (packet.kind === Kind.Hello)
      send(Kind.HelloAck, packet.requestId, build());
    else if (packet.kind === Kind.Heartbeat)
      send(Kind.HeartbeatAck, packet.requestId);
    else if (packet.kind === Kind.Shutdown) {
      send(Kind.ShutdownAck, packet.requestId);
      process.stdin.destroy();
    } else if (packet.kind === Kind.HostInventory) {
      if (mode === 'stall') return;
      const request = decodeHostInventoryRequest(packet.payload);
      const classes = (mode === 'foreign' ? ['usb'] : request.classes).map(
        (kind) => ({ kind, status: 'available', devices: [] }),
      );
      const response = encodeHostInventoryReport({ classes });
      if (mode === 'malformed') response[7] = 1;
      send(Kind.HostInventoryResult, packet.requestId, response);
    } else process.exit(2);
  });
});
