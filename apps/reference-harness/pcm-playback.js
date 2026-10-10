const MAX_TIMESTAMP = 0xffffffffffffffffn - 20000n;
const AVAILABILITY = [
  'unavailable',
  'waiting',
  'ready',
  'suspended',
  'closed',
  'failed',
];
const STATS_FIELDS = [
  'configurations',
  'packets',
  'playedFrames',
  'underflowFrames',
  'underflows',
  'bufferingSilenceFrames',
  'overflowSkippedFrames',
  'resetDiscardedFrames',
  'invalidCalls',
  'highWaterFrames',
  'queuedFrames',
];
const invalid = () => new Error('Invalid PCM audio record');
function add(counters, name, amount = 1) {
  counters[name] = Math.min(Number.MAX_SAFE_INTEGER, counters[name] + amount);
}
/** Isolated RWB1 parser; sample bytes borrow the validated input until copied. */
export function parsePcmAudioRecord(bytes) {
  if (
    !(bytes instanceof ArrayBuffer) ||
    ![48, 68, 3868].includes(bytes.byteLength)
  )
    throw invalid();
  const view = new DataView(bytes),
    type = view.getUint8(5),
    flags = view.getUint16(6);
  const timestampUs = view.getBigUint64(16),
    sequence = view.getUint32(12);
  if (
    view.getUint32(0) !== 0x52574231 ||
    view.getUint8(4) !== 1 ||
    view.getUint32(8) !== 3 ||
    view.getUint32(24) !== bytes.byteLength - 28 ||
    timestampUs > MAX_TIMESTAMP
  )
    throw invalid();
  if (type === 9) {
    if (bytes.byteLength !== 68 || flags !== 2) throw invalid();
    const enabled = view.getUint8(30),
      availability = AVAILABILITY[view.getUint8(31)],
      revision = view.getBigUint64(32),
      epoch = view.getBigUint64(40);
    if (
      view.getUint16(28) !== 1 ||
      enabled > 1 ||
      availability === undefined ||
      revision === 0n ||
      (enabled === 0 && (availability !== 'unavailable' || epoch !== 0n)) ||
      (availability === 'ready' && epoch === 0n) ||
      view.getBigUint64(48) !== timestampUs ||
      view.getUint8(56) !== (enabled ? 2 : 0) ||
      view.getUint8(57) !== (enabled ? 2 : 0) ||
      view.getUint8(58) !== (enabled ? 1 : 0) ||
      view.getUint8(59) !== 0 ||
      view.getUint32(60) !== (enabled ? 48000 : 0) ||
      view.getUint16(64) !== (enabled ? 960 : 0) ||
      view.getUint16(66) !== 0
    )
      throw invalid();
    return {
      type: 'state',
      enabled: enabled === 1,
      availability,
      revision,
      epoch,
      timestampUs,
      sequence,
    };
  }
  if (type === 3) {
    if (
      bytes.byteLength !== 48 ||
      flags !== 2 ||
      view.getUint8(28) !== 1 ||
      view.getUint8(29) !== 2 ||
      view.getUint8(30) !== 2 ||
      view.getUint8(31) !== 1 ||
      view.getUint32(32) !== 48000 ||
      view.getUint16(36) !== 960 ||
      view.getUint16(38) !== 0 ||
      view.getBigUint64(40) === 0n
    )
      throw invalid();
    return {
      type: 'config',
      epoch: view.getBigUint64(40),
      timestampUs,
      sequence,
    };
  }
  if (type !== 4 || bytes.byteLength !== 3868 || (flags !== 0 && flags !== 2))
    throw invalid();
  return {
    type: 'packet',
    timestampUs,
    sequence,
    discontinuity: flags === 2,
    pcm: new Uint8Array(bytes, 28),
  };
}
/** One posted command, one pending config, one pending PCM and one stats flag. */
export class PcmPortSender {
  constructor(port, { timeoutMs = 2000, onFailure, cleanup } = {}) {
    if (
      !port ||
      typeof port.postMessage !== 'function' ||
      typeof port.close !== 'function' ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 10 ||
      timeoutMs > 5000
    )
      throw invalid();
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.onFailure = onFailure;
    this.cleanup = cleanup;
    this.sequence = this.id = 0;
    this.epoch = this.configTimestamp = this.timestamp = undefined;
    this.pendingConfig = this.pendingPacket = this.flight = undefined;
    this.pendingStats = this.closed = false;
    this.boundary = this.nextDiscontinuity = true;
    this.timer = this.closePromise = this.remoteStats = undefined;
    this.counters = {
      records: 0,
      posted: 0,
      acknowledged: 0,
      replacedPackets: 0,
      resetDiscardedPackets: 0,
    };
    port.onmessage = ({ data }) => this.acknowledge(data);
    port.onmessageerror = () => this.fail('message');
  }
  record(bytes) {
    if (this.closed) return false;
    try {
      const record = parsePcmAudioRecord(bytes);
      if (record.sequence !== this.sequence || this.sequence > 0xffffffff)
        throw invalid();
      // Codec preparation only; status-aware playback ownership is a later block.
      if (record.type === 'state') throw invalid();
      if (record.type === 'config') {
        if (
          (this.epoch !== undefined && record.epoch < this.epoch) ||
          (this.timestamp !== undefined && record.timestampUs < this.timestamp)
        )
          throw invalid();
        if (this.pendingPacket) add(this.counters, 'resetDiscardedPackets');
        this.pendingPacket = undefined;
        this.epoch = record.epoch;
        this.configTimestamp = record.timestampUs;
        this.pendingConfig = { type: 'config', epoch: record.epoch };
        this.boundary = this.nextDiscontinuity = true;
      } else {
        if (
          this.epoch === undefined ||
          record.timestampUs < this.configTimestamp ||
          (this.boundary && !record.discontinuity) ||
          (this.timestamp !== undefined &&
            (record.timestampUs <= this.timestamp ||
              (!record.discontinuity &&
                record.timestampUs !== this.timestamp + 20000n)))
        )
          throw invalid();
        const pcm = record.pcm.slice().buffer;
        if (this.pendingPacket) {
          add(this.counters, 'replacedPackets');
          this.nextDiscontinuity = true;
        }
        this.pendingPacket = {
          epoch: this.epoch,
          timestampUs: record.timestampUs,
          discontinuity: record.discontinuity,
          pcm,
        };
        this.timestamp = record.timestampUs;
        this.boundary = false;
      }
      this.sequence++;
      add(this.counters, 'records');
      this.flush();
      return !this.closed;
    } catch {
      this.fail('protocol');
      return false;
    }
  }
  requestStats() {
    if (this.closed) return false;
    this.pendingStats = true;
    this.flush();
    return !this.closed;
  }
  flush() {
    if (this.closed || this.flight) return;
    let command,
      transfer = [];
    if (this.pendingConfig) {
      command = this.pendingConfig;
      this.pendingConfig = undefined;
    } else if (this.pendingStats) {
      command = { type: 'stats' };
      this.pendingStats = false;
    } else if (this.pendingPacket) {
      const packet = this.pendingPacket;
      this.pendingPacket = undefined;
      packet.discontinuity ||= this.nextDiscontinuity;
      this.nextDiscontinuity = false;
      command = { type: 'packet', packet };
      transfer = [packet.pcm];
    } else return;
    if (this.id === Number.MAX_SAFE_INTEGER) {
      this.fail('sequence');
      return;
    }
    const id = ++this.id;
    this.flight = { id, type: command.type };
    this.timer = setTimeout(() => {
      if (this.flight?.id === id) this.fail('deadline');
    }, this.timeoutMs);
    try {
      this.port.postMessage({ ...command, id }, transfer);
      add(this.counters, 'posted');
    } catch {
      this.fail('message');
    }
  }
  acknowledge(reply) {
    if (this.closed) return;
    if (
      !this.flight ||
      !reply ||
      reply.type !== 'ack' ||
      reply.id !== this.flight.id ||
      reply.accepted !== true
    ) {
      this.fail('acknowledgment');
      return;
    }
    if (this.flight.type === 'stats') {
      const stats = reply.stats;
      if (
        !stats ||
        Object.keys(stats).length !== STATS_FIELDS.length + 1 ||
        typeof stats.buffering !== 'boolean' ||
        STATS_FIELDS.some(
          (key) => !Number.isSafeInteger(stats[key]) || stats[key] < 0,
        ) ||
        stats.queuedFrames > 5760 ||
        stats.highWaterFrames > 5760
      ) {
        this.fail('statistics');
        return;
      }
      this.remoteStats = { ...stats };
    }
    clearTimeout(this.timer);
    this.timer = this.flight = undefined;
    add(this.counters, 'acknowledged');
    this.flush();
  }
  snapshot() {
    return {
      ...this.counters,
      closed: this.closed,
      inFlight: this.flight ? 1 : 0,
      pendingPacketBytes: this.pendingPacket ? 3840 : 0,
      pendingConfig: Boolean(this.pendingConfig),
      remote: this.remoteStats ? { ...this.remoteStats } : undefined,
    };
  }
  fail(reason) {
    if (this.closed) return;
    void this.close();
    try {
      this.onFailure?.(reason);
    } catch {
      /* Observer errors cannot retain the audio owner. */
    }
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    clearTimeout(this.timer);
    this.timer =
      this.flight =
      this.pendingConfig =
      this.pendingPacket =
        undefined;
    this.pendingStats = false;
    this.port.onmessage = this.port.onmessageerror = null;
    try {
      this.port.close();
    } catch {
      /* Retire local ownership and close the context anyway. */
    }
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    this.closePromise = Promise.resolve()
      .then(() => cleanup?.())
      .catch(() => {
        try {
          this.onFailure?.('cleanup');
        } catch {
          /* Cleanup remains complete. */
        }
      });
    return this.closePromise;
  }
}
/** Caller transfers exclusive AudioContext ownership after explicit user activation. */
export async function createPcmPlayback(context, options = {}) {
  if (
    !context ||
    context.sampleRate !== 48000 ||
    context.state !== 'running' ||
    !context.audioWorklet
  )
    throw invalid();
  let node, sender;
  const stateChanged = () => {
    if (context.state !== 'running') sender?.fail('context');
  };
  try {
    await context.audioWorklet.addModule(
      new URL('./pcm-worklet.js', import.meta.url),
    );
    node = new AudioWorkletNode(context, 'bridge-pcm-s16le', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    sender = new PcmPortSender(node.port, {
      timeoutMs: options.timeoutMs,
      onFailure: options.onFailure,
      cleanup: async () => {
        context.removeEventListener('statechange', stateChanged);
        node.disconnect();
        if (context.state !== 'closed') await context.close();
      },
    });
    context.addEventListener('statechange', stateChanged);
    node.addEventListener('processorerror', () => sender.fail('processor'), {
      once: true,
    });
    node.connect(context.destination);
    stateChanged();
    return sender;
  } catch {
    if (sender) await sender.close();
    else {
      node?.disconnect();
      node?.port.close();
      context.removeEventListener('statechange', stateChanged);
      if (context.state !== 'closed') await context.close();
    }
    throw invalid();
  }
}
