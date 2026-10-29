import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker } from './session-worker.mjs';

const workerPath = resolve(
  process.env.BRIDGE_FILE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);

// Actual native file/lifecycle IPC; only the RDP connection state is synthetic.
export class NativeFileWorker extends FakeSessionWorker {
  constructor(runtimeRoot, limits, transport) {
    super();
    this.calls = [];
    this.policy = limits.files;
    this.native = new WorkerProcess({
      workerPath,
      runtimeRoot,
      maxWriteBytes: 131072,
      ...(transport ? { ipcTransport: transport } : {}),
    });
  }
  async start(config, signal) {
    await this.native.start();
    const p = this.policy;
    assert.equal(
      (
        await this.native.nativeFileCommand({
          operation: 'initialize',
          id: BigInt(p.maxTotalBytes),
          argument: BigInt(p.maxFileBytes),
          value: BigInt(p.maxEntries),
        })
      ).status,
      'ok',
    );
    await super.start(config, signal);
  }
  fileCommand(command) {
    this.calls.push({
      operation: command.operation,
      bytes: command.data?.length ?? 0,
    });
    return this.native.nativeFileCommand(command);
  }
  async close() {
    await this.native.close();
    await super.close();
  }
  async terminate() {
    this.native.terminate();
    await this.native.close();
  }
}
