import test from 'node:test';
import assert from 'node:assert/strict';
import {
  windowsRuntimeNames,
  windowsRuntimeInventory,
} from '../../scripts/windows-runtime-model.mjs';

const records = () =>
  windowsRuntimeNames.map((name) => ({ name, version: '14.44.35211.0' }));
const files = () =>
  windowsRuntimeNames.map((name, index) => ({
    SPDXID: 'SPDXRef-file-' + index,
    fileName: './native/bin/' + name,
  }));
test('Windows runtime inventory binds packaged CRT files to exact PE file versions without inventing license conclusions', () => {
  const result = windowsRuntimeInventory(records(), files());
  assert.equal(result.packages.length, 1);
  assert.equal(result.relationships.length, 8);
  assert.equal(result.packages[0].versionInfo, '14.44.35211.0');
  assert.equal(result.packages[0].licenseDeclared, 'NOASSERTION');
  const split = records();
  split[0].version = '14.44.35212.0';
  assert.equal(windowsRuntimeInventory(split, files()).packages.length, 2);
});
test('Windows runtime inventory refuses missing/duplicate/foreign files and invalid resource versions', () => {
  for (const changes of [
    (items) => items.pop(),
    (items) => {
      items[1] = { ...items[0] };
    },
    (items) => {
      items[0].name = '../private.dll';
    },
    (items) => {
      items[0].version = '14.44.65536.0';
    },
    (items) => {
      items[0].version = '14.44.synthetic-secret';
    },
    (items) => {
      items[0].version = '0.0.0.0';
    },
  ]) {
    const values = records();
    changes(values);
    assert.throws(() => windowsRuntimeInventory(values, files()), {
      message: 'WINDOWS_RUNTIME_VERSION_INVALID',
    });
  }
  assert.throws(() => windowsRuntimeInventory(records(), files().slice(1)), {
    message: 'WINDOWS_RUNTIME_VERSION_INVALID',
  });
  assert.throws(() => windowsRuntimeInventory(records(), [null]), {
    message: 'WINDOWS_RUNTIME_VERSION_INVALID',
  });
});
