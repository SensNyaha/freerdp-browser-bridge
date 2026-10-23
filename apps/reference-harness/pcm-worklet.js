import { PcmPlaybackQueue } from './pcm-queue.js';

class BridgePcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.queue = new PcmPlaybackQueue();
    this.closed = sampleRate !== 48000;
    // Optional bounded initial handoff avoids a startup MessagePort backlog.
    const initial = options?.processorOptions?.initial;
    if (initial !== undefined) {
      if (
        !initial ||
        !Array.isArray(initial.packets) ||
        initial.packets.length > 2 ||
        !this.queue.configure(initial.epoch)
      )
        this.closed = true;
      else
        for (const packet of initial.packets)
          if (!this.queue.push(packet)) this.closed = true;
    }
    if (this.closed) this.queue.disable();
    this.port.onmessage = ({ data }) => {
      if (!data || !Number.isSafeInteger(data.id) || data.id < 1 || this.closed)
        return;
      let accepted = false;
      if (data.type === 'config') accepted = this.queue.configure(data.epoch);
      else if (data.type === 'packet') accepted = this.queue.push(data.packet);
      else if (data.type === 'reset' || data.type === 'dispose') {
        this.queue.disable();
        accepted = true;
        this.closed = data.type === 'dispose';
      } else if (data.type === 'stats') accepted = true;
      if (!accepted) {
        this.closed = true;
        this.queue.disable();
      }
      this.port.postMessage({
        type: 'ack',
        id: data.id,
        accepted,
        ...(data.type === 'stats' ? { stats: this.queue.stats() } : {}),
      });
    };
  }
  process(_inputs, outputs) {
    if (this.closed) return false;
    const channels = outputs[0];
    if (!channels || channels.length !== 2) return true;
    if (!this.queue.render(channels[0], channels[1])) {
      this.queue.disable();
      this.closed = true;
      return false;
    }
    return true;
  }
}
registerProcessor('bridge-pcm-s16le', BridgePcmProcessor);
