import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

/** Explicit fake RDP backend for Stage 2 orchestration; no native/RDP integration claim. */
export class FakeSessionWorker extends EventEmitter {
  constructor(mode = 'connected') {
    super();
    this.mode = mode;
    this.started = 0;
    this.closed = 0;
    this.terminated = 0;
  }
  onState(listener) {
    this.on('state', listener);
    return () => this.off('state', listener);
  }
  onFailure(listener) {
    this.on('failure', listener);
    return () => this.off('failure', listener);
  }
  onCursor(listener) {
    this.on('cursor', listener);
    return () => this.off('cursor', listener);
  }
  onDisplay(listener) {
    this.on('display', listener);
    return () => this.off('display', listener);
  }
  onTouch(listener) {
    this.on('touch', listener);
    return () => this.off('touch', listener);
  }
  async start(config, signal) {
    this.started++;
    this.received = config;
    if (signal.aborted) throw new Error('aborted');
    if (this.mode === 'start-error')
      throw new Error('untrusted worker diagnostic');
    this.emit('state', 'connecting');
    if (this.mode === 'start-hang') {
      await new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
      return;
    }
    if (this.mode === 'starting') return;
    await Promise.resolve();
    if (!signal.aborted) this.emit('state', 'connected');
  }
  async close() {
    this.closed++;
    if (this.mode === 'close-hang') await new Promise(() => {});
    this.emit('state', 'closed');
  }
  terminate() {
    this.terminated++;
  }
  crash() {
    this.emit('failure', new Error('untrusted worker diagnostic'));
  }
}
export function fakeFactory(mode = 'connected') {
  const workers = [];
  return {
    workers,
    workerFactory() {
      const worker = new FakeSessionWorker(mode);
      workers.push(worker);
      return worker;
    },
  };
}
export async function eventually(predicate, timeoutMs = 3000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw new Error('Invalid fixture wait deadline');
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline)
      throw new Error('Test condition deadline exceeded');
    await delay(5);
  }
}
