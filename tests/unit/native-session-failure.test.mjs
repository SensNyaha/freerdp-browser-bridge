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
    classifyNativeConnectionFailure(event(0x00020015, 'RDP_PROTOCOL_ERROR')),
    'RDP_PROTOCOL_ERROR',
  );
});
