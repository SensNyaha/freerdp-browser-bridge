import test from 'node:test';
import assert from 'node:assert/strict';
import { readPrivateLabInput } from '../../scripts/private-lab-input.mjs';

test('lab stdin: bounded fragmented bootstrap, scalar projection and wiped input chunks', async () => {
  const input = Buffer.from(
    JSON.stringify({
      host: '127.0.0.1',
      username: 'synthetic',
      password: 'synthetic-bootstrap',
      ignored: 'extra',
    }),
  );
  const chunks = [
    Buffer.from(input.subarray(0, 9)),
    Buffer.from(input.subarray(9)),
  ];
  const value = await readPrivateLabInput(chunks);
  assert.deepEqual(value, {
    host: '127.0.0.1',
    port: 3389,
    username: 'synthetic',
    password: 'synthetic-bootstrap',
  });
  assert.ok(chunks.every((chunk) => chunk.every((byte) => byte === 0)));
});

test('lab stdin: overflow, malformed data and iterator faults expose no input and wipe borrowed chunks', async () => {
  const invalid = [
    Buffer.alloc(8193, 7),
    Buffer.from('{"password":"synthetic-bootstrap"}'),
    Buffer.from('bad synthetic-bootstrap'),
  ];
  for (const chunk of invalid) {
    await assert.rejects(readPrivateLabInput([chunk]), {
      message: 'Invalid private lab input',
    });
    assert.ok(chunk.every((byte) => byte === 0));
  }
  const prefix = Buffer.alloc(8190, 32),
    tail = Buffer.alloc(3, 7);
  await assert.rejects(readPrivateLabInput([prefix, tail]), {
    message: 'Invalid private lab input',
  });
  assert.ok(
    prefix.every((byte) => byte === 0) && tail.every((byte) => byte === 0),
  );
  async function* fault() {
    throw new Error('synthetic-bootstrap');
  }
  await assert.rejects(readPrivateLabInput(fault()), {
    message: 'Invalid private lab input',
  });
  for (const port of [0, 65536, '3389', 1.5])
    await assert.rejects(
      readPrivateLabInput([
        Buffer.from(
          JSON.stringify({
            host: '127.0.0.1',
            username: '',
            password: '',
            port,
          }),
        ),
      ]),
      { message: 'Invalid private lab input' },
    );
});
