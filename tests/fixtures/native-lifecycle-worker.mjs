import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';

// Test-only registry adapter for real native lifecycle IPC. It never sends
// CONFIGURE, SECRET or CONNECT and never reports an RDP connected state.
export class NativeLifecycleWorker extends EventEmitter {
  constructor(options) {
    super();
    this.native = this.createWorkerProcess(options);
    this.native.on('failure', () => {
      if (!this.closing) this.emit('failure', 'WORKER_FAILED');
    });
  }
  createWorkerProcess(options) {
    return new WorkerProcess(options);
  }
  onState(listener) {
    this.on('state', listener);
    return () => this.off('state', listener);
  }
  onFailure(listener) {
    this.on('failure', listener);
    return () => this.off('failure', listener);
  }
  async start(_config, signal) {
    if (signal.aborted) throw new Error('Lifecycle startup was cancelled');
    const abort = () => {
      // The final joined close observes rejection of this same promise.
      void this.close().catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      this.emit('state', 'connecting');
      assert.equal((await this.native.start()).transport, 'framed-pipes');
      if (signal.aborted) throw new Error('Lifecycle startup was cancelled');
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  close() {
    this.closing = true;
    if (this.native.state === 'starting') this.native.terminate();
    this.closePromise ??= this.native.close().then(() => {
      this.emit('state', 'closed');
    });
    return this.closePromise;
  }
  terminate() {
    return this.close();
  }
}
