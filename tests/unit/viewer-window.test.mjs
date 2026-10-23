import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForViewerClose } from '../../scripts/viewer-window.mjs';

test('manual viewer ends on window close or signal and removes all lifecycle listeners', async () => {
  for (const event of [
    'close',
    'disconnected',
    'SIGINT',
    'SIGTERM',
    'already-closed',
  ]) {
    const browser = new EventEmitter();
    const page = new EventEmitter();
    const signals = new EventEmitter();
    browser.isConnected = () => true;
    page.isClosed = () => event === 'already-closed';
    const waiting = waitForViewerClose(browser, page, signals);
    if (event === 'close') page.emit(event);
    else if (event === 'disconnected') browser.emit(event);
    else if (event !== 'already-closed') signals.emit(event);
    await waiting;
    for (const emitter of [browser, page, signals])
      assert.deepEqual(emitter.eventNames(), []);
  }
});
