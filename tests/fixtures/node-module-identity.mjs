import assert from 'node:assert/strict';
import { SessionError } from '../../packages/node-bridge/dist/index.js';
import { SessionError as ApiSessionError } from '../../apps/bridge-api/node_modules/@freerdp-bridge/node/dist/index.js';
import { ProtocolError } from '../../packages/protocol/dist/index.js';
import { ProtocolError as BridgeProtocolError } from '../../packages/node-bridge/node_modules/@freerdp-bridge/protocol/dist/index.js';

assert.equal(SessionError, ApiSessionError);
assert.equal(ProtocolError, BridgeProtocolError);
console.log('workspace error identity preserved');
