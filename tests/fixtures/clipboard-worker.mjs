// Synthetic private IPC only. No FreeRDP, RDP server, GUI or OS clipboard.
import {
  Kind,
  PacketDecoder,
  encodePacket,
  decodeClipboardCommand,
  encodeClipboardState,
  encodeClipboardResult,
  encodeClipboardHtmlItem,
  encodeClipboardImageItem,
  decodeClipboardImageItem,
} from '../../packages/protocol/dist/index.js';
const requestedMode = process.argv[2] ?? 'valid';
const htmlMode = requestedMode.startsWith('html-');
const imageMode = requestedMode.startsWith('image-');
const mode = htmlMode
  ? requestedMode.slice(5)
  : imageMode
    ? requestedMode.slice(6)
    : requestedMode;
const decoder = new PacketDecoder();
let state, held;
const send = (kind, requestId, payload = Buffer.alloc(0)) => {
  const bytes = encodePacket({ kind, requestId, payload });
  if (process.stdout.writableLength + bytes.length > 16777216 + 65536)
    process.exit(2);
  process.stdout.write(bytes, () => {
    if (kind === Kind.ClipboardResult) bytes.fill(0);
  });
};
const source = () => send(Kind.ClipboardState, 0n, encodeClipboardState(state));
const reply = (p, command) => {
  if (mode === 'timeout') return;
  if (mode === 'stale') {
    ++state.revision;
    source();
  }
  if (mode === 'terminal') {
    send(Kind.State, 0n, Buffer.from([0, 4, 0, 0, 0, 0, 0, 0]));
    source(); // Already queued state cannot revive authority.
  }
  if (
    command.operation === 'set' ||
    command.operation === 'set-html' ||
    command.operation === 'set-image'
  ) {
    state.localAccepted = true;
    if (state.html) state.localHtmlAccepted = command.operation === 'set-html';
    if (state.image)
      state.localImageAccepted = command.operation === 'set-image';
    source();
  }
  if (command.operation === 'revoke') {
    state.localAccepted = mode === 'revoke-stale';
    if (state.html)
      state.localHtmlAccepted = !state.image && mode === 'revoke-stale';
    if (state.image) state.localImageAccepted = mode === 'revoke-stale';
    source();
  }
  const payload = encodeClipboardResult({
    operation: mode === 'mismatch' ? 'set' : command.operation,
    generation: command.generation,
    revision: mode === 'mismatch' ? 0n : command.revision,
    status: 'accepted',
    text:
      mode === 'mismatch'
        ? Buffer.alloc(0)
        : command.operation === 'read-image'
          ? encodeClipboardImageItem({
              width: mode === 'overquota' ? 257 : 2,
              height: 1,
              rgba:
                mode === 'overquota'
                  ? Buffer.alloc(1028, 65)
                  : Buffer.from('12345678fedcba98', 'hex'),
            })
          : command.operation === 'read-html'
            ? (() => {
                const body =
                  mode === 'overquota'
                    ? Buffer.alloc(1025, 65)
                    : Buffer.from(
                        '<html><body><b>\u0416\ud83d\ude00</b></body></html>',
                      );
                return encodeClipboardHtmlItem({
                  body,
                  fragmentOffset: mode === 'overquota' ? 0 : 12,
                  fragmentBytes: mode === 'overquota' ? body.length : 13,
                  context: mode !== 'overquota',
                  selection: mode !== 'overquota',
                  selectionOffset: mode === 'overquota' ? 0 : 15,
                  selectionBytes: mode === 'overquota' ? 0 : 6,
                  text: Buffer.from('\u0416\ud83d\ude00'),
                });
              })()
            : mode === 'mismatch' || command.operation !== 'read'
              ? Buffer.alloc(0)
              : mode === 'overquota'
                ? Buffer.alloc(1024, 65)
                : Buffer.from('A\nЖ😀'),
  });
  if (mode === 'malformed' && command.operation === 'read-image')
    payload.writeUInt32BE(0, 28);
  send(Kind.ClipboardResult, p.requestId, payload);
  if (mode === 'duplicate') send(Kind.ClipboardResult, p.requestId, payload);
  payload.fill(0);
};
process.stdin.on('data', (b) => {
  try {
    decoder.push(b, (p) => {
      if (p.kind === Kind.Hello) {
        const strings = [
          '0.1.0',
          'synthetic-clipboard',
          '3.32.1',
          '3.32.1',
          'fake',
          'x64',
          'framed-pipes',
        ].flatMap((text) => {
          const bytes = Buffer.from(text),
            n = Buffer.alloc(2);
          n.writeUInt16BE(bytes.length);
          return [n, bytes];
        });
        send(
          Kind.HelloAck,
          p.requestId,
          Buffer.concat([
            Buffer.from([0, 1, 0, 5]),
            ...strings,
            ...(mode === 'legacy'
              ? []
              : [
                  Buffer.from([
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    (htmlMode || (imageMode && mode !== 'no-html') ? 1 : 0) |
                      (imageMode && mode !== 'no-image' ? 2 : 0),
                    mode === 'no-revoke' ? 8 : 24,
                  ]),
                ]),
          ]),
        );
      } else if (p.kind === Kind.Configure) {
        const schema = p.payload.readUInt16BE(0);
        const selectedRich = schema >= 12;
        if (
          mode === 'legacy' ||
          schema !==
            (imageMode && mode !== 'unselected' ? 14 : htmlMode ? 13 : 10)
        )
          process.exit(2);
        const flags = p.payload.readUInt32BE(
          p.payload.length - (selectedRich ? 13 : 8),
        );
        state = {
          generation: 1n,
          revision: 1n,
          maximum: p.payload.readUInt32BE(
            p.payload.length - (selectedRich ? 9 : 4),
          ),
          ready: true,
          toServer: Boolean(flags & 128),
          fromServer: Boolean(flags & 256),
          remoteText: Boolean(flags & 256),
          localAccepted: false,
          localPending: false,
          remotePending: false,
          ...(flags & 512
            ? {
                html: true,
                remoteHtml: Boolean(flags & 256),
                localHtmlAccepted: false,
              }
            : {}),
          ...(flags & 1024
            ? {
                image: true,
                remoteImage: Boolean(flags & 256),
                localImageAccepted: false,
              }
            : {}),
        };
        send(Kind.ConfigureAck, p.requestId);
      } else if (p.kind === Kind.Secret) {
        p.payload.fill(0);
        send(Kind.SecretAck, p.requestId);
      } else if (p.kind === Kind.Connect) {
        send(Kind.ConnectAck, p.requestId);
        if (mode === 'premature') source();
        send(Kind.State, 0n, Buffer.from([0, 3, 0, 0, 0, 0, 0, 0]));
        if (mode === 'bad-state') state.maximum += 1;
        if (mode === 'downgrade') {
          delete state.image;
          delete state.remoteImage;
          delete state.localImageAccepted;
        }
        source();
        if (mode === 'generation') {
          ++state.generation;
          source();
        }
        if (mode === 'backward') {
          state.revision = 0n;
          state.remoteText = false;
          if (state.html) state.remoteHtml = false;
          if (state.image) state.remoteImage = false;
          source();
        }
      } else if (p.kind === Kind.ClipboardCommand) {
        const c = decodeClipboardCommand(p.payload);
        if (mode === 'check-write' && c.operation === 'set-image') {
          const image = decodeClipboardImageItem(c.text);
          if (
            image.width !== 2 ||
            image.height !== 1 ||
            !image.rgba.equals(Buffer.from('12345678fedcba98', 'hex'))
          )
            process.exit(2);
        }
        // Copy scalars only; result text is independently generated synthetic input.
        const command = {
          operation: c.operation,
          generation: c.generation,
          revision: c.revision,
        };
        p.payload.fill(0);
        if (mode === 'source-close') {
          state.ready = false;
          state.remoteText = false;
          state.localAccepted = false;
          if (state.html) {
            state.remoteHtml = false;
            state.localHtmlAccepted = false;
          }
          if (state.image) {
            state.remoteImage = false;
            state.localImageAccepted = false;
          }
          source();
          held = [p, command];
        } else if (mode === 'hold') held = [p, command];
        else reply(p, command);
      } else if (p.kind === Kind.Heartbeat) {
        send(Kind.HeartbeatAck, p.requestId);
        if (held) {
          const [packet, command] = held;
          held = undefined;
          reply(packet, command);
        }
      } else if (p.kind === Kind.Shutdown) {
        send(Kind.ShutdownAck, p.requestId);
        process.stdin.pause();
        process.stdout.end(() => process.exit(0));
      } else process.exit(2);
    });
  } catch {
    process.exit(2);
  }
});
process.stdin.on('end', () => process.exit(0));
