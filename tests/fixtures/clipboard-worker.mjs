// Synthetic private IPC only. No FreeRDP, RDP server, GUI or OS clipboard.
import {
  Kind,
  PacketDecoder,
  encodePacket,
  decodeClipboardCommand,
  encodeClipboardState,
  encodeClipboardResult,
  encodeClipboardHtmlItem,
} from '../../packages/protocol/dist/index.js';
const requestedMode = process.argv[2] ?? 'valid';
const htmlMode = requestedMode.startsWith('html-');
const mode = htmlMode ? requestedMode.slice(5) : requestedMode;
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
  if (command.operation === 'set' || command.operation === 'set-html') {
    state.localAccepted = true;
    if (htmlMode) state.localHtmlAccepted = command.operation === 'set-html';
    source();
  }
  if (command.operation === 'revoke') {
    state.localAccepted = mode === 'revoke-stale';
    if (htmlMode) state.localHtmlAccepted = mode === 'revoke-stale';
    source();
  }
  const payload = encodeClipboardResult({
    operation: mode === 'mismatch' ? 'set' : command.operation,
    generation: command.generation,
    revision: mode === 'mismatch' ? 0n : command.revision,
    status: 'accepted',
    text:
      command.operation === 'read-html'
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
                    htmlMode ? 1 : 0,
                    mode === 'no-revoke' ? 8 : 24,
                  ]),
                ]),
          ]),
        );
      } else if (p.kind === Kind.Configure) {
        if (
          mode === 'legacy' ||
          p.payload.readUInt16BE(0) !== (htmlMode ? 13 : 10)
        )
          process.exit(2);
        const flags = p.payload.readUInt32BE(
          p.payload.length - (htmlMode ? 13 : 8),
        );
        state = {
          generation: 1n,
          revision: 1n,
          maximum: p.payload.readUInt32BE(
            p.payload.length - (htmlMode ? 9 : 4),
          ),
          ready: true,
          toServer: Boolean(flags & 128),
          fromServer: Boolean(flags & 256),
          remoteText: Boolean(flags & 256),
          localAccepted: false,
          localPending: false,
          remotePending: false,
          ...(htmlMode
            ? {
                html: true,
                remoteHtml: Boolean(flags & 256),
                localHtmlAccepted: false,
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
        source();
        if (mode === 'generation') {
          ++state.generation;
          source();
        }
        if (mode === 'backward') {
          state.revision = 0n;
          state.remoteText = false;
          if (htmlMode) state.remoteHtml = false;
          source();
        }
      } else if (p.kind === Kind.ClipboardCommand) {
        const c = decodeClipboardCommand(p.payload);
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
          if (htmlMode) {
            state.remoteHtml = false;
            state.localHtmlAccepted = false;
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
