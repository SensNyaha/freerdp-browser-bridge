import { WebSocket } from 'ws';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  ClipboardTransfer,
  type SessionManager,
  type SessionClipboardSnapshot,
} from '@freerdp-bridge/node';
import {
  CLIPBOARD_CHUNK_MAX_BYTES,
  CLIPBOARD_CHUNK_WINDOW,
} from '@freerdp-bridge/protocol';

const u64 = Type.String({ pattern: '^[1-9][0-9]{0,19}$' });
const setRequest = TypeCompiler.Compile(
  Type.Object(
    { generation: u64, bytes: Type.Integer({ minimum: 0, maximum: 16777216 }) },
    { additionalProperties: false },
  ),
);
const readRequest = TypeCompiler.Compile(
  Type.Object(
    { generation: u64, revision: u64 },
    { additionalProperties: false },
  ),
);
const ack = TypeCompiler.Compile(
  Type.Object(
    {
      requestSeq: Type.Integer({ minimum: 0, maximum: 0xffffffff }),
      offset: Type.Integer({ minimum: 0, maximum: 16777216 }),
    },
    { additionalProperties: false },
  ),
);
type Lease = ReturnType<SessionManager['attach']>;

/** Optional RWC1 logical lane on the current control socket; existing 4 KiB parser bound stays. */
export function installClipboard(
  ws: WebSocket,
  lease: Lease,
  send: (type: string, data: unknown) => void,
):
  | {
      command(type: string, seq: number, data: unknown): boolean;
      binary(bytes: Buffer): void;
      dispose(): void;
    }
  | undefined {
  let initial: SessionClipboardSnapshot;
  try {
    initial = lease.clipboardSnapshot;
  } catch {
    return;
  } // Explicitly unselected/unsupported backend; no authority or storage.
  let disposed = false,
    timer: NodeJS.Timeout | undefined;
  let unsubscribe: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    transfer.dispose();
    unsubscribe?.();
    unsubscribe = undefined;
  };
  const close = () => {
    dispose();
    lease.release(); // Revoke input and clipboard before the close handshake.
    ws.close(1008, 'clipboard transfer failed');
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (disposed) return;
    const deadline = transfer.nextDeadline;
    if (deadline !== undefined) {
      timer = setTimeout(
        () => {
          timer = undefined;
          transfer.service();
        },
        Math.max(1, Math.ceil(deadline - performance.now())),
      );
      timer.unref();
    }
  };
  const transfer = new ClipboardTransfer(
    {
      snapshot: () => lease.clipboardSnapshot,
      start: () => lease.startClipboard(),
      read: (revision) => lease.readClipboardText(revision),
      write: (bytes) => lease.writeClipboardText(bytes),
    },
    {
      control: send,
      chunk: (bytes) =>
        new Promise<void>((resolve, reject) => {
          if (
            disposed ||
            ws.readyState !== WebSocket.OPEN ||
            ws.bufferedAmount + bytes.length > 65536
          ) {
            reject(new Error('Clipboard transport unavailable'));
            return;
          }
          ws.send(bytes, { binary: true }, (error) => {
            if (error) reject(new Error('Clipboard transport unavailable'));
            else resolve();
          });
        }),
      close,
      changed: arm,
    },
  );
  const offer = (snapshot: SessionClipboardSnapshot) => {
    if (disposed) return;
    send('clipboard.offer', {
      protocol: 'RWC1',
      version: 1,
      chunkBytes: CLIPBOARD_CHUNK_MAX_BYTES,
      window: CLIPBOARD_CHUNK_WINDOW,
      granted: snapshot.granted,
      retiring: snapshot.retiring,
      ...(snapshot.state
        ? {
            state: {
              ...snapshot.state,
              generation: snapshot.state.generation.toString(),
              revision: snapshot.state.revision.toString(),
            },
          }
        : {}),
    });
    transfer.service();
  };
  try {
    unsubscribe = lease.onClipboard(offer);
    offer(initial);
  } catch {
    close();
    return;
  }
  ws.once('close', dispose);
  return {
    dispose,
    binary(bytes) {
      try {
        if (!disposed) transfer.receive(bytes);
      } finally {
        bytes.fill(0);
      }
    },
    command(type, seq, data) {
      if (
        !['clipboard.set', 'clipboard.request', 'clipboard.ack'].includes(type)
      )
        return false;
      if (disposed) return true;
      try {
        if (type === 'clipboard.set' && setRequest.Check(data))
          transfer.set(seq, BigInt(data.generation), data.bytes);
        else if (type === 'clipboard.request' && readRequest.Check(data))
          transfer.read(seq, BigInt(data.generation), BigInt(data.revision));
        else if (type === 'clipboard.ack' && ack.Check(data))
          transfer.acknowledge(data.requestSeq, data.offset);
        else close();
      } catch {
        close();
      }
      return true;
    },
  };
}
