import { MicrophoneCapture } from './microphone-capture.js';

const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
class BridgeMicrophoneProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.command = 0;
    this.faultReported = false;
    this.disposed = false;
    this.capture = new MicrophoneCapture((packet) =>
      this.port.postMessage({ type: 'packet', ...packet }, [packet.pcm]),
    );
    const initial = options?.processorOptions;
    if (
      sampleRate !== 48000 ||
      !exact(initial, ['epoch']) ||
      !this.capture.configure(initial.epoch, currentFrame)
    )
      this.capture.close();
    this.port.postMessage({
      type: 'ready',
      accepted: !this.capture.stats.closed,
    });
    this.port.onmessage = ({ data }) => {
      if (this.capture.stats.closed) return;
      let accepted = false;
      if (exact(data, ['type', 'id']) && data.type === 'ack') {
        accepted = this.capture.acknowledge(data.id, currentFrame);
        if (!accepted) {
          this.capture.close();
          this.reportFault();
        }
        return; // Packet credit never generates a second acknowledgment stream.
      }
      if (
        data &&
        Number.isInteger(data.id) &&
        data.id > this.command &&
        data.id <= 0xffffffff
      ) {
        if (exact(data, ['type', 'id', 'epoch']) && data.type === 'config')
          accepted = this.capture.configure(data.epoch, currentFrame);
        else if (exact(data, ['type', 'id']) && data.type === 'pause')
          accepted = this.capture.pause(currentFrame);
        else if (exact(data, ['type', 'id']) && data.type === 'dispose') {
          this.disposed = true;
          this.capture.close();
          accepted = true;
        }
      }
      if (!accepted) this.capture.close();
      if (Number.isInteger(data?.id) && data.id >= 1 && data.id <= 0xffffffff) {
        this.command = data.id;
        this.port.postMessage({ type: 'result', id: data.id, accepted });
      }
      if (!accepted) this.reportFault();
    };
  }
  reportFault() {
    if (this.faultReported) return;
    this.faultReported = true;
    this.port.postMessage({ type: 'fault' });
  }
  process(inputs, outputs) {
    // Keep a silent connected output so the graph is pulled, with no local microphone monitoring.
    for (const channels of outputs)
      for (const channel of channels) channel.fill(0);
    if (this.disposed) return false;
    if (!Array.isArray(inputs) || inputs.length !== 1) {
      this.capture.close();
      this.reportFault();
      return false;
    }
    const active = this.capture.render(inputs[0], currentFrame);
    if (!active) this.reportFault();
    return active;
  }
}
registerProcessor('bridge-microphone-s16le', BridgeMicrophoneProcessor);
