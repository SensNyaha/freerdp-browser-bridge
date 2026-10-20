import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNativeConnectionFailure } from '../../packages/node-bridge/dist/index.js';

test('native connection failure maps only documented remote timeout/logoff ERRINFO values', () => {
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
    classifyNativeConnectionFailure(event(0x00010002)),
    'RDP_SERVER_LOGOFF',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x0001000c)),
    'RDP_SERVER_LOGOFF',
  );
  assert.equal(
    classifyNativeConnectionFailure(event(0x00010001)),
    'RDP_DISCONNECTED',
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
