import {
  encodeClipboardChunk,
  decodeClipboardChunk,
  CLIPBOARD_CHUNK_MAX_BYTES as chunkBytes,
  CLIPBOARD_CHUNK_WINDOW as windowSize,
} from './clipboard-wire.js';
import { encodeClipboardText, decodeClipboardText } from './clipboard-text.js';
const windowBytes = chunkBytes * windowSize;
const statuses = [
  'accepted',
  'refused',
  'stale',
  'unavailable',
  'busy',
  'invalid',
  'timeout',
  'disconnected',
];
const integer = (n, maximum = 16777216) =>
  Number.isInteger(n) && n >= 0 && n <= maximum;
function u64(value, zero = false) {
  if (
    typeof value !== 'string' ||
    !(zero ? /^(0|[1-9][0-9]{0,19})$/ : /^[1-9][0-9]{0,19}$/).test(value) ||
    BigInt(value) > 0xffffffffffffffffn
  )
    throw new Error();
  return value;
}
/** One explicit item over the current control socket. No OS clipboard access or history. */
export class ClipboardClient {
  active;
  source;
  closed = false;
  lastTime;
  constructor(host, clock = () => performance.now()) {
    this.host = host;
    this.clock = clock;
  }
  get snapshot() {
    const s = this.source;
    return {
      available: Boolean(
        !this.closed && this.host.authorized() && s?.ready && !s.retiring,
      ),
      busy: Boolean(this.active),
      maximum: s?.maximum,
      toServer: s?.toServer === true,
      fromServer: s?.fromServer === true,
      remoteText: s?.remoteText === true,
    };
  }
  get nextDeadline() {
    const a = this.active;
    if (!a || this.closed) return;
    return Math.min(
      a.whole,
      a.progress,
      a.stage === 'upload' ? a.nextAt : Infinity,
    );
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    const a = this.active;
    this.active = undefined;
    this.source = undefined;
    if (a) {
      this.wipe(a);
      a.resolve({ status: 'disconnected' });
    }
    this.changed();
  }
  wipe(a) {
    a.buffer?.fill(0);
    a.buffer = undefined;
    for (const frame of a.frames) new Uint8Array(frame).fill(0);
    a.frames.length = 0;
  }
  fail() {
    if (this.closed) return;
    this.dispose();
    try {
      this.host.failed();
    } catch {
      /* Fixed cleanup only. */
    }
  }
  changed() {
    try {
      this.host.changed();
    } catch {
      this.fail();
    }
  }
  now() {
    if (this.closed) return;
    try {
      const t = this.clock(),
        a = this.active;
      if (
        !Number.isFinite(t) ||
        t < 0 ||
        t > Number.MAX_SAFE_INTEGER - 60000 ||
        (this.lastTime !== undefined && t < this.lastTime) ||
        (a && (t >= a.whole || t >= a.progress)) ||
        (a && !this.authority(a))
      )
        throw new Error();
      this.lastTime = t;
      return t;
    } catch {
      this.fail();
    }
  }
  authority(a) {
    const s = this.source;
    return (
      this.host.authorized() &&
      s?.ready &&
      !s.retiring &&
      s.generation === a.generation &&
      s.maximum === a.maximum
    );
  }
  offer(data) {
    if (this.now() === undefined) return;
    try {
      if (
        !data ||
        data.protocol !== 'RWC1' ||
        data.version !== 1 ||
        data.chunkBytes !== chunkBytes ||
        data.window !== windowSize ||
        typeof data.granted !== 'boolean' ||
        typeof data.retiring !== 'boolean'
      )
        throw new Error();
      let source;
      if (data.state !== undefined) {
        const s = data.state;
        if (!s || !integer(s.maximum) || s.maximum < 1) throw new Error();
        for (const field of [
          'ready',
          'toServer',
          'fromServer',
          'remoteText',
          'localAccepted',
          'localPending',
          'remotePending',
        ])
          if (typeof s[field] !== 'boolean') throw new Error();
        if (
          (!s.toServer && (s.localAccepted || s.localPending)) ||
          (!s.fromServer && (s.remoteText || s.remotePending)) ||
          (s.remoteText && s.revision === '0')
        )
          throw new Error();
        source = {
          ready: s.ready,
          toServer: s.toServer,
          fromServer: s.fromServer,
          remoteText: s.remoteText,
          localPending: s.localPending,
          remotePending: s.remotePending,
          maximum: s.maximum,
          generation: u64(s.generation),
          revision: u64(s.revision, true),
          retiring: data.retiring,
        };
        const old = this.source;
        if (
          old &&
          (old.generation !== source.generation ||
            old.maximum !== source.maximum ||
            old.toServer !== source.toServer ||
            old.fromServer !== source.fromServer ||
            BigInt(source.revision) < BigInt(old.revision))
        )
          throw new Error();
      }
      this.source = source;
      if (this.active && (!data.granted || !this.authority(this.active)))
        throw new Error();
    } catch {
      this.fail();
    }
    this.changed();
  }
  admit(operation, text) {
    const time = this.now(),
      s = this.source;
    if (time === undefined || !this.snapshot.available)
      return Promise.resolve({ status: 'unavailable' });
    if (this.active) return Promise.resolve({ status: 'busy' });
    if (
      operation === 'set'
        ? !s.toServer || s.localPending
        : !s.fromServer || !s.remoteText || s.remotePending
    )
      return Promise.resolve({ status: 'refused' });
    let buffer;
    try {
      if (operation === 'set') buffer = encodeClipboardText(text, s.maximum);
    } catch {
      return Promise.resolve({ status: 'invalid' });
    }
    const a = {
      operation,
      generation: s.generation,
      revision: s.revision,
      maximum: s.maximum,
      total: buffer?.length ?? 0,
      offset: 0,
      creditEnd: 0,
      buffer,
      frames: [],
      stage: operation === 'set' ? 'ready' : 'native',
      whole: time + 60000,
      progress: time + (operation === 'set' ? 2000 : 8000),
      nextAt: time,
      lastWindow: undefined,
    };
    const promise = new Promise((resolve) => {
      a.resolve = resolve;
    });
    this.active = a;
    try {
      const seq = this.host.sendControl(
        operation === 'set' ? 'clipboard.set' : 'clipboard.request',
        operation === 'set'
          ? { generation: a.generation, bytes: a.total }
          : { generation: a.generation, revision: a.revision },
      );
      if (!integer(seq, 0xffffffff)) throw new Error();
      a.seq = seq;
    } catch {
      this.fail();
    }
    this.changed();
    return promise;
  }
  set(text) {
    return this.admit('set', text);
  }
  read() {
    return this.admit('read');
  }
  finish(a, status, text) {
    if (this.active !== a) return;
    this.active = undefined;
    this.wipe(a);
    a.resolve({ status, ...(text === undefined ? {} : { text }) });
    this.changed();
  }
  message(type, data) {
    if (!type.startsWith('clipboard.')) return false;
    if (type === 'clipboard.offer') {
      this.offer(data);
      return true;
    }
    if (this.now() === undefined) return true;
    try {
      const a = this.active;
      if (!a || !data || data.requestSeq !== a.seq) throw new Error();
      if (type === 'clipboard.set.ready' || type === 'clipboard.set.ack') {
        if (
          a.operation !== 'set' ||
          data.creditEnd !== Math.min(a.total, a.offset + windowBytes)
        )
          throw new Error();
        if (
          type === 'clipboard.set.ready'
            ? a.stage !== 'ready' || data.bytes !== a.total
            : a.stage !== 'upload-ack' || data.offset !== a.offset
        )
          throw new Error();
        for (const frame of a.frames) new Uint8Array(frame).fill(0);
        a.frames.length = 0;
        a.creditEnd = data.creditEnd;
        a.stage = a.total ? 'upload' : 'native';
        a.progress = this.lastTime + (a.total ? 2000 : 8000);
        a.nextAt = Math.max(this.lastTime, (a.lastWindow ?? -64) + 64);
        this.service();
      } else if (type === 'clipboard.set.result') {
        if (
          a.operation !== 'set' ||
          !['ready', 'native'].includes(a.stage) ||
          !statuses.includes(data.status) ||
          data.bytes !== 0 ||
          (data.status === 'accepted' && a.stage !== 'native')
        )
          throw new Error();
        this.finish(a, data.status);
      } else if (type === 'clipboard.data') {
        if (
          a.operation !== 'read' ||
          a.stage !== 'native' ||
          !statuses.includes(data.status) ||
          !integer(data.bytes) ||
          data.bytes > a.maximum
        )
          throw new Error();
        if (data.status !== 'accepted') {
          if (data.bytes !== 0) throw new Error();
          this.finish(a, data.status);
        } else {
          if (
            data.generation !== a.generation ||
            data.revision !== a.revision ||
            data.creditEnd !== Math.min(data.bytes, windowBytes)
          )
            throw new Error();
          a.total = data.bytes;
          a.creditEnd = data.creditEnd;
          a.buffer = new Uint8Array(a.total);
          a.stage = 'download';
          a.progress = this.lastTime + 2000;
          if (!a.total) this.acknowledge(a);
        }
      } else if (type === 'clipboard.data.complete') {
        if (
          a.operation !== 'read' ||
          a.stage !== 'complete' ||
          a.offset !== a.total ||
          data.status !== 'accepted' ||
          data.bytes !== 0
        )
          throw new Error();
        this.finish(a, 'accepted', decodeClipboardText(a.buffer, a.maximum));
      } else throw new Error();
    } catch {
      this.fail();
    }
    this.changed();
    return true;
  }
  binary(record) {
    try {
      if (this.now() === undefined) return;
      const a = this.active,
        c = decodeClipboardChunk(record);
      if (
        !a ||
        a.stage !== 'download' ||
        c.requestSeq !== a.seq ||
        c.offset !== a.offset ||
        c.bytes.length !== Math.min(chunkBytes, a.total - a.offset) ||
        a.offset + c.bytes.length > a.creditEnd
      )
        throw new Error();
      a.buffer.set(c.bytes, a.offset);
      a.offset += c.bytes.length;
      if (a.offset === a.creditEnd) this.acknowledge(a);
    } catch {
      this.fail();
    } finally {
      if (record instanceof ArrayBuffer) new Uint8Array(record).fill(0);
      this.changed();
    }
  }
  acknowledge(a) {
    a.stage = a.offset === a.total ? 'complete' : 'download';
    a.creditEnd = Math.min(a.total, a.offset + windowBytes);
    a.progress = this.lastTime + 2000;
    const seq = this.host.sendControl('clipboard.ack', {
      requestSeq: a.seq,
      offset: a.offset,
    });
    if (!integer(seq, 0xffffffff)) throw new Error();
  }
  service() {
    const time = this.now(),
      a = this.active;
    if (time === undefined || !a || a.stage !== 'upload' || time < a.nextAt) {
      this.changed();
      return;
    }
    try {
      if (a.lastWindow === undefined || a.offset % windowBytes === 0)
        a.lastWindow = time;
      while (
        this.active === a &&
        a.stage === 'upload' &&
        a.offset < a.creditEnd
      ) {
        const next = Math.min(a.total, a.offset + chunkBytes);
        const queued = this.host.bufferedAmount();
        if (!integer(queued, 65536)) throw new Error();
        if (queued + 20 + next - a.offset > 8192) {
          a.nextAt = time + 5;
          break;
        }
        const frame = encodeClipboardChunk({
          requestSeq: a.seq,
          offset: a.offset,
          bytes: a.buffer.subarray(a.offset, next),
        });
        a.frames.push(frame);
        a.offset = next;
        if (a.offset === a.creditEnd) {
          a.stage = a.offset === a.total ? 'native' : 'upload-ack';
          if (a.stage === 'native') {
            a.progress = time + 8000;
            a.buffer.fill(0);
            a.buffer = undefined;
          }
        }
        if (this.host.sendBinary(frame) !== true) throw new Error();
      }
    } catch {
      this.fail();
    }
    this.changed();
  }
}
