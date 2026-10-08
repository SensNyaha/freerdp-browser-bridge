import { WebSocket } from 'ws';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { encodeJpegRecords, MAX_JPEG_BYTES } from '@freerdp-bridge/protocol';
import { publicSessionError, type SessionManager } from '@freerdp-bridge/node';

const hello = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.Literal('media.hello'),
      data: Type.Object(
        {
          codecs: Type.Array(Type.Literal('jpeg'), {
            minItems: 1,
            maxItems: 1,
          }),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);
const ack = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.Literal('media.ack'),
      data: Type.Object(
        { sequence: Type.Integer({ minimum: 0, maximum: 0xffffffff }) },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);

/** Browser render acknowledgements grant one frame of credit. No timer queues raw/encoded frames. */
export function installJpegMedia(
  ws: WebSocket,
  lease: ReturnType<SessionManager['attach']>,
  send: (type: string, data: unknown) => void,
): void {
  let negotiated = false,
    busy = false,
    revision = 0n;
  let window = Date.now(),
    received = 0;
  let sequence = 0,
    expectedAck: number | undefined;
  let width = 0,
    height = 0;
  let timer: NodeJS.Timeout | undefined;
  let deadline: NodeJS.Timeout | undefined;
  const fail = (code: string) => {
    send('media.error', { code });
    ws.close(1008, 'media unavailable');
  };
  const limit = MAX_JPEG_BYTES + 128;
  const schedule = () => {
    if (ws.readyState === WebSocket.OPEN)
      timer = setTimeout(() => {
        void pull();
      }, 50);
  };
  const pull = async () => {
    if (busy || expectedAck !== undefined || ws.readyState !== WebSocket.OPEN)
      return;
    busy = true;
    try {
      const frame = await lease.captureFrame(revision);
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!frame?.jpeg) {
        schedule();
        return;
      }
      if (sequence > 0xfffffffc) {
        ws.close(1000, 'media sequence exhausted');
        return;
      }
      const reconfigure = frame.width !== width || frame.height !== height;
      const records = encodeJpegRecords(frame, sequence, reconfigure);
      const bytes = records.reduce((sum, record) => sum + record.length, 0);
      if (ws.bufferedAmount + bytes > limit) {
        ws.close(1008, 'media backlog limit');
        return;
      }
      width = frame.width;
      height = frame.height;
      revision = frame.revision;
      sequence += records.length;
      expectedAck = sequence - 1;
      deadline = setTimeout(() => {
        ws.close(1008, 'media acknowledgement deadline');
      }, 5000);
      for (const record of records)
        ws.send(record, { binary: true }, (error) => {
          if (error) ws.terminate();
        });
    } catch (error) {
      fail(publicSessionError(error).code);
    } finally {
      busy = false;
    }
  };
  deadline = setTimeout(
    () => ws.close(1008, 'media negotiation deadline'),
    5000,
  );
  ws.once('close', () => {
    clearTimeout(timer);
    clearTimeout(deadline);
  });
  ws.on('message', (bytes, binary) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - window >= 1000) {
      window = Date.now();
      received = 0;
    }
    if (++received > 32) {
      fail('MEDIA_RATE_LIMIT');
      return;
    }
    if (binary || !Buffer.isBuffer(bytes)) {
      fail('MEDIA_PROTOCOL_ERROR');
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('MEDIA_PROTOCOL_ERROR');
      return;
    }
    if (!negotiated && hello.Check(value)) {
      negotiated = true;
      clearTimeout(deadline);
      send('media.ready', {
        codec: 'jpeg',
        maxFps: 20,
        maxInFlight: 1,
        maxPayloadBytes: MAX_JPEG_BYTES,
      });
      void pull();
    } else if (
      negotiated &&
      ack.Check(value) &&
      expectedAck !== undefined &&
      value.data.sequence === expectedAck
    ) {
      clearTimeout(deadline);
      expectedAck = undefined;
      schedule();
    } else fail('MEDIA_PROTOCOL_ERROR');
  });
}
