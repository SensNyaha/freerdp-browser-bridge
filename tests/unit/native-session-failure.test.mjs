import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  classifyNativeConnectionFailure,
  NativeSessionWorker,
} from '../../packages/node-bridge/dist/index.js';

const paths = { workerPath: 'unused-worker', runtimeRoot: 'unused-runtime' };

test('native connection failure maps documented remote ERRINFO values without reclassifying other failures', () => {
  const event = (nativeError, error = 'RDP_DISCONNECTED') => ({
    nativeError,
    state: 'failed',
    error,
  });

  assert.equal(
    classifyNativeConnectionFailure(event(0x00010003)),
    'RDP_SERVER_TIMEOUT',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010004)),
    'RDP_SERVER_TIMEOUT',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010411)),
    'RDP_SERVER_TIMEOUT',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010409)),
    'RDP_CONNECT_CANCELLED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010007)),
    'RDP_SERVER_REJECTED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010009)),
    'RDP_SERVER_REJECTED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010400)),
    'RDP_SERVER_REJECTED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x0001000a)),
    'RDP_AUTHENTICATION_FAILED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010005)),
    'RDP_SESSION_REPLACED',
  );
  for (const nativeError of [
    0x00010006, 0x0001000f, 0x00010010, 0x00010011, 0x00010012, 0x00010017,
    0x00010018,
  ])
    assert.equal(
      classifyNativeConnectionFailure(event(nativeError)),
      'RDP_SERVER_FAILURE',
      nativeError.toString(16),
    );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010002)),
    'RDP_SERVER_LOGOFF',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010001)),
    'RDP_SERVER_DISCONNECT',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x0001000b)),
    'RDP_SERVER_DISCONNECT',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x0001000c)),
    'RDP_SERVER_LOGOFF',
  );
  for (const nativeError of [
    0x00010100, 0x00010101, 0x00010102, 0x00010103, 0x00010104, 0x00010105,
    0x00010106, 0x00010107, 0x00010108, 0x00010109, 0x0001010a,
  ])
    assert.equal(
      classifyNativeConnectionFailure(event(nativeError)),
      'RDP_LICENSE_FAILURE',
      nativeError.toString(16),
    );
  assert.equal(
    classifyNativeConnectionFailure(event(0x0001ffff)),
    'RDP_DISCONNECTED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010003, 'RDP_PROTOCOL_ERROR')),
    'RDP_PROTOCOL_ERROR',
  );
});

test('native connection failure maps pinned credential/account CONNECT errors and preserves transport errors', () => {
  const event = (nativeError, error = 'RDP_CONNECT_FAILED') => ({
    nativeError,
    state: 'failed',
    error,
  });
  const authenticationErrors = [
    0x0002000a, 0x0002000e, 0x0002000f, 0x00020010, 0x00020012, 0x00020013,
    0x00020014, 0x00020015, 0x00020016, 0x00020017, 0x00020018, 0x00020019,
    0x0002001a, 0x0002001b,
  ];
  for (const nativeError of authenticationErrors)
    assert.equal(
      classifyNativeConnectionFailure(event(nativeError)),
      'RDP_AUTHENTICATION_FAILED',
      nativeError.toString(16),
    );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00020008)),
    'RDP_CONNECT_FAILED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00020011)),
    'RDP_CONNECT_FAILED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x0002001d)),
    'RDP_CONNECT_FAILED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x0002001e)),
    'RDP_SECURITY_MODE_REQUIRED',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00020015, 'RDP_PROTOCOL_ERROR')),
    'RDP_PROTOCOL_ERROR',
  );
});

test('native session adapter publishes classified fixed failures from terminal state events', () => {
  class Adapter extends NativeSessionWorker {
    createWorkerProcess() {
      this.peer = new EventEmitter();
      return this.peer;
    }
  }
  const adapter = new Adapter(paths);
  const observed = [];
  const unsubscribe = adapter.onFailure((code) => observed.push(code));
  try {
    for (const [nativeError, error] of [
      [0x00010003, 'RDP_DISCONNECTED'],
      [0x00010002, 'RDP_DISCONNECTED'],
      [0x00010411, 'RDP_DISCONNECTED'],
      [0x00010409, 'RDP_DISCONNECTED'],
      [0x00010001, 'RDP_DISCONNECTED'],
      [0x00010007, 'RDP_DISCONNECTED'],
      [0x00010400, 'RDP_DISCONNECTED'],
      [0x0001000a, 'RDP_DISCONNECTED'],
      [0x00010005, 'RDP_DISCONNECTED'],
      [0x00010010, 'RDP_DISCONNECTED'],
      [0x00010101, 'RDP_DISCONNECTED'],
      [0x00020015, 'RDP_CONNECT_FAILED'],
      [0x00020008, 'RDP_CONNECT_FAILED'],
      [0x0002001e, 'RDP_CONNECT_FAILED'],
      [0x00010003, 'RDP_PROTOCOL_ERROR'],
    ])
      adapter.peer.emit('rdp-state', { nativeError, state: 'failed', error });

    assert.deepEqual(observed, [
      'RDP_SERVER_TIMEOUT',
      'RDP_SERVER_LOGOFF',
      'RDP_SERVER_TIMEOUT',
      'RDP_CONNECT_CANCELLED',
      'RDP_SERVER_DISCONNECT',
      'RDP_SERVER_REJECTED',
      'RDP_SERVER_REJECTED',
      'RDP_AUTHENTICATION_FAILED',
      'RDP_SESSION_REPLACED',
      'RDP_SERVER_FAILURE',
      'RDP_LICENSE_FAILURE',
      'RDP_AUTHENTICATION_FAILED',
      'RDP_CONNECT_FAILED',
      'RDP_SECURITY_MODE_REQUIRED',
      'RDP_PROTOCOL_ERROR',
    ]);
  } finally {
    unsubscribe();
  }
});
